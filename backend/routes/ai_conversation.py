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


# ── Settings: per-user preferences + workspace-admin settings ───────────────
class PreferencesIn(BaseModel):
    auto_continue_enabled: bool | None = None
    session_timeout_minutes: int | None = None
    follow_up_threshold: float | None = None
    show_recipient_indicator: bool | None = None
    ask_when_ambiguous: bool | None = None


class WsSettingsIn(BaseModel):
    enabled: bool | None = None
    default_timeout_minutes: int | None = None
    follow_up_threshold: float | None = None
    allow_in_group_chats: bool | None = None


@router.get("/ai-conversation/preferences")
async def get_preferences(current=Depends(require_user)):
    from services.workspace_settings import (
        get_effective_ai_settings, get_user_prefs, get_ws_ai_conversation,
    )
    ws = current.get("workspace_id")
    return {
        "preferences": await get_user_prefs(ws, current["id"]),
        "workspace": await get_ws_ai_conversation(ws),
        "effective": await get_effective_ai_settings(ws, current["id"]),
    }


@router.put("/ai-conversation/preferences")
async def update_preferences(payload: PreferencesIn, current=Depends(require_user)):
    from services.workspace_settings import set_user_prefs
    vals = {k: v for k, v in payload.model_dump().items() if v is not None}
    prefs = await set_user_prefs(current.get("workspace_id"), current["id"], vals)
    return {"preferences": prefs}


@router.get("/ai-conversation/workspace-settings")
async def get_ws_settings(current=Depends(require_user)):
    from services.workspace_settings import get_ws_ai_conversation, get_ws_security
    ws = current.get("workspace_id")
    return {
        "ai_conversation": await get_ws_ai_conversation(ws),
        "security": await get_ws_security(ws),
        "can_edit": current.get("role") in ("owner", "admin"),
    }


@router.put("/ai-conversation/workspace-settings")
async def update_ws_settings(payload: WsSettingsIn, current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only workspace owners/admins can change these settings")
    from services.workspace_settings import set_ws_ai_conversation
    vals = {k: v for k, v in payload.model_dump().items() if v is not None}
    return {"ai_conversation": await set_ws_ai_conversation(current["workspace_id"], vals)}


# ── Save AI conversation to Role Intelligence (owner saves, members suggest) ──
@router.get("/ai-conversation/roles")
async def list_roles_for_picker(current=Depends(require_user)):
    """Lightweight role list (id + name) for the Save-to-Role picker. Available
    to any workspace member so they can suggest knowledge for review."""
    ws = current.get("workspace_id")
    rows = await db.enterprise_roles.find(
        {"workspace_id": ws}, {"_id": 0, "id": 1, "role_name": 1}
    ).sort("role_name", 1).to_list(200)
    return {"roles": rows}


class SaveToRoleIn(BaseModel):
    role_id: str


@router.post("/chats/{chat_id}/save-to-role")
async def save_conversation_to_role(
    chat_id: str, payload: SaveToRoleIn, current=Depends(require_user)
):
    """Capture this chat's conversation as PROPOSED role-intelligence memories.
    Everything lands in the owner review queue (`/enterprise/memories/review`),
    so members effectively *suggest* and owners approve."""
    ws = current.get("workspace_id")
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]}, {"_id": 0, "id": 1})
    if not chat:
        raise HTTPException(404, "Chat not found or not accessible")
    role = await db.enterprise_roles.find_one({"id": payload.role_id, "workspace_id": ws}, {"_id": 0})
    if not role:
        raise HTTPException(404, "Role not found")

    from services.ai_runtime import build_chat_context
    from services.enterprise_intelligence import propose_memories_from_text
    text = await build_chat_context(chat_id, limit=40)
    if not text:
        raise HTTPException(400, "This conversation has no content to save yet")
    proposed = await propose_memories_from_text(role, text)
    if not proposed:
        return {"proposed": 0, "note": "Nothing worth preserving was found in this conversation."}

    now = now_iso()
    docs = []
    for p in proposed:
        docs.append({
            "id": new_id(), "workspace_id": ws, "role_id": payload.role_id,
            "source_user_id": current["id"], "source_type": "AI conversation",
            "source_id": chat_id, "memory_type": p["memory_type"], "title": p["title"],
            "content": p["content"], "sensitivity_level": p["sensitivity_level"],
            "visibility": "role", "transferable": p["transferable"],
            "approved_by_user_id": None, "approval_status": "proposed",
            "retention_policy": "keep_indefinitely", "confidence": p["confidence"],
            "source_date": now[:10], "last_reviewed_at": None,
            "created_at": now, "updated_at": now,
        })
    await db.enterprise_role_memories.insert_many([d.copy() for d in docs])
    return {"proposed": len(docs), "status": "pending_review"}
