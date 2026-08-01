"""Slack — workspace-level outbound posting (bot token).

Posts @ai answers + AI-credit budget alerts into a chosen channel. Per-workspace
config (default channel + toggles) lives in `slack_settings`. Never raises to
callers — Slack being down must not break chat, billing, or invites.
"""
import os
from typing import List, Optional

import httpx

from deps import db, logger, now_iso

_API = "https://slack.com/api"


def _token() -> str:
    return (os.environ.get("SLACK_BOT_TOKEN") or "").strip()


def configured() -> bool:
    return _token().startswith("xoxb-")


async def _post(method: str, payload: dict) -> dict:
    if not configured():
        return {"ok": False, "error": "not_configured"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{_API}/{method}",
                headers={"Authorization": f"Bearer {_token()}",
                         "Content-Type": "application/json; charset=utf-8"},
                json=payload,
            )
        data = r.json()
        if not data.get("ok"):
            logger.warning("[slack] %s failed: %s", method, data.get("error"))
        return data
    except Exception as e:
        logger.warning("[slack] %s exception: %s", method, e)
        return {"ok": False, "error": str(e)}


async def _get(method: str, params: dict) -> dict:
    if not configured():
        return {"ok": False, "error": "not_configured"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{_API}/{method}",
                headers={"Authorization": f"Bearer {_token()}"},
                params=params,
            )
        return r.json()
    except Exception as e:
        logger.warning("[slack] %s exception: %s", method, e)
        return {"ok": False, "error": str(e)}


async def auth_test() -> dict:
    return await _post("auth.test", {})


async def list_channels(limit: int = 200) -> dict:
    """Returns {"channels": [...], "scope_error": bool}. scope_error=True when the
    bot token lacks channels:read (channel listing needs a reinstall)."""
    out: List[dict] = []
    cursor = ""
    scope_error = False
    for _ in range(5):  # paginate defensively (up to 1000 channels)
        params = {"limit": limit, "types": "public_channel,private_channel",
                  "exclude_archived": "true"}
        if cursor:
            params["cursor"] = cursor
        data = await _get("conversations.list", params)
        if not data.get("ok"):
            scope_error = data.get("error") == "missing_scope"
            break
        for c in data.get("channels", []):
            out.append({"id": c["id"], "name": c.get("name"),
                        "is_private": c.get("is_private", False)})
        cursor = (data.get("response_metadata") or {}).get("next_cursor") or ""
        if not cursor:
            break
    out.sort(key=lambda c: c.get("name") or "")
    return {"channels": out, "scope_error": scope_error}


async def post_message(channel: str, text: str, blocks: Optional[list] = None) -> dict:
    payload = {"channel": channel, "text": text}
    if blocks:
        payload["blocks"] = blocks
    return await _post("chat.postMessage", payload)


# ── Per-workspace config ─────────────────────────────────────────────────
DEFAULT_CONFIG = {
    "enabled": False,
    "default_channel_id": None,
    "default_channel_name": None,
    "post_ai_answers": False,
    "post_budget_alerts": True,
}


async def get_config(workspace_id: str) -> dict:
    doc = await db.slack_settings.find_one({"workspace_id": workspace_id}, {"_id": 0})
    cfg = dict(DEFAULT_CONFIG)
    if doc:
        for k in DEFAULT_CONFIG:
            if doc.get(k) is not None:
                cfg[k] = doc[k]
    return cfg


async def set_config(workspace_id: str, patch: dict) -> dict:
    allowed = {k: patch[k] for k in DEFAULT_CONFIG if k in patch}
    allowed["workspace_id"] = workspace_id
    allowed["updated_at"] = now_iso()
    await db.slack_settings.update_one(
        {"workspace_id": workspace_id}, {"$set": allowed}, upsert=True)
    return await get_config(workspace_id)


async def _notify(workspace_id: str, toggle: str, text: str) -> None:
    if not configured() or not workspace_id:
        return
    cfg = await get_config(workspace_id)
    if not cfg.get("enabled") or not cfg.get(toggle) or not cfg.get("default_channel_id"):
        return
    await post_message(cfg["default_channel_id"], text)


async def notify_budget_alert(workspace_id: str, text: str) -> None:
    await _notify(workspace_id, "post_budget_alerts", text)


async def notify_ai_answer(workspace_id, chat, question, answer_body, used_knowledge=False) -> None:
    chat_name = (chat or {}).get("name") or "a chat"
    q = (question or "").strip()
    a = (answer_body or "").strip()
    if len(a) > 1200:
        a = a[:1200] + "…"
    tag = "  ·  :package: from a knowledge ZIP" if used_knowledge else ""
    text = f":robot_face: *@ai answered in #{chat_name}*{tag}\n>*Q:* {q[:300]}\n{a}"
    await _notify(workspace_id, "post_ai_answers", text)
