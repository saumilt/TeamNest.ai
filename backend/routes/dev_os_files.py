"""Dev OS — generated code files, snapshots/rollback and the diff viewer."""
import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import _broadcast_message, db, new_id, now_iso, require_user

router = APIRouter()
logger = logging.getLogger("teamnest")

# ─── Real code files (LLM-generated, served as live preview) ─────────────
class CodeFilePatch(BaseModel):
    content: str


@router.get("/dev-projects/{project_id}/files")
async def list_files(project_id: str, current=Depends(require_user)):
    """File tree for the project. Returns lightweight metadata only — fetch
    `/dev-projects/{pid}/files/{file_id}` for the actual content."""
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    from services.dev_os_codegen import list_project_files
    files = await list_project_files(project_id)
    # Strip content from the list response to keep payloads small.
    return {
        "files": [
            {k: v for k, v in f.items() if k != "content"}
            for f in files
        ],
        "count": len(files),
    }


@router.get("/dev-projects/{project_id}/files/{file_id}")
async def get_file(project_id: str, file_id: str, current=Depends(require_user)):
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    from services.dev_os_codegen import get_file_by_id
    f = await get_file_by_id(file_id)
    if not f or f.get("project_id") != project_id:
        raise HTTPException(404, "File not found")
    return f


@router.put("/dev-projects/{project_id}/files/{file_id}")
async def patch_file(
    project_id: str, file_id: str, payload: CodeFilePatch,
    current=Depends(require_user),
):
    """Inline edit. Re-deploying to Vercel / pushing to GitHub picks up the
    updated content automatically because both flows read from
    `dev_code_files` on the fly."""
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    from deps import block_if_demo
    await block_if_demo(
        current["workspace_id"],
        "Demo mode: files are read-only. Sign up for your own free workspace to edit code.",
    )
    from services.dev_os_codegen import get_file_by_id
    f = await get_file_by_id(file_id)
    if not f or f.get("project_id") != project_id:
        raise HTTPException(404, "File not found")
    # Snapshot OLD content so a human edit can be reverted too.
    from services.dev_os_snapshots import capture_snapshot
    await capture_snapshot(f, reason="human_edit", actor=current["id"])
    new_content = payload.content
    await db.dev_code_files.update_one(
        {"id": file_id},
        {"$set": {
            "content": new_content,
            "size_bytes": len(new_content.encode("utf-8")),
            "llm_status": "human_edited",
            "updated_at": now_iso(),
        }},
    )
    return await get_file_by_id(file_id)


# ─── Snapshot history & rollback ─────────────────────────────────────
@router.get("/dev-projects/{project_id}/files/{file_id}/snapshots")
async def list_file_snapshots(
    project_id: str, file_id: str, current=Depends(require_user),
):
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    from services.dev_os_snapshots import list_snapshots
    return {"snapshots": await list_snapshots(file_id)}


@router.get("/dev-projects/{project_id}/files/{file_id}/snapshots/{snapshot_id}")
async def get_file_snapshot(
    project_id: str, file_id: str, snapshot_id: str,
    current=Depends(require_user),
):
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    from services.dev_os_snapshots import get_snapshot
    snap = await get_snapshot(snapshot_id)
    if not snap or snap.get("file_id") != file_id or snap.get("project_id") != project_id:
        raise HTTPException(404, "Snapshot not found")
    return snap


@router.post("/dev-projects/{project_id}/files/{file_id}/revert/{snapshot_id}")
async def revert_to_snapshot(
    project_id: str, file_id: str, snapshot_id: str,
    current=Depends(require_user),
):
    """Restore a file to a previous snapshot. Captures the CURRENT content
    as a fresh snapshot first so the revert itself is also undoable."""
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    from deps import block_if_demo
    await block_if_demo(
        current["workspace_id"],
        "Demo mode: files are read-only. Sign up for your own free workspace to edit code.",
    )
    from services.dev_os_codegen import get_file_by_id
    from services.dev_os_snapshots import capture_snapshot, get_snapshot
    f = await get_file_by_id(file_id)
    if not f or f.get("project_id") != project_id:
        raise HTTPException(404, "File not found")
    snap = await get_snapshot(snapshot_id)
    if not snap or snap.get("file_id") != file_id:
        raise HTTPException(404, "Snapshot not found")
    await capture_snapshot(f, reason="pre_revert", actor=current["id"])
    new_content = snap.get("content") or ""
    await db.dev_code_files.update_one(
        {"id": file_id},
        {"$set": {
            "content": new_content,
            "size_bytes": len(new_content.encode("utf-8")),
            "llm_status": "reverted",
            "updated_at": now_iso(),
        }},
    )
    try:
        await db.dev_audit_logs.insert_one({
            "id": new_id(),
            "workspace_id": project["workspace_id"],
            "project_id": project_id,
            "user_id": current["id"],
            "action": "revert",
            "summary": f"Reverted {f['path']} to a previous snapshot",
            "metadata": {"file_id": file_id, "snapshot_id": snapshot_id, "path": f["path"]},
            "created_at": now_iso(),
        })
    except Exception:
        pass
    return await get_file_by_id(file_id)



# ─── Snapshot diff viewer ────────────────────────────────────────────────
@router.get("/dev-projects/{project_id}/files/{file_id}/diff/{snapshot_id}")
async def diff_file_snapshot(
    project_id: str, file_id: str, snapshot_id: str, current=Depends(require_user),
):
    """Unified diff between a snapshot (old) and the current file content."""
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    from services.dev_os_codegen import get_file_by_id
    from services.dev_os_snapshots import get_snapshot
    f = await get_file_by_id(file_id)
    if not f or f.get("project_id") != project_id:
        raise HTTPException(404, "File not found")
    snap = await get_snapshot(snapshot_id)
    if not snap or snap.get("file_id") != file_id:
        raise HTTPException(404, "Snapshot not found")
    import difflib
    old = (snap.get("content") or "").splitlines()
    new = (f.get("content") or "").splitlines()
    lines = []
    added = removed = 0
    for l in difflib.unified_diff(old, new, lineterm=""):
        if l.startswith("+++") or l.startswith("---"):
            continue
        if l.startswith("@@"):
            lines.append({"t": "hunk", "text": l})
        elif l.startswith("+"):
            added += 1
            lines.append({"t": "add", "text": l[1:]})
        elif l.startswith("-"):
            removed += 1
            lines.append({"t": "del", "text": l[1:]})
        else:
            lines.append({"t": "ctx", "text": l[1:] if l.startswith(" ") else l})
    return {
        "path": f.get("path"),
        "snapshot_id": snapshot_id,
        "snapshot_at": snap.get("created_at"),
        "added": added,
        "removed": removed,
        "lines": lines[:900],
    }


class ReleaseNotesGenerate(BaseModel):
    version: str = "v0.1.0"


@router.post("/dev-projects/{project_id}/release-notes")
async def gen_release_notes(project_id: str, payload: ReleaseNotesGenerate, current=Depends(require_user)):
    from services.dev_os_phase3b import generate_release_notes
    return await generate_release_notes(current["workspace_id"], project_id, payload.version, current["id"])


@router.get("/dev-projects/{project_id}/release-notes")
async def list_release_notes(project_id: str, current=Depends(require_user)):
    rows = await db.dev_release_notes.find(
        {"project_id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    ).sort("created_at", -1).to_list(30)
    return {"releases": rows}


class MemoryAdd(BaseModel):
    category: str
    note: str
    source: str = "manual"


@router.post("/dev-projects/{project_id}/memory")
async def add_memory_endpoint(project_id: str, payload: MemoryAdd, current=Depends(require_user)):
    from services.dev_os_phase3b import add_memory
    return await add_memory(
        workspace_id=current["workspace_id"], project_id=project_id, user_id=current["id"],
        category=payload.category, note=payload.note, source=payload.source,
    )


@router.get("/dev-projects/{project_id}/memory")
async def list_memory_endpoint(project_id: str, current=Depends(require_user)):
    from services.dev_os_phase3b import list_memory
    items = await list_memory(workspace_id=current["workspace_id"], project_id=project_id)
    return {"items": items}


@router.get("/dev-os/audit-log")
async def get_audit_log(current=Depends(require_user)):
    from services.dev_os_phase3b import list_audit
    return {"entries": await list_audit(current["workspace_id"], limit=200)}


