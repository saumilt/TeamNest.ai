"""WhatsApp `.txt` import — parse exported chat history into TeamNest messages.

Supports the two canonical WhatsApp export formats:
  1. `[DD/MM/YY, HH:MM:SS] Name: text`   (iOS, square-bracket variant)
  2. `DD/MM/YYYY, HH:MM - Name: text`    (Android, dash variant)

Multi-line messages have their continuation lines appended (no timestamp prefix).
Media placeholders (`<Media omitted>`, `image omitted`, `audio omitted`,
`document omitted`) are kept as system notes.

Flow:
  POST /api/imports/whatsapp/preview  — parse only, return participants + counts
  POST /api/imports/whatsapp/commit   — insert messages, map senders, persist
"""
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from deps import db, new_id, now_iso, require_user

router = APIRouter()


# ---- Parser ----

# iOS:  [12/05/24, 14:32:01] Amit Patel: Lease rates are higher than expected
_RE_IOS = re.compile(
    r"^\[(\d{1,2})/(\d{1,2})/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\]\s*([^:]+?):\s*(.*)$",
    re.IGNORECASE,
)
# Android:  12/05/24, 14:32 - Amit Patel: Lease rates are higher than expected
_RE_ANDROID = re.compile(
    r"^(\d{1,2})/(\d{1,2})/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\s*-\s*([^:]+?):\s*(.*)$",
    re.IGNORECASE,
)

_MEDIA_HINTS = ("<media omitted>", "image omitted", "audio omitted", "video omitted",
                "document omitted", "sticker omitted", "gif omitted", "voice call",
                "video call", "missed voice call", "missed video call")


def _norm_year(y: str) -> int:
    yy = int(y)
    if yy < 100:
        # WhatsApp 2-digit years: <70 → 20xx else 19xx (matches Python strptime)
        yy = 2000 + yy if yy < 70 else 1900 + yy
    return yy


def _parse_line(line: str) -> Optional[Dict[str, Any]]:
    line = line.rstrip("\r\n")
    m = _RE_IOS.match(line) or _RE_ANDROID.match(line)
    if not m:
        return None
    g = m.groups()
    day, month, year, hour, minute, sec, ampm, sender, text = g
    sec = int(sec or 0)
    hour = int(hour)
    if ampm:
        a = ampm.upper()
        if a == "PM" and hour < 12:
            hour += 12
        elif a == "AM" and hour == 12:
            hour = 0
    try:
        ts = datetime(
            _norm_year(year), int(month), int(day),
            hour, int(minute), sec, tzinfo=timezone.utc,
        ).isoformat()
    except ValueError:
        return None
    return {"timestamp": ts, "sender": sender.strip(), "text": text.strip()}


def parse_whatsapp(content: str) -> List[Dict[str, Any]]:
    """Yield message dicts. Continuation lines are appended to the prior message."""
    out: List[Dict[str, Any]] = []
    for raw in content.splitlines():
        parsed = _parse_line(raw)
        if parsed:
            out.append(parsed)
        elif out and raw.strip():
            # continuation
            out[-1]["text"] = (out[-1]["text"] + "\n" + raw).strip()
    return out


def _is_system(text: str) -> bool:
    return any(hint in text.lower() for hint in _MEDIA_HINTS)


# ---- API ----

class WhatsAppCommit(BaseModel):
    chat_id: str
    participant_map: Dict[str, str] = {}  # whatsapp_name → teamnest_user_id (or "" to keep as system)
    raw_text: str
    skip_media_placeholders: bool = True


@router.post("/imports/whatsapp/preview")
async def whatsapp_preview(file: UploadFile = File(...), current=Depends(require_user)):
    """Parse a WhatsApp export and return participants + counts without storing."""
    raw = (await file.read()).decode("utf-8", errors="replace")
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 5MB). Split your export into chunks.")
    messages = parse_whatsapp(raw)
    if not messages:
        raise HTTPException(
            400,
            "No WhatsApp-formatted messages detected. Ensure you exported "
            "the chat as .txt (Settings → Chat → Export chat → Without Media).",
        )
    participants: Dict[str, int] = {}
    media_count = 0
    for m in messages:
        if _is_system(m["text"]):
            media_count += 1
        participants[m["sender"]] = participants.get(m["sender"], 0) + 1
    dates = [m["timestamp"][:10] for m in messages]
    return {
        "ok": True,
        "message_count": len(messages),
        "participants": [
            {"name": k, "message_count": v} for k, v in sorted(participants.items(), key=lambda x: -x[1])
        ],
        "media_placeholders": media_count,
        "date_range": {"from": min(dates), "to": max(dates)} if dates else None,
        "preview": messages[:10],  # first 10 for UI display
        "raw_text": raw,  # echoed back so commit doesn't need a re-upload
    }


@router.post("/imports/whatsapp/commit")
async def whatsapp_commit(payload: WhatsAppCommit, current=Depends(require_user)):
    """Persist messages into the chosen chat. Maps WhatsApp senders → TeamNest user_ids
    via `participant_map`. Unmapped senders are stored as system messages with the
    original WhatsApp name surfaced in `metadata.imported_sender_name`."""
    chat = await db.chats.find_one(
        {"id": payload.chat_id, "member_ids": current["id"]}, {"_id": 0}
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    if chat.get("workspace_id") != current["workspace_id"]:
        raise HTTPException(403, "Wrong workspace")

    messages = parse_whatsapp(payload.raw_text or "")
    if not messages:
        raise HTTPException(400, "No messages to import")

    inserted = 0
    skipped = 0
    docs = []
    for m in messages:
        text = m["text"]
        is_media = _is_system(text)
        if is_media and payload.skip_media_placeholders:
            skipped += 1
            continue
        mapped_id = (payload.participant_map or {}).get(m["sender"], "").strip()
        sender_id = mapped_id if mapped_id else "ai-system"
        docs.append({
            "id": new_id(),
            "chat_id": payload.chat_id,
            "sender_id": sender_id,
            "message_type": "text",
            "body": text,
            "parent_message_id": None,
            "metadata": {
                "imported_from": "whatsapp",
                "imported_sender_name": m["sender"],
                "is_media_placeholder": is_media,
                "import_batch_at": now_iso(),
            },
            "reactions": {},
            "created_at": m["timestamp"],
            "edited_at": None,
            "deleted_at": None,
        })
        inserted += 1

    if docs:
        await db.messages.insert_many([d.copy() for d in docs])

    # Audit
    try:
        from services.audit import record_audit
        await record_audit(
            workspace_id=current["workspace_id"],
            actor_id=current["id"],
            actor_name=current.get("name"),
            action="import.whatsapp",
            target_type="chat",
            target_id=payload.chat_id,
            meta={"imported": inserted, "skipped": skipped, "participants": list((payload.participant_map or {}).keys())},
        )
    except Exception:
        pass

    return {
        "ok": True,
        "imported": inserted,
        "skipped_media": skipped,
        "destination_chat_id": payload.chat_id,
        "destination_chat_name": chat.get("name"),
    }
