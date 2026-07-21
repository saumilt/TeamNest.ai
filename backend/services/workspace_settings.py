"""Workspace-admin + per-user settings.

Phase 2 of AI Conversation Mode makes the previously-hardcoded routing
defaults configurable, and adds a workspace security setting for temporary
password expiry.

Two documents:
  * ``workspace_admin_settings`` — one per workspace (namespaced: ai_conversation,
    security). Owner/admin editable.
  * ``ai_conversation_preferences`` — one per (workspace, user). User editable.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from deps import db, new_id, now_iso

# ── Defaults ────────────────────────────────────────────────────────────────
AI_CONV_WS_DEFAULTS = {
    "enabled": True,               # master switch for the whole workspace
    "default_timeout_minutes": 30,  # 0 or less = keep active until the user exits
    "follow_up_threshold": 0.75,
    "allow_in_group_chats": True,
}
SECURITY_WS_DEFAULTS = {
    "temp_password_expiry_days": 7,
}
AI_CONV_USER_DEFAULTS = {
    "auto_continue_enabled": True,
    "session_timeout_minutes": None,  # None = inherit workspace default
    "follow_up_threshold": None,      # None = inherit workspace default
    "show_recipient_indicator": True,
    "ask_when_ambiguous": True,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(s) -> Optional[datetime]:
    if not s:
        return None
    if isinstance(s, datetime):
        return s
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


# ── Workspace admin settings ────────────────────────────────────────────────
async def _get_ws_doc(workspace_id: str) -> dict:
    doc = await db.workspace_admin_settings.find_one(
        {"workspace_id": workspace_id}, {"_id": 0}
    )
    return doc or {}


async def get_ws_ai_conversation(workspace_id: str) -> dict:
    doc = await _get_ws_doc(workspace_id)
    return {**AI_CONV_WS_DEFAULTS, **(doc.get("ai_conversation") or {})}


async def get_ws_security(workspace_id: str) -> dict:
    doc = await _get_ws_doc(workspace_id)
    return {**SECURITY_WS_DEFAULTS, **(doc.get("security") or {})}


async def _upsert_ws(workspace_id: str, key: str, values: dict) -> dict:
    await db.workspace_admin_settings.update_one(
        {"workspace_id": workspace_id},
        {
            "$set": {f"{key}.{k}": v for k, v in values.items()}
            | {"updated_at": now_iso()},
            "$setOnInsert": {"id": new_id(), "workspace_id": workspace_id},
        },
        upsert=True,
    )
    if key == "ai_conversation":
        return await get_ws_ai_conversation(workspace_id)
    return await get_ws_security(workspace_id)


async def set_ws_ai_conversation(workspace_id: str, values: dict) -> dict:
    clean = {k: v for k, v in values.items() if k in AI_CONV_WS_DEFAULTS and v is not None}
    return await _upsert_ws(workspace_id, "ai_conversation", clean)


async def set_ws_security(workspace_id: str, values: dict) -> dict:
    clean = {k: v for k, v in values.items() if k in SECURITY_WS_DEFAULTS and v is not None}
    return await _upsert_ws(workspace_id, "security", clean)


# ── Per-user AI conversation preferences ────────────────────────────────────
async def get_user_prefs(workspace_id: str, user_id: str) -> dict:
    doc = await db.ai_conversation_preferences.find_one(
        {"workspace_id": workspace_id, "user_id": user_id}, {"_id": 0}
    )
    return {**AI_CONV_USER_DEFAULTS, **{k: v for k, v in (doc or {}).items() if k in AI_CONV_USER_DEFAULTS}}


async def set_user_prefs(workspace_id: str, user_id: str, values: dict) -> dict:
    clean = {k: v for k, v in values.items() if k in AI_CONV_USER_DEFAULTS}
    await db.ai_conversation_preferences.update_one(
        {"workspace_id": workspace_id, "user_id": user_id},
        {
            "$set": {**clean, "updated_at": now_iso()},
            "$setOnInsert": {"id": new_id(), "workspace_id": workspace_id, "user_id": user_id},
        },
        upsert=True,
    )
    return await get_user_prefs(workspace_id, user_id)


# ── Effective settings used by the routing engine ───────────────────────────
async def get_effective_ai_settings(workspace_id: Optional[str], user_id: str) -> dict:
    """Merge workspace + user settings into the values the router acts on.
    User values override workspace defaults; workspace ``enabled`` and
    ``allow_in_group_chats`` are hard master switches."""
    ws = await get_ws_ai_conversation(workspace_id) if workspace_id else dict(AI_CONV_WS_DEFAULTS)
    pref = await get_user_prefs(workspace_id, user_id) if workspace_id else dict(AI_CONV_USER_DEFAULTS)
    timeout = pref["session_timeout_minutes"]
    if timeout is None:
        timeout = ws["default_timeout_minutes"]
    threshold = pref["follow_up_threshold"]
    if threshold is None:
        threshold = ws["follow_up_threshold"]
    return {
        "enabled": bool(ws["enabled"] and pref["auto_continue_enabled"]),
        "allow_in_group_chats": bool(ws["allow_in_group_chats"]),
        "timeout_minutes": int(timeout),
        "follow_up_threshold": float(threshold),
        "ask_when_ambiguous": bool(pref["ask_when_ambiguous"]),
        "show_recipient_indicator": bool(pref["show_recipient_indicator"]),
    }


# ── Temporary-password expiry ───────────────────────────────────────────────
async def temp_password_expired(user: dict) -> bool:
    """True when a provisioned account (still must_change_password) has had its
    temporary password past the workspace expiry window without completing
    first login."""
    if not user.get("must_change_password"):
        return False
    days = (await get_ws_security(user.get("workspace_id"))).get("temp_password_expiry_days", 7)
    if not days or days <= 0:
        return False
    issued = _parse_iso(user.get("temp_password_issued_at") or user.get("created_at"))
    if not issued:
        return False
    return _now() > issued + timedelta(days=int(days))
