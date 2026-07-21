"""Workspace-admin AI credit governance — set/inspect multi-scope caps."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import db, require_user
from services import credit_governance as cg

router = APIRouter()


def _admin_only(current: dict):
    if not current.get("is_super_admin") and current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Workspace owner/admin only")


class CapIn(BaseModel):
    scope: str          # user | chat | workspace | enterprise
    scope_id: Optional[str] = None  # defaults to workspace_id for workspace/enterprise
    limit_credits: int


@router.get("/credit-governance/caps")
async def list_caps(current=Depends(require_user)):
    _admin_only(current)
    ws = current["workspace_id"]
    caps = await cg.caps_status(ws)
    # Enrich with human labels for the admin UI.
    members = await db.users.find(
        {"workspace_id": ws, "status": {"$ne": "removed"}},
        {"_id": 0, "id": 1, "name": 1, "email": 1},
    ).to_list(500)
    chats = await db.chats.find(
        {"workspace_id": ws}, {"_id": 0, "id": 1, "name": 1, "type": 1},
    ).to_list(500)
    name_by_user = {m["id"]: (m.get("name") or m.get("email")) for m in members}
    name_by_chat = {c["id"]: (c.get("name") or "Untitled chat") for c in chats}
    for c in caps:
        if c["scope"] == "user":
            c["label"] = name_by_user.get(c["scope_id"], c["scope_id"])
        elif c["scope"] == "chat":
            c["label"] = name_by_chat.get(c["scope_id"], c["scope_id"])
        elif c["scope"] == "enterprise":
            c["label"] = "All workspaces (org-wide)"
        else:
            c["label"] = "This workspace"
    return {
        "caps": caps,
        "members": members,
        "chats": [{"id": c["id"], "name": c.get("name") or "Untitled chat"} for c in chats],
        "scopes": list(cg.SCOPES),
    }


@router.put("/credit-governance/caps")
async def set_cap(payload: CapIn, current=Depends(require_user)):
    _admin_only(current)
    ws = current["workspace_id"]
    if payload.scope not in cg.SCOPES:
        raise HTTPException(400, "invalid scope")
    scope_id = payload.scope_id
    if payload.scope in ("workspace", "enterprise"):
        scope_id = ws if payload.scope == "workspace" else ws
    if not scope_id:
        raise HTTPException(400, f"scope_id is required for the '{payload.scope}' scope")
    if payload.limit_credits <= 0:
        await cg.delete_cap(ws, payload.scope, scope_id)
        return {"ok": True, "removed": True}
    cap = await cg.set_cap(ws, payload.scope, scope_id, payload.limit_credits, current["id"])
    return {"ok": True, "cap": cap}


@router.delete("/credit-governance/caps/{scope}/{scope_id}")
async def delete_cap(scope: str, scope_id: str, current=Depends(require_user)):
    _admin_only(current)
    removed = await cg.delete_cap(current["workspace_id"], scope, scope_id)
    return {"ok": True, "removed": removed}
