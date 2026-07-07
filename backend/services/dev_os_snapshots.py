"""File snapshot history + revert for Dev OS code files.

Every Talk-to-Build edit, human edit, and AI cascade write is preceded by a
small snapshot of the file's previous content (stored in `dev_code_file_snapshots`).
Users can list recent snapshots and revert to any point — the rollback the
user explicitly asked for.

Snapshots are append-only and capped at 20 per file (oldest culled) to keep
storage bounded — each snapshot is at most ~5KB of code so 20 × 5KB = 100KB
per file maximum.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from deps import db, new_id, now_iso

SNAPSHOT_RETENTION = 20


async def capture_snapshot(file_doc: Dict[str, Any], reason: str, actor: str) -> None:
    """Append the file's CURRENT content to the snapshots collection BEFORE
    it gets overwritten. Idempotency: skip if the latest snapshot already
    has the same content (no-op edits don't pollute history)."""
    if not file_doc:
        return
    latest = await db.dev_code_file_snapshots.find_one(
        {"file_id": file_doc["id"]},
        {"_id": 0, "content": 1},
        sort=[("created_at", -1)],
    )
    if latest and latest.get("content") == file_doc.get("content"):
        return
    snap = {
        "id": new_id(),
        "workspace_id": file_doc["workspace_id"],
        "project_id": file_doc["project_id"],
        "file_id": file_doc["id"],
        "path": file_doc["path"],
        "content": file_doc.get("content") or "",
        "size_bytes": file_doc.get("size_bytes") or 0,
        "llm_status_before": file_doc.get("llm_status") or "real",
        "reason": reason,
        "actor": actor,
        "created_at": now_iso(),
    }
    await db.dev_code_file_snapshots.insert_one(snap)
    # Prune oldest beyond retention.
    extras = await db.dev_code_file_snapshots.find(
        {"file_id": file_doc["id"]}, {"_id": 0, "id": 1, "created_at": 1},
    ).sort("created_at", -1).skip(SNAPSHOT_RETENTION).to_list(50)
    if extras:
        await db.dev_code_file_snapshots.delete_many(
            {"id": {"$in": [s["id"] for s in extras]}}
        )


async def list_snapshots(file_id: str) -> List[Dict[str, Any]]:
    """Most recent first. Strip content from the list response to keep
    payloads small — caller fetches `/snapshots/{id}` for the actual diff."""
    rows = await db.dev_code_file_snapshots.find(
        {"file_id": file_id},
        {"_id": 0, "content": 0},
    ).sort("created_at", -1).to_list(SNAPSHOT_RETENTION)
    return rows


async def get_snapshot(snapshot_id: str) -> Optional[Dict[str, Any]]:
    return await db.dev_code_file_snapshots.find_one(
        {"id": snapshot_id}, {"_id": 0},
    )
