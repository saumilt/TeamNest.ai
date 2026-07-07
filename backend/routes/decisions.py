"""Decision Log — a structured view over memory_items where memory_type='decision'.

Backed by the existing `memory_items` collection so it reuses Phase 4 RAG infra.
Adds workflow status (proposed → approved → superseded/reversed) via the
`meta.decision_status` subfield.

Endpoints:
  GET    /api/decisions                list with status/project filters
  POST   /api/decisions                create from scratch (or from message/AI/approval)
  PATCH  /api/decisions/{id}/status    change status (approve/reverse/supersede)
  GET    /api/decisions/{id}           single decision + linked tasks
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from deps import db, new_id, now_iso, require_user
from services.audit import record_audit
from services.memory_rag import record_memory

router = APIRouter()

DECISION_STATUSES = ("proposed", "under_review", "approved", "rejected", "reversed", "superseded")


class DecisionCreate(BaseModel):
    title: str
    summary: str
    rationale: Optional[str] = None
    risks: Optional[str] = None
    project_folder_id: Optional[str] = None
    chat_id: Optional[str] = None
    source_type: Optional[str] = None  # message / ai_thread / approval / etc
    source_id: Optional[str] = None
    status: Literal["proposed", "under_review", "approved"] = "proposed"


class DecisionStatusUpdate(BaseModel):
    status: Literal["proposed", "under_review", "approved", "rejected", "reversed", "superseded"]
    superseded_by: Optional[str] = None  # decision_id that replaces this one
    note: Optional[str] = None


@router.get("/decisions")
async def list_decisions(
    project_folder_id: Optional[str] = None,
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current=Depends(require_user),
):
    flt: dict = {
        "workspace_id": current["workspace_id"],
        "memory_type": "decision",
        "status": {"$in": ["active", "outdated"]},
    }
    if project_folder_id:
        flt["project_folder_id"] = project_folder_id
    if status:
        flt["meta.decision_status"] = status
    items = await db.memory_items.find(flt, {"_id": 0}).sort("created_at", -1).to_list(limit)
    # default to 'approved' if backfilled item has no decision_status
    for it in items:
        if "decision_status" not in (it.get("meta") or {}):
            it.setdefault("meta", {})["decision_status"] = (
                "approved" if it.get("source_type") in ("approval", "smart_card") else "proposed"
            )
    return {"decisions": items, "count": len(items)}


@router.get("/decisions/{decision_id}")
async def get_decision(decision_id: str, current=Depends(require_user)):
    d = await db.memory_items.find_one({"id": decision_id, "workspace_id": current["workspace_id"]}, {"_id": 0})
    if not d or d.get("memory_type") != "decision":
        raise HTTPException(404, "Decision not found")
    # Linked tasks (best-effort: tasks created from the same chat referencing this title)
    linked_tasks = []
    if d.get("chat_id"):
        linked_tasks = await db.tasks.find(
            {"source_chat_id": d["chat_id"]},
            {"_id": 0},
        ).sort("created_at", -1).to_list(20)
    return {"decision": d, "linked_tasks": linked_tasks}


@router.post("/decisions")
async def create_decision(payload: DecisionCreate, current=Depends(require_user)):
    raw_parts = [payload.summary]
    if payload.rationale:
        raw_parts.append(f"Rationale: {payload.rationale}")
    if payload.risks:
        raw_parts.append(f"Risks: {payload.risks}")
    raw_content = "\n\n".join(raw_parts)

    item = await record_memory(
        workspace_id=current["workspace_id"],
        source_type=payload.source_type or "card",
        source_id=payload.source_id or new_id(),
        raw_content=raw_content,
        chat_id=payload.chat_id,
        project_folder_id=payload.project_folder_id,
        title=payload.title,
        memory_type="decision",
        visibility="project" if payload.project_folder_id else "workspace",
        importance_score=0.9,
        created_by=current["id"],
        extra_meta={
            "decision_status": payload.status,
            "rationale": payload.rationale,
            "risks": payload.risks,
            "decision_history": [{
                "status": payload.status,
                "by": current["id"],
                "by_name": current.get("name"),
                "at": now_iso(),
                "note": "Created",
            }],
        },
    )
    if not item:
        raise HTTPException(500, "Failed to create decision")
    await record_audit(
        workspace_id=current["workspace_id"],
        actor_id=current["id"], actor_name=current.get("name"),
        action="decision.created", target_type="decision", target_id=item["id"],
        meta={"title": payload.title, "status": payload.status},
    )
    return item


@router.patch("/decisions/{decision_id}/status")
async def update_decision_status(
    decision_id: str, payload: DecisionStatusUpdate, current=Depends(require_user),
):
    d = await db.memory_items.find_one(
        {"id": decision_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not d or d.get("memory_type") != "decision":
        raise HTTPException(404, "Decision not found")
    history = (d.get("meta") or {}).get("decision_history") or []
    history.append({
        "status": payload.status,
        "by": current["id"], "by_name": current.get("name"),
        "at": now_iso(), "note": payload.note,
        "superseded_by": payload.superseded_by,
    })
    update = {
        "updated_at": now_iso(),
        "meta.decision_status": payload.status,
        "meta.decision_history": history,
    }
    if payload.status == "superseded" and payload.superseded_by:
        update["meta.superseded_by"] = payload.superseded_by
        update["status"] = "outdated"
    elif payload.status == "reversed":
        update["status"] = "outdated"
    await db.memory_items.update_one({"id": decision_id}, {"$set": update})
    await record_audit(
        workspace_id=current["workspace_id"],
        actor_id=current["id"], actor_name=current.get("name"),
        action="decision.status_changed", target_type="decision", target_id=decision_id,
        meta={"title": d.get("title"), "new_status": payload.status, "old_status": (d.get("meta") or {}).get("decision_status")},
    )
    out = await db.memory_items.find_one({"id": decision_id}, {"_id": 0})
    return out
