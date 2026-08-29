"""Lightweight in-app meeting scheduling (for Meeting Prep).

A `meetings` doc is a scheduled meeting optionally tied to a chat. "Prepare me"
reads the next upcoming meeting so the brief is about the actual upcoming call.
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ai_service import complete
from deps import _broadcast_message, db, logger, new_id, now_iso, require_user

router = APIRouter()


class MeetingCreate(BaseModel):
    title: str
    start_at: str  # ISO datetime
    chat_id: Optional[str] = None
    attendees: Optional[List[str]] = None
    notes: Optional[str] = None
    remind_minutes: Optional[int] = 10


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
        "remind_minutes": payload.remind_minutes if payload.remind_minutes is not None else 10,
        "reminded_at": None,
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


def _parse_iso(s):
    try:
        dt = datetime.fromisoformat((s or "").replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


async def _build_brief(ws: str, meeting: dict) -> str:
    """Generate a short prep brief for a meeting from its chat context + docs."""
    chat_id = meeting.get("chat_id")
    convo = "(no recent messages)"
    if chat_id:
        msgs = await db.messages.find(
            {"chat_id": chat_id}, {"_id": 0, "body": 1}
        ).sort("created_at", -1).to_list(20)
        convo = "\n".join(f"- {(m.get('body') or '')[:180]}" for m in reversed(msgs) if m.get("body"))[:3500] or "(no recent messages)"
    att = ", ".join(meeting.get("attendees") or []) or "not specified"
    sys = "You are an executive assistant. Be concise and practical."
    prompt = (
        f"Prepare me for '{meeting.get('title')}' (attendees: {att}).\n"
        f"Agenda notes: {meeting.get('notes') or 'none'}\nRelated conversation:\n{convo}\n\n"
        "In under 120 words with short bold headings give: context recap, 3 talking points, and one goal."
    )
    try:
        return (await complete(sys, prompt, "claude")).strip()
    except Exception:
        return "Quick prep: review the recent thread and confirm the goal for this meeting."


async def run_due_meeting_reminders():
    """Tick job: post a reminder (with an AI prep brief) into a meeting's chat
    ~remind_minutes before it starts. Each meeting reminds once. 60s loop."""
    now = datetime.now(timezone.utc)
    upcoming = await db.meetings.find(
        {"reminded_at": None, "chat_id": {"$ne": None}, "start_at": {"$gte": now.isoformat()}}, {"_id": 0}
    ).to_list(200)
    for m in upcoming:
        try:
            start = _parse_iso(m.get("start_at"))
            if not start:
                continue
            lead = int(m.get("remind_minutes") or 10)
            if (start - now).total_seconds() > lead * 60:
                continue  # not within the reminder window yet
            brief = await _build_brief(m["workspace_id"], m)
            mins = max(1, round((start - now).total_seconds() / 60))
            att = ", ".join(m.get("attendees") or [])
            body = (
                f"⏰ **{m.get('title')}** starts in ~{mins} min"
                + (f" · with {att}" if att else "")
                + f"\n\n**Your prep brief**\n\n{brief}"
            )
            msg = {
                "id": new_id(),
                "chat_id": m["chat_id"],
                "sender_id": "ai-system",
                "message_type": "text",
                "body": body,
                "parent_message_id": None,
                "metadata": {"event": "meeting_reminder", "meeting_id": m["id"]},
                "reactions": {},
                "created_at": now_iso(),
                "edited_at": None,
                "deleted_at": None,
            }
            await db.messages.insert_one(msg.copy())
            await _broadcast_message(m["chat_id"], msg)
            await db.meetings.update_one({"id": m["id"]}, {"$set": {"reminded_at": now_iso()}})
        except Exception:
            logger.exception("meeting reminder failed for %s", m.get("id"))
