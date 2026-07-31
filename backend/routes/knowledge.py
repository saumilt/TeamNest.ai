"""Knowledge / Documents library: turn uploaded ZIPs (or files) into searchable
knowledge sources and ask questions over them (RAG)."""
from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import db, new_id, now_iso, require_user
from services.knowledge_ingest import ingest_source
from services.knowledge_search import ask_source
from storage import delete_object

router = APIRouter()


class CreateSource(BaseModel):
    file_id: str
    name: Optional[str] = None
    chat_id: Optional[str] = None


class AskBody(BaseModel):
    question: str
    model: str = "claude"


def _source_public(s: dict) -> dict:
    return {
        "id": s["id"],
        "name": s.get("name"),
        "source_type": s.get("source_type"),
        "status": s.get("status"),
        "progress": s.get("progress", 0),
        "file_count": s.get("file_count", 0),
        "indexed_file_count": s.get("indexed_file_count", 0),
        "chunk_count": s.get("chunk_count", 0),
        "error": s.get("error"),
        "chat_id": s.get("chat_id"),
        "created_by": s.get("created_by"),
        "created_at": s.get("created_at"),
        "updated_at": s.get("updated_at"),
    }


@router.post("/knowledge/sources")
async def create_source(payload: CreateSource, current=Depends(require_user)):
    file_rec = await db.files.find_one(
        {"id": payload.file_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not file_rec:
        raise HTTPException(404, "File not found")
    fname = file_rec.get("original_filename", "file")
    is_zip = fname.lower().endswith(".zip") or file_rec.get("is_archive")
    source = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "created_by": current["id"],
        "name": (payload.name or fname).strip() or fname,
        "source_type": "zip" if is_zip else "file",
        "file_id": payload.file_id,
        "chat_id": payload.chat_id,
        "status": "processing",
        "progress": 0,
        "file_count": 0,
        "indexed_file_count": 0,
        "chunk_count": 0,
        "error": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.knowledge_sources.insert_one(source.copy())
    asyncio.create_task(ingest_source(source["id"]))
    return _source_public(source)


@router.get("/knowledge/sources")
async def list_sources(chat_id: Optional[str] = None, current=Depends(require_user)):
    q = {"workspace_id": current["workspace_id"]}
    if chat_id:
        q["chat_id"] = chat_id
    rows = await db.knowledge_sources.find(
        q, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return {"sources": [_source_public(r) for r in rows]}


@router.get("/knowledge/sources/{source_id}")
async def get_source(source_id: str, current=Depends(require_user)):
    s = await db.knowledge_sources.find_one(
        {"id": source_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not s:
        raise HTTPException(404, "Source not found")
    files = await db.knowledge_files.find(
        {"source_id": source_id}, {"_id": 0}
    ).sort("path", 1).to_list(2000)
    return {"source": _source_public(s), "files": files}


@router.post("/knowledge/sources/{source_id}/ask")
async def ask(source_id: str, payload: AskBody, current=Depends(require_user)):
    s = await db.knowledge_sources.find_one(
        {"id": source_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not s:
        raise HTTPException(404, "Source not found")
    if s.get("status") != "ready":
        raise HTTPException(409, "Source is still processing")
    q = (payload.question or "").strip()
    if not q:
        raise HTTPException(400, "Question is required")
    return await ask_source(source_id, q, model=payload.model)


@router.delete("/knowledge/sources/{source_id}")
async def delete_source(source_id: str, current=Depends(require_user)):
    s = await db.knowledge_sources.find_one(
        {"id": source_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not s:
        raise HTTPException(404, "Source not found")
    await db.knowledge_chunks.delete_many({"source_id": source_id})
    await db.knowledge_files.delete_many({"source_id": source_id})
    await db.knowledge_sources.delete_one({"id": source_id})
    # Best-effort remove the underlying stored object.
    file_rec = await db.files.find_one({"id": s.get("file_id")}, {"_id": 0})
    if file_rec and file_rec.get("storage_path"):
        delete_object(file_rec["storage_path"])
        await db.files.update_one({"id": s["file_id"]}, {"$set": {"is_deleted": True}})
    return {"ok": True}
