"""Dev OS — public preview serving, share links, guest comments, presence."""
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

from fastapi import Response
from fastapi.routing import APIRoute
from services.dev_preview_shim import _inject_login_shim

# ─── Preview presence (who's viewing the live preview right now) ──────
# Lightweight per-project liveness: DevStudio heartbeats every 30s while
# the preview iframe is mounted. Other teammates see "Priya is viewing the
# live preview" in the linked chat, driving shared exploration of the
# generated app. Presence rows are considered live for 90s after the last
# heartbeat (3× the client interval, so a single dropped beat doesn't
# evict the user).

PRESENCE_TTL_SECONDS = 90


async def _live_viewers(project_id: str) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=PRESENCE_TTL_SECONDS)).isoformat()
    rows = await db.dev_preview_presence.find(
        {"project_id": project_id, "last_seen_at": {"$gte": cutoff}},
        {"_id": 0, "user_id": 1, "user_name": 1, "last_seen_at": 1},
    ).to_list(50)
    return rows


@router.post("/dev-projects/{project_id}/presence/heartbeat")
async def presence_heartbeat(project_id: str, current=Depends(require_user)):
    """Mark the current user as actively viewing this project's preview.
    DevStudio calls this on mount and every 30s. Returns the current list
    of other live viewers (excluding the caller) so the UI can update
    co-presence chips in the same round-trip.

    Includes a 5s write-throttle: if the same user heartbeated for this
    project in the last 5s we skip the Mongo write but still return the
    fresh `others` list. Protects against runaway clients write-amplifying
    the collection."""
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]},
        {"_id": 0, "id": 1, "related_chat_id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    user_name = current.get("name") or current.get("email") or "Teammate"
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()

    existing = await db.dev_preview_presence.find_one(
        {"project_id": project_id, "user_id": current["id"]},
        {"_id": 0, "last_seen_at": 1},
    )
    write = True
    if existing and existing.get("last_seen_at"):
        try:
            last = datetime.fromisoformat(existing["last_seen_at"])
            if (now_dt - last).total_seconds() < 5:
                write = False
        except (ValueError, TypeError):
            pass

    if write:
        await db.dev_preview_presence.update_one(
            {"project_id": project_id, "user_id": current["id"]},
            {"$set": {
                "project_id": project_id,
                "user_id": current["id"],
                "user_name": user_name,
                "workspace_id": current["workspace_id"],
                "related_chat_id": project.get("related_chat_id"),
                "last_seen_at": now,
            }},
            upsert=True,
        )

    others = [v for v in await _live_viewers(project_id) if v["user_id"] != current["id"]]
    return {"ok": True, "others": others}


@router.delete("/dev-projects/{project_id}/presence")
async def presence_leave(project_id: str, current=Depends(require_user)):
    """Best-effort 'I'm leaving the preview now' — DevStudio fires this on
    unmount via navigator.sendBeacon so the chip goes away immediately
    instead of waiting for the 90s TTL."""
    await db.dev_preview_presence.delete_one(
        {"project_id": project_id, "user_id": current["id"]},
    )
    return {"ok": True}


@router.get("/chats/{chat_id}/preview-viewers")
async def chat_preview_viewers(chat_id: str, current=Depends(require_user)):
    """List teammates currently viewing the dev-OS preview linked to this
    chat. Returns [] when no project is linked or no one is viewing.
    Excludes the caller so the chat header doesn't show "you" to you."""
    chat = await db.chats.find_one(
        {"id": chat_id, "workspace_id": current["workspace_id"]},
        # Project `id` too — without it, a chat that has no
        # `linked_dev_project_id` would come back as `{}` and the falsy
        # check below would incorrectly think the chat doesn't exist.
        {"_id": 0, "id": 1, "linked_dev_project_id": 1},
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    project_id = chat.get("linked_dev_project_id")
    if not project_id:
        # Fallback: a project may have related_chat_id pointing here without
        # the chat back-pointer being set.
        project = await db.dev_projects.find_one(
            {"workspace_id": current["workspace_id"], "related_chat_id": chat_id},
            {"_id": 0, "id": 1},
        )
        if not project:
            return {"viewers": [], "project_id": None}
        project_id = project["id"]
    others = [v for v in await _live_viewers(project_id) if v["user_id"] != current["id"]]
    return {"viewers": others, "project_id": project_id}



# ─── Public preview server ───────────────────────────────────────────────
# Serves generated frontend files as static content so users can OPEN a real
# working preview of their project. No auth — anyone with the URL sees it
# (this is the same model Vercel uses for preview branches). The project id
# is the only secret; share_tokens layer in a future iteration if needed.
_MIME_BY_EXT = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".sql": "text/plain; charset=utf-8",
    ".py": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
}


@router.get("/dev-projects/{project_id}/preview/{file_path:path}")
async def serve_preview_file(project_id: str, file_path: str):
    """Static preview server. Looks up the file in `dev_code_files` and
    returns it with the right MIME type. Defaults `index.html` if the path
    is empty. Tries `frontend/<path>` first (most previews are frontend
    assets), then the raw path so backend/sql files can be inspected too."""
    return await _serve_preview(project_id, file_path)


async def _serve_preview(project_id: str, file_path: str) -> Response:
    """Internal: shared between the authed preview route and the public
    `/api/share/preview/{token}/...` route — both ultimately render the
    same `dev_code_files`.

    Self-healing: if the project has no files at all yet (created via
    chat spin-up before stub-seeding existed, or an aborted build), we
    transparently seed the deterministic stub SPA so the iframe always
    renders something usable. The first real build then overwrites these.
    """
    from services.dev_os_codegen import get_file_by_path
    path = file_path or "index.html"
    f = await get_file_by_path(project_id, f"frontend/{path}")
    if not f:
        f = await get_file_by_path(project_id, path)

    if not f:
        # Empty project — try to backfill the stub SPA on the fly so the
        # iframe shows a working preview instead of a bare 404.
        try:
            file_count = await db.dev_code_files.count_documents({"project_id": project_id})
        except Exception:
            file_count = 0
        if file_count == 0:
            proj = await db.dev_projects.find_one({"id": project_id}, {"_id": 0})
            if proj:
                from services.dev_os_codegen import seed_stub_files
                try:
                    await seed_stub_files(proj)
                    f = await get_file_by_path(project_id, f"frontend/{path}")
                    if not f:
                        f = await get_file_by_path(project_id, path)
                except Exception:
                    f = None

    if not f:
        # Friendly empty state — still a working HTML page so the iframe
        # doesn't look broken. Links back to the Studio so the user can
        # kick off a real build in one tap.
        html = _empty_preview_html(project_id, path)
        return Response(content=html, status_code=200, media_type="text/html")

    ext = ""
    if "." in f["path"]:
        ext = "." + f["path"].rsplit(".", 1)[1].lower()
    mime = _MIME_BY_EXT.get(ext, "text/plain; charset=utf-8")
    content = f["content"]
    # Inject a resilient demo-login shim into every served HTML so login
    # always works — even when the LLM-generated index.html uses different
    # element ids than the stub app.js expects.
    if ext == ".html":
        from services.dev_preview_shim import PREVIEW_HEADERS
        content = _inject_login_shim(content)
        try:
            from deps import is_demo_workspace
            from services.dev_preview_shim import _inject_demo_watermark
            proj = await db.dev_projects.find_one(
                {"id": project_id}, {"_id": 0, "workspace_id": 1},
            )
            if proj and await is_demo_workspace(proj.get("workspace_id")):
                content = _inject_demo_watermark(content)
        except Exception:
            pass
        return Response(content=content, media_type=mime,
                        headers=PREVIEW_HEADERS)
    return Response(content=content, media_type=mime)


def _empty_preview_html(project_id: str, path: str) -> str:
    """Friendly empty-state shown when a project has no generated files."""
    studio_url = f"/dev-os/projects/{project_id}/studio"
    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>Preview — not built yet</title>"
        "<style>"
        "body{margin:0;background:radial-gradient(1200px 600px at 20% -10%,rgba(251,191,36,.10),transparent 60%),#09090b;"
        "color:#e4e4e7;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;min-height:100vh;"
        "display:flex;align-items:center;justify-content:center;padding:24px}"
        ".card{max-width:520px;width:100%;background:rgba(24,24,27,.7);border:1px solid rgba(255,255,255,.08);"
        "border-radius:20px;padding:36px;backdrop-filter:blur(14px)}"
        ".badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;text-transform:uppercase;"
        "letter-spacing:.12em;color:#fbbf24;background:rgba(251,191,36,.10);border:1px solid rgba(251,191,36,.30);"
        "border-radius:999px;padding:4px 10px;margin-bottom:18px}"
        "h1{font-size:22px;margin:0 0 8px;color:#fafafa}"
        "p{font-size:14px;line-height:1.6;color:#a1a1aa;margin:0 0 20px}"
        ".cta{display:inline-flex;align-items:center;gap:8px;background:#fbbf24;color:#0c0a09;"
        "text-decoration:none;font-weight:600;font-size:13px;padding:10px 16px;border-radius:10px;"
        "transition:transform .15s ease,background-color .2s ease}"
        ".cta:hover{background:#fde68a;transform:translateY(-1px)}"
        ".hint{margin-top:18px;font-size:11px;color:#71717a}"
        "code{background:rgba(255,255,255,.06);padding:2px 6px;border-radius:6px;color:#fbbf24;font-size:11.5px}"
        "</style></head><body><div class='card'>"
        "<div class='badge'>🚀 Empty project</div>"
        "<h1>This build hasn't been generated yet.</h1>"
        f"<p>Open the Studio and describe what you'd like to build, or ask <code>@devmgr</code> in the chat. "
        "We'll scaffold the SPA, FastAPI backend and tests in seconds.</p>"
        f"<a class='cta' target='_top' href='{studio_url}'>Open Studio →</a>"
        f"<div class='hint'>Looking for <code>{path}</code> — it will appear here once the first build completes.</div>"
        "</div></body></html>"
    )



# ─── Public share links for the live preview ─────────────────────────
# Users can mint a public token to demo the build to people outside the
# workspace. Tokens map 1:1 to a project; same token is returned for the
# same (project, creator) pair so old links keep working when re-shared.
# Tokens grant READ-ONLY access to the preview files — never to source
# code, project metadata or chat. Expire after 30 days of inactivity.

import secrets as _secrets  # noqa: E402

PREVIEW_SHARE_TTL_DAYS = 30


@router.post("/dev-projects/{project_id}/share-token")
async def mint_share_token(project_id: str, current=Depends(require_user)):
    """Create or reuse a public share token for this project's preview.
    Returns `{token, share_path, expires_at}`. Idempotent for the same
    (project, user) pair so re-sharing doesn't break older links."""
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]},
        {"_id": 0, "id": 1, "name": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")

    now_dt = datetime.now(timezone.utc)
    expires_dt = now_dt + timedelta(days=PREVIEW_SHARE_TTL_DAYS)
    existing = await db.dev_preview_share_tokens.find_one(
        {
            "project_id": project_id,
            "created_by": current["id"],
            "revoked": {"$ne": True},
        },
        {"_id": 0, "token": 1, "expires_at": 1},
    )
    if existing:
        # Extend the existing token's lifetime so any links the user has
        # already shared stay live for another 30 days.
        await db.dev_preview_share_tokens.update_one(
            {"token": existing["token"]},
            {"$set": {"expires_at": expires_dt.isoformat(), "last_minted_at": now_dt.isoformat()}},
        )
        token = existing["token"]
    else:
        token = _secrets.token_urlsafe(24)
        await db.dev_preview_share_tokens.insert_one({
            "token": token,
            "project_id": project_id,
            "workspace_id": current["workspace_id"],
            "created_by": current["id"],
            "created_at": now_dt.isoformat(),
            "expires_at": expires_dt.isoformat(),
            "last_minted_at": now_dt.isoformat(),
            "revoked": False,
        })
    return {
        "token": token,
        "share_path": f"/share/{token}",
        "expires_at": expires_dt.isoformat(),
        "project_name": project.get("name"),
    }


@router.delete("/dev-projects/{project_id}/share-token")
async def revoke_share_tokens(project_id: str, current=Depends(require_user)):
    """Revoke all share tokens the current user has minted for this
    project. Existing public links return 404 immediately afterwards."""
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]},
        {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    result = await db.dev_preview_share_tokens.update_many(
        {"project_id": project_id, "created_by": current["id"]},
        {"$set": {"revoked": True, "revoked_at": now_iso()}},
    )
    return {"ok": True, "revoked_count": result.modified_count}


# Note: PUBLIC route — no `Depends(require_user)`. Token-gated read-only.
@router.get("/share/preview/{token}/{file_path:path}")
async def public_share_preview(token: str, file_path: str = ""):
    """Serve a project's preview file via an unauthenticated share token.
    Looks up the token, validates expiry+revocation, then delegates to the
    same internal file server the authed route uses. Returns 410 for
    expired/revoked tokens (so clients can show a friendly "link expired"
    page rather than a generic 404)."""
    record = await db.dev_preview_share_tokens.find_one(
        {"token": token}, {"_id": 0, "project_id": 1, "expires_at": 1, "revoked": 1},
    )
    if not record:
        return Response(
            content="<!doctype html><h1>404 — link not found</h1>",
            status_code=404, media_type="text/html",
        )
    if record.get("revoked"):
        return Response(
            content="<!doctype html><h1>410 — link revoked</h1>",
            status_code=410, media_type="text/html",
        )
    expires = record.get("expires_at")
    if expires and expires < datetime.now(timezone.utc).isoformat():
        return Response(
            content="<!doctype html><h1>410 — link expired</h1>",
            status_code=410, media_type="text/html",
        )
    return await _serve_preview(record["project_id"], file_path or "index.html")



# ─── Public guest comments on shared previews (token-gated, no auth, ─────
# no AI-credit spend). Distinct path prefix so the /share/preview/{token}/
# {file_path} catch-all never swallows these routes.
async def _valid_share_record(token: str) -> Dict[str, Any]:
    record = await db.dev_preview_share_tokens.find_one(
        {"token": token}, {"_id": 0, "project_id": 1, "workspace_id": 1, "expires_at": 1, "revoked": 1},
    )
    if not record or record.get("revoked"):
        raise HTTPException(404, "Share link not found or revoked")
    if (record.get("expires_at") or "") < datetime.now(timezone.utc).isoformat():
        raise HTTPException(410, "Share link expired")
    return record


class GuestCommentCreate(BaseModel):
    author_name: str = "Guest"
    comment: str
    screen_name: str = ""


@router.get("/preview-share/{token}/comments")
async def list_guest_comments(token: str):
    record = await _valid_share_record(token)
    rows = await db.dev_preview_comments.find(
        {"project_id": record["project_id"]},
        {"_id": 0, "id": 1, "comment": 1, "screen_name": 1, "author_name": 1,
         "is_guest": 1, "resolved": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(100)
    return {"comments": rows}


@router.post("/preview-share/{token}/comments")
async def create_guest_comment(token: str, payload: GuestCommentCreate):
    record = await _valid_share_record(token)
    body = (payload.comment or "").strip()
    if not body:
        raise HTTPException(400, "Comment cannot be empty")
    row = {
        "id": new_id(),
        "workspace_id": record.get("workspace_id"),
        "project_id": record["project_id"],
        "build_id": None,
        "user_id": None,
        "author_name": (payload.author_name or "Guest").strip()[:60] or "Guest",
        "is_guest": True,
        "screen_name": (payload.screen_name or "").strip()[:80],
        "comment": body[:1000],
        "screenshot_url": None,
        "converted_to_task_id": None,
        "converted_to_bug_id": None,
        "resolved": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_preview_comments.insert_one(row.copy())
    return row


