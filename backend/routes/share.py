"""AI research share links (separate from the public snapshot fetch)."""
from fastapi import APIRouter, Depends, HTTPException

from deps import db, new_id, require_user

router = APIRouter()


@router.post("/ai/research/{thread_id}/share")
async def create_share_link(thread_id: str, current=Depends(require_user)):
    thread = await db.ai_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Thread not found")
    chat = await db.chats.find_one(
        {"id": thread["chat_id"], "member_ids": current["id"]}
    )
    if not chat:
        raise HTTPException(403, "Forbidden")
    token = thread.get("public_token") or new_id().replace("-", "")[:16]
    await db.ai_threads.update_one(
        {"id": thread_id}, {"$set": {"public_token": token}}
    )
    return {"token": token, "thread_id": thread_id}


@router.delete("/ai/research/{thread_id}/share")
async def revoke_share_link(thread_id: str, current=Depends(require_user)):
    thread = await db.ai_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Thread not found")
    chat = await db.chats.find_one(
        {"id": thread["chat_id"], "member_ids": current["id"]}
    )
    if not chat:
        raise HTTPException(403, "Forbidden")
    await db.ai_threads.update_one(
        {"id": thread_id}, {"$set": {"public_token": None}}
    )
    return {"ok": True}
