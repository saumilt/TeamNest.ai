"""Phase 4 — Memory / RAG REST endpoints.

Endpoints:
- GET    /api/memory/search       text-search across memory items
- GET    /api/memory/timeline     reverse-chronological for a project/chat
- POST   /api/memory/save         manually pin a source as a memory item
- PATCH  /api/memory/{id}         archive / mark outdated / restore / edit
- DELETE /api/memory/{id}         hard delete (admin/owner)
- POST   /api/memory/cards        create a free-form memory card
- GET    /api/memory/access-rules / PATCH (admin)
- POST   /api/memory/backfill     one-shot backfill for current workspace
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from deps import db, new_id, now_iso, require_user
from models import MemoryAccessRule, MemorySave, MemoryUpdate
from services.memory_rag import (
    backfill_existing_chats,
    ensure_memory_indexes,
    extract_smart_cards_bulk,
    record_memory,
    retrieve_memory,
)

router = APIRouter()


def _is_admin(user: dict) -> bool:
    return user.get("role") in ("owner", "admin")


@router.get("/memory/search")
async def search_memory(
    q: str = Query("", description="Free-text query"),
    chat_id: Optional[str] = None,
    project_folder_id: Optional[str] = None,
    mode: str = Query("workspace"),
    limit: int = Query(20, ge=1, le=100),
    current=Depends(require_user),
):
    if mode not in {"none", "chat", "project", "workspace", "custom"}:
        mode = "workspace"
    items = await retrieve_memory(
        workspace_id=current["workspace_id"],
        query=q,
        chat_id=chat_id,
        project_folder_id=project_folder_id,
        mode=mode,  # type: ignore[arg-type]
        limit=limit,
        user_role=current.get("role"),
    )
    return {"items": items, "count": len(items)}


@router.get("/memory/timeline")
async def memory_timeline(
    project_folder_id: Optional[str] = None,
    chat_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    current=Depends(require_user),
):
    await ensure_memory_indexes()
    flt: dict = {"workspace_id": current["workspace_id"], "status": {"$in": ["active", "outdated"]}}
    if project_folder_id:
        flt["project_folder_id"] = project_folder_id
    elif chat_id:
        flt["chat_id"] = chat_id
    items = await db.memory_items.find(flt, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"items": items, "count": len(items)}


@router.post("/memory/save")
async def save_memory(payload: MemorySave, current=Depends(require_user)):
    """User explicitly pins a message / answer / file as memory."""
    if payload.chat_id:
        chat = await db.chats.find_one({"id": payload.chat_id, "member_ids": current["id"]}, {"_id": 0})
        if not chat:
            raise HTTPException(404, "Chat not found")
        project_folder_id = payload.project_folder_id or chat.get("project_folder_id")
    else:
        project_folder_id = payload.project_folder_id

    # Resolve content from the original source if not supplied
    content = payload.content
    title = payload.title
    if not content:
        content, fetched_title = await _fetch_source_content(payload.source_type, payload.source_id)
        title = title or fetched_title
    if not content:
        raise HTTPException(400, "Source content not found or empty")

    item = await record_memory(
        workspace_id=current["workspace_id"],
        source_type=payload.source_type,
        source_id=payload.source_id,
        raw_content=content,
        chat_id=payload.chat_id,
        project_folder_id=project_folder_id,
        title=title,
        memory_type=payload.memory_type,
        visibility=payload.visibility,
        created_by=current["id"],
        importance_score=0.7,  # manual pins get a bump
    )
    if not item:
        raise HTTPException(500, "Failed to save memory")
    # Touch updated_at + restore from soft-delete so the manual pin surfaces at
    # the top of the timeline and is searchable.
    await db.memory_items.update_one(
        {"id": item["id"]},
        {"$set": {"status": "active", "updated_at": now_iso(), "created_at": now_iso()}},
    )
    item = await db.memory_items.find_one({"id": item["id"]}, {"_id": 0})
    return item


async def _fetch_source_content(source_type: str, source_id: str):
    """Resolve the raw content + title for a given source id. Best-effort."""
    if source_type == "message":
        m = await db.messages.find_one({"id": source_id}, {"_id": 0})
        return (m or {}).get("body"), None
    if source_type in ("ai_response",):
        r = await db.ai_responses.find_one({"id": source_id}, {"_id": 0})
        if r:
            return r.get("answer"), r.get("model_name")
    if source_type == "ai_thread":
        t = await db.ai_threads.find_one({"id": source_id}, {"_id": 0})
        if t:
            return f"Q: {t.get('question','')}\n\nA: {t.get('final_answer','')}", t.get("question")
    if source_type == "approval":
        a = await db.approvals.find_one({"id": source_id}, {"_id": 0})
        if a:
            return a.get("final_answer"), a.get("title")
    if source_type == "voice_note":
        v = await db.voice_notes.find_one({"id": source_id}, {"_id": 0})
        if v:
            return v.get("transcript"), "Voice note"
    if source_type == "call_summary":
        c = await db.calls.find_one({"id": source_id}, {"_id": 0})
        if c:
            return (c.get("summary") or {}).get("text") or c.get("summary_text"), c.get("title")
    if source_type == "task":
        t = await db.tasks.find_one({"id": source_id}, {"_id": 0})
        if t:
            return f"{t.get('title','')}\n{t.get('description','')}", t.get("title")
    return None, None


@router.post("/memory/cards")
async def create_card(
    title: str,
    content: str,
    memory_type: str = "note",
    chat_id: Optional[str] = None,
    project_folder_id: Optional[str] = None,
    visibility: str = "chat",
    current=Depends(require_user),
):
    """Free-form memory card creation (Decision / Assumption / Risk / Note)."""
    item = await record_memory(
        workspace_id=current["workspace_id"],
        source_type="card",
        source_id=new_id(),
        raw_content=content,
        chat_id=chat_id,
        project_folder_id=project_folder_id,
        title=title,
        memory_type=memory_type,
        visibility=visibility,
        importance_score=0.7,
        created_by=current["id"],
    )
    if not item:
        raise HTTPException(500, "Failed to create card")
    return item


# ---- Access rules (admin) — declared BEFORE /memory/{id} so path doesn't shadow ----

@router.get("/memory/access-rules")
async def get_access_rules(current=Depends(require_user)):
    rules = await db.memory_access_rules.find(
        {"workspace_id": current["workspace_id"]}, {"_id": 0}
    ).to_list(20)
    return {"rules": rules}


@router.patch("/memory/access-rules")
async def update_access_rule(payload: MemoryAccessRule, current=Depends(require_user)):
    if not _is_admin(current):
        raise HTTPException(403, "Owners/admins only")
    update = payload.model_dump()
    update["workspace_id"] = current["workspace_id"]
    update["updated_at"] = now_iso()
    await db.memory_access_rules.update_one(
        {"workspace_id": current["workspace_id"], "role": payload.role},
        {"$set": update},
        upsert=True,
    )
    return update


@router.patch("/memory/{memory_id}")
async def update_memory(memory_id: str, payload: MemoryUpdate, current=Depends(require_user)):
    item = await db.memory_items.find_one({"id": memory_id}, {"_id": 0})
    if not item or item.get("workspace_id") != current["workspace_id"]:
        raise HTTPException(404, "Memory not found")
    # Only owner / creator can mutate
    if item.get("created_by") != current["id"] and not _is_admin(current):
        raise HTTPException(403, "Not allowed")
    update: dict = {"updated_at": now_iso()}
    for k in ("status", "memory_type", "title", "content", "visibility"):
        v = getattr(payload, k, None)
        if v is not None:
            update[k] = v
    if "title" in update or "content" in update:
        update["search_text"] = f"{update.get('title') or item['title']}\n{update.get('content') or item.get('content','')}"
    await db.memory_items.update_one({"id": memory_id}, {"$set": update})
    out = await db.memory_items.find_one({"id": memory_id}, {"_id": 0})
    return out


@router.delete("/memory/{memory_id}")
async def delete_memory(memory_id: str, current=Depends(require_user)):
    item = await db.memory_items.find_one({"id": memory_id}, {"_id": 0})
    if not item or item.get("workspace_id") != current["workspace_id"]:
        raise HTTPException(404, "Memory not found")
    if item.get("created_by") != current["id"] and not _is_admin(current):
        raise HTTPException(403, "Only the creator or an admin can delete this memory")
    await db.memory_items.update_one(
        {"id": memory_id}, {"$set": {"status": "deleted", "updated_at": now_iso()}}
    )
    return {"ok": True}


@router.post("/memory/backfill")
async def backfill_memory(current=Depends(require_user)):
    """Owner-only: scan existing approvals/calls/threads and seed memory."""
    if not _is_admin(current):
        raise HTTPException(403, "Owners/admins only")
    counts = await backfill_existing_chats(current["workspace_id"])
    return {"ok": True, "counts": counts}


@router.post("/memory/extract-smart-cards")
async def extract_smart_cards_endpoint(current=Depends(require_user)):
    """Owner/admin only: scan existing approved decisions + call summaries and
    use Claude Haiku to extract sharper Decision/Risk/Assumption/Task/Fact cards.

    Runs synchronously (can take 30-60s for a full workspace). Idempotent: cards
    already extracted for a source are skipped.
    """
    if not _is_admin(current):
        raise HTTPException(403, "Owners/admins only")
    counts = await extract_smart_cards_bulk(current["workspace_id"])
    return {"ok": True, "counts": counts}
