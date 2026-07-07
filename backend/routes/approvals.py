"""AI answer approval workflow."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from deps import PROJ, _post_reminder, db, new_id, now_iso, require_user
from models import ApprovalCreate, ApprovalDecision, ApprovalEdit

router = APIRouter()

APPROVAL_STATUSES = ("draft", "needs_review", "approved", "rejected", "needs_revision", "archived")


def _public_approval(a: dict) -> dict:
    if not a:
        return a
    return {k: v for k, v in a.items() if k != "_id"}


@router.post("/approvals")
async def create_approval(payload: ApprovalCreate, current=Depends(require_user)):
    """Create an approval request for a final AI answer."""
    thread = await db.ai_threads.find_one({"id": payload.research_thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Research thread not found")
    valid_ids = {
        u["id"]
        for u in await db.users.find(
            {"workspace_id": current["workspace_id"]}, PROJ
        ).to_list(1000)
    }
    reviewers = [r for r in payload.reviewer_ids if r in valid_ids and r != current["id"]]
    approval = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "research_thread_id": payload.research_thread_id,
        "title": payload.title.strip()[:200],
        "final_answer": payload.final_answer,
        "version": 1,
        "history": [{
            "version": 1,
            "edited_by": current["id"],
            "final_answer": payload.final_answer,
            "at": now_iso(),
        }],
        "status": "needs_review" if reviewers else "draft",
        "created_by": current["id"],
        "reviewer_ids": reviewers,
        "decisions": [],
        "comments": [],
        "approved_by": None,
        "approved_at": None,
        "locked": False,
        "project_folder_id": payload.project_folder_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.approvals.insert_one(approval.copy())
    for rid in reviewers:
        await _post_reminder(
            rid,
            f'{current["name"]} requested your approval on "{approval["title"]}".',
            {"id": approval["id"]},
        )
    return _public_approval(approval)


@router.get("/approvals")
async def list_approvals(
    status: Optional[str] = None,
    project_folder_id: Optional[str] = None,
    mine: bool = False,
    current=Depends(require_user),
):
    q: dict = {"workspace_id": current["workspace_id"]}
    if status:
        q["status"] = status
    if project_folder_id:
        q["project_folder_id"] = project_folder_id
    if mine:
        q["$or"] = [{"created_by": current["id"]}, {"reviewer_ids": current["id"]}]
    items = await db.approvals.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@router.get("/approvals/{approval_id}")
async def get_approval(approval_id: str, current=Depends(require_user)):
    a = await db.approvals.find_one(
        {"id": approval_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not a:
        raise HTTPException(404, "Approval not found")
    return a


def _ensure_can_edit_approval(approval: dict, current: dict) -> None:
    if approval.get("locked"):
        raise HTTPException(400, "Approval is locked; cannot edit")
    if approval["created_by"] != current["id"] and current["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Only creator or admin can edit")


def _apply_title_edit(update: dict, payload: ApprovalEdit) -> None:
    if payload.title is None:
        return
    update["title"] = payload.title.strip()[:200]


def _apply_answer_edit(update: dict, approval: dict, payload: ApprovalEdit, current: dict) -> None:
    if payload.final_answer is None or payload.final_answer == approval["final_answer"]:
        return
    new_version = (approval.get("version") or 1) + 1
    update["final_answer"] = payload.final_answer
    update["version"] = new_version
    update["history"] = (approval.get("history") or []) + [{
        "version": new_version,
        "edited_by": current["id"],
        "final_answer": payload.final_answer,
        "at": now_iso(),
    }]
    if approval["status"] in ("approved", "rejected"):
        update["status"] = "needs_revision"


async def _apply_reviewer_edit(
    update: dict, approval: dict, payload: ApprovalEdit, workspace_id: str, current_id: str
) -> None:
    if payload.reviewer_ids is None:
        return
    valid_ids = {
        u["id"]
        for u in await db.users.find({"workspace_id": workspace_id}, PROJ).to_list(1000)
    }
    update["reviewer_ids"] = [
        r for r in payload.reviewer_ids if r in valid_ids and r != current_id
    ]
    if update["reviewer_ids"] and approval["status"] == "draft":
        update["status"] = "needs_review"


@router.patch("/approvals/{approval_id}")
async def edit_approval(
    approval_id: str, payload: ApprovalEdit, current=Depends(require_user)
):
    a = await db.approvals.find_one(
        {"id": approval_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not a:
        raise HTTPException(404, "Approval not found")
    _ensure_can_edit_approval(a, current)

    update: dict = {"updated_at": now_iso()}
    _apply_title_edit(update, payload)
    _apply_answer_edit(update, a, payload, current)
    await _apply_reviewer_edit(update, a, payload, current["workspace_id"], current["id"])

    await db.approvals.update_one({"id": approval_id}, {"$set": update})
    return await db.approvals.find_one({"id": approval_id}, {"_id": 0})


@router.post("/approvals/{approval_id}/decision")
async def decide_approval(
    approval_id: str, payload: ApprovalDecision, current=Depends(require_user)
):
    a = await db.approvals.find_one(
        {"id": approval_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not a:
        raise HTTPException(404, "Approval not found")
    if a.get("locked"):
        raise HTTPException(400, "Approval is locked")
    if current["id"] not in (a.get("reviewer_ids") or []) and current["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Only reviewers (or owner/admin) can decide")
    decision = {
        "by": current["id"],
        "by_name": current["name"],
        "status": payload.status,
        "comment": (payload.comment or "").strip()[:1000],
        "at": now_iso(),
    }
    update = {"$push": {"decisions": decision}, "$set": {"updated_at": now_iso()}}
    if payload.status == "approved":
        update["$set"].update({
            "status": "approved",
            "approved_by": current["id"],
            "approved_at": now_iso(),
            "locked": True,
        })
    elif payload.status == "rejected":
        update["$set"]["status"] = "rejected"
    elif payload.status == "needs_revision":
        update["$set"]["status"] = "needs_revision"
    await db.approvals.update_one({"id": approval_id}, update)
    await _post_reminder(
        a["created_by"],
        f'{current["name"]} {payload.status.replace("_", " ")} your approval request "{a["title"]}".',
        {"id": approval_id},
    )
    a = await db.approvals.find_one({"id": approval_id}, {"_id": 0})
    # Audit: approval decision
    try:
        from services.audit import record_audit
        await record_audit(
            workspace_id=current["workspace_id"], actor_id=current["id"], actor_name=current.get("name"),
            action=f"approval.{payload.status}", target_type="approval", target_id=approval_id,
            meta={"title": a.get("title"), "creator_id": a.get("created_by")},
        )
    except Exception:
        pass
    # Phase 4 — record approved final answer as high-importance memory + Decision Log row
    if payload.status == "approved" and a.get("final_answer"):
        try:
            import asyncio
            from services.memory_rag import extract_smart_cards, record_memory
            await record_memory(
                workspace_id=current["workspace_id"],
                source_type="approval",
                source_id=approval_id,
                raw_content=f"{a.get('title','Approved')}: {a['final_answer']}",
                chat_id=a.get("chat_id"),
                project_folder_id=a.get("project_folder_id"),
                title=a.get("title"),
                memory_type="decision",
                visibility="project",
                importance_score=0.95,
                created_by=current["id"],
                extra_meta={
                    "decision_status": "approved",
                    "from_approval_id": approval_id,
                    "decision_history": [{
                        "status": "approved",
                        "by": current["id"],
                        "by_name": current.get("name"),
                        "at": now_iso(),
                        "note": f"Auto-logged from approval: {a.get('title')}",
                    }],
                },
            )
            # Background: extract sharper Decision/Risk/Assumption cards via Claude
            asyncio.create_task(extract_smart_cards(
                workspace_id=current["workspace_id"],
                source_type="approval",
                source_id=approval_id,
                raw_content=f"{a.get('title','')}\n\n{a['final_answer']}",
                chat_id=a.get("chat_id"),
                project_folder_id=a.get("project_folder_id"),
                created_by=current["id"],
            ))
        except Exception:
            pass
    return a


@router.delete("/approvals/{approval_id}")
async def delete_approval(approval_id: str, current=Depends(require_user)):
    a = await db.approvals.find_one(
        {"id": approval_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not a:
        raise HTTPException(404, "Approval not found")
    if a["created_by"] != current["id"] and current["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Only creator or admin can delete")
    await db.approvals.update_one(
        {"id": approval_id}, {"$set": {"status": "archived"}}
    )
    return {"ok": True}
