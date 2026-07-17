"""Learned-memory (ChatGPT-style) management endpoints — view / edit / forget
what the AI has learned about the user (personal) and workspace (shared)."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import require_user
from services import learned_memory as lm

router = APIRouter(prefix="/memory")


@router.get("/learned")
async def get_learned(current=Depends(require_user)):
    return await lm.list_memories(current["workspace_id"], current["id"])


class RememberIn(BaseModel):
    text: str
    scope: str = "personal"


@router.post("/learned")
async def add_learned(payload: RememberIn, current=Depends(require_user)):
    doc = await lm.remember(current["workspace_id"], current["id"], payload.text,
                            scope=payload.scope, source="manual")
    if not doc:
        raise HTTPException(400, "Provide a memory to save")
    return {"ok": True, "memory": doc}


class UpdateIn(BaseModel):
    text: Optional[str] = None
    active: Optional[bool] = None


@router.patch("/learned/{mem_id}")
async def patch_learned(mem_id: str, payload: UpdateIn, current=Depends(require_user)):
    ok = await lm.update_memory(mem_id, current["workspace_id"], payload.text, payload.active)
    if not ok:
        raise HTTPException(404, "Memory not found")
    return {"ok": True}


@router.delete("/learned/{mem_id}")
async def delete_learned(mem_id: str, current=Depends(require_user)):
    ok = await lm.forget(mem_id, current["workspace_id"])
    if not ok:
        raise HTTPException(404, "Memory not found")
    return {"ok": True}
