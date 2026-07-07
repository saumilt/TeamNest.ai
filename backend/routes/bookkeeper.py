"""AI QuickBooks Bookkeeper — backend routes.

Collections:
  bk_statements         — uploaded statement metadata
  bk_transactions       — per-row transactions extracted from statements
  bk_rules              — auto-generated and admin-approved categorization rules
  bk_reconciliations    — period reconciliation records
  bk_pending_qb_sync    — approved entries waiting for QuickBooks write-back

Mock QuickBooks sync is implemented as a "pending_qb_sync" collection.
Real QuickBooks OAuth ships in Session 2.
"""
import asyncio
import csv
import io
import json
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from ai_employees_catalog import get_employee
from ai_service import EMERGENT_LLM_KEY
from deps import _broadcast_message, db, new_id, now_iso, require_user
from routes.ai_employees import deduct_employee_credits, log_employee_activity

router = APIRouter()


# ====== Pydantic ======
class CategorizeRequest(BaseModel):
    statement_id: str
    user_id_to_ask: Optional[str] = None  # who to @mention for suspense items
    chat_id: Optional[str] = None  # chat to post suspense questions in


class UpdateCategoryRequest(BaseModel):
    category: str
    notes: Optional[str] = None
    create_rule: bool = False


class ApproveSyncRequest(BaseModel):
    transaction_ids: List[str]


class ReconcileRequest(BaseModel):
    account_name: str
    period_start: str
    period_end: str
    statement_beginning_balance: float
    statement_ending_balance: float


# ====== Helpers ======
async def _assert_bookkeeper_active(workspace_id: str) -> Dict[str, Any]:
    sub = await db.ai_employee_subscriptions.find_one(
        {"workspace_id": workspace_id, "employee_key": "bookkeeper"},
        {"_id": 0},
    )
    if not sub:
        raise HTTPException(403, "AI Bookkeeper is not active in this workspace. Start a 7-day trial.")
    if sub.get("status") in ("paused", "cancelled"):
        raise HTTPException(403, f"AI Bookkeeper is {sub.get('status')}.")
    return sub


def _parse_csv_rows(content: bytes) -> List[Dict[str, Any]]:
    """Parse a CSV bank/credit-card statement into normalised rows.

    Accepts the common Chase/Amex/BoA layouts. Best-effort — unknown headers
    map to description/notes. Returns list of dicts with date, description,
    amount (positive = debit/expense, negative = credit/refund), balance.
    """
    text = content.decode("utf-8", errors="replace")
    # Strip BOM and any leading blank rows
    text = text.lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(text))
    rows: List[Dict[str, Any]] = []
    headers = [h.lower().strip() for h in (reader.fieldnames or [])]

    def _key(*candidates: str) -> Optional[str]:
        for c in candidates:
            for h in headers:
                if c == h:
                    return reader.fieldnames[headers.index(h)]
        for c in candidates:
            for h in headers:
                if c in h:
                    return reader.fieldnames[headers.index(h)]
        return None

    date_key = _key("date", "transaction date", "posting date", "trans date")
    desc_key = _key("description", "details", "merchant", "name", "memo")
    amount_key = _key("amount", "debit", "transaction amount")
    credit_key = _key("credit")
    balance_key = _key("balance", "running balance")

    for raw in reader:
        if not raw:
            continue
        date_raw = (raw.get(date_key, "") if date_key else "").strip()
        desc = (raw.get(desc_key, "") if desc_key else "").strip()
        amount_str = (raw.get(amount_key, "") if amount_key else "").strip()
        credit_str = (raw.get(credit_key, "") if credit_key else "").strip()
        balance_str = (raw.get(balance_key, "") if balance_key else "").strip()
        if not date_raw and not desc and not amount_str:
            continue

        amount: float = 0.0
        if amount_str:
            try:
                amount = float(amount_str.replace(",", "").replace("$", ""))
            except ValueError:
                amount = 0.0
        elif credit_str:
            try:
                amount = -float(credit_str.replace(",", "").replace("$", ""))
            except ValueError:
                amount = 0.0

        # Normalise date to ISO if possible
        date_iso: Optional[str] = None
        for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y", "%m-%d-%Y", "%d/%m/%Y"):
            try:
                date_iso = datetime.strptime(date_raw, fmt).date().isoformat()
                break
            except ValueError:
                continue

        rows.append({
            "date": date_iso or date_raw,
            "description": desc[:200],
            "amount": round(amount, 2),
            "balance": float(balance_str.replace(",", "").replace("$", "")) if balance_str else None,
        })
    return rows


CHART_OF_ACCOUNTS = [
    "Advertising & Marketing", "Office Supplies", "Travel",
    "Meals & Entertainment", "Software & Subscriptions", "Professional Fees",
    "Rent", "Utilities", "Repairs & Maintenance", "Payroll Expense",
    "Bank Fees", "Insurance", "Telephone & Internet", "Inventory Purchases",
    "Owner Draw", "Transfer", "Sales Income", "Refund", "Other", "Suspense",
]


async def _ai_categorize_batch(transactions: List[Dict[str, Any]], existing_rules: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Categorize transactions in a single LLM call to save credits."""
    emp = get_employee("bookkeeper")
    if not emp or not transactions:
        return [{"account": "Suspense", "confidence": 0, "reason": "no_employee", "is_transfer": False} for _ in transactions]

    # Rule-first pass — exact / contains match on merchant pattern.
    out: List[Optional[Dict[str, Any]]] = [None] * len(transactions)
    rule_count = 0
    for i, tx in enumerate(transactions):
        desc_lower = (tx.get("description") or "").lower()
        for rule in existing_rules:
            if not rule.get("active", True):
                continue
            pattern = (rule.get("merchant_pattern") or "").lower()
            if pattern and pattern in desc_lower:
                out[i] = {
                    "account": rule["category"],
                    "confidence": int(rule.get("confidence", 95)),
                    "reason": f"matched rule '{rule.get('name','')}'",
                    "is_transfer": rule["category"] == "Transfer",
                    "rule_id": rule.get("id"),
                }
                rule_count += 1
                break

    # Build prompt only for unmatched.
    unmatched_idx = [i for i, v in enumerate(out) if v is None]
    if unmatched_idx:
        lines = []
        for i in unmatched_idx:
            tx = transactions[i]
            lines.append(f"#{i}: {tx['date']} | {tx['description']} | ${tx['amount']:.2f}")
        prompt = (
            "Categorize each of the following transactions. Respond with a "
            "JSON array of objects in the SAME ORDER as the input, one object "
            "per transaction. Each object must include: index (int matching "
            "the input #), account (string from this list: "
            + ", ".join(CHART_OF_ACCOUNTS) + "), confidence (0-100), reason "
            "(string), is_transfer (boolean). Do not add any prose outside "
            "the JSON.\n\nTransactions:\n" + "\n".join(lines)
        )
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"bookkeeper-batch-{new_id()}",
                system_message=emp["system_prompt"],
            ).with_model("openai", "gpt-5.4-mini")
            response_text = str(await chat.send_message(UserMessage(text=prompt)))
            # Strip code fences if present.
            m = re.search(r"\[.*\]", response_text, re.DOTALL)
            parsed = json.loads(m.group(0) if m else response_text)
        except Exception:
            parsed = []

        parsed_by_idx = {item.get("index"): item for item in parsed if isinstance(item, dict)}
        for i in unmatched_idx:
            item = parsed_by_idx.get(i) or {}
            out[i] = {
                "account": item.get("account") or "Suspense",
                "confidence": int(item.get("confidence", 0) or 0),
                "reason": item.get("reason", "no_response"),
                "is_transfer": bool(item.get("is_transfer", False)),
                "rule_id": None,
            }

    return [v or {"account": "Suspense", "confidence": 0, "reason": "unknown", "is_transfer": False} for v in out]


def _suggested_status(decision: Dict[str, Any]) -> str:
    if decision["confidence"] >= 80:
        return "auto_matched"
    if decision["confidence"] >= 60:
        return "suggested_category"
    return "suspense"


# ====== Endpoints ======
async def _ingest_pdf_blob(
    blob: bytes,
    workspace_id: str,
    uploaded_by: str,
    filename: str,
    source: str = "upload",
    source_ref: Optional[str] = None,
    account_name: str = "Plaid bank",
    statement_type: str = "bank",
) -> Dict[str, Any]:
    """Shared helper used by both the manual upload route and the Plaid
    auto-download route. Parses a PDF blob, persists the bk_statement row
    and its transactions, and returns the new statement document."""
    from services.statement_parsers import parse_pdf_statement
    rows = parse_pdf_statement(blob)
    if not rows:
        raise HTTPException(400, "Couldn't extract any transactions from the PDF.")
    statement = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "uploaded_by": uploaded_by,
        "filename": filename,
        "account_name": account_name,
        "statement_type": statement_type,
        "row_count": len(rows),
        "status": "imported",
        "source": source,
        "source_ref": source_ref,
        "created_at": now_iso(),
    }
    await db.bk_statements.insert_one(statement.copy())
    tx_docs = [{
        "id": new_id(),
        "workspace_id": workspace_id,
        "statement_id": statement["id"],
        "row_index": i,
        "date": r["date"],
        "description": r["description"],
        "amount": r["amount"],
        "balance": r["balance"],
        "account_name": account_name,
        "suggested_category": None,
        "confidence": 0,
        "reason": None,
        "is_transfer": False,
        "rule_id": None,
        "status": "imported",
        "approved_by": None,
        "synced_to_qb": False,
        "notes": None,
        "suspense_question_id": None,
        "created_at": now_iso(),
    } for i, r in enumerate(rows)]
    await db.bk_transactions.insert_many([d.copy() for d in tx_docs])
    return statement


@router.post("/bookkeeper/statements")
async def upload_statement(
    file: UploadFile = File(...),
    account_name: str = "Bank",
    statement_type: str = "bank",  # "bank" | "credit_card"
    current=Depends(require_user),
):
    """Upload a CSV statement, parse it, return preview rows. Categorization
    runs after the user clicks 'Categorize'."""
    await _assert_bookkeeper_active(current["workspace_id"])

    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(400, "Statement is too large (max 10 MB).")
    fname = (file.filename or "").lower()
    if fname.endswith(".csv"):
        rows = _parse_csv_rows(raw)
    elif fname.endswith(".pdf"):
        from services.statement_parsers import parse_pdf_statement
        try:
            rows = parse_pdf_statement(raw)
        except Exception as e:
            raise HTTPException(400, f"PDF parse failed: {e}")
    elif fname.endswith(".ofx") or fname.endswith(".qbo"):
        from services.statement_parsers import parse_ofx_statement
        try:
            rows = parse_ofx_statement(raw)
        except Exception as e:
            raise HTTPException(400, f"OFX parse failed: {e}")
    else:
        raise HTTPException(
            400, "Supported formats: .csv, .pdf, .ofx, .qbo"
        )
    if not rows:
        raise HTTPException(400, "Couldn't extract any transactions from the file.")

    statement = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "uploaded_by": current["id"],
        "filename": file.filename,
        "account_name": account_name,
        "statement_type": statement_type,
        "row_count": len(rows),
        "status": "imported",  # imported -> categorized -> partially_reviewed -> reviewed -> reconciled
        "created_at": now_iso(),
    }
    await db.bk_statements.insert_one(statement.copy())

    tx_docs = []
    for i, r in enumerate(rows):
        tx_docs.append({
            "id": new_id(),
            "workspace_id": current["workspace_id"],
            "statement_id": statement["id"],
            "row_index": i,
            "date": r["date"],
            "description": r["description"],
            "amount": r["amount"],
            "balance": r["balance"],
            "account_name": account_name,
            "suggested_category": None,
            "confidence": 0,
            "reason": None,
            "is_transfer": False,
            "rule_id": None,
            "status": "imported",
            "approved_by": None,
            "synced_to_qb": False,
            "notes": None,
            "suspense_question_id": None,
            "created_at": now_iso(),
        })
    await db.bk_transactions.insert_many([d.copy() for d in tx_docs])

    await log_employee_activity(
        current["workspace_id"], "bookkeeper", current["id"],
        "statement_uploaded",
        f"Uploaded {file.filename} ({len(rows)} rows) for {account_name}",
        {"statement_id": statement["id"], "row_count": len(rows)},
    )
    return {"statement": statement, "transactions_preview": tx_docs[:10]}


@router.post("/bookkeeper/statements/{statement_id}/categorize")
async def categorize_statement(
    statement_id: str,
    payload: CategorizeRequest,
    current=Depends(require_user),
):
    """Run the AI categorizer on every transaction. Posts suspense items
    to the supplied chat_id (defaults to the workspace's first group chat)."""
    await _assert_bookkeeper_active(current["workspace_id"])

    stmt = await db.bk_statements.find_one({"id": statement_id, "workspace_id": current["workspace_id"]}, {"_id": 0})
    if not stmt:
        raise HTTPException(404, "Statement not found")
    txs = await db.bk_transactions.find(
        {"statement_id": statement_id, "workspace_id": current["workspace_id"]},
        {"_id": 0},
    ).sort("row_index", 1).to_list(2000)

    rules = await db.bk_rules.find(
        {"workspace_id": current["workspace_id"], "active": True}, {"_id": 0}
    ).to_list(500)

    # Process in chunks of 20 so the LLM context stays small.
    decisions: List[Dict[str, Any]] = []
    for start in range(0, len(txs), 20):
        chunk = txs[start:start + 20]
        decisions.extend(await _ai_categorize_batch(chunk, rules))

    suspense_count = 0
    auto_matched_count = 0
    suggested_count = 0
    for tx, decision in zip(txs, decisions):
        status = _suggested_status(decision)
        if status == "auto_matched":
            auto_matched_count += 1
        elif status == "suggested_category":
            suggested_count += 1
        else:
            suspense_count += 1
        await db.bk_transactions.update_one(
            {"id": tx["id"]},
            {"$set": {
                "suggested_category": decision["account"],
                "confidence": decision["confidence"],
                "reason": decision["reason"],
                "is_transfer": decision["is_transfer"],
                "rule_id": decision.get("rule_id"),
                "status": status,
            }},
        )

    # Post one consolidated suspense Q to the supplied chat for batch review.
    if suspense_count > 0 and payload.chat_id:
        question_body = (
            f"@AI Bookkeeper review: I imported **{stmt['filename']}** "
            f"({stmt['row_count']} rows). Auto-matched: {auto_matched_count}, "
            f"suggested: {suggested_count}, **suspense: {suspense_count}**. "
            f"Open the Bookkeeper page to review and approve."
        )
        sys_msg = {
            "id": new_id(),
            "chat_id": payload.chat_id,
            "sender_id": "ai-bookkeeper",
            "message_type": "text",
            "body": question_body,
            "parent_message_id": None,
            "metadata": {
                "employee_key": "bookkeeper",
                "event": "suspense_batch",
                "statement_id": stmt["id"],
                "suspense_count": suspense_count,
            },
            "reactions": {},
            "created_at": now_iso(),
            "edited_at": None,
            "deleted_at": None,
        }
        await db.messages.insert_one(sys_msg.copy())
        await _broadcast_message(payload.chat_id, sys_msg)

    new_status = "categorized" if suspense_count == 0 else "partially_reviewed"
    await db.bk_statements.update_one(
        {"id": statement_id},
        {"$set": {
            "status": new_status,
            "auto_matched_count": auto_matched_count,
            "suggested_count": suggested_count,
            "suspense_count": suspense_count,
        }},
    )

    credits_used = max(20, len(txs))  # ~1 credit per row, min 20
    await deduct_employee_credits(
        workspace_id=current["workspace_id"], employee_key="bookkeeper",
        user_id=current["id"], credits=credits_used,
        reason=f"Categorize {stmt['filename']} ({len(txs)} rows)",
        task_id=statement_id,
    )
    await log_employee_activity(
        current["workspace_id"], "bookkeeper", current["id"],
        "categorized",
        f"Categorized {stmt['filename']}: {auto_matched_count} auto, {suggested_count} suggested, {suspense_count} suspense",
        {"statement_id": stmt["id"]},
    )

    return {
        "statement_id": stmt["id"],
        "auto_matched": auto_matched_count,
        "suggested": suggested_count,
        "suspense": suspense_count,
        "credits_used": credits_used,
    }


@router.get("/bookkeeper/statements")
async def list_statements(current=Depends(require_user), limit: int = 50):
    rows = await db.bk_statements.find(
        {"workspace_id": current["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    return {"statements": rows}


@router.get("/bookkeeper/statements/{statement_id}")
async def get_statement(statement_id: str, current=Depends(require_user)):
    stmt = await db.bk_statements.find_one(
        {"id": statement_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not stmt:
        raise HTTPException(404, "Statement not found")
    txs = await db.bk_transactions.find(
        {"statement_id": statement_id, "workspace_id": current["workspace_id"]},
        {"_id": 0},
    ).sort("row_index", 1).to_list(2000)
    return {"statement": stmt, "transactions": txs}


@router.patch("/bookkeeper/transactions/{tx_id}")
async def update_transaction(tx_id: str, payload: UpdateCategoryRequest, current=Depends(require_user)):
    await _assert_bookkeeper_active(current["workspace_id"])
    tx = await db.bk_transactions.find_one({"id": tx_id, "workspace_id": current["workspace_id"]}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Transaction not found")
    if payload.category not in CHART_OF_ACCOUNTS:
        raise HTTPException(400, f"Unknown account '{payload.category}'")

    await db.bk_transactions.update_one(
        {"id": tx_id},
        {"$set": {
            "suggested_category": payload.category,
            "status": "approved",
            "approved_by": current["id"],
            "notes": payload.notes,
            "confidence": 100,
            "reason": "human_approved",
        }},
    )

    rule_created = None
    if payload.create_rule and tx.get("description"):
        # Use the merchant tokens (first 2 words, alpha-only) as the pattern.
        words = re.findall(r"[A-Za-z][A-Za-z0-9'&]+", tx["description"])
        pattern = " ".join(words[:2]).lower() if words else tx["description"][:24].lower()
        rule = {
            "id": new_id(),
            "workspace_id": current["workspace_id"],
            "name": f"Auto: {pattern} → {payload.category}",
            "merchant_pattern": pattern,
            "description_pattern": None,
            "amount_range": None,
            "category": payload.category,
            "confidence": 95,
            "active": True,
            "created_by": "ai-bookkeeper",
            "approved_by": current["id"],
            "source_tx_id": tx_id,
            "created_at": now_iso(),
            "last_used_at": now_iso(),
        }
        await db.bk_rules.insert_one(rule.copy())
        rule_created = rule
        await log_employee_activity(
            current["workspace_id"], "bookkeeper", current["id"],
            "rule_created",
            f"Rule: '{pattern}' → {payload.category}",
            {"rule_id": rule["id"]},
        )

    return {"ok": True, "rule_created": rule_created}


@router.post("/bookkeeper/transactions/approve-sync")
async def approve_for_sync(payload: ApproveSyncRequest, current=Depends(require_user)):
    """Move approved transactions into the pending_qb_sync queue.
    Actual QuickBooks Online write-back is mocked in Session 1 and will be
    wired up in Session 2."""
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owners/admins can approve QuickBooks sync.")
    await _assert_bookkeeper_active(current["workspace_id"])

    txs = await db.bk_transactions.find(
        {"id": {"$in": payload.transaction_ids}, "workspace_id": current["workspace_id"]},
        {"_id": 0},
    ).to_list(2000)
    if not txs:
        raise HTTPException(404, "No matching transactions")

    queue_docs = []
    now = now_iso()
    for tx in txs:
        queue_docs.append({
            "id": new_id(),
            "workspace_id": current["workspace_id"],
            "transaction_id": tx["id"],
            "statement_id": tx["statement_id"],
            "date": tx["date"],
            "description": tx["description"],
            "amount": tx["amount"],
            "account": tx.get("suggested_category"),
            "approved_by": current["id"],
            "approved_at": now,
            "status": "pending_sync",  # pending_sync -> synced (mock)
            "synced_at": None,
        })
    await db.bk_pending_qb_sync.insert_many([d.copy() for d in queue_docs])
    await db.bk_transactions.update_many(
        {"id": {"$in": [t["id"] for t in txs]}, "workspace_id": current["workspace_id"]},
        {"$set": {"status": "synced", "synced_to_qb": True}},
    )

    # Mock the sync — flip to 'synced (mock)' after a brief delay.
    async def _mock_sync(ids: List[str]):
        await asyncio.sleep(2)
        await db.bk_pending_qb_sync.update_many(
            {"id": {"$in": ids}},
            {"$set": {"status": "synced_mock", "synced_at": now_iso()}},
        )
    asyncio.create_task(_mock_sync([d["id"] for d in queue_docs]))

    await log_employee_activity(
        current["workspace_id"], "bookkeeper", current["id"],
        "qb_sync_approved",
        f"Approved {len(txs)} entries for QuickBooks sync (mocked)",
        {"count": len(txs)},
    )
    return {"ok": True, "approved": len(txs), "note": "QuickBooks sync is mocked in this release."}


@router.get("/bookkeeper/rules")
async def list_rules(current=Depends(require_user)):
    rows = await db.bk_rules.find(
        {"workspace_id": current["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return {"rules": rows}


@router.delete("/bookkeeper/rules/{rule_id}")
async def delete_rule(rule_id: str, current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Admins only")
    r = await db.bk_rules.find_one({"id": rule_id, "workspace_id": current["workspace_id"]}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Rule not found")
    await db.bk_rules.delete_one({"id": rule_id})
    return {"ok": True}


@router.post("/bookkeeper/reconcile")
async def start_reconciliation(payload: ReconcileRequest, current=Depends(require_user)):
    await _assert_bookkeeper_active(current["workspace_id"])
    # Sum approved transactions for this account in the period.
    txs = await db.bk_transactions.find(
        {
            "workspace_id": current["workspace_id"],
            "account_name": payload.account_name,
            "status": {"$in": ["approved", "synced"]},
            "date": {"$gte": payload.period_start, "$lte": payload.period_end},
        },
        {"_id": 0},
    ).to_list(5000)
    debits = sum(t["amount"] for t in txs if t["amount"] > 0)
    credits = sum(-t["amount"] for t in txs if t["amount"] < 0)
    qb_ending = payload.statement_beginning_balance - debits + credits
    diff = round(qb_ending - payload.statement_ending_balance, 2)

    rec = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "account_name": payload.account_name,
        "period_start": payload.period_start,
        "period_end": payload.period_end,
        "statement_beginning_balance": payload.statement_beginning_balance,
        "statement_ending_balance": payload.statement_ending_balance,
        "qb_calculated_ending_balance": round(qb_ending, 2),
        "difference": diff,
        "matched_count": len(txs),
        "ready_to_reconcile": abs(diff) < 0.01,
        "status": "ready" if abs(diff) < 0.01 else "needs_review",
        "started_by": current["id"],
        "created_at": now_iso(),
    }
    await db.bk_reconciliations.insert_one(rec.copy())
    await log_employee_activity(
        current["workspace_id"], "bookkeeper", current["id"],
        "reconciliation_started",
        f"Reconciliation for {payload.account_name} {payload.period_start}–{payload.period_end}: diff ${diff:.2f}",
        {"reconciliation_id": rec["id"]},
    )
    return rec


@router.get("/bookkeeper/reconciliations")
async def list_reconciliations(current=Depends(require_user)):
    rows = await db.bk_reconciliations.find(
        {"workspace_id": current["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"reconciliations": rows}


@router.get("/bookkeeper/dashboard")
async def bookkeeper_dashboard(current=Depends(require_user)):
    workspace_id = current["workspace_id"]
    statements = await db.bk_statements.find({"workspace_id": workspace_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    pending_sync = await db.bk_pending_qb_sync.count_documents({"workspace_id": workspace_id, "status": "pending_sync"})
    suspense = await db.bk_transactions.count_documents({"workspace_id": workspace_id, "status": "suspense"})
    needs_review = await db.bk_transactions.count_documents({"workspace_id": workspace_id, "status": "suggested_category"})
    auto_matched = await db.bk_transactions.count_documents({"workspace_id": workspace_id, "status": "auto_matched"})
    approved = await db.bk_transactions.count_documents({"workspace_id": workspace_id, "status": {"$in": ["approved", "synced"]}})
    rules = await db.bk_rules.count_documents({"workspace_id": workspace_id, "active": True})
    return {
        "statements_count": len(statements),
        "recent_statements": statements[:5],
        "pending_sync": pending_sync,
        "suspense": suspense,
        "needs_review": needs_review,
        "auto_matched": auto_matched,
        "approved": approved,
        "active_rules": rules,
    }
