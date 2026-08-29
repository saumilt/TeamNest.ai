"""Lightweight in-app meeting scheduling (for Meeting Prep).

A `meetings` doc is a scheduled meeting optionally tied to a chat. "Prepare me"
reads the next upcoming meeting so the brief is about the actual upcoming call.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import db, new_id, now_iso, require_user

router = APIRouter()


class MeetingCreate(BaseModel):
    title: str
    start_at: str  # ISO datetime
    chat_id: Optional[str] = None
    attendees: Optional[List[str]] = None
    notes: Optional[str] = None


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


@router.post("/meetings")
async def create_meeting(payload: MeetingCreate, current=Depends(require_user)):
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(400, "Give the meeting a title")
    if not (payload.start_at or "").strip():
        raise HTTPException(400, "Pick a date and time")
    if payload.chat_id:
        chat = await db.chats.find_one(
            {"id": payload.chat_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1}
        )
        if not chat:
            raise HTTPException(404, "Chat not found")
    doc = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "chat_id": payload.chat_id,
        "title": title,
        "start_at": payload.start_at,
        "attendees": payload.attendees or [],
        "notes": (payload.notes or "").strip(),
        "created_by": current["id"],
        "created_at": now_iso(),
    }
    await db.meetings.insert_one(doc.copy())
    return _clean(doc)


@router.get("/meetings/upcoming")
async def upcoming_meetings(chat_id: Optional[str] = None, current=Depends(require_user)):
    """Next upcoming meetings (start_at >= now) for the workspace, optionally
    filtered to a chat. Soonest first."""
    now = datetime.now(timezone.utc).isoformat()
    q = {"workspace_id": current["workspace_id"], "start_at": {"$gte": now}}
    if chat_id:
        q["chat_id"] = chat_id
    items = await db.meetings.find(q, {"_id": 0}).sort("start_at", 1).to_list(20)
    return {"items": items}


@router.get("/meetings")
async def list_meetings(current=Depends(require_user)):
    items = await db.meetings.find(
        {"workspace_id": current["workspace_id"]}, {"_id": 0}
    ).sort("start_at", 1).to_list(100)
    return {"items": items}


@router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str, current=Depends(require_user)):
    res = await db.meetings.delete_one(
        {"id": meeting_id, "workspace_id": current["workspace_id"]}
    )
    if not res.deleted_count:
        raise HTTPException(404, "Meeting not found")
    return {"ok": True}
