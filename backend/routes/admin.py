"""Admin dashboard analytics + user management (owner / admin only)."""
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from deps import PROJ, _ws_chat_ids, db, now_iso, public_user, require_user
from services.audit import list_audit
from services.workspace_membership import list_workspace_members

router = APIRouter()


@router.get("/admin/audit-logs")
async def admin_audit_logs(
    action: Optional[str] = Query(None),
    actor_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current=Depends(require_user),
):
    """Owner/Admin only — read the workspace audit trail."""
    if current["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin only")
    logs = await list_audit(
        workspace_id=current["workspace_id"],
        action=action,
        actor_id=actor_id,
        limit=limit,
    )
    return {"logs": logs, "count": len(logs)}


@router.get("/admin/ai-usage")
async def admin_ai_usage(
    group_by: str = Query("user", regex="^(user|chat|model|date)$"),
    days: int = Query(30, ge=1, le=365),
    current=Depends(require_user),
):
    """Owner/Admin only — AI credit usage broken down by user / chat / model / date."""
    if current["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin only")
    ws_id = current["workspace_id"]
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    rows: dict = {}
    total = 0
    async for e in db.ai_credit_ledger.find(
        {"workspace_id": ws_id, "at": {"$gte": cutoff}},
        {"_id": 0, "user_id": 1, "chat_id": 1, "model_key": 1, "amount": 1,
         "billed_amount": 1, "at": 1},
    ):
        amt = int(e.get("amount") or e.get("billed_amount") or 0)
        total += amt
        if group_by == "user":
            key = e.get("user_id") or "unknown"
        elif group_by == "chat":
            key = e.get("chat_id") or "unknown"
        elif group_by == "model":
            key = e.get("model_key") or "unknown"
        else:
            key = (e.get("at") or "")[:10]
        r = rows.setdefault(key, {"key": key, "credits": 0, "count": 0})
        r["credits"] += amt
        r["count"] += 1
    out = list(rows.values())
    if group_by == "user":
        ids = [r["key"] for r in out if r["key"] != "unknown"]
        users = await db.users.find({"id": {"$in": ids}}, PROJ).to_list(1000)
        umap = {u["id"]: (u.get("name") or u.get("email") or "Unknown") for u in users}
        for r in out:
            r["label"] = umap.get(r["key"], "Unknown")
    elif group_by == "chat":
        ids = [r["key"] for r in out if r["key"] != "unknown"]
        chats = await db.chats.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
        cmap = {c["id"]: (c.get("name") or "Chat") for c in chats}
        for r in out:
            r["label"] = cmap.get(r["key"], "Direct / Unknown")
    else:
        for r in out:
            r["label"] = r["key"] or "Unknown"
    out.sort(key=lambda r: r["credits"], reverse=True)
    return {"group_by": group_by, "days": days, "total_credits": total, "rows": out}


async def _member_user_ids(workspace_id: str) -> list:
    """Return all user ids that are members of this workspace via workspace_members."""
    return [
        m["user_id"]
        async for m in db.workspace_members.find(
            {"workspace_id": workspace_id, "status": {"$ne": "removed"}},
            {"user_id": 1, "_id": 0},
        )
    ]


@router.get("/admin/overview")
async def admin_overview(current=Depends(require_user)):
    if current["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin only")
    ws_id = current["workspace_id"]
    cutoff_active = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    chat_ids = await _ws_chat_ids(ws_id)
    member_user_ids = await _member_user_ids(ws_id)
    [users_total, chats_total, groups_total, ai_threads, tasks_total,
     overdue_tasks, approvals_approved, approvals_pending, files_total,
     active_users, msgs_total] = await asyncio.gather(
        db.workspace_members.count_documents({"workspace_id": ws_id, "status": {"$ne": "removed"}}),
        db.chats.count_documents({"workspace_id": ws_id}),
        db.chats.count_documents({"workspace_id": ws_id, "type": "group"}),
        db.ai_threads.count_documents({"chat_id": {"$in": chat_ids}}),
        db.tasks.count_documents({"workspace_id": ws_id}),
        db.tasks.count_documents({
            "workspace_id": ws_id,
            "status": {"$nin": ["completed"]},
            "due_date": {"$lt": now_iso(), "$ne": None},
        }),
        db.approvals.count_documents({"workspace_id": ws_id, "status": "approved"}),
        db.approvals.count_documents({
            "workspace_id": ws_id,
            "status": {"$in": ["needs_review", "needs_revision"]},
        }),
        db.files.count_documents({"workspace_id": ws_id}),
        db.users.count_documents({"id": {"$in": member_user_ids}, "last_active": {"$gte": cutoff_active}}),
        db.messages.count_documents({"chat_id": {"$in": chat_ids}}),
    )
    thread_ids = [t["id"] async for t in db.ai_threads.find(
        {"chat_id": {"$in": chat_ids}}, {"id": 1, "_id": 0}
    )]
    pipeline = [
        {"$match": {"research_thread_id": {"$in": thread_ids}}},
        {"$group": {"_id": "$model_key", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    model_usage = []
    async for r in db.ai_responses.aggregate(pipeline):
        if r["_id"]:
            model_usage.append({"model": r["_id"], "count": r["count"]})

    storage_size = 0
    async for f in db.files.find({"workspace_id": ws_id}, {"size": 1, "_id": 0}):
        storage_size += int(f.get("size") or 0)

    return {
        "users_total": users_total,
        "users_active_14d": active_users,
        "chats_total": chats_total,
        "groups_total": groups_total,
        "messages_total": msgs_total,
        "ai_threads_total": ai_threads,
        "tasks_total": tasks_total,
        "tasks_overdue": overdue_tasks,
        "approvals_approved": approvals_approved,
        "approvals_pending": approvals_pending,
        "files_total": files_total,
        "storage_bytes": storage_size,
        "ai_model_usage": model_usage,
    }


@router.get("/admin/users")
async def admin_users(current=Depends(require_user)):
    if current["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin only")
    users = await list_workspace_members(current["workspace_id"])
    out = []
    for u in users:
        task_count = await db.tasks.count_documents(
            {"assigned_to": u["id"], "workspace_id": current["workspace_id"], "status": {"$nin": ["completed"]}}
        )
        out.append({
            **public_user(u),
            "open_tasks": task_count,
            "last_active": u.get("last_active"),
        })
    return out


async def _build_user_update(payload, membership, current):
    """Validate role/status changes and return the update dict.

    Raises HTTPException on invalid transitions or an empty update.
    """
    update = {}
    if "role" in payload and payload["role"] in ("owner", "admin", "member", "viewer", "guest"):
        if membership.get("role") == "owner" and payload["role"] != "owner":
            owner_count = await db.workspace_members.count_documents(
                {"workspace_id": current["workspace_id"], "role": "owner", "status": {"$ne": "removed"}}
            )
            if owner_count <= 1:
                raise HTTPException(400, "Cannot demote the only owner")
        update["role"] = payload["role"]
    if "status" in payload and payload["status"] in ("active", "disabled"):
        update["status"] = payload["status"]
    if not update:
        raise HTTPException(400, "Nothing to update")
    return update


async def _audit_user_update(current, user_id, update, membership, u):
    """Emit audit rows for role and/or status changes."""
    from services.audit import record_audit
    if "role" in update:
        await record_audit(
            workspace_id=current["workspace_id"], actor_id=current["id"], actor_name=current.get("name"),
            action="user.role_changed", target_type="user", target_id=user_id,
            meta={"old_role": membership.get("role"), "new_role": update["role"], "target_name": u.get("name")},
        )
    if "status" in update:
        await record_audit(
            workspace_id=current["workspace_id"], actor_id=current["id"], actor_name=current.get("name"),
            action=("user.disabled" if update["status"] == "disabled" else "user.activated"),
            target_type="user", target_id=user_id, meta={"target_name": u.get("name")},
        )


@router.patch("/admin/users/{user_id}")
async def admin_update_user(
    user_id: str, payload: dict, current=Depends(require_user)
):
    if current["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin only")
    if user_id == current["id"] and payload.get("status") == "disabled":
        raise HTTPException(400, "Cannot disable yourself")
    membership = await db.workspace_members.find_one(
        {"user_id": user_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not membership:
        raise HTTPException(404, "User not found in this workspace")
    update = await _build_user_update(payload, membership, current)
    await db.workspace_members.update_one(
        {"user_id": user_id, "workspace_id": current["workspace_id"]}, {"$set": update}
    )
    # If the target user is currently active in this workspace, mirror the role
    # on their user doc too so the next request reflects the change immediately.
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "workspace_id": 1})
    if target and target.get("workspace_id") == current["workspace_id"]:
        await db.users.update_one({"id": user_id}, {"$set": update})
    u = await db.users.find_one({"id": user_id}, PROJ)
    u["role"] = update.get("role", membership.get("role"))
    u["status"] = update.get("status", membership.get("status"))
    await _audit_user_update(current, user_id, update, membership, u)
    return public_user(u)


@router.get("/admin/task-analytics")
async def admin_task_analytics(current=Depends(require_user)):
    if current["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin only")
    ws = current["workspace_id"]
    by_status_pipe = [
        {"$match": {"workspace_id": ws}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    by_assignee_pipe = [
        {"$match": {"workspace_id": ws, "assigned_to": {"$ne": None}}},
        {"$group": {"_id": "$assigned_to", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]
    by_status = [r async for r in db.tasks.aggregate(by_status_pipe)]
    by_assignee_raw = [r async for r in db.tasks.aggregate(by_assignee_pipe)]
    by_assignee = []
    for r in by_assignee_raw:
        u = await db.users.find_one({"id": r["_id"]}, PROJ)
        by_assignee.append({
            "user_id": r["_id"],
            "name": (u or {}).get("name", "—"),
            "count": r["count"],
        })
    today_iso = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat()
    tomorrow_iso = (
        datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        + timedelta(days=1)
    ).isoformat()
    due_today = await db.tasks.count_documents({
        "workspace_id": ws,
        "status": {"$nin": ["completed"]},
        "due_date": {"$gte": today_iso, "$lt": tomorrow_iso},
    })
    return {
        "by_status": [{"status": r["_id"], "count": r["count"]} for r in by_status],
        "by_assignee": by_assignee,
        "due_today": due_today,
    }


@router.get("/admin/approvals-analytics")
async def admin_approvals_analytics(current=Depends(require_user)):
    if current["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin only")
    ws = current["workspace_id"]
    by_status = [r async for r in db.approvals.aggregate([
        {"$match": {"workspace_id": ws}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ])]
    return {"by_status": [{"status": r["_id"], "count": r["count"]} for r in by_status]}



# ─── Billing / credit pricing ───────────────────────────────────────────────
class CreditMarginPatch(BaseModel):
    credit_margin_pct: Optional[float] = None        # e.g. 0.25 = 25%
    credit_usd_per_credit: Optional[float] = None    # e.g. 0.001 = 1 credit per 0.1 cent
    provider_rates: Optional[dict] = None            # override individual provider rates
    credit_packs: Optional[list] = None              # [{id, credits, price_usd, bonus_pct}]
    credit_promo: Optional[dict] = None              # {enabled, splash_title, banner, badge}


@router.get("/admin/billing-settings")
async def get_billing_settings(current=Depends(require_user)):
    """Admin / owner only — read the live system-wide billing knobs."""
    if current["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin only")
    from services.billing_settings import get_settings
    return await get_settings()


@router.patch("/admin/billing-settings")
async def patch_billing_settings(payload: CreditMarginPatch, current=Depends(require_user)):
    """Admin / owner only — update margin and/or unit price. The pricing page
    re-flows immediately on next page load."""
    if current["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin only")
    from services.billing_settings import update_settings
    return await update_settings(payload.dict(exclude_unset=True))



# ── Security: temporary-password expiry ──────────────────────────────────────
def _admin_only(current: dict):
    if current["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin only")


class SecuritySettingsPatch(BaseModel):
    temp_password_expiry_days: Optional[int] = None


@router.get("/admin/security-settings")
async def get_security_settings(current=Depends(require_user)):
    _admin_only(current)
    from services.workspace_settings import get_ws_security
    return await get_ws_security(current["workspace_id"])


@router.put("/admin/security-settings")
async def put_security_settings(
    payload: SecuritySettingsPatch, current=Depends(require_user)
):
    _admin_only(current)
    if payload.temp_password_expiry_days is not None and payload.temp_password_expiry_days < 0:
        raise HTTPException(400, "Expiry days cannot be negative (use 0 to disable expiry)")
    from services.workspace_settings import set_ws_security
    return await set_ws_security(
        current["workspace_id"],
        {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None},
    )


@router.get("/admin/provisioned-accounts")
async def list_provisioned_accounts(current=Depends(require_user)):
    """Provisioned accounts (still on a temporary password) with expiry status,
    so owners can spot and re-issue expired invitations."""
    _admin_only(current)
    from services.workspace_settings import get_ws_security, temp_password_expired
    ws = current["workspace_id"]
    days = (await get_ws_security(ws)).get("temp_password_expiry_days", 7)
    rows = []
    async for u in db.users.find(
        {"workspace_id": ws, "must_change_password": True},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "created_at": 1, "temp_password_issued_at": 1},
    ):
        issued = u.get("temp_password_issued_at") or u.get("created_at")
        rows.append({
            "id": u["id"], "name": u.get("name"), "email": u.get("email"),
            "issued_at": issued,
            "expired": await temp_password_expired({**u, "workspace_id": ws}),
        })
    rows.sort(key=lambda r: r.get("issued_at") or "", reverse=True)
    return {"accounts": rows, "expiry_days": days}


@router.post("/admin/provisioned-accounts/{uid}/rotate")
async def rotate_temp_password(uid: str, current=Depends(require_user)):
    """Issue a fresh temporary password for a provisioned account and reset its
    expiry clock. Returns the plaintext once for the admin to share securely."""
    _admin_only(current)
    import secrets as _secrets
    from auth_utils import hash_password
    user = await db.users.find_one(
        {"id": uid, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1, "email": 1}
    )
    if not user:
        raise HTTPException(404, "User not found in this workspace")
    new_pw = _secrets.token_urlsafe(9) + "aA1$"
    await db.users.update_one(
        {"id": uid},
        {"$set": {
            "password_hash": hash_password(new_pw),
            "must_change_password": True,
            "temp_password_issued_at": now_iso(),
            "updated_at": now_iso(),
        }},
    )
    return {"ok": True, "email": user["email"], "temporary_password": new_pw}
