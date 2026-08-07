"""Call-related helpers shared between routes/calls.py and the LiveKit webhook."""
from ai_service import highlight_segments
from deps import _broadcast_message, db, new_id, now_iso


def public_call(c: dict) -> dict:
    """Strip Mongo internals from a call record before returning to clients."""
    if not c:
        return c
    return {k: v for k, v in c.items() if k != "_id"}


async def post_call_card(call: dict, message_type: str = "call_started") -> dict:
    """Post a system message into the call's chat so participants can see the
    LIVE / ENDED card."""
    msg = {
        "id": new_id(),
        "chat_id": call["chat_id"],
        "sender_id": "ai-system",
        "message_type": message_type,
        "body": "",
        "parent_message_id": None,
        "metadata": {
            "call_id": call["id"],
            "mode": call["mode"],
            "status": call["status"],
            "started_by": call["started_by"],
            "started_at": call["started_at"],
            "ended_at": call.get("ended_at"),
            "duration_seconds": call.get("duration_seconds"),
            "participants": call.get("participants", []),
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(call["chat_id"], msg)
    return msg


async def generate_and_store_highlights(call_id: str, workspace_id: str) -> list:
    """Compute Claude-driven highlights for a call's transcript segments and
    persist them. Idempotent: callable any number of times; latest result wins.
    """
    call = await db.calls.find_one(
        {"id": call_id, "workspace_id": workspace_id},
        {"_id": 0, "transcript_segments": 1},
    )
    if not call:
        return []
    segs = call.get("transcript_segments") or []
    if not segs:
        await db.calls.update_one(
            {"id": call_id},
            {"$set": {"transcript_highlights": [], "highlights_generated_at": now_iso()}},
        )
        return []
    highlights = await highlight_segments(segs)
    await db.calls.update_one(
        {"id": call_id},
        {"$set": {"transcript_highlights": highlights, "highlights_generated_at": now_iso()}},
    )
    return highlights


async def post_call_recap_card(call: dict, highlights: list) -> dict:
    """Post an AI 'Call recap' card into the call's chat summarising the key
    highlights (decisions / action items / risks / questions)."""
    msg = {
        "id": new_id(),
        "chat_id": call["chat_id"],
        "sender_id": "ai-system",
        "message_type": "call_recap",
        "body": "",
        "parent_message_id": None,
        "metadata": {
            "call_id": call["id"],
            "mode": call.get("mode"),
            "duration_seconds": call.get("duration_seconds"),
            "highlights": highlights,
            "count": len(highlights),
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(call["chat_id"], msg)
    return msg


async def post_missed_call_card(call: dict) -> dict:
    """Post a 'Missed call' card into the chat when a ring is declined or times
    out with no one (other than the caller) joining. Includes a one-tap
    call-back on the client."""
    msg = {
        "id": new_id(),
        "chat_id": call["chat_id"],
        "sender_id": "ai-system",
        "message_type": "call_missed",
        "body": "",
        "parent_message_id": None,
        "metadata": {
            "call_id": call["id"],
            "mode": call.get("mode"),
            "from_id": call.get("started_by"),
            "from_name": call.get("started_by_name") or "Someone",
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(call["chat_id"], msg)
    return msg


async def generate_and_post_recap(call_id: str, workspace_id: str) -> list:
    """Generate call highlights then, if any, drop a recap card into the chat.
    Fire-and-forget friendly (swallows its own errors)."""
    try:
        highlights = await generate_and_store_highlights(call_id, workspace_id)
        if highlights:
            call = await db.calls.find_one({"id": call_id, "workspace_id": workspace_id}, {"_id": 0})
            if call:
                await post_call_recap_card(call, highlights)
        return highlights
    except Exception:
        return []
