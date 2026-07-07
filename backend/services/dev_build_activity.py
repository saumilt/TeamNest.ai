"""Live build activity tracking — the Emergent-style step-by-step progress
feed shown inside the chat while AI agents build or edit a project.

An activity owns an ordered list of steps. Adding a new step auto-completes
the previous running one, so callers just fire `add_step` at each milestone.
A `build_progress` chat message carrying `metadata.build_activity_id` is
posted when the activity starts; the frontend BuildProgressCard polls the
activity endpoint while status == running.
"""
from typing import Any, Dict, List, Optional

from deps import _broadcast_message, db, new_id, now_iso


async def start_activity(
    chat_id: Optional[str],
    workspace_id: str,
    project_id: str,
    title: str,
    kind: str = "build",
) -> Dict[str, Any]:
    activity = {
        "id": new_id(),
        "chat_id": chat_id,
        "workspace_id": workspace_id,
        "project_id": project_id,
        "kind": kind,
        "title": title,
        "status": "running",
        "steps": [],
        "summary": None,
        "files_changed": [],
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "finished_at": None,
    }
    await db.dev_build_activities.insert_one(activity.copy())
    if not chat_id:
        return activity

    msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "build_progress",
        "body": f"🛠️ {title}",
        "parent_message_id": None,
        "metadata": {
            "source": "build_activity",
            "build_activity_id": activity["id"],
            "project_id": project_id,
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(chat_id, msg)
    return activity


async def _finish_running_step(activity_id: str, status: str = "done") -> None:
    await db.dev_build_activities.update_one(
        {"id": activity_id, "steps.status": "running"},
        {"$set": {"steps.$.status": status, "steps.$.finished_at": now_iso()}},
    )


async def add_step(activity_id: str, label: str, icon: str = "⚙️") -> Dict[str, Any]:
    now = now_iso()
    await _finish_running_step(activity_id)
    step = {
        "id": new_id()[:8],
        "icon": icon,
        "label": label,
        "status": "running",
        "started_at": now,
        "finished_at": None,
    }
    await db.dev_build_activities.update_one(
        {"id": activity_id},
        {"$push": {"steps": step}, "$set": {"updated_at": now}},
    )
    return step


async def complete_activity(
    activity_id: str,
    summary: str,
    files_changed: Optional[List[str]] = None,
) -> None:
    now = now_iso()
    await _finish_running_step(activity_id)
    await db.dev_build_activities.update_one(
        {"id": activity_id},
        {"$set": {
            "status": "done",
            "summary": summary,
            "files_changed": files_changed or [],
            "finished_at": now,
            "updated_at": now,
        }},
    )


async def attach_screenshot(activity_id: str, data_uri: str) -> None:
    await db.dev_build_activities.update_one(
        {"id": activity_id},
        {"$set": {"screenshot_b64": data_uri, "updated_at": now_iso()}},
    )


async def set_fields(activity_id: str, fields: Dict[str, Any]) -> None:
    await db.dev_build_activities.update_one(
        {"id": activity_id},
        {"$set": {**fields, "updated_at": now_iso()}},
    )


async def fail_activity(activity_id: str, error: str) -> None:
    now = now_iso()
    await _finish_running_step(activity_id, status="error")
    await db.dev_build_activities.update_one(
        {"id": activity_id},
        {"$set": {
            "status": "error",
            "summary": error,
            "finished_at": now,
            "updated_at": now,
        }},
    )
