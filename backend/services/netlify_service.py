"""Real Netlify integration via Personal Access Token (env: NETLIFY_AUTH_TOKEN).

Mirrors `vercel_service.py` operation-for-operation so the frontend can
hold the two providers in symmetry:

  • verify_token() — GET /api/v1/user
  • list_sites()   — GET /api/v1/sites
  • link_site(...) — store dev_project → netlify_site link
  • trigger_deploy(workspace_id, dev_project_id) — POST /api/v1/sites/{id}/builds
    (calls Netlify's "Build hooks" equivalent via the builds endpoint, which
    forces a fresh build of the latest deploy on the linked Git provider)
"""
from __future__ import annotations
import logging
import os
from typing import Any, Dict, List, Optional

import httpx

from deps import db, new_id, now_iso

logger = logging.getLogger("teamnest")

_TOKEN = os.environ.get("NETLIFY_AUTH_TOKEN")
_API = "https://api.netlify.com/api/v1"


def configured() -> bool:
    return bool(_TOKEN)


def _headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {_TOKEN}", "Content-Type": "application/json"}


async def verify_token() -> Dict[str, Any]:
    if not configured():
        return {"ok": False, "reason": "not_configured"}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{_API}/user", headers=_headers())
        if r.status_code >= 400:
            return {"ok": False, "reason": "http_error", "status": r.status_code}
        u = r.json() or {}
        return {
            "ok": True,
            "id": u.get("id"),
            "email": u.get("email"),
            "full_name": u.get("full_name"),
            "site_count": u.get("site_count"),
        }
    except Exception as e:
        return {"ok": False, "reason": "exception", "error": str(e)}


async def list_sites(limit: int = 50) -> Dict[str, Any]:
    if not configured():
        return {"ok": False, "reason": "not_configured", "sites": []}
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(f"{_API}/sites", headers=_headers(), params={"per_page": limit})
        if r.status_code >= 400:
            return {"ok": False, "reason": "http_error", "status": r.status_code, "sites": []}
        out: List[Dict[str, Any]] = []
        for s in r.json() or []:
            out.append({
                "id": s.get("id"),
                "name": s.get("name"),
                "url": s.get("ssl_url") or s.get("url"),
                "updated_at": s.get("updated_at"),
            })
        return {"ok": True, "sites": out}
    except Exception as e:
        return {"ok": False, "reason": "exception", "error": str(e), "sites": []}


async def link_site(workspace_id: str, dev_project_id: str, site_id: str, site_name: str) -> Dict[str, Any]:
    row = {
        "workspace_id": workspace_id,
        "dev_project_id": dev_project_id,
        "netlify_site_id": site_id,
        "netlify_site_name": site_name,
        "linked_at": now_iso(),
    }
    await db.dev_netlify_links.update_one(
        {"workspace_id": workspace_id, "dev_project_id": dev_project_id},
        {"$set": row, "$setOnInsert": {"id": new_id()}},
        upsert=True,
    )
    return {"ok": True, "link": row}


async def get_link(workspace_id: str, dev_project_id: str) -> Optional[Dict[str, Any]]:
    return await db.dev_netlify_links.find_one(
        {"workspace_id": workspace_id, "dev_project_id": dev_project_id},
        {"_id": 0},
    )


async def trigger_deploy(workspace_id: str, dev_project_id: str) -> Dict[str, Any]:
    """Force a fresh build via POST /sites/{id}/builds (rebuilds the latest
    git source). Returns {ok, deploy} on success."""
    if not configured():
        return {"ok": False, "reason": "not_configured"}
    link = await get_link(workspace_id, dev_project_id)
    if not link:
        return {"ok": False, "reason": "not_linked"}
    try:
        async with httpx.AsyncClient(timeout=25) as c:
            r = await c.post(
                f"{_API}/sites/{link['netlify_site_id']}/builds",
                headers=_headers(),
            )
        if r.status_code >= 400:
            return {"ok": False, "reason": "build_failed", "status": r.status_code, "body": r.text[:500]}
        body = r.json() or {}
    except Exception as e:
        logger.warning("[netlify] trigger_deploy failed: %s", e)
        return {"ok": False, "reason": "exception", "error": str(e)}

    row = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "dev_project_id": dev_project_id,
        "netlify_site_id": link["netlify_site_id"],
        "build_id": body.get("id"),
        "state": body.get("done") and "done" or "building",
        "deploy_id": body.get("deploy_id"),
        "created_at": now_iso(),
    }
    await db.dev_netlify_deployments.insert_one(row.copy())
    return {"ok": True, "deploy": row}
