"""Plaid Link + Statements integration for the AI Bookkeeper.

Flow:
  1. Frontend calls POST /plaid/link-token → opens Plaid Link.
  2. User picks bank in Plaid Link → frontend receives public_token.
  3. Frontend POSTs to /plaid/exchange → we store an `access_token` per
     workspace in `plaid_items`.
  4. /plaid/items/{id}/refresh-statements: lists statements via
     /statements/list, downloads each new PDF via /statements/download, feeds
     it into the existing bookkeeper parser (same as a manual upload), and
     records billable usage to `plaid_usage` for the current month.

Pricing model (2× Plaid's rate, billed to the workspace at the end of the
cycle alongside the regular AI credit invoice):
  - $1.00 per statement (Plaid charges us $0.50)
  - $2.00 per parsed page (Plaid charges us $1.00 for Document Income Parsing)
"""
from __future__ import annotations

import io
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from deps import db, new_id, now_iso, require_user

router = APIRouter()

# ─── Plaid SDK setup (lazy init so missing keys don't break the import) ────
_plaid_client = None


def _get_plaid_client():
    global _plaid_client
    if _plaid_client is not None:
        return _plaid_client
    from plaid import Configuration, ApiClient, Environment
    from plaid.api import plaid_api

    env = os.environ.get("PLAID_ENV", "sandbox").lower()
    host = {
        "sandbox": Environment.Sandbox,
        "production": Environment.Production,
    }.get(env, Environment.Sandbox)
    cfg = Configuration(
        host=host,
        api_key={
            "clientId": os.environ.get("PLAID_CLIENT_ID", ""),
            "secret": os.environ.get("PLAID_SECRET", ""),
        },
    )
    _plaid_client = plaid_api.PlaidApi(ApiClient(cfg))
    return _plaid_client


def _plaid_configured() -> bool:
    return bool(os.environ.get("PLAID_CLIENT_ID") and os.environ.get("PLAID_SECRET"))


# ─── Pricing constants (2× Plaid pass-through) ──────────────────────────────
PRICE_PER_STATEMENT_USD = 1.00
PRICE_PER_PAGE_USD = 2.00


# ─── Models ─────────────────────────────────────────────────────────────────
class CreateLinkTokenIn(BaseModel):
    products: Optional[List[str]] = None


class ExchangePublicTokenIn(BaseModel):
    public_token: str
    institution_name: Optional[str] = None
    institution_id: Optional[str] = None


# ─── Public config + status ─────────────────────────────────────────────────
@router.get("/plaid/config")
async def plaid_config(current=Depends(require_user)):
    return {
        "configured": _plaid_configured(),
        "env": os.environ.get("PLAID_ENV", "sandbox"),
        "products": [p.strip() for p in os.environ.get("PLAID_PRODUCTS", "statements,transactions").split(",")],
        "countries": [c.strip() for c in os.environ.get("PLAID_COUNTRIES", "US,CA").split(",")],
        "price_per_statement_usd": PRICE_PER_STATEMENT_USD,
        "price_per_page_usd": PRICE_PER_PAGE_USD,
    }


# ─── Link token ─────────────────────────────────────────────────────────────
@router.post("/plaid/link-token")
async def create_link_token(payload: CreateLinkTokenIn, current=Depends(require_user)):
    if not _plaid_configured():
        raise HTTPException(503, "Plaid is not configured on the server.")
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owners/admins can connect a bank.")
    from plaid.model.link_token_create_request import LinkTokenCreateRequest
    from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
    from plaid.model.link_token_create_request_statements import LinkTokenCreateRequestStatements
    from plaid.model.products import Products
    from plaid.model.country_code import CountryCode
    from datetime import date, timedelta

    products_env = payload.products or [
        p.strip() for p in os.environ.get("PLAID_PRODUCTS", "statements,transactions").split(",")
    ]
    products = [Products(p) for p in products_env if p]
    countries = [
        CountryCode(c.strip())
        for c in os.environ.get("PLAID_COUNTRIES", "US,CA").split(",")
        if c.strip()
    ]
    req_kwargs = dict(
        user=LinkTokenCreateRequestUser(client_user_id=current["workspace_id"]),
        client_name="TeamNest.ai AI Bookkeeper",
        products=products,
        country_codes=countries,
        language="en",
    )
    if any(p.value == "statements" for p in products):
        end_date = date.today()
        start_date = end_date - timedelta(days=365)
        req_kwargs["statements"] = LinkTokenCreateRequestStatements(
            start_date=start_date,
            end_date=end_date,
        )
    webhook = os.environ.get("PLAID_WEBHOOK_URL", "").strip()
    if webhook:
        req_kwargs["webhook"] = webhook
    request = LinkTokenCreateRequest(**req_kwargs)
    try:
        resp = _get_plaid_client().link_token_create(request)
    except Exception as exc:
        raise HTTPException(502, f"Plaid link-token failed: {exc}")
    return {"link_token": resp["link_token"], "expiration": str(resp.get("expiration"))}


# ─── Exchange public_token → access_token ───────────────────────────────────
@router.post("/plaid/exchange")
async def exchange_public_token(payload: ExchangePublicTokenIn, current=Depends(require_user)):
    if not _plaid_configured():
        raise HTTPException(503, "Plaid is not configured.")
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owners/admins can connect a bank.")
    from plaid.model.item_public_token_exchange_request import (
        ItemPublicTokenExchangeRequest,
    )
    req = ItemPublicTokenExchangeRequest(public_token=payload.public_token)
    try:
        resp = _get_plaid_client().item_public_token_exchange(req)
    except Exception as exc:
        raise HTTPException(502, f"Plaid exchange failed: {exc}")
    item_doc = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "plaid_item_id": resp["item_id"],
        "access_token": resp["access_token"],
        "institution_name": payload.institution_name,
        "institution_id": payload.institution_id,
        "env": os.environ.get("PLAID_ENV", "sandbox"),
        "connected_by": current["id"],
        "created_at": now_iso(),
        "last_statements_sync_at": None,
    }
    await db.plaid_items.insert_one(item_doc.copy())
    return {
        "id": item_doc["id"],
        "institution_name": item_doc["institution_name"],
        "created_at": item_doc["created_at"],
    }


# ─── List + disconnect items ────────────────────────────────────────────────
@router.get("/plaid/items")
async def list_items(current=Depends(require_user)):
    cur = db.plaid_items.find(
        {"workspace_id": current["workspace_id"]},
        {"_id": 0, "access_token": 0},
    )
    items = await cur.to_list(50)
    return {"items": items}


@router.delete("/plaid/items/{item_id}")
async def disconnect_item(item_id: str, current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owners/admins can disconnect a bank.")
    item = await db.plaid_items.find_one(
        {"id": item_id, "workspace_id": current["workspace_id"]}
    )
    if not item:
        raise HTTPException(404, "Not found")
    # Best-effort Plaid item removal.
    try:
        from plaid.model.item_remove_request import ItemRemoveRequest
        _get_plaid_client().item_remove(ItemRemoveRequest(access_token=item["access_token"]))
    except Exception:
        pass
    await db.plaid_items.delete_one({"id": item_id})
    return {"ok": True}


# ─── Refresh / download statements ──────────────────────────────────────────
def _count_pdf_pages(blob: bytes) -> int:
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(blob)) as pdf:
            return len(pdf.pages)
    except Exception:
        return 1


async def _record_usage(workspace_id: str, statements: int, pages: int) -> None:
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    await db.plaid_usage.update_one(
        {"workspace_id": workspace_id, "month": month},
        {
            "$inc": {
                "statements_downloaded": statements,
                "pages_downloaded": pages,
                "billable_usd": statements * PRICE_PER_STATEMENT_USD + pages * PRICE_PER_PAGE_USD,
            },
            "$setOnInsert": {"created_at": now_iso()},
            "$set": {"updated_at": now_iso()},
        },
        upsert=True,
    )


@router.post("/plaid/items/{item_id}/refresh-statements")
async def refresh_statements(item_id: str, current=Depends(require_user)):
    """List statements from Plaid, download any new PDFs, hand each off to
    the bookkeeper's statement parser, and record billable usage."""
    item = await db.plaid_items.find_one(
        {"id": item_id, "workspace_id": current["workspace_id"]}
    )
    if not item:
        raise HTTPException(404, "Item not found")
    from plaid.model.statements_list_request import StatementsListRequest
    from plaid.model.statements_download_request import StatementsDownloadRequest

    client = _get_plaid_client()
    try:
        listing = client.statements_list(StatementsListRequest(access_token=item["access_token"]))
    except Exception as exc:
        raise HTTPException(502, f"Plaid statements list failed: {exc}")

    downloaded: List[Dict[str, Any]] = []
    total_pages = 0
    new_count = 0

    # `accounts` is a list of {account_id, statements: [{statement_id, year, month, ...}]}
    for account in listing.get("accounts", []):
        account_id = account.get("account_id")
        for stmt in account.get("statements", []):
            statement_id = stmt.get("statement_id")
            existing = await db.plaid_statements.find_one(
                {"plaid_statement_id": statement_id, "workspace_id": current["workspace_id"]}
            )
            if existing:
                continue
            try:
                dl = client.statements_download(
                    StatementsDownloadRequest(
                        access_token=item["access_token"], statement_id=statement_id
                    )
                )
                blob = bytes(dl)  # the SDK returns a file-like; bytes() materializes
            except Exception as exc:
                downloaded.append({"statement_id": statement_id, "error": str(exc)})
                continue
            pages = _count_pdf_pages(blob)
            new_count += 1
            total_pages += pages
            await db.plaid_statements.insert_one({
                "id": new_id(),
                "workspace_id": current["workspace_id"],
                "plaid_item_id": item["id"],
                "plaid_account_id": account_id,
                "plaid_statement_id": statement_id,
                "year": stmt.get("year"),
                "month": stmt.get("month"),
                "pages": pages,
                "downloaded_at": now_iso(),
                "size_bytes": len(blob),
            })
            # Hand off to the bookkeeper pipeline. We avoid a hard import-cycle
            # by calling the route's internal helper if present.
            try:
                from routes.bookkeeper import _ingest_pdf_blob  # type: ignore
                await _ingest_pdf_blob(
                    blob=blob,
                    workspace_id=current["workspace_id"],
                    uploaded_by=current["id"],
                    source="plaid",
                    source_ref=statement_id,
                    filename=f"plaid-{statement_id}.pdf",
                )
            except ImportError:
                pass
            except Exception as exc:
                downloaded.append({"statement_id": statement_id, "ingest_error": str(exc)})
            downloaded.append({"statement_id": statement_id, "pages": pages})

    await db.plaid_items.update_one(
        {"id": item_id}, {"$set": {"last_statements_sync_at": now_iso()}}
    )
    if new_count:
        await _record_usage(current["workspace_id"], new_count, total_pages)
    return {
        "new_statements": new_count,
        "pages_downloaded": total_pages,
        "details": downloaded,
        "estimated_billable_usd": round(
            new_count * PRICE_PER_STATEMENT_USD + total_pages * PRICE_PER_PAGE_USD, 2
        ),
    }


# ─── Usage / billing summary ────────────────────────────────────────────────
@router.get("/plaid/usage")
async def usage(current=Depends(require_user)):
    cur = db.plaid_usage.find(
        {"workspace_id": current["workspace_id"]}, {"_id": 0}
    ).sort("month", -1)
    months = await cur.to_list(24)
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    current_month = next((m for m in months if m["month"] == month), None)
    return {
        "current_month": current_month or {
            "month": month,
            "statements_downloaded": 0,
            "pages_downloaded": 0,
            "billable_usd": 0,
        },
        "history": months,
        "rates": {
            "per_statement_usd": PRICE_PER_STATEMENT_USD,
            "per_page_usd": PRICE_PER_PAGE_USD,
        },
    }


# ─── Webhook ────────────────────────────────────────────────────────────────
@router.post("/plaid/webhook")
async def plaid_webhook(request: Request):
    payload = await request.json()
    plaid_item_id = payload.get("item_id")
    webhook_type = payload.get("webhook_type")
    webhook_code = payload.get("webhook_code")
    if not plaid_item_id:
        return {"status": "ignored"}
    item = await db.plaid_items.find_one({"plaid_item_id": plaid_item_id})
    if not item:
        return {"status": "unknown_item"}
    await db.plaid_webhooks.insert_one({
        "id": new_id(),
        "item_id": item["id"],
        "workspace_id": item["workspace_id"],
        "webhook_type": webhook_type,
        "webhook_code": webhook_code,
        "payload": payload,
        "received_at": now_iso(),
    })
    return {"status": "ok"}
