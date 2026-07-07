"""Per-chat integrations: incoming webhooks, ad-hoc API fetch, outgoing webhooks."""
import secrets as _secrets

import httpx
from fastapi import APIRouter, Depends, HTTPException

from deps import _broadcast_message, db, new_id, now_iso, require_user
from models import ApiFetchRequest, IntegrationCreate, WebhookPayload

router = APIRouter()


def _public_integration(rec: dict) -> dict:
    """Strip internals + expose the webhook URL when applicable."""
    if not rec:
        return rec
    out = {k: v for k, v in rec.items() if k != "_id"}
    if rec.get("type") == "incoming_webhook" and rec.get("secret_token"):
        out["webhook_url"] = f"/api/webhooks/incoming/{rec['secret_token']}"
    return out


@router.get("/chats/{chat_id}/integrations")
async def list_integrations(chat_id: str, current=Depends(require_user)):
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]})
    if not chat:
        raise HTTPException(404, "Chat not found")
    records = await db.integrations.find({"chat_id": chat_id}, {"_id": 0}).to_list(100)
    return [_public_integration(r) for r in records]


@router.post("/chats/{chat_id}/integrations")
async def create_integration(
    chat_id: str, payload: IntegrationCreate, current=Depends(require_user)
):
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]})
    if not chat:
        raise HTTPException(404, "Chat not found")
    if payload.type == "outgoing_webhook" and not payload.config.get("url"):
        raise HTTPException(400, "outgoing_webhook requires config.url")
    if payload.type == "api_fetch" and not payload.config.get("url"):
        raise HTTPException(400, "api_fetch requires config.url")
    rec = {
        "id": new_id(),
        "chat_id": chat_id,
        "workspace_id": current["workspace_id"],
        "type": payload.type,
        "name": payload.name,
        "config": payload.config or {},
        "secret_token": _secrets.token_urlsafe(24) if payload.type == "incoming_webhook" else None,
        "created_by": current["id"],
        "created_at": now_iso(),
        "last_used_at": None,
        "enabled": True,
    }
    await db.integrations.insert_one(rec.copy())
    return _public_integration(rec)


@router.delete("/integrations/{integration_id}")
async def delete_integration(integration_id: str, current=Depends(require_user)):
    rec = await db.integrations.find_one({"id": integration_id}, {"_id": 0})
    if not rec or rec["workspace_id"] != current["workspace_id"]:
        raise HTTPException(404, "Integration not found")
    await db.integrations.delete_one({"id": integration_id})
    return {"ok": True}


@router.post("/chats/{chat_id}/api-fetch")
async def chat_api_fetch(
    chat_id: str, payload: ApiFetchRequest, current=Depends(require_user)
):
    """Run an ad-hoc HTTP fetch and post the result as a chat message."""
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]})
    if not chat:
        raise HTTPException(404, "Chat not found")
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            req_kwargs = {"headers": payload.headers or {}}
            if payload.method == "POST":
                req_kwargs["content"] = payload.body or ""
            resp = await client.request(payload.method, payload.url, **req_kwargs)
            preview = resp.text[:4000]
            status = resp.status_code
    except Exception as e:
        raise HTTPException(502, f"Fetch failed: {e}")

    label = payload.label or payload.url
    body = (
        f"**API fetch · {label}**  \n"
        f"`{payload.method} {payload.url}` → `{status}`\n\n"
        f"```\n{preview}\n```"
    )
    msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "text",
        "body": body,
        "parent_message_id": None,
        "metadata": {
            "integration": "api_fetch",
            "url": payload.url,
            "method": payload.method,
            "status_code": status,
            "by_user": current["id"],
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(chat_id, msg)
    return msg


@router.post("/webhooks/incoming/{token}")
async def incoming_webhook(token: str, payload: WebhookPayload):
    """Public webhook endpoint. Zapier / external systems POST JSON here to drop
    a message into the linked chat. No auth needed (the secret token IS the auth)."""
    rec = await db.integrations.find_one(
        {"type": "incoming_webhook", "secret_token": token, "enabled": True},
        {"_id": 0},
    )
    if not rec:
        raise HTTPException(404, "Webhook not found or disabled")
    chat = await db.chats.find_one({"id": rec["chat_id"]}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Linked chat not found")

    parts = []
    if payload.title:
        parts.append(f"**{payload.title}**")
    if payload.text:
        parts.append(payload.text)
    if not parts and payload.data:
        parts.append(f"```\n{str(payload.data)[:2000]}\n```")
    body = "\n\n".join(parts) or "[empty webhook payload]"
    if payload.source:
        body = f"_via {payload.source}_  \n{body}"

    msg = {
        "id": new_id(),
        "chat_id": rec["chat_id"],
        "sender_id": "ai-system",
        "message_type": "text",
        "body": body,
        "parent_message_id": None,
        "metadata": {
            "integration": "incoming_webhook",
            "integration_id": rec["id"],
            "integration_name": rec["name"],
            "source": payload.source,
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(rec["chat_id"], msg)
    await db.integrations.update_one(
        {"id": rec["id"]}, {"$set": {"last_used_at": now_iso()}}
    )
    return {"ok": True, "message_id": msg["id"]}
