"""Task management — CRUD with assignee reminders + soft delete."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from deps import _post_reminder, db, new_id, now_iso, require_user
from models import TaskCreate, TaskUpdate

router = APIRouter()

# Soft-deleted tasks are auto-purged after this many days.
PURGE_AFTER_DAYS = 30


async def _purge_expired_deleted(workspace_id: str) -> int:
    """Permanently remove soft-deleted tasks older than PURGE_AFTER_DAYS.
    Called on each list() call so we don't need a background job."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=PURGE_AFTER_DAYS)).isoformat()
    res = await db.tasks.delete_many({
        "workspace_id": workspace_id,
        "deleted_at": {"$ne": None, "$lt": cutoff},
    })
    return res.deleted_count


@router.post("/tasks")
async def create_task(payload: TaskCreate, current=Depends(require_user)):
    task = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "project_folder_id": payload.project_folder_id,
        "source_chat_id": payload.source_chat_id,
        "source_message_id": payload.source_message_id,
        "title": payload.title,
        "description": payload.description or "",
        "assigned_to": payload.assigned_to,
        "created_by": current["id"],
        "created_by_employee_key": payload.created_by_employee_key,
        "estimated_hours_saved": payload.estimated_hours_saved,
        "due_date": payload.due_date,
        "priority": payload.priority,
        "status": payload.status,
        "created_at": now_iso(),
        "completed_at": now_iso() if payload.status == "completed" else None,
        "deleted_at": None,
        "reminder_log": [],  # stamps of which reminders already fired
    }
    await db.tasks.insert_one(task.copy())
    if payload.assigned_to and payload.assigned_to != current["id"]:
        due_text = f" Due {payload.due_date[:10]}." if payload.due_date else ""
        await _post_reminder(
            payload.assigned_to,
            f'You have been assigned: "{payload.title}".{due_text}',
            task,
        )
        # Push to mobile too, fire-and-forget.
        try:
            import asyncio as _asyncio
            from services.push_service import send_to_user as _push
            _asyncio.create_task(_push(
                payload.assigned_to,
                "New task assigned",
                f'{current.get("name") or "Someone"}: "{payload.title}"{due_text}',
                {"task_id": task["id"], "type": "task_assigned"},
            ))
        except Exception:
            pass
    return task


@router.get("/tasks")
async def list_tasks(
    scope: str = "all",
    folder_id: Optional[str] = None,
    status_filter: str = "active",  # active | completed | deleted
    current=Depends(require_user),
):
    """Filter:
      - active   → not completed, not deleted (default)
      - completed→ completed, not deleted
      - deleted  → soft-deleted, within 30d retention window
    """
    await _purge_expired_deleted(current["workspace_id"])
    q = {"workspace_id": current["workspace_id"]}
    if folder_id:
        q["project_folder_id"] = folder_id
    if scope == "mine":
        q["assigned_to"] = current["id"]
    if status_filter == "deleted":
        q["deleted_at"] = {"$ne": None}
    elif status_filter == "completed":
        q["deleted_at"] = None
        q["status"] = "completed"
    else:  # active
        q["deleted_at"] = None
        q["status"] = {"$nin": ["completed"]}
    tasks = await db.tasks.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    today = datetime.now(timezone.utc).isoformat()
    for t in tasks:
        if (
            t.get("due_date")
            and t.get("status") not in ("completed",)
            and t["due_date"] < today
        ):
            t["status"] = "overdue"
    return tasks


@router.patch("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, current=Depends(require_user)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates.get("status") == "completed":
        updates["completed_at"] = now_iso()
    await db.tasks.update_one(
        {"id": task_id, "workspace_id": current["workspace_id"]}, {"$set": updates}
    )
    return await db.tasks.find_one({"id": task_id}, {"_id": 0})


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, current=Depends(require_user)):
    """Soft-delete: stamp `deleted_at`. Task moves to "Recently deleted" tab
    and is auto-purged 30 days later."""
    res = await db.tasks.update_one(
        {"id": task_id, "workspace_id": current["workspace_id"]},
        {"$set": {"deleted_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Task not found")
    return {"ok": True, "soft_deleted": True}


@router.post("/tasks/{task_id}/restore")
async def restore_task(task_id: str, current=Depends(require_user)):
    """Undo a soft delete — task returns to its prior (active/completed) state."""
    res = await db.tasks.update_one(
        {"id": task_id, "workspace_id": current["workspace_id"], "deleted_at": {"$ne": None}},
        {"$set": {"deleted_at": None}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Task not found or not deleted")
    return await db.tasks.find_one({"id": task_id}, {"_id": 0})


@router.delete("/tasks/{task_id}/purge")
async def purge_task(task_id: str, current=Depends(require_user)):
    """Permanently delete a soft-deleted task immediately (skip the 30d wait)."""
    res = await db.tasks.delete_one({
        "id": task_id,
        "workspace_id": current["workspace_id"],
        "deleted_at": {"$ne": None},
    })
    if res.deleted_count == 0:
        raise HTTPException(404, "Task not soft-deleted")
    return {"ok": True, "purged": True}
