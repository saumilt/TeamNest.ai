"""AI Conversation Mode — session status, exit, explicit start, and the
ambiguous-message routing choice ("Continue with AI?" / "Send to chat")."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import db, logger, manager, require_user
from services import ai_conversation as aiconv

router = APIRouter()


def _public_session(sess: dict | None) -> dict:
    if not sess:
        return {"active": False}
    return {
        "active": True,
        "assistant_id": sess.get("assistant_id") or "ai",
        "topic": sess.get("topic"),
        "thread_id": sess.get("thread_id"),
        "latest_ai_message_id": sess.get("latest_ai_message_id"),
        "expires_at": sess.get("expires_at"),
        "started_at": sess.get("started_at"),
    }


@router.get("/chats/{chat_id}/ai-session")
async def get_ai_session(chat_id: str, current=Depends(require_user)):
    sess = await aiconv.get_active_session(chat_id, current["id"])
    return _public_session(sess)


@router.post("/chats/{chat_id}/ai-session/exit")
async def exit_ai_session(chat_id: str, current=Depends(require_user)):
    await aiconv.end_session(chat_id, current["id"], reason="user_exit")
    return {"active": False, "ended": True}


@router.post("/chats/{chat_id}/ai-session/start")
async def start_ai_session(chat_id: str, current=Depends(require_user)):
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    sess = await aiconv.start_or_refresh_session(
        workspace_id=current.get("workspace_id"),
        chat_id=chat_id,
        user_id=current["id"],
        assistant_id="ai",
    )
    return _public_session(sess)


class RouteChoice(BaseModel):
    message_id: str
    to: str  # "ai" | "chat"


@router.post("/chats/{chat_id}/ai-session/route")
async def route_ambiguous_message(
    chat_id: str, payload: RouteChoice, current=Depends(require_user)
):
    """Resolve an ambiguous message the user was asked about. `to='ai'` sends
    it to the assistant and continues the session; `to='chat'` keeps it as a
    normal team message. Either way the pending flag is cleared."""
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    msg = await db.messages.find_one({"id": payload.message_id, "chat_id": chat_id}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.get("sender_id") != current["id"]:
        raise HTTPException(403, "Not your message")

    # Clear the pending-route flag and broadcast the update so the inline
    # choice disappears on every open client.
    new_meta = {**(msg.get("metadata") or {})}
    new_meta.pop("pending_ai_route", None)
    new_meta["ai_route_resolved"] = payload.to
    await db.messages.update_one({"id": msg["id"]}, {"$set": {"metadata": new_meta}})
    updated = await db.messages.find_one({"id": msg["id"]}, {"_id": 0})
    await manager.broadcast(chat_id, {"event": "message_updated", "data": updated})

    await aiconv.log_routing_decision(
        workspace_id=current.get("workspace_id"),
        chat_id=chat_id,
        message_id=msg["id"],
        user_id=current["id"],
        session_id=(await aiconv.get_active_session(chat_id, current["id"]) or {}).get("id"),
        confidence=0.0,
        detected_follow_up=(payload.to == "ai"),
        reasons=["user_override"],
        final_recipient=payload.to,
        user_override=payload.to,
    )

    if payload.to == "ai":
        from services.ai_runtime import handle_ai_command
        asyncio.create_task(
            handle_ai_command(chat_id, current["id"], msg.get("body") or "", ["gpt-4o-mini"])
        )
        return {"routed": "ai"}
    return {"routed": "chat"}
