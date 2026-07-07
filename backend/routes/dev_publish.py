"""Publish generated projects to production + external deploys.

  • TeamNest hosting: snapshot the current preview files into an immutable
    release served publicly at /api/p/{slug}/... (wrapped by /p/{slug} on
    the frontend). Test preview keeps evolving; production only changes
    when the user re-publishes.
  • Custom domain: stored on the release with CNAME instructions surfaced
    in the UI (DNS verification is informational only).
  • Vercel / Netlify: real deploys via user-provided access tokens
    (tokens are never persisted).
"""
import asyncio
import hashlib
import logging
import re
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from deps import db, new_id, now_iso, require_user

router = APIRouter()
logger = logging.getLogger("teamnest")

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$")
DOMAIN_RE = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$")


def _dns_proof_sync(domain: str, expected_host: Optional[str], token: Optional[str]) -> tuple:
    """DNS proof for a custom domain: the domain's CNAME must point at the
    platform host, OR a TXT record at _teamnest.<domain> must contain the
    release's verify token."""
    import dns.resolver
    try:
        for r in dns.resolver.resolve(domain, "CNAME"):
            tgt = str(r.target).rstrip(".").lower()
            if (expected_host and tgt == expected_host) or tgt.endswith(".emergentagent.com"):
                return True, f"CNAME → {tgt}"
    except Exception:
        pass
    if token:
        try:
            for r in dns.resolver.resolve(f"_teamnest.{domain}", "TXT"):
                txt = "".join(s.decode() if isinstance(s, bytes) else str(s) for s in r.strings)
                if token in txt:
                    return True, "TXT record verified"
        except Exception:
            pass
    return False, "No matching CNAME or _teamnest TXT record found yet"


async def _dns_proof(domain: str, expected_host: Optional[str], token: Optional[str]) -> tuple:
    return await asyncio.to_thread(_dns_proof_sync, domain, expected_host, token)

VERCEL_API = "https://api.vercel.com"
NETLIFY_API = "https://api.netlify.com/api/v1"


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "app").lower()).strip("-")
    s = re.sub(r"-{2,}", "-", s)[:40].strip("-")
    return s if len(s) >= 3 else (s + "-app")


async def _get_project_checked(project_id: str, current: Dict[str, Any]) -> Dict[str, Any]:
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    return project


async def _frontend_files(project_id: str) -> List[Dict[str, str]]:
    """Frontend assets flattened for static hosting (index.html at root)."""
    rows = await db.dev_code_files.find(
        {"project_id": project_id, "path": {"$regex": "^frontend/"}},
        {"_id": 0, "path": 1, "content": 1},
    ).to_list(100)
    return [
        {"file": r["path"].split("frontend/", 1)[1], "data": r.get("content") or ""}
        for r in rows
        if r["path"] != "frontend/"
    ]


# ─── Build activity (polled by the chat's BuildProgressCard) ─────────────
@router.get("/build-activities/{activity_id}")
async def get_build_activity(activity_id: str, current=Depends(require_user)):
    doc = await db.dev_build_activities.find_one(
        {"id": activity_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Activity not found")
    return doc


# ─── TeamNest production hosting ─────────────────────────────────────────
class PublishReq(BaseModel):
    slug: Optional[str] = None
    override_gates: bool = False


class ProductionPatch(BaseModel):
    slug: Optional[str] = None
    custom_domain: Optional[str] = None
    showcase_opt_in: Optional[bool] = None
    showcase_tagline: Optional[str] = None


def _release_public(release: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: v for k, v in release.items() if k != "files"}
    out["path"] = f"/p/{release['slug']}"
    out["files_count"] = len(release.get("files") or [])
    return out


async def _do_publish(
    project: Dict[str, Any],
    files: List[Dict[str, Any]],
    publisher_id: str,
    slug: Optional[str] = None,
    gates: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Snapshot files into the production release (versioned). Called by the
    publish route AND by an approved PM action."""
    project_id = project["id"]
    existing = await db.dev_prod_releases.find_one({"project_id": project_id}, {"_id": 0})
    slug = (slug or "").strip().lower() or (existing or {}).get("slug") or _slugify(project.get("name"))
    if not SLUG_RE.match(slug):
        raise HTTPException(400, "Slug must be 3-40 chars: lowercase letters, numbers, hyphens.")

    # Auto-suffix on collision with another project's slug.
    base = slug
    for i in range(2, 10):
        taken = await db.dev_prod_releases.find_one(
            {"slug": slug, "project_id": {"$ne": project_id}}, {"_id": 0, "id": 1},
        )
        if not taken:
            break
        slug = f"{base}-{i}"

    version = ((existing or {}).get("version") or 0) + 1
    now = now_iso()
    release = {
        "id": (existing or {}).get("id") or new_id(),
        "workspace_id": project["workspace_id"],
        "project_id": project_id,
        "slug": slug,
        "version": version,
        "files": files,
        "gates": gates,
        "custom_domain": (existing or {}).get("custom_domain"),
        "domain_status": (existing or {}).get("domain_status"),
        "status": "live",
        "published_by": publisher_id,
        "created_at": (existing or {}).get("created_at") or now,
        "published_at": now,
        "updated_at": now,
    }
    await db.dev_prod_releases.update_one(
        {"project_id": project_id}, {"$set": release}, upsert=True,
    )
    # Auto release notes (best-effort, non-blocking).
    try:
        import asyncio
        from services.dev_os_phase3b import generate_release_notes
        asyncio.create_task(generate_release_notes(
            project["workspace_id"], project_id, f"v{version}", publisher_id,
        ))
    except Exception:
        pass
    return _release_public(release)


@router.post("/dev-projects/{project_id}/publish")
async def publish_project(project_id: str, payload: PublishReq, current=Depends(require_user)):
    project = await _get_project_checked(project_id, current)
    files = await db.dev_code_files.find(
        {"project_id": project_id}, {"_id": 0, "path": 1, "content": 1, "kind": 1},
    ).to_list(500)
    if not files:
        raise HTTPException(400, "No files to publish — run a build first.")

    from routes.dev_gates import is_pm_or_admin, maybe_require_approval, run_gates_on_files
    gates = run_gates_on_files(files)
    if not gates["ok"] and not (payload.override_gates and current.get("role") in ("owner", "admin")):
        raise HTTPException(422, detail={"code": "gates_failed", "gates": gates})

    pending = await maybe_require_approval(
        project, "production_publish", current,
        payload={"slug": payload.slug}, gates=gates,
    )
    if pending:
        return pending

    return await _do_publish(project, files, current["id"], payload.slug, gates=gates)


@router.get("/dev-projects/{project_id}/production")
async def get_production(project_id: str, current=Depends(require_user)):
    await _get_project_checked(project_id, current)
    release = await db.dev_prod_releases.find_one({"project_id": project_id}, {"_id": 0})
    if not release:
        raise HTTPException(404, "Not published yet")
    return _release_public(release)


@router.patch("/dev-projects/{project_id}/production")
async def patch_production(project_id: str, payload: ProductionPatch, request: Request, current=Depends(require_user)):
    await _get_project_checked(project_id, current)
    release = await db.dev_prod_releases.find_one({"project_id": project_id}, {"_id": 0})
    if not release:
        raise HTTPException(404, "Not published yet — publish first.")

    updates: Dict[str, Any] = {}
    if payload.slug is not None:
        slug = payload.slug.strip().lower()
        if not SLUG_RE.match(slug):
            raise HTTPException(400, "Slug must be 3-40 chars: lowercase letters, numbers, hyphens.")
        taken = await db.dev_prod_releases.find_one(
            {"slug": slug, "project_id": {"$ne": project_id}}, {"_id": 0, "id": 1},
        )
        if taken:
            raise HTTPException(409, f"'{slug}' is already taken — try another name.")
        updates["slug"] = slug
    if payload.custom_domain is not None:
        domain = payload.custom_domain.strip().lower().rstrip(".")
        if domain == "":
            updates["custom_domain"] = None
            updates["domain_status"] = None
            updates["domain_verify_token"] = None
        else:
            if not DOMAIN_RE.match(domain):
                raise HTTPException(400, "Enter a valid domain like app.yourcompany.com")
            updates["custom_domain"] = domain
            updates["domain_status"] = "pending_dns"
            updates["domain_verify_token"] = f"tn-verify-{new_id().split('-')[0]}"
            updates["platform_host"] = (request.headers.get("host") or "").split(":")[0].lower()
    if payload.showcase_opt_in is not None:
        updates["showcase_opt_in"] = bool(payload.showcase_opt_in)
    if payload.showcase_tagline is not None:
        updates["showcase_tagline"] = payload.showcase_tagline.strip()[:120]
    if not updates:
        return _release_public(release)
    updates["updated_at"] = now_iso()
    await db.dev_prod_releases.update_one({"project_id": project_id}, {"$set": updates})
    release.update(updates)
    return _release_public(release)


# ─── Public production serving (no auth — like the preview model) ────────
_MIME_BY_EXT = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
}


def _prod_404(slug: str) -> Response:
    html = (
        "<!doctype html><html><head><meta charset='utf-8'><title>Not found</title>"
        "<style>body{margin:0;background:#09090b;color:#e4e4e7;font-family:ui-sans-serif,system-ui;"
        "min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center}"
        "code{color:#fbbf24}</style></head><body><div>"
        f"<h1>404</h1><p>No live app is published at <code>/p/{slug}</code>.</p>"
        "</div></body></html>"
    )
    return Response(content=html, status_code=404, media_type="text/html")


async def _serve_prod(slug: str, file_path: str) -> Response:
    release = await db.dev_prod_releases.find_one(
        {"slug": slug, "status": "live"}, {"_id": 0},
    )
    if not release:
        return _prod_404(slug)
    path = file_path or "index.html"
    by_path = {f["path"]: f for f in (release.get("files") or [])}
    f = by_path.get(f"frontend/{path}") or by_path.get(path)
    if not f:
        return _prod_404(slug)
    ext = "." + f["path"].rsplit(".", 1)[1].lower() if "." in f["path"] else ""
    mime = _MIME_BY_EXT.get(ext, "text/plain; charset=utf-8")
    content = f.get("content") or ""
    if ext == ".html":
        from services.dev_preview_shim import _inject_login_shim, PREVIEW_HEADERS
        content = _inject_login_shim(content)
        try:
            from deps import is_demo_workspace
            from services.dev_preview_shim import _inject_demo_watermark
            ws = release.get("workspace_id")
            if not ws:
                proj = await db.dev_projects.find_one(
                    {"id": release.get("project_id")}, {"_id": 0, "workspace_id": 1},
                )
                ws = (proj or {}).get("workspace_id")
            if await is_demo_workspace(ws):
                content = _inject_demo_watermark(content)
        except Exception:
            pass
        return Response(content=content, media_type=mime,
                        headers=PREVIEW_HEADERS)
    return Response(content=content, media_type=mime)


@router.get("/p/{slug}")
async def serve_production_root(slug: str):
    return await _serve_prod(slug, "index.html")


@router.get("/p-resolve")
async def resolve_custom_domain(host: str):
    """Public: map a custom domain (Host header value) to a published app slug.
    Used by the frontend bootstrap to serve /p/ apps on customer domains."""
    domain = (host or "").strip().lower().rstrip(".").split(":")[0]
    if not domain or not DOMAIN_RE.match(domain):
        raise HTTPException(404, "No app for this domain")
    release = await db.dev_prod_releases.find_one(
        {"custom_domain": domain, "status": "live"},
        {"_id": 0, "slug": 1, "project_id": 1, "domain_status": 1,
         "platform_host": 1, "domain_verify_token": 1},
    )
    if not release:
        raise HTTPException(404, "No app for this domain")
    # Flip to connected only once DNS proof (CNAME/TXT probe) passes.
    if release.get("domain_status") != "connected":
        ok, detail = await _dns_proof(
            domain, release.get("platform_host"), release.get("domain_verify_token"),
        )
        if ok:
            await db.dev_prod_releases.update_one(
                {"custom_domain": domain},
                {"$set": {"domain_status": "connected",
                          "domain_check_detail": detail, "updated_at": now_iso()}},
            )
    return {"slug": release["slug"]}


@router.post("/dev-projects/{project_id}/verify-domain")
async def verify_domain(project_id: str, current=Depends(require_user)):
    """Probe DNS (CNAME → platform host, or _teamnest TXT token) and update
    the custom domain's status accordingly."""
    await _get_project_checked(project_id, current)
    release = await db.dev_prod_releases.find_one({"project_id": project_id}, {"_id": 0})
    if not release or not release.get("custom_domain"):
        raise HTTPException(400, "Set a custom domain first")
    ok, detail = await _dns_proof(
        release["custom_domain"], release.get("platform_host"), release.get("domain_verify_token"),
    )
    status = "connected" if ok else "pending_dns"
    await db.dev_prod_releases.update_one(
        {"project_id": project_id},
        {"$set": {"domain_status": status, "domain_last_check": now_iso(),
                  "domain_check_detail": detail, "updated_at": now_iso()}},
    )
    return {"verified": ok, "domain_status": status, "detail": detail}


@router.get("/showcase")
async def public_showcase():
    """Public: opt-in gallery of apps built & published with TeamNest."""
    releases = await db.dev_prod_releases.find(
        {"showcase_opt_in": True, "status": "live"},
        {"_id": 0, "slug": 1, "project_id": 1, "published_at": 1, "updated_at": 1,
         "custom_domain": 1, "showcase_tagline": 1, "version": 1},
    ).sort("updated_at", -1).to_list(60)
    project_ids = [r["project_id"] for r in releases]
    projects = await db.dev_projects.find(
        {"id": {"$in": project_ids}}, {"_id": 0, "id": 1, "name": 1, "description": 1},
    ).to_list(60)
    by_id = {p["id"]: p for p in projects}
    apps = []
    for r in releases:
        p = by_id.get(r["project_id"], {})
        apps.append({
            "slug": r["slug"],
            "name": p.get("name") or r["slug"],
            "tagline": r.get("showcase_tagline") or (p.get("description") or "")[:120],
            "url": f"/p/{r['slug']}",
            "custom_domain": r.get("custom_domain"),
            "version": r.get("version"),
            "published_at": r.get("published_at") or r.get("updated_at"),
        })
    return {"apps": apps}


@router.get("/p/{slug}/{file_path:path}")
async def serve_production_file(slug: str, file_path: str):
    return await _serve_prod(slug, file_path)


# ─── Vercel deploy (user token, never stored) ────────────────────────────
class VercelDeployReq(BaseModel):
    token: str
    team_id: Optional[str] = None


@router.post("/dev-projects/{project_id}/deploy/vercel")
async def deploy_vercel(project_id: str, payload: VercelDeployReq, current=Depends(require_user)):
    from deps import block_if_demo
    await block_if_demo(
        current["workspace_id"],
        "Demo mode: external deploys are disabled. Sign up for your own free workspace to deploy.",
    )
    project = await _get_project_checked(project_id, current)
    files = await _frontend_files(project_id)
    if not files:
        raise HTTPException(400, "No frontend files to deploy — run a build first.")

    name = _slugify(project.get("name"))
    body = {
        "name": name,
        "files": [{"file": f["file"], "data": f["data"], "encoding": "utf8"} for f in files],
        "projectSettings": {
            "framework": None,
            "buildCommand": None,
            "devCommand": None,
            "installCommand": None,
            "outputDirectory": None,
        },
    }
    params = {"teamId": payload.team_id} if payload.team_id else {}
    headers = {"Authorization": f"Bearer {payload.token}"}

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.post(f"{VERCEL_API}/v13/deployments", headers=headers, params=params, json=body)
            if res.status_code >= 400:
                detail = ""
                try:
                    detail = (res.json().get("error") or {}).get("message") or res.text[:200]
                except Exception:
                    detail = res.text[:200]
                code = res.status_code if res.status_code in (401, 403) else 502
                raise HTTPException(code, f"Vercel: {detail}")
            dep = res.json()
            state = dep.get("readyState")
            for _ in range(20):
                if state in ("READY", "ERROR", "CANCELED"):
                    break
                await asyncio.sleep(2)
                r2 = await client.get(f"{VERCEL_API}/v13/deployments/{dep['id']}", headers=headers, params=params)
                if r2.status_code < 400:
                    state = r2.json().get("readyState")
            if state in ("ERROR", "CANCELED"):
                raise HTTPException(502, f"Vercel deployment failed ({state})")
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Vercel unreachable: {e}")

    url = f"https://{dep.get('url')}"
    await db.dev_external_deploys.insert_one({
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "project_id": project_id,
        "provider": "vercel",
        "url": url,
        "state": state,
        "created_by": current["id"],
        "created_at": now_iso(),
    })
    return {"provider": "vercel", "url": url, "state": state}


# ─── Netlify deploy (user token, never stored) ───────────────────────────
class NetlifyDeployReq(BaseModel):
    token: str
    site_name: Optional[str] = None


@router.post("/dev-projects/{project_id}/deploy/netlify")
async def deploy_netlify(project_id: str, payload: NetlifyDeployReq, current=Depends(require_user)):
    from deps import block_if_demo
    await block_if_demo(
        current["workspace_id"],
        "Demo mode: external deploys are disabled. Sign up for your own free workspace to deploy.",
    )
    await _get_project_checked(project_id, current)
    files = await _frontend_files(project_id)
    if not files:
        raise HTTPException(400, "No frontend files to deploy — run a build first.")

    headers = {"Authorization": f"Bearer {payload.token}"}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # Re-deploy to the same site when we've deployed this project before.
            site = None
            prior = await db.dev_external_deploys.find_one(
                {"project_id": project_id, "provider": "netlify", "site_id": {"$ne": None}},
                {"_id": 0}, sort=[("created_at", -1)],
            )
            if prior and prior.get("site_id"):
                r = await client.get(f"{NETLIFY_API}/sites/{prior['site_id']}", headers=headers)
                if r.status_code < 400:
                    site = r.json()
            if site is None:
                site_body = {"name": payload.site_name} if payload.site_name else {}
                r = await client.post(f"{NETLIFY_API}/sites", headers=headers, json=site_body)
                if r.status_code == 422 and payload.site_name:
                    r = await client.post(
                        f"{NETLIFY_API}/sites", headers=headers,
                        json={"name": f"{payload.site_name}-{new_id()[:4]}"},
                    )
                if r.status_code >= 400:
                    code = r.status_code if r.status_code in (401, 403) else 502
                    raise HTTPException(code, f"Netlify: {r.text[:200]}")
                site = r.json()

            digests = {f["file"]: hashlib.sha1(f["data"].encode("utf-8")).hexdigest() for f in files}
            r = await client.post(
                f"{NETLIFY_API}/sites/{site['id']}/deploys", headers=headers, json={"files": digests},
            )
            if r.status_code >= 400:
                raise HTTPException(502, f"Netlify deploy: {r.text[:200]}")
            deploy = r.json()

            put_headers = {**headers, "Content-Type": "application/octet-stream"}
            for f in files:
                pr = await client.put(
                    f"{NETLIFY_API}/deploys/{deploy['id']}/files/{f['file']}",
                    headers=put_headers, content=f["data"].encode("utf-8"),
                )
                if pr.status_code >= 400:
                    raise HTTPException(502, f"Netlify upload {f['file']}: {pr.text[:150]}")

            state = deploy.get("state")
            for _ in range(20):
                if state in ("ready", "error"):
                    break
                await asyncio.sleep(2)
                sr = await client.get(f"{NETLIFY_API}/deploys/{deploy['id']}", headers=headers)
                if sr.status_code < 400:
                    state = sr.json().get("state")
            if state == "error":
                raise HTTPException(502, "Netlify deployment failed")
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Netlify unreachable: {e}")

    url = site.get("ssl_url") or site.get("url")
    await db.dev_external_deploys.insert_one({
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "project_id": project_id,
        "provider": "netlify",
        "site_id": site.get("id"),
        "url": url,
        "deploy_url": deploy.get("deploy_url"),
        "state": state,
        "created_by": current["id"],
        "created_at": now_iso(),
    })
    return {"provider": "netlify", "url": url, "deploy_url": deploy.get("deploy_url"), "state": state}
