"""Per-group AI Billing & Permissions.

A single document per chat (`chat_ai_settings`) controls who can use AI, who
pays, and how much. The dispatcher consults `check_ai_allowed()` BEFORE
firing any LLM call. Defaults follow the "Owner Pays Unless Changed" rule:

  - Workspace chat  → workspace pays
  - Personal chat   → creator pays from their personal AI credits

Billing modes:
  1. workspace_pays
  2. requester_pays
  3. sponsor_pays      (requires sponsor_user_id)
  4. split_usage       (requires split_user_ids[])
  5. guests_disabled   (same as workspace_pays but guests/sms_guests blocked)

Enforcement order for an AI Employee action:
  employee_included → employee_monthly → group_budget → workspace_wallet → overage
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import db, new_id, now_iso, require_user

router = APIRouter()


BillingMode = Literal[
    "workspace_pays", "requester_pays", "sponsor_pays", "split_usage", "guests_disabled",
]


def _default_settings(chat: Dict[str, Any]) -> Dict[str, Any]:
    """Returns the "Owner Pays Unless Changed" defaults for a chat."""
    has_workspace = bool(chat.get("workspace_id"))
    return {
        "ai_enabled": True,
        "billing_mode": "workspace_pays" if has_workspace else "requester_pays",
        "sponsor_user_id": None,
        "split_user_ids": [],
        "who_can_ask_ai_roles": ["owner", "admin", "member"],
        "monthly_group_budget_credits": None,  # None = inherit workspace
        "per_user_credit_limit": None,
        "per_question_credit_limit": None,
        "guest_ai_enabled": False,
        "sms_guest_ai_enabled": False,
        "premium_models_enabled": True,
        "multi_model_compare_enabled": True,
        "web_research_enabled": True,
        "document_analysis_enabled": True,
        "memory_access_enabled": True,
        "approval_threshold_credits": None,
        "usage_alerts_enabled": True,
        "billed_to_label": None,  # cached display label for banners
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }


# ─── Pydantic ────────────────────────────────────────────────────────────────
class AiSettingsUpdate(BaseModel):
    ai_enabled: Optional[bool] = None
    billing_mode: Optional[BillingMode] = None
    sponsor_user_id: Optional[str] = None
    split_user_ids: Optional[List[str]] = None
    who_can_ask_ai_roles: Optional[List[str]] = None
    monthly_group_budget_credits: Optional[int] = None
    per_user_credit_limit: Optional[int] = None
    per_question_credit_limit: Optional[int] = None
    guest_ai_enabled: Optional[bool] = None
    sms_guest_ai_enabled: Optional[bool] = None
    premium_models_enabled: Optional[bool] = None
    multi_model_compare_enabled: Optional[bool] = None
    web_research_enabled: Optional[bool] = None
    document_analysis_enabled: Optional[bool] = None
    memory_access_enabled: Optional[bool] = None
    approval_threshold_credits: Optional[int] = None
    usage_alerts_enabled: Optional[bool] = None


# ─── Helpers ────────────────────────────────────────────────────────────────
async def get_chat_settings(chat_id: str) -> Dict[str, Any]:
    """Always returns a dict (creates defaults on first read)."""
    doc = await db.chat_ai_settings.find_one({"chat_id": chat_id}, {"_id": 0})
    if doc:
        return doc
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    settings = _default_settings(chat)
    settings["chat_id"] = chat_id
    settings["id"] = new_id()
    await db.chat_ai_settings.insert_one(settings.copy())
    return settings


async def _month_usage(chat_id: str, user_id: Optional[str] = None) -> int:
    """Sum credits consumed this calendar month for the chat (optionally
    filtered to one user)."""
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc).isoformat()
    q: Dict[str, Any] = {"chat_id": chat_id, "created_at": {"$gte": month_start}}
    if user_id:
        q["user_id"] = user_id
    cur = db.chat_ai_usage.aggregate([
        {"$match": q},
        {"$group": {"_id": None, "credits": {"$sum": "$credits"}}},
    ])
    rows = await cur.to_list(1)
    return int(rows[0]["credits"]) if rows else 0


def _membership_role(chat: Dict[str, Any], user_id: str) -> str:
    """Return the user's role in this chat: owner | admin | member | guest |
    sms_guest | external_client | unknown."""
    if chat.get("created_by") == user_id:
        return "owner"
    member_roles = (chat.get("member_roles") or {})  # {user_id: role}
    if user_id in member_roles:
        return member_roles[user_id]
    if user_id in (chat.get("admin_ids") or chat.get("admins") or []):
        return "admin"
    if user_id in (chat.get("guest_ids") or []):
        return "guest"
    if user_id in (chat.get("sms_guest_ids") or []):
        return "sms_guest"
    if user_id in (chat.get("member_ids") or chat.get("members") or []):
        return "member"
    return "unknown"


async def check_ai_allowed(
    chat: Dict[str, Any], user: Dict[str, Any], estimated_credits: int = 10,
) -> Dict[str, Any]:
    """Returns { allowed: bool, reason?, banner?, requires_approval?, billed_to_label?,
                 settings, role }. Used by the dispatcher and by the frontend
    pre-flight check before posting an `@ai` message."""
    settings = await get_chat_settings(chat["id"])
    role = _membership_role(chat, user["id"])

    if not settings["ai_enabled"]:
        return {"allowed": False, "reason": "AI is disabled for this group.", "settings": settings, "role": role}

    # Role gating.
    role_allowed = role in (settings.get("who_can_ask_ai_roles") or [])
    if role == "guest" and not settings.get("guest_ai_enabled"):
        return {"allowed": False, "reason": "Guests cannot use AI in this group.", "settings": settings, "role": role}
    if role == "sms_guest" and not settings.get("sms_guest_ai_enabled"):
        return {"allowed": False, "reason": "SMS guests cannot use AI in this group.", "settings": settings, "role": role}
    if role in ("guest", "sms_guest") and (settings.get("guest_ai_enabled") or settings.get("sms_guest_ai_enabled")):
        role_allowed = True
    if role not in ("owner", "admin") and not role_allowed:
        return {"allowed": False, "reason": "Your role doesn't have AI access in this group.", "settings": settings, "role": role}

    # Per-question cap.
    pq = settings.get("per_question_credit_limit")
    if pq and estimated_credits > pq:
        return {"allowed": False, "reason": f"This task would use {estimated_credits} credits; per-question cap is {pq}.", "settings": settings, "role": role}

    # Per-user monthly cap.
    pu = settings.get("per_user_credit_limit")
    if pu:
        used = await _month_usage(chat["id"], user_id=user["id"])
        if used + estimated_credits > pu:
            return {"allowed": False, "reason": f"You've reached your monthly cap ({pu} credits) for this group.", "settings": settings, "role": role}

    # Group budget.
    gb = settings.get("monthly_group_budget_credits")
    if gb:
        used = await _month_usage(chat["id"])
        if used + estimated_credits > gb:
            return {"allowed": False, "reason": f"This group has reached its monthly AI budget ({gb} credits).", "settings": settings, "role": role}

    # Approval gate.
    requires_approval = False
    at = settings.get("approval_threshold_credits")
    if at and estimated_credits >= at and role not in ("owner", "admin"):
        requires_approval = True

    billed_to = await _billed_to_label(chat, settings)

    return {
        "allowed": True,
        "requires_approval": requires_approval,
        "billed_to_label": billed_to,
        "settings": settings,
        "role": role,
    }


async def _billed_to_label(chat: Dict[str, Any], settings: Dict[str, Any]) -> str:
    mode = settings.get("billing_mode", "workspace_pays")
    if mode == "workspace_pays":
        if chat.get("workspace_id"):
            ws = await db.workspaces.find_one({"id": chat["workspace_id"]}, {"_id": 0, "name": 1})
            return ws.get("name", "this workspace") if ws else "this workspace"
        return "the group creator"
    if mode == "requester_pays":
        return "the user asking (their personal credits)"
    if mode == "sponsor_pays":
        s = settings.get("sponsor_user_id")
        if s:
            u = await db.users.find_one({"id": s}, {"_id": 0, "name": 1})
            return u.get("name", "sponsor") if u else "sponsor"
        return "sponsor (not selected)"
    if mode == "split_usage":
        ids = settings.get("split_user_ids") or []
        return f"split between {len(ids)} members"
    if mode == "guests_disabled":
        return "workspace (guests blocked)"
    return "workspace"


async def record_ai_usage(
    chat_id: str, user_id: str, credits: int,
    employee_key: Optional[str] = None,
    model: Optional[str] = None,
    workflow: Optional[str] = None,
    project_folder_id: Optional[str] = None,
) -> None:
    """Insert a ledger row for usage reporting + threshold alerts."""
    settings = await get_chat_settings(chat_id)
    await db.chat_ai_usage.insert_one({
        "id": new_id(),
        "chat_id": chat_id,
        "workspace_id": (await db.chats.find_one({"id": chat_id}, {"workspace_id": 1, "_id": 0}) or {}).get("workspace_id"),
        "user_id": user_id,
        "credits": int(credits),
        "billing_mode": settings.get("billing_mode"),
        "employee_key": employee_key,
        "model": model,
        "workflow": workflow,
        "project_folder_id": project_folder_id,
        "created_at": now_iso(),
    })
    # Threshold notifications.
    gb = settings.get("monthly_group_budget_credits")
    if gb and settings.get("usage_alerts_enabled"):
        used = await _month_usage(chat_id)
        pct = used / gb if gb else 0
        for label, threshold in (("50%", 0.5), ("80%", 0.8), ("100%", 1.0)):
            already = await db.chat_ai_alerts.find_one(
                {"chat_id": chat_id, "month": datetime.now(timezone.utc).strftime("%Y-%m"), "threshold": label},
            )
            if not already and pct >= threshold:
                await db.chat_ai_alerts.insert_one({
                    "id": new_id(),
                    "chat_id": chat_id,
                    "month": datetime.now(timezone.utc).strftime("%Y-%m"),
                    "threshold": label,
                    "used_credits": used,
                    "budget_credits": gb,
                    "created_at": now_iso(),
                })


# ─── Endpoints ──────────────────────────────────────────────────────────────
@router.get("/chats/{chat_id}/ai-settings")
async def get_ai_settings(chat_id: str, current=Depends(require_user)):
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    settings = await get_chat_settings(chat_id)
    settings["billed_to_label"] = await _billed_to_label(chat, settings)
    settings["role"] = _membership_role(chat, current["id"])
    settings["usage_this_month"] = await _month_usage(chat_id)
    return settings


@router.put("/chats/{chat_id}/ai-settings")
async def update_ai_settings(chat_id: str, payload: AiSettingsUpdate, current=Depends(require_user)):
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    role = _membership_role(chat, current["id"])
    if role not in ("owner", "admin"):
        raise HTTPException(403, "Only owners/admins can change AI billing settings.")
    diff = payload.model_dump(exclude_unset=True)
    if not diff:
        raise HTTPException(400, "No changes")
    if diff.get("billing_mode") == "sponsor_pays" and not (
        diff.get("sponsor_user_id") or (await get_chat_settings(chat_id)).get("sponsor_user_id")
    ):
        raise HTTPException(400, "Sponsor mode requires sponsor_user_id")
    diff["updated_at"] = now_iso()
    await db.chat_ai_settings.update_one(
        {"chat_id": chat_id}, {"$set": diff, "$setOnInsert": {"id": new_id(), "chat_id": chat_id}}, upsert=True,
    )
    settings = await get_chat_settings(chat_id)
    settings["billed_to_label"] = await _billed_to_label(chat, settings)
    return settings


@router.get("/chats/{chat_id}/ai-preflight")
async def preflight(chat_id: str, estimated_credits: int = 10, current=Depends(require_user)):
    """Frontend calls this before showing the @AI composer to know if it can
    fire, what notice banner to display, and who'll be charged."""
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    return await check_ai_allowed(chat, current, estimated_credits)


@router.get("/chats/{chat_id}/ai-usage")
async def ai_usage_report(chat_id: str, current=Depends(require_user)):
    """Full breakdown: by user, by employee, by model, by workflow. Used by
    the AI Billing & Permissions tab and admin Export."""
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    role = _membership_role(chat, current["id"])
    if role not in ("owner", "admin"):
        raise HTTPException(403, "Owners/admins only")

    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc).isoformat()
    match = {"chat_id": chat_id, "created_at": {"$gte": month_start}}

    async def group_by(field: str) -> List[Dict[str, Any]]:
        cur = db.chat_ai_usage.aggregate([
            {"$match": match},
            {"$group": {"_id": f"${field}", "credits": {"$sum": "$credits"}, "count": {"$sum": 1}}},
            {"$sort": {"credits": -1}},
            {"$limit": 20},
        ])
        rows = await cur.to_list(20)
        return [{field: r["_id"], "credits": r["credits"], "count": r["count"]} for r in rows if r["_id"] is not None]

    return {
        "month": now.strftime("%Y-%m"),
        "total_credits": await _month_usage(chat_id),
        "by_user": await group_by("user_id"),
        "by_employee": await group_by("employee_key"),
        "by_model": await group_by("model"),
        "by_workflow": await group_by("workflow"),
        "by_project": await group_by("project_folder_id"),
    }
