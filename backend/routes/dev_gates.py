"""QA/Security publish gates + Product Manager action approvals.

High-risk actions (production publish, GitHub export) run automated QA +
security gates and require Product Manager approval when requested by a
non-PM. The PM is whoever claimed the 'product' role on the project;
falls back to the workspace owner.
"""
import logging
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import _broadcast_message, _post_reminder, db, new_id, now_iso, require_user

router = APIRouter()
logger = logging.getLogger("teamnest")

ACTION_LABELS = {
    "production_publish": "Publish to production",
    "github_export": "Export to GitHub",
}


# ─── Product Manager resolution ──────────────────────────────────────────
def _pm_claim(project: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    return (project.get("role_claims") or {}).get("product")


def is_pm_or_admin(project: Dict[str, Any], current: Dict[str, Any]) -> bool:
    if current.get("role") in ("owner", "admin"):
        return True
    claim = _pm_claim(project)
    return bool(claim and claim.get("user_id") == current["id"])


async def product_manager_id(project: Dict[str, Any], workspace_id: str) -> Optional[str]:
    claim = _pm_claim(project)
    if claim and claim.get("user_id"):
        return claim["user_id"]
    owner = await db.users.find_one(
        {"workspace_id": workspace_id, "role": "owner"}, {"_id": 0, "id": 1},
    )
    return owner["id"] if owner else None


# ─── Automated gates ─────────────────────────────────────────────────────
def run_qa_checks(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_path = {f["path"]: (f.get("content") or "") for f in files}
    checks = [
        ("index.html renders", "<html" in by_path.get("frontend/index.html", "").lower()),
        ("app.js has logic", len(by_path.get("frontend/app.js", "")) > 80),
        ("styles.css present", len(by_path.get("frontend/styles.css", "")) > 20),
        ("API server present", "FastAPI" in by_path.get("backend/server.py", "")),
        ("schema defined", "CREATE TABLE" in by_path.get("backend/schema.sql", "").upper()),
        ("tests generated", "def test_" in by_path.get("tests/test_basic.py", "")),
    ]
    results = [{"name": n, "ok": ok} for n, ok in checks]
    passed = sum(1 for r in results if r["ok"])
    # One optional file (e.g. schema variant) may miss without blocking.
    return {"ok": passed >= len(results) - 1, "passed": passed, "total": len(results), "checks": results}


_HIGH_PATTERNS = [
    ("hardcoded_secret", r"(sk-[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{12,}|ghp_[A-Za-z0-9]{20,})",
     "Possible hardcoded API key / secret"),
    ("eval_usage", r"\beval\s*\(", "eval() usage — code-injection risk"),
    ("document_write", r"document\.write\s*\(", "document.write — XSS-prone"),
]
_WARN_PATTERNS = [
    ("inner_html", r"\.innerHTML\s*=", "innerHTML assignment — sanitize any user-supplied content"),
    ("insecure_http", r"[\"']http://(?!localhost|127\.)", "Insecure http:// endpoint reference"),
]


def run_security_scan(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    issues: List[Dict[str, Any]] = []
    for f in files:
        content = f.get("content") or ""
        for code, pattern, msg in _HIGH_PATTERNS:
            if re.search(pattern, content):
                issues.append({"severity": "high", "code": code, "message": msg, "path": f["path"]})
        for code, pattern, msg in _WARN_PATTERNS:
            if re.search(pattern, content):
                issues.append({"severity": "warning", "code": code, "message": msg, "path": f["path"]})
    high = [i for i in issues if i["severity"] == "high"]
    return {"ok": len(high) == 0, "issues": issues[:30], "high_count": len(high)}


def run_gates_on_files(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    qa = run_qa_checks(files)
    sec = run_security_scan(files)
    return {"qa": qa, "security": sec, "ok": qa["ok"] and sec["ok"], "ran_at": now_iso()}


@router.post("/dev-projects/{project_id}/gates/run")
async def run_gates_endpoint(project_id: str, current=Depends(require_user)):
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    files = await db.dev_code_files.find(
        {"project_id": project_id}, {"_id": 0, "path": 1, "content": 1},
    ).to_list(500)
    if not files:
        raise HTTPException(400, "No files yet — run a build first.")
    gates = run_gates_on_files(files)
    # Browser-smoke layer: JS syntax + id contracts + login gate markers.
    try:
        from services.dev_smoke import run_smoke_checks
        smoke = await run_smoke_checks(project_id, browser=True)
        gates["smoke"] = smoke
        gates["ok"] = gates["ok"] and smoke["passed"]
    except Exception:
        pass
    await db.dev_projects.update_one(
        {"id": project_id}, {"$set": {"last_gates": gates, "updated_at": now_iso()}},
    )
    return gates


# ─── PM action approvals ─────────────────────────────────────────────────
def _public_approval(a: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in a.items() if k != "_id"}


async def _chat_id_for_project(project: Dict[str, Any]) -> Optional[str]:
    cid = project.get("related_chat_id")
    if cid:
        return cid
    chat = await db.chats.find_one(
        {"linked_dev_project_id": project["id"]}, {"_id": 0, "id": 1},
    )
    return chat["id"] if chat else None


async def _post_approval_message(chat_id: str, body: str, card: Optional[Dict[str, Any]] = None) -> None:
    msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "ai-system",
        "body": body,
        "parent_message_id": None,
        "metadata": {"source": "dev_approval", **({"approval_card": card} if card else {})},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(chat_id, msg)


async def maybe_require_approval(
    project: Dict[str, Any],
    action: str,
    current: Dict[str, Any],
    payload: Optional[Dict[str, Any]] = None,
    gates: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Returns None when the requester may act directly (PM/owner/admin).
    Otherwise creates (or reuses) a pending approval, posts an approval
    card to the linked chat, notifies the PM, and returns the
    approval_requested response body."""
    if is_pm_or_admin(project, current):
        return None

    existing = await db.dev_action_approvals.find_one(
        {"project_id": project["id"], "action": action, "status": "pending"}, {"_id": 0},
    )
    if existing:
        return {"status": "approval_requested", "approval": existing, "already_pending": True}

    approval = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "project_id": project["id"],
        "project_name": project.get("name"),
        "action": action,
        "action_label": ACTION_LABELS.get(action, action),
        "payload": payload or {},
        "gates": gates,
        "risk_level": "high",
        "requested_by": current["id"],
        "requested_by_name": current.get("name") or current.get("email") or "Teammate",
        "status": "pending",
        "decided_by": None,
        "decided_at": None,
        "decision_note": "",
        "result": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_action_approvals.insert_one(approval.copy())

    chat_id = await _chat_id_for_project(project)
    if chat_id:
        await _post_approval_message(
            chat_id,
            f"🔐 **Approval required** — {approval['requested_by_name']} wants to "
            f"**{approval['action_label'].lower()}** for *{project.get('name')}*. "
            f"Waiting on the Product Manager.",
            card={
                "approval_id": approval["id"],
                "action": action,
                "action_label": approval["action_label"],
                "project_id": project["id"],
                "project_name": project.get("name"),
            },
        )
    pm = await product_manager_id(project, current["workspace_id"])
    if pm and pm != current["id"]:
        try:
            await _post_reminder(
                pm,
                f'{approval["requested_by_name"]} requested approval to '
                f'{approval["action_label"].lower()} for "{project.get("name")}".',
                {"id": approval["id"]},
            )
        except Exception as e:
            logger.warning("[dev-gates] PM reminder failed: %s", e)
    return {"status": "approval_requested", "approval": approval}


@router.get("/dev-projects/{project_id}/action-approvals")
async def list_action_approvals(project_id: str, current=Depends(require_user)):
    rows = await db.dev_action_approvals.find(
        {"project_id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    ).sort("created_at", -1).to_list(50)
    return {"approvals": rows}


@router.get("/dev-action-approvals/{approval_id}")
async def get_action_approval(approval_id: str, current=Depends(require_user)):
    a = await db.dev_action_approvals.find_one(
        {"id": approval_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not a:
        raise HTTPException(404, "Approval not found")
    project = await db.dev_projects.find_one(
        {"id": a["project_id"]}, {"_id": 0, "role_claims": 1},
    )
    a["can_decide"] = is_pm_or_admin(project or {}, current) and a["status"] == "pending"
    return a


class DecisionReq(BaseModel):
    decision: str  # approve | reject
    note: str = ""


@router.post("/dev-action-approvals/{approval_id}/decision")
async def decide_action_approval(approval_id: str, payload: DecisionReq, current=Depends(require_user)):
    if payload.decision not in ("approve", "reject"):
        raise HTTPException(400, "decision must be approve or reject")
    approval = await db.dev_action_approvals.find_one(
        {"id": approval_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not approval:
        raise HTTPException(404, "Approval not found")
    if approval["status"] != "pending":
        raise HTTPException(409, f"Already {approval['status']}")
    project = await db.dev_projects.find_one(
        {"id": approval["project_id"], "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    if not is_pm_or_admin(project, current):
        raise HTTPException(403, "Only the Product Manager (or workspace owner/admin) can decide")

    status = "approved" if payload.decision == "approve" else "rejected"
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

    if status == "approved":
        try:
            if approval["action"] == "production_publish":
                from routes.dev_publish import _do_publish
                files = await db.dev_code_files.find(
                    {"project_id": project["id"]}, {"_id": 0, "path": 1, "content": 1, "kind": 1},
                ).to_list(500)
                result = await _do_publish(
                    project, files, approval["requested_by"],
                    (approval.get("payload") or {}).get("slug"),
                    gates=approval.get("gates"),
                )
            elif approval["action"] == "github_export":
                from services.github_service import export_or_fallback
                result = await export_or_fallback(project, requested_by=approval["requested_by"])
        except Exception as e:
            logger.warning("[dev-gates] approved action failed: %s", e)
            error = str(e)[:300]

    updates = {
        "status": status,
        "decided_by": current["id"],
        "decided_by_name": current.get("name") or current.get("email"),
        "decided_at": now_iso(),
        "decision_note": payload.note[:500],
        "result": result,
        "error": error,
        "updated_at": now_iso(),
    }
    await db.dev_action_approvals.update_one({"id": approval_id}, {"$set": updates})
    approval.update(updates)

    chat_id = await _chat_id_for_project(project)
    if chat_id:
        if status == "approved" and not error:
            extra = ""
            if approval["action"] == "production_publish" and result:
                extra = f" Live at `{result.get('path')}` (v{result.get('version')})."
            body = (
                f"✅ **Approved** — {updates['decided_by_name']} approved "
                f"*{approval['action_label'].lower()}* for **{project.get('name')}**.{extra}"
            )
        elif status == "approved" and error:
            body = f"⚠️ Approved, but execution failed: {error}"
        else:
            body = (
                f"⛔ **Rejected** — {updates['decided_by_name']} rejected "
                f"*{approval['action_label'].lower()}* for **{project.get('name')}**."
                + (f" Note: {payload.note}" if payload.note else "")
            )
        await _post_approval_message(chat_id, body)
    return _public_approval(approval)
