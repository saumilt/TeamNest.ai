"""Real Vercel integration via Personal Access Token (env: VERCEL_TOKEN).

Two operations:
  - list_projects() — surface available Vercel projects so the user can pick one
    to link from /dev-os/integrations.
  - trigger_deploy(vercel_project_id, name) — POST /v13/deployments. For v1
    we trigger a redeploy of the latest production deployment of the linked
    Vercel project, which kicks Vercel's existing Git provider integration
    to rebuild HEAD on the project's source branch.

Like the GitHub module, all functions return a structured `{ok, reason, ...}`
result so callers don't need try/except.
"""
from __future__ import annotations
import logging
import os
from typing import Any, Dict, List, Optional

import httpx

from deps import db, new_id, now_iso

logger = logging.getLogger("teamnest")

_TOKEN = os.environ.get("VERCEL_TOKEN")
_TEAM_ID = os.environ.get("VERCEL_TEAM_ID")    # optional
_API = "https://api.vercel.com"


def configured() -> bool:
    return bool(_TOKEN)


def _headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {_TOKEN}", "Content-Type": "application/json"}


def _team_qs() -> Dict[str, str]:
    return {"teamId": _TEAM_ID} if _TEAM_ID else {}


async def verify_token() -> Dict[str, Any]:
    """Probe `GET /v2/user` so we can show the connected account on the
    integrations page."""
    if not configured():
        return {"ok": False, "reason": "not_configured"}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{_API}/v2/user", headers=_headers())
        if r.status_code >= 400:
            return {"ok": False, "reason": "http_error", "status": r.status_code}
        u = (r.json() or {}).get("user") or {}
        return {"ok": True, "username": u.get("username"), "name": u.get("name"), "email": u.get("email")}
    except Exception as e:
        return {"ok": False, "reason": "exception", "error": str(e)}


async def list_projects(limit: int = 50) -> Dict[str, Any]:
    if not configured():
        return {"ok": False, "reason": "not_configured", "projects": []}
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(
                f"{_API}/v9/projects",
                headers=_headers(),
                params={"limit": limit, **_team_qs()},
            )
        if r.status_code >= 400:
            return {"ok": False, "reason": "http_error", "status": r.status_code, "projects": []}
        body = r.json() or {}
        out: List[Dict[str, Any]] = []
        for p in body.get("projects") or []:
            out.append({
                "id": p.get("id"),
                "name": p.get("name"),
                "framework": p.get("framework"),
                "latest_url": (p.get("targets") or {}).get("production", {}).get("url"),
                "updated_at": p.get("updatedAt"),
            })
        return {"ok": True, "projects": out}
    except Exception as e:
        return {"ok": False, "reason": "exception", "error": str(e), "projects": []}


async def link_project(workspace_id: str, dev_project_id: str, vercel_project_id: str, vercel_project_name: str) -> Dict[str, Any]:
    """Store the link between a Dev OS project and a Vercel project."""
    row = {
        "workspace_id": workspace_id,
        "dev_project_id": dev_project_id,
        "vercel_project_id": vercel_project_id,
        "vercel_project_name": vercel_project_name,
        "linked_at": now_iso(),
    }
    await db.dev_vercel_links.update_one(
        {"workspace_id": workspace_id, "dev_project_id": dev_project_id},
        {"$set": row, "$setOnInsert": {"id": new_id()}},
        upsert=True,
    )
    return {"ok": True, "link": row}


async def get_link(workspace_id: str, dev_project_id: str) -> Optional[Dict[str, Any]]:
    return await db.dev_vercel_links.find_one(
        {"workspace_id": workspace_id, "dev_project_id": dev_project_id},
        {"_id": 0},
    )


async def trigger_deploy(workspace_id: str, dev_project_id: str) -> Dict[str, Any]:
    """Redeploy the latest production deployment of the linked Vercel
    project. Returns {ok, deployment} on success."""
    if not configured():
        return {"ok": False, "reason": "not_configured"}
    link = await get_link(workspace_id, dev_project_id)
    if not link:
        return {"ok": False, "reason": "not_linked"}
    try:
        async with httpx.AsyncClient(timeout=25) as c:
            # 1. Find the latest production deployment for the linked Vercel project.
            r = await c.get(
                f"{_API}/v6/deployments",
                headers=_headers(),
                params={"projectId": link["vercel_project_id"], "target": "production", "limit": 1, **_team_qs()},
            )
            if r.status_code >= 400:
                return {"ok": False, "reason": "list_deployments_failed", "status": r.status_code}
            deps = ((r.json() or {}).get("deployments") or [])
            if not deps:
                return {"ok": False, "reason": "no_production_deployment_to_redeploy"}
            latest = deps[0]
            deployment_id = latest.get("uid")

            # 2. Trigger a redeploy by POSTing a fresh deployment using the same source.
            redeploy = await c.post(
                f"{_API}/v13/deployments",
                headers=_headers(),
                params={**_team_qs()},
                json={
                    "name": link["vercel_project_name"],
                    "deploymentId": deployment_id,
                    "target": "production",
                },
            )
            if redeploy.status_code >= 400:
                return {"ok": False, "reason": "redeploy_failed", "status": redeploy.status_code, "body": redeploy.text[:500]}
            d = redeploy.json() or {}
    except Exception as e:
        logger.warning("[vercel] trigger_deploy failed: %s", e)
        return {"ok": False, "reason": "exception", "error": str(e)}

    deploy_url = d.get("url") and f"https://{d['url']}"
    row = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "dev_project_id": dev_project_id,
        "vercel_project_id": link["vercel_project_id"],
        "deployment_id": d.get("id") or d.get("uid"),
        "url": deploy_url,
        "state": d.get("readyState") or d.get("state") or "queued",
        "created_at": now_iso(),
    }
    await db.dev_vercel_deployments.insert_one(row.copy())
    return {"ok": True, "deployment": row}
