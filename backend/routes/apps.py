"""Apps Marketplace (Phase 4).

Rebrands "Connectors" into a categorized **Apps** catalogue with plain-English
Read/Act consent and a Native vs Partner split. Native apps reuse the existing
connector registry + OAuth (Gmail / M365 style training, unchanged). Adds a
live, keyless **Zapier** partner connection built on webhooks:
  • outbound — TeamNest POSTs workspace events to a Zapier "Catch Hook" URL
  • inbound  — Zapier POSTs into a unique, secret-signed TeamNest webhook URL
No API keys or external app publishing required; a free Zapier account is enough.
"""
import hmac
import secrets as _secrets
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from deps import _broadcast_message, db, ensure_personal_ai_chat, new_id, now_iso, require_user, resolve_app_base
from services.connectors_registry import PROVIDERS

router = APIRouter()

CATEGORIES = ["Email", "CRM", "Chat", "Files", "Automation"]

# Plain-English Read / Act permissions per app. (type, title, plain description)
_PERMS = {
    "gmail": [("read", "Read your sent mail", "Learns your writing style from sent Gmail. Read-only — it never sends on your behalf.")],
    "gworkspace": [("read", "Read your sent mail", "Learns your writing style from Workspace Gmail. Read-only.")],
    "outlook": [("read", "Read your Outlook mail", "Learns your tone & follow-up style. Read-only.")],
    "m365": [("read", "Read your Microsoft 365 mail", "Learns your writing style from Exchange Online mail. Read-only.")],
    "hubspot": [("read", "Read CRM activity", "Learns your sales workflow style from sanitized CRM activity.")],
    "salesforce": [("read", "Read opportunity activity", "Learns deal-update style from sanitized activity.")],
    "slack": [("read", "Read selected channels", "Learns your internal-update style from channels you choose.")],
    "teams": [("read", "Read team messages", "Learns your team-messaging style. Read-only.")],
    "gdrive": [("read", "Read reference documents", "Uses documents you select for knowledge retrieval.")],
    "zapier": [
        ("read", "Receive events into TeamNest", "Lets your other apps (6,000+ via Zapier) create messages or tasks in TeamNest."),
        ("act", "Send TeamNest events out", "When things happen in TeamNest — like an automation running — TeamNest can send that out to trigger your Zaps."),
    ],
}
_DEFAULT_PERMS = [("read", "Read-only access", "Reads only the data you choose. Never writes without approval.")]


def _perms(key: str) -> list:
    rows = _PERMS.get(key, _DEFAULT_PERMS)
    return [{"type": t, "title": ti, "plain": pl} for (t, ti, pl) in rows]


async def _zapier_doc(ws: str) -> Optional[dict]:
    return await db.app_connections.find_one({"workspace_id": ws, "app": "zapier"}, {"_id": 0})


def _zapier_public(doc: Optional[dict], request: Request = None) -> dict:
    if not doc:
        return {"connected": False, "status": "disconnected"}
    base = resolve_app_base(request)
    token, secret = doc.get("inbound_token"), doc.get("inbound_secret")
    inbound_path = f"/api/apps/webhooks/zapier/{token}?secret={secret}" if token else None
    return {
        "connected": doc.get("status") == "connected",
        "status": doc.get("status", "disconnected"),
        "outbound_url": doc.get("outbound_url"),
        "has_outbound": bool(doc.get("outbound_url")),
        "inbound_path": inbound_path,
        "inbound_url": (base + inbound_path) if (base and inbound_path) else inbound_path,
        "events_sent": doc.get("events_sent", 0),
        "events_received": doc.get("events_received", 0),
        "last_event_at": doc.get("last_event_at"),
        "connected_at": doc.get("connected_at"),
    }


# ── Catalogue ────────────────────────────────────────────────────────────
@router.get("/apps")
async def list_apps(q: Optional[str] = None, category: Optional[str] = None, current=Depends(require_user)):
    ws, uid = current["workspace_id"], current["id"]
    accounts = {
        a["provider"]: a
        for a in await db.connector_accounts.find(
            {"user_id": uid, "connection_status": "connected"},
            {"_id": 0, "id": 1, "provider": 1, "provider_account_email": 1},
        ).to_list(100)
    }
    apps = []
    for p in PROVIDERS:
        acc = accounts.get(p["provider"])
        apps.append({
            "key": p["provider"], "name": p["name"], "category": p["category"],
            "description": p["desc"], "kind": "native",
            "permissions": _perms(p["provider"]), "live": bool(p.get("live")),
            "connect_via": "oauth" if p.get("oauth_start") else "none",
            "oauth_start": p.get("oauth_start"),
            "supports_style_training": bool(p.get("supports_style_training")),
            "connected": bool(acc),
            "account_email": acc.get("provider_account_email") if acc else None,
        })
    zap = await _zapier_doc(ws)
    apps.append({
        "key": "zapier", "name": "Zapier", "category": "Automation",
        "description": "Connect TeamNest to 6,000+ apps. Send events out to trigger Zaps, or let Zapier create messages and tasks in TeamNest.",
        "kind": "partner", "permissions": _perms("zapier"), "live": True,
        "connect_via": "webhook", "oauth_start": None, "supports_style_training": False,
        "connected": bool(zap and zap.get("status") == "connected"),
        "account_email": None,
    })

    if category:
        apps = [a for a in apps if a["category"].lower() == category.lower()]
    if q:
        ql = q.lower()
        apps = [a for a in apps if ql in a["name"].lower() or ql in a["description"].lower() or ql in a["category"].lower()]
    return {"apps": apps, "categories": CATEGORIES}


# ── Zapier partner connection ──────────────────────────────────────────────
class ZapierConnect(BaseModel):
    catch_hook_url: Optional[str] = None


def _require_admin(current: dict):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owners and admins can manage workspace apps")


@router.get("/apps/zapier")
async def get_zapier(request: Request, current=Depends(require_user)):
    return _zapier_public(await _zapier_doc(current["workspace_id"]), request)


@router.post("/apps/zapier/connect")
async def connect_zapier(payload: ZapierConnect, request: Request, current=Depends(require_user)):
    _require_admin(current)
    ws = current["workspace_id"]
    url = (payload.catch_hook_url or "").strip()
    if url and not url.startswith("https://"):
        raise HTTPException(400, "Enter a valid https Zapier Catch Hook URL")
    doc = await _zapier_doc(ws)
    now = now_iso()
    if not doc:
        default_chat = await ensure_personal_ai_chat(current["id"], ws)
        doc = {
            "workspace_id": ws, "app": "zapier", "status": "connected",
            "outbound_url": url or None,
            "inbound_token": _secrets.token_urlsafe(18),
            "inbound_secret": _secrets.token_urlsafe(24),
            "default_chat_id": default_chat["id"],
            "connected_by": current["id"], "connected_at": now, "updated_at": now,
            "events_sent": 0, "events_received": 0, "last_event_at": None,
        }
        await db.app_connections.insert_one(doc.copy())
    else:
        await db.app_connections.update_one(
            {"workspace_id": ws, "app": "zapier"},
            {"$set": {"status": "connected", "outbound_url": url or doc.get("outbound_url"), "updated_at": now}},
        )
        doc = await _zapier_doc(ws)
    return _zapier_public(doc, request)


@router.post("/apps/zapier/disconnect")
async def disconnect_zapier(current=Depends(require_user)):
    _require_admin(current)
    await db.app_connections.delete_one({"workspace_id": current["workspace_id"], "app": "zapier"})
    return {"ok": True}


@router.post("/apps/zapier/test")
async def test_zapier(current=Depends(require_user)):
    _require_admin(current)
    doc = await _zapier_doc(current["workspace_id"])
    if not doc or not doc.get("outbound_url"):
        raise HTTPException(400, "Add your Zapier Catch Hook URL first, then test.")
    ok = await emit_zapier_event(
        current["workspace_id"], "test.event",
        {"message": "Test event from TeamNest", "by": current.get("name")},
    )
    if not ok:
        raise HTTPException(502, "Couldn't reach the Zapier Catch Hook URL. Double-check it and try again.")
    return {"ok": True}


async def emit_zapier_event(workspace_id: str, event: str, payload: dict) -> bool:
    """Best-effort outbound: POST a workspace event to the Zapier Catch Hook."""
    doc = await db.app_connections.find_one(
        {"workspace_id": workspace_id, "app": "zapier", "status": "connected"}, {"_id": 0}
    )
    url = doc and doc.get("outbound_url")
    if not url:
        return False
    body = {"event": event, "workspace_id": workspace_id, "at": now_iso(), **payload}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, json=body)
        ok = r.status_code < 400
    except Exception:
        ok = False
    if ok:
        await db.app_connections.update_one(
            {"workspace_id": workspace_id, "app": "zapier"},
            {"$inc": {"events_sent": 1}, "$set": {"last_event_at": now_iso()}},
        )
    return ok


# ── Inbound webhook (Zapier → TeamNest) ─────────────────────────────────────
class ZapierInbound(BaseModel):
    title: Optional[str] = None
    text: Optional[str] = None
    data: Optional[dict] = None
    target_chat_id: Optional[str] = None


@router.post("/apps/webhooks/zapier/{token}")
async def zapier_inbound(token: str, payload: ZapierInbound, secret: Optional[str] = None):
    """Public inbound endpoint. The URL token + secret are the auth. Zapier POSTs
    JSON here to drop a message into the connected workspace's chat."""
    doc = await db.app_connections.find_one(
        {"app": "zapier", "inbound_token": token, "status": "connected"}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "Connection not found")
    if not secret or not hmac.compare_digest(secret, doc.get("inbound_secret", "")):
        raise HTTPException(401, "Invalid secret")

    chat_id = payload.target_chat_id or doc.get("default_chat_id")
    chat = await db.chats.find_one({"id": chat_id, "workspace_id": doc["workspace_id"]}, {"_id": 0, "id": 1}) if chat_id else None
    if not chat:
        raise HTTPException(404, "Target chat not found")

    parts = []
    if payload.title:
        parts.append(f"**{payload.title}**")
    if payload.text:
        parts.append(payload.text)
    if not parts and payload.data:
        parts.append(f"```\n{str(payload.data)[:2000]}\n```")
    body = "⚡ _via Zapier_\n\n" + ("\n\n".join(parts) or "[empty Zapier payload]")

    msg = {
        "id": new_id(), "chat_id": chat["id"], "sender_id": "ai-system",
        "message_type": "text", "body": body, "parent_message_id": None,
        "metadata": {"integration": "zapier", "event": "inbound"},
        "reactions": {}, "created_at": now_iso(), "edited_at": None, "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(chat["id"], msg)
    await db.app_connections.update_one(
        {"workspace_id": doc["workspace_id"], "app": "zapier"},
        {"$inc": {"events_received": 1}, "$set": {"last_event_at": now_iso()}},
    )
    return {"ok": True, "message_id": msg["id"]}
