"""Audit logging — Mongo-backed activity stream for admin visibility.

Fire-and-forget: never raises into caller. Stores {workspace_id, actor_id,
actor_name, action, target_type, target_id, meta, created_at} for every
material workspace event.

Recorded actions:
- user.invited, user.removed, user.role_changed, user.added_to_workspace
- chat.created, chat.deleted, chat.cleared, chat.left, chat.guest_invited, chat.guest_removed
- project.created, project.archived
- approval.created, approval.decided
- decision.created, decision.status_changed
- workspace.transferred, workspace.left
- import.whatsapp
- file.uploaded
- export.downloaded
- billing.upgraded, billing.cancelled
"""
from typing import Any, Optional

from deps import db, logger, new_id, now_iso


async def record_audit(
    *,
    workspace_id: Optional[str],
    actor_id: Optional[str],
    actor_name: Optional[str],
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    meta: Optional[dict] = None,
) -> None:
    """Insert one audit row. Swallows errors so a logging failure never breaks
    the request path."""
    if not workspace_id:
        return
    try:
        await db.audit_logs.insert_one({
            "id": new_id(),
            "workspace_id": workspace_id,
            "actor_id": actor_id,
            "actor_name": actor_name or "system",
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "meta": meta or {},
            "created_at": now_iso(),
        })
    except Exception as e:
        logger.warning("[audit] %s skipped: %s", action, e)


async def list_audit(
    *,
    workspace_id: str,
    action: Optional[str] = None,
    actor_id: Optional[str] = None,
    limit: int = 100,
) -> list:
    """Admin-only list query. Newest first."""
    flt: dict[str, Any] = {"workspace_id": workspace_id}
    if action:
        flt["action"] = action
    if actor_id:
        flt["actor_id"] = actor_id
    cur = db.audit_logs.find(flt, {"_id": 0}).sort("created_at", -1).limit(limit)
    return [doc async for doc in cur]
