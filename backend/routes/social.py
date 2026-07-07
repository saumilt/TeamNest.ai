"""Social media connections for AI CMO.

Lets a workspace owner connect Instagram, Facebook Pages, and YouTube
channels via OAuth, store the long-lived access tokens, and periodically pull
high-signal analytics (followers, reach, engagement, video views) into Mongo
so the AI CMO can reason about them when answering questions.

OAuth keys are read from env at request time:
  - META_APP_ID / META_APP_SECRET     (Instagram + Facebook share the same App)
  - META_REDIRECT_URI                 (typically {PUBLIC_BACKEND_URL}/api/social/meta/callback)
  - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
  - GOOGLE_REDIRECT_URI               (typically {PUBLIC_BACKEND_URL}/api/social/google/callback)

If the env vars are missing, the corresponding "Connect" button is hidden
and `GET /social/config` returns `available=false` for that platform.

This module intentionally does NOT post to social platforms — read-only
scopes only. Analytics are refreshed on-demand via `POST /social/{id}/sync`
and surfaced in `GET /social/summary`, which the AI CMO calls before
answering questions when the user is on a paid CMO subscription.
"""
from __future__ import annotations

import os
import secrets
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from deps import db, new_id, now_iso, require_user

router = APIRouter()


# ─── Config + helpers ────────────────────────────────────────────────────────
def _public_base() -> str:
    return (
        os.environ.get("PUBLIC_BACKEND_URL")
        or os.environ.get("REACT_APP_BACKEND_URL")
        or ""
    ).rstrip("/")


def _meta_available() -> bool:
    return bool(os.environ.get("META_APP_ID") and os.environ.get("META_APP_SECRET"))


def _google_available() -> bool:
    return bool(
        os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET")
    )


def _meta_redirect() -> str:
    return os.environ.get("META_REDIRECT_URI") or f"{_public_base()}/api/social/meta/callback"


def _google_redirect() -> str:
    return (
        os.environ.get("GOOGLE_REDIRECT_URI")
        or f"{_public_base()}/api/social/google/callback"
    )


# ─── Status ─────────────────────────────────────────────────────────────────
@router.get("/social/config")
async def social_config(current=Depends(require_user)):
    return {
        "meta_available": _meta_available(),
        "google_available": _google_available(),
        "platforms": [
            {"key": "instagram", "label": "Instagram", "available": _meta_available(), "icon": "instagram"},
            {"key": "facebook", "label": "Facebook Pages", "available": _meta_available(), "icon": "facebook"},
            {"key": "youtube", "label": "YouTube", "available": _google_available(), "icon": "youtube"},
        ],
    }


@router.get("/social/connections")
async def list_connections(current=Depends(require_user)):
    cur = db.social_connections.find(
        {"workspace_id": current["workspace_id"]},
        {"_id": 0, "access_token": 0, "refresh_token": 0},
    )
    items = await cur.to_list(50)
    return {"connections": items}


@router.delete("/social/connections/{conn_id}")
async def disconnect(conn_id: str, current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owners/admins can disconnect")
    res = await db.social_connections.delete_one(
        {"id": conn_id, "workspace_id": current["workspace_id"]}
    )
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    await db.social_analytics_snapshots.delete_many({"connection_id": conn_id})
    return {"ok": True}


# ─── OAuth: Meta (Facebook + Instagram) ──────────────────────────────────────
@router.get("/social/meta/auth-url")
async def meta_auth_url(platform: str = "instagram", current=Depends(require_user)):
    if not _meta_available():
        raise HTTPException(503, "Meta integration is not configured on the server.")
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owners/admins can connect a social account.")
    if platform not in ("instagram", "facebook"):
        raise HTTPException(400, "platform must be instagram or facebook")
    state_id = new_id()
    nonce = secrets.token_urlsafe(16)
    await db.social_oauth_states.insert_one({
        "id": state_id,
        "nonce": nonce,
        "platform": platform,
        "provider": "meta",
        "workspace_id": current["workspace_id"],
        "user_id": current["id"],
        "created_at": now_iso(),
    })
    # Instagram Graph reads Business/Creator accounts via the linked Page,
    # so we request Page + IG scopes regardless of which button was clicked.
    scopes = [
        "pages_show_list",
        "pages_read_engagement",
        "instagram_basic",
        "read_insights",
        "business_management",
    ]
    if platform == "instagram":
        scopes.append("instagram_manage_insights")
    params = {
        "client_id": os.environ["META_APP_ID"],
        "redirect_uri": _meta_redirect(),
        "scope": ",".join(scopes),
        "response_type": "code",
        "state": f"{state_id}.{nonce}",
    }
    return {
        "url": f"https://www.facebook.com/v19.0/dialog/oauth?{urlencode(params)}",
        "state_id": state_id,
    }


@router.get("/social/meta/callback")
async def meta_callback(request: Request, code: Optional[str] = None, state: Optional[str] = None):
    if not code or not state or "." not in state:
        raise HTTPException(400, "Missing code or state")
    state_id, nonce = state.split(".", 1)
    st = await db.social_oauth_states.find_one({"id": state_id, "nonce": nonce})
    if not st:
        raise HTTPException(400, "Invalid or expired state")
    await db.social_oauth_states.delete_one({"id": state_id})
    async with httpx.AsyncClient(timeout=30) as client:
        token_resp = await client.get(
            "https://graph.facebook.com/v19.0/oauth/access_token",
            params={
                "client_id": os.environ["META_APP_ID"],
                "client_secret": os.environ["META_APP_SECRET"],
                "redirect_uri": _meta_redirect(),
                "code": code,
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(502, f"Meta token exchange failed: {token_resp.text[:200]}")
        short = token_resp.json()
        # Exchange for long-lived token.
        ll = await client.get(
            "https://graph.facebook.com/v19.0/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": os.environ["META_APP_ID"],
                "client_secret": os.environ["META_APP_SECRET"],
                "fb_exchange_token": short["access_token"],
            },
        )
        access_token = ll.json().get("access_token", short["access_token"])
        # List Pages the user manages, then for IG pull the linked IG account.
        pages = await client.get(
            "https://graph.facebook.com/v19.0/me/accounts",
            params={"access_token": access_token, "fields": "id,name,access_token,instagram_business_account"},
        )
        pages_data = pages.json().get("data", []) if pages.status_code == 200 else []
    saved: List[Dict[str, Any]] = []
    for page in pages_data:
        page_token = page.get("access_token", access_token)
        if st["platform"] == "facebook":
            doc = {
                "id": new_id(),
                "workspace_id": st["workspace_id"],
                "platform": "facebook",
                "provider": "meta",
                "remote_id": page["id"],
                "display_name": page.get("name") or "Facebook Page",
                "access_token": page_token,
                "connected_by": st["user_id"],
                "created_at": now_iso(),
                "last_synced_at": None,
            }
            await db.social_connections.insert_one(doc.copy())
            saved.append({"platform": "facebook", "name": doc["display_name"]})
        ig_ref = page.get("instagram_business_account")
        if st["platform"] == "instagram" and ig_ref:
            doc = {
                "id": new_id(),
                "workspace_id": st["workspace_id"],
                "platform": "instagram",
                "provider": "meta",
                "remote_id": ig_ref["id"],
                "display_name": f"@{page.get('name') or 'instagram'}",
                "access_token": page_token,
                "page_id": page["id"],
                "connected_by": st["user_id"],
                "created_at": now_iso(),
                "last_synced_at": None,
            }
            await db.social_connections.insert_one(doc.copy())
            saved.append({"platform": "instagram", "name": doc["display_name"]})
    redirect = f"{_public_base()}/employees/cmo?connected={st['platform']}&count={len(saved)}"
    return RedirectResponse(redirect, status_code=302)


# ─── OAuth: Google / YouTube ─────────────────────────────────────────────────
@router.get("/social/google/auth-url")
async def google_auth_url(current=Depends(require_user)):
    if not _google_available():
        raise HTTPException(503, "Google integration is not configured on the server.")
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owners/admins can connect a social account.")
    state_id = new_id()
    nonce = secrets.token_urlsafe(16)
    await db.social_oauth_states.insert_one({
        "id": state_id,
        "nonce": nonce,
        "platform": "youtube",
        "provider": "google",
        "workspace_id": current["workspace_id"],
        "user_id": current["id"],
        "created_at": now_iso(),
    })
    params = {
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "redirect_uri": _google_redirect(),
        "response_type": "code",
        "scope": " ".join([
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/yt-analytics.readonly",
        ]),
        "access_type": "offline",
        "prompt": "consent",
        "state": f"{state_id}.{nonce}",
    }
    return {
        "url": f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}",
        "state_id": state_id,
    }


@router.get("/social/google/callback")
async def google_callback(code: Optional[str] = None, state: Optional[str] = None):
    if not code or not state or "." not in state:
        raise HTTPException(400, "Missing code or state")
    state_id, nonce = state.split(".", 1)
    st = await db.social_oauth_states.find_one({"id": state_id, "nonce": nonce})
    if not st:
        raise HTTPException(400, "Invalid state")
    await db.social_oauth_states.delete_one({"id": state_id})
    async with httpx.AsyncClient(timeout=30) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": os.environ["GOOGLE_CLIENT_ID"],
                "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
                "redirect_uri": _google_redirect(),
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(502, f"Google token exchange failed: {token_resp.text[:200]}")
        tokens = token_resp.json()
        access_token = tokens["access_token"]
        refresh_token = tokens.get("refresh_token")
        channels = await client.get(
            "https://www.googleapis.com/youtube/v3/channels",
            params={"part": "snippet,statistics", "mine": "true"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
    saved = 0
    for ch in channels.json().get("items", []) if channels.status_code == 200 else []:
        doc = {
            "id": new_id(),
            "workspace_id": st["workspace_id"],
            "platform": "youtube",
            "provider": "google",
            "remote_id": ch["id"],
            "display_name": ch["snippet"]["title"],
            "access_token": access_token,
            "refresh_token": refresh_token,
            "connected_by": st["user_id"],
            "created_at": now_iso(),
            "last_synced_at": None,
        }
        await db.social_connections.insert_one(doc.copy())
        saved += 1
    redirect = f"{_public_base()}/employees/cmo?connected=youtube&count={saved}"
    return RedirectResponse(redirect, status_code=302)


# ─── Sync analytics ─────────────────────────────────────────────────────────
async def _sync_meta(conn: Dict[str, Any]) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        if conn["platform"] == "instagram":
            r = await client.get(
                f"https://graph.facebook.com/v19.0/{conn['remote_id']}",
                params={
                    "fields": "username,followers_count,follows_count,media_count",
                    "access_token": conn["access_token"],
                },
            )
            d = r.json() if r.status_code == 200 else {}
            ins = await client.get(
                f"https://graph.facebook.com/v19.0/{conn['remote_id']}/insights",
                params={
                    "metric": "reach,impressions,profile_views",
                    "period": "day",
                    "access_token": conn["access_token"],
                },
            )
            insights = ins.json().get("data", []) if ins.status_code == 200 else []
            return {
                "username": d.get("username"),
                "followers": d.get("followers_count"),
                "follows": d.get("follows_count"),
                "media_count": d.get("media_count"),
                "insights": insights,
            }
        # facebook page
        r = await client.get(
            f"https://graph.facebook.com/v19.0/{conn['remote_id']}",
            params={
                "fields": "name,fan_count,followers_count,about",
                "access_token": conn["access_token"],
            },
        )
        d = r.json() if r.status_code == 200 else {}
        ins = await client.get(
            f"https://graph.facebook.com/v19.0/{conn['remote_id']}/insights",
            params={
                "metric": "page_impressions,page_engaged_users,page_fans",
                "period": "day",
                "access_token": conn["access_token"],
            },
        )
        return {
            "name": d.get("name"),
            "fans": d.get("fan_count"),
            "followers": d.get("followers_count"),
            "about": d.get("about"),
            "insights": ins.json().get("data", []) if ins.status_code == 200 else [],
        }


async def _sync_youtube(conn: Dict[str, Any]) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            "https://www.googleapis.com/youtube/v3/channels",
            params={"part": "snippet,statistics", "id": conn["remote_id"]},
            headers={"Authorization": f"Bearer {conn['access_token']}"},
        )
        if r.status_code == 401 and conn.get("refresh_token"):
            tk = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "refresh_token": conn["refresh_token"],
                    "client_id": os.environ["GOOGLE_CLIENT_ID"],
                    "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
                    "grant_type": "refresh_token",
                },
            )
            if tk.status_code == 200:
                new_access = tk.json()["access_token"]
                await db.social_connections.update_one(
                    {"id": conn["id"]}, {"$set": {"access_token": new_access}}
                )
                conn["access_token"] = new_access
                r = await client.get(
                    "https://www.googleapis.com/youtube/v3/channels",
                    params={"part": "snippet,statistics", "id": conn["remote_id"]},
                    headers={"Authorization": f"Bearer {new_access}"},
                )
        ch = (r.json().get("items") or [{}])[0] if r.status_code == 200 else {}
        stats = ch.get("statistics", {})
        return {
            "title": ch.get("snippet", {}).get("title"),
            "subscribers": int(stats.get("subscriberCount", 0) or 0),
            "views": int(stats.get("viewCount", 0) or 0),
            "videos": int(stats.get("videoCount", 0) or 0),
        }


@router.post("/social/connections/{conn_id}/sync")
async def sync_connection(conn_id: str, current=Depends(require_user)):
    conn = await db.social_connections.find_one(
        {"id": conn_id, "workspace_id": current["workspace_id"]}
    )
    if not conn:
        raise HTTPException(404, "Not found")
    try:
        data = (
            await _sync_youtube(conn)
            if conn["platform"] == "youtube"
            else await _sync_meta(conn)
        )
    except Exception as exc:
        raise HTTPException(502, f"Sync failed: {exc}")
    snap = {
        "id": new_id(),
        "connection_id": conn["id"],
        "workspace_id": conn["workspace_id"],
        "platform": conn["platform"],
        "snapshot": data,
        "created_at": now_iso(),
    }
    await db.social_analytics_snapshots.insert_one(snap.copy())
    await db.social_connections.update_one(
        {"id": conn_id}, {"$set": {"last_synced_at": now_iso(), "last_snapshot": data}}
    )
    return {"ok": True, "snapshot": data}


@router.get("/social/summary")
async def summary(current=Depends(require_user)):
    """Compact analytics summary the AI CMO can read before answering."""
    cur = db.social_connections.find(
        {"workspace_id": current["workspace_id"]},
        {"_id": 0, "access_token": 0, "refresh_token": 0},
    )
    items = await cur.to_list(50)
    return {"connections": items}
