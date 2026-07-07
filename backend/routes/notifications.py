"""Notification preferences — per-user, with optional per-chat overrides.

Stored on `users.notification_prefs`:
  {
    "dnd_until": ISO date string | null,  # global mute
    "mute_chats": { chat_id: ISO_end_or_'forever' },
    "mute_groups": bool,            # global group-chat mute
    "mute_dms": bool,               # global DM mute
    "mute_ai_answers": bool,
    "email_digest": "off"|"daily"|"weekly",
  }
"""
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import db, now_iso, require_user

router = APIRouter()


class NotifPrefs(BaseModel):
    dnd_until: Optional[str] = None
    mute_groups: Optional[bool] = None
    mute_dms: Optional[bool] = None
    mute_ai_answers: Optional[bool] = None
    email_digest: Optional[Literal["off", "daily", "weekly"]] = None


class MuteChatPayload(BaseModel):
    chat_id: str
    duration: Literal["1h", "8h", "24h", "1week", "forever"]


def _default_prefs() -> dict:
    return {
        "dnd_until": None,
        "mute_chats": {},
        "mute_groups": False,
        "mute_dms": False,
        "mute_ai_answers": False,
        "email_digest": "daily",
    }


@router.get("/notifications/prefs")
async def get_prefs(current=Depends(require_user)):
    prefs = current.get("notification_prefs") or _default_prefs()
    # Ensure all default keys exist
    base = _default_prefs()
    base.update(prefs)
    return base


@router.patch("/notifications/prefs")
async def update_prefs(payload: NotifPrefs, current=Depends(require_user)):
    existing = current.get("notification_prefs") or _default_prefs()
    update_doc = {**existing}
    incoming = payload.model_dump(exclude_unset=True)
    update_doc.update(incoming)
    await db.users.update_one(
        {"id": current["id"]},
        {"$set": {"notification_prefs": update_doc, "notification_prefs_updated_at": now_iso()}},
    )
    return update_doc


@router.post("/notifications/mute-chat")
async def mute_chat(payload: MuteChatPayload, current=Depends(require_user)):
    """Mute a single chat for the given duration. 'forever' = until manually unmuted."""
    chat = await db.chats.find_one({"id": payload.chat_id, "member_ids": current["id"]}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    now = datetime.now(timezone.utc)
    durations = {
        "1h": timedelta(hours=1),
        "8h": timedelta(hours=8),
        "24h": timedelta(hours=24),
        "1week": timedelta(days=7),
    }
    if payload.duration == "forever":
        until = "forever"
    else:
        until = (now + durations[payload.duration]).isoformat()
    existing = current.get("notification_prefs") or _default_prefs()
    mute_chats = dict(existing.get("mute_chats") or {})
    mute_chats[payload.chat_id] = until
    existing["mute_chats"] = mute_chats
    await db.users.update_one(
        {"id": current["id"]}, {"$set": {"notification_prefs": existing}}
    )
    return {"ok": True, "chat_id": payload.chat_id, "muted_until": until}


@router.post("/notifications/unmute-chat/{chat_id}")
async def unmute_chat(chat_id: str, current=Depends(require_user)):
    existing = current.get("notification_prefs") or _default_prefs()
    mute_chats = dict(existing.get("mute_chats") or {})
    mute_chats.pop(chat_id, None)
    existing["mute_chats"] = mute_chats
    await db.users.update_one(
        {"id": current["id"]}, {"$set": {"notification_prefs": existing}}
    )
    return {"ok": True, "chat_id": chat_id}


@router.post("/notifications/dnd")
async def set_dnd(
    duration: Literal["off", "1h", "8h", "24h", "1week"],
    current=Depends(require_user),
):
    """Toggle Do Not Disturb on/off."""
    now = datetime.now(timezone.utc)
    durations = {
        "1h": timedelta(hours=1),
        "8h": timedelta(hours=8),
        "24h": timedelta(hours=24),
        "1week": timedelta(days=7),
    }
    existing = current.get("notification_prefs") or _default_prefs()
    if duration == "off":
        existing["dnd_until"] = None
    else:
        existing["dnd_until"] = (now + durations[duration]).isoformat()
    await db.users.update_one(
        {"id": current["id"]}, {"$set": {"notification_prefs": existing}}
    )
    return {"ok": True, "dnd_until": existing["dnd_until"]}
