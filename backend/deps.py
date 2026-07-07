"""Shared infrastructure used by all routers.

Holds the singleton Mongo client + the small helper functions that need to be
callable from multiple router modules (broadcasting, reminders, badges, etc.).

Routers should always import from here rather than from `server`.
"""
import logging
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

# Make sure .env is loaded before any os.environ[...] access happens, even when
# deps.py is the first import in a router module.
load_dotenv(Path(__file__).parent / ".env")

from auth_utils import get_current_user_id  # noqa: E402
from models import new_id, now_iso  # noqa: E402, F401  (re-export)
from ws_manager import manager  # noqa: E402

logger = logging.getLogger("teamnest")

_mongo_url = os.environ["MONGO_URL"]
client: AsyncIOMotorClient = AsyncIOMotorClient(_mongo_url)
db = client[os.environ["DB_NAME"]]

# Mongo projection that strips internal fields from every user lookup.
PROJ = {"_id": 0, "password_hash": 0}

# Referral tier thresholds — exposed so the invites router can compute progress.
BADGE_THRESHOLDS = [("bronze", 1), ("silver", 5), ("gold", 15), ("platinum", 50)]


def _referral_badge(count: int) -> Optional[str]:
    if count >= 50:
        return "platinum"
    if count >= 15:
        return "gold"
    if count >= 5:
        return "silver"
    if count >= 1:
        return "bronze"
    return None


def _next_badge(count: int) -> dict:
    for name, threshold in BADGE_THRESHOLDS:
        if count < threshold:
            return {"next_badge": name, "remaining": threshold - count, "threshold": threshold}
    return {"next_badge": None, "remaining": 0, "threshold": None}


def normalize_phone(phone: str | None) -> str:
    """Strip everything except digits. Returns '' for None/empty. Stored on the
    user record as `phone_normalized` so we can do exact matching regardless of
    user input format."""
    if not phone:
        return ""
    digits = "".join(c for c in str(phone) if c.isdigit())
    # Drop the international `+` (already stripped) and any leading 0s only if
    # the result is unreasonably long; otherwise return as-is. Frontend is
    # expected to send the user-provided string.
    return digits


def public_user(u: dict) -> dict:
    if not u:
        return {}
    boost_until = u.get("pro_boost_until")
    return {
        "id": u["id"],
        "name": u["name"],
        "email": u["email"],
        "phone": u.get("phone"),
        "avatar": u.get("avatar"),
        "role": u.get("role", "member"),
        "workspace_id": u.get("workspace_id"),
        "status": u.get("status", "active"),
        "created_at": u.get("created_at"),
        "preferences": u.get("preferences") or {"favorite_ai_model": "claude", "favorite_models": []},
        "referral_count": int(u.get("referral_count") or 0),
        "referral_badge": _referral_badge(int(u.get("referral_count") or 0)),
        "pro_boost_until": boost_until,
        "pro_boost_active": bool(boost_until and boost_until > now_iso()),
        "must_change_password": bool(u.get("must_change_password")),
    }


async def get_user(user_id: str) -> dict:
    user = await db.users.find_one({"id": user_id}, PROJ)
    if not user:
        raise HTTPException(404, "User not found")
    # Overlay role/status from the active workspace's membership (multi-workspace
    # support). Falls back to the legacy user.role for users that pre-date the
    # workspace_members migration.
    ws_id = user.get("workspace_id")
    if ws_id:
        m = await db.workspace_members.find_one(
            {"user_id": user["id"], "workspace_id": ws_id}, {"_id": 0}
        )
        if m:
            user["role"] = m.get("role") or user.get("role", "member")
            user["status"] = m.get("status") or user.get("status", "active")
    return user


async def require_user(user_id: str = Depends(get_current_user_id)) -> dict:
    return await get_user(user_id)


async def ensure_personal_ai_chat(user_id: str, workspace_id: str) -> dict:
    """Return (creating if needed) the user's personal AI chat scoped to the
    given workspace. Each workspace a user belongs to gets its own personal AI
    chat so reminders and assistant conversations stay properly scoped."""
    chat = await db.chats.find_one(
        {"type": "personal_ai", "created_by": user_id, "workspace_id": workspace_id},
        {"_id": 0},
    )
    if chat:
        return chat
    chat = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "type": "personal_ai",
        "name": "My AI Assistant",
        "description": "Your personal AI workspace.",
        "project_folder_id": None,
        "default_models": ["claude"],
        "member_ids": [user_id],
        "created_by": user_id,
        "created_at": now_iso(),
        "pinned_message_ids": [],
    }
    await db.chats.insert_one(chat.copy())
    return chat


async def _broadcast_message(chat_id: str, message: dict) -> None:
    await manager.broadcast(chat_id, {"event": "message", "data": message})


async def _post_reminder(user_id: str, body: str, task: dict) -> None:
    """Drop a system reminder message into the user's personal AI chat."""
    user = await db.users.find_one({"id": user_id}, PROJ)
    if not user:
        return
    personal = await ensure_personal_ai_chat(user["id"], user["workspace_id"])
    msg = {
        "id": new_id(),
        "chat_id": personal["id"],
        "sender_id": "ai-system",
        "message_type": "text",
        "body": body,
        "parent_message_id": None,
        "metadata": {"reminder": True, "task_id": task["id"]},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(personal["id"], msg)


async def _ws_chat_ids(ws_id: str) -> list:
    """Return all chat ids belonging to a workspace — used by admin analytics."""
    return [c["id"] async for c in db.chats.find({"workspace_id": ws_id}, {"id": 1, "_id": 0})]


async def project_dev_team_hired(project: dict) -> bool:
    """True when @devmanager is unlocked for this dev project — the related
    chat paid the one-time hire, or (chatless project) any chat in the
    workspace has."""
    rc = project.get("related_chat_id") or project.get("linked_chat_id")
    if rc:
        c = await db.chats.find_one({"id": rc}, {"_id": 0, "dev_team_hired": 1})
        return bool(c and c.get("dev_team_hired"))
    c = await db.chats.find_one(
        {"workspace_id": project.get("workspace_id"), "dev_team_hired": True}, {"_id": 1},
    )
    return bool(c)


# ─── Demo-mode guardrails ────────────────────────────────────────────────────
DEMO_USER_EMAIL = "amit@demo.team"
DEMO_BUILD_LIMIT_PER_HOUR = int(os.environ.get("DEMO_BUILD_LIMIT_PER_HOUR", "10"))
_demo_ws_cache: dict = {"id": None, "at": 0.0}


async def demo_workspace_id() -> Optional[str]:
    """Workspace id of the public demo account (5-min cached)."""
    import time
    if _demo_ws_cache["id"] is not None and time.time() - _demo_ws_cache["at"] < 300:
        return _demo_ws_cache["id"]
    u = await db.users.find_one({"email": DEMO_USER_EMAIL}, {"_id": 0, "workspace_id": 1})
    _demo_ws_cache["id"] = (u or {}).get("workspace_id")
    _demo_ws_cache["at"] = time.time()
    return _demo_ws_cache["id"]


async def is_demo_workspace(workspace_id: Optional[str]) -> bool:
    return bool(workspace_id) and workspace_id == await demo_workspace_id()


async def demo_build_quota(workspace_id: str) -> dict:
    """Demo workspaces get DEMO_BUILD_LIMIT_PER_HOUR AI builds/edits per rolling hour."""
    if not await is_demo_workspace(workspace_id):
        return {"is_demo": False, "limit": 0, "used": 0, "remaining": None}
    from datetime import datetime, timedelta, timezone
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    used = await db.dev_build_activities.count_documents(
        {"workspace_id": workspace_id, "created_at": {"$gte": cutoff}},
    )
    return {
        "is_demo": True,
        "limit": DEMO_BUILD_LIMIT_PER_HOUR,
        "used": used,
        "remaining": max(0, DEMO_BUILD_LIMIT_PER_HOUR - used),
    }


async def block_if_demo(workspace_id: str, message: str) -> None:
    """403 with a friendly message when the workspace is the public demo."""
    if await is_demo_workspace(workspace_id):
        raise HTTPException(403, message)
