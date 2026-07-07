"""OneSignal — minimal transactional push helper.

Configured via environment:
  ONESIGNAL_APP_ID   — public app id (visible in the OneSignal dashboard)
  ONESIGNAL_API_KEY  — server-side REST API key (NEVER ship to the client)

If either is missing, `send_push` no-ops and logs a warning so local dev never
blows up.

Targets users via OneSignal's `external_id` alias — we treat TeamNest's user
id as the external_id. The frontend (web SDK or Capacitor plugin) is
responsible for calling `OneSignal.login(user.id)` after auth so the alias
exists.

References: OneSignal Create Message API
  https://documentation.onesignal.com/reference/create-message
"""
import os
from typing import Any, Dict, List, Optional

import httpx

from deps import logger

_API_URL = "https://api.onesignal.com/notifications"
_APP_ID = os.environ.get("ONESIGNAL_APP_ID")
_API_KEY = os.environ.get("ONESIGNAL_API_KEY")


def _configured() -> bool:
    return bool(_APP_ID and _API_KEY)


async def send_push(
    *,
    external_user_ids: List[str],
    heading: str,
    message: str,
    url: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Send a push to one or more TeamNest user ids. Returns the OneSignal
    response dict or `{ok: False, reason: ...}` on soft-failures (missing
    config, no subscribers, etc.) so callers don't have to wrap in try/except
    just to keep flows alive."""
    if not _configured():
        logger.warning("[onesignal] not configured — skipping push to %d user(s)", len(external_user_ids))
        return {"ok": False, "reason": "not_configured"}
    if not external_user_ids:
        return {"ok": False, "reason": "no_targets"}

    payload: Dict[str, Any] = {
        "app_id": _APP_ID,
        "target_channel": "push",
        "headings": {"en": heading},
        "contents": {"en": message[:300]},
        "include_aliases": {"external_id": list(set(external_user_ids))},
    }
    if url:
        payload["url"] = url
    if data:
        payload["data"] = data

    headers = {
        "Authorization": f"Key {_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(_API_URL, json=payload, headers=headers)
        body = resp.json()
        if resp.status_code >= 400:
            logger.warning("[onesignal] HTTP %s · %s", resp.status_code, body)
            return {"ok": False, "reason": "http_error", "status": resp.status_code, "body": body}
        if not body.get("id"):
            # 200 with no id = OneSignal accepted but found no subscribers.
            return {"ok": False, "reason": "no_subscribers", "body": body}
        logger.info("[onesignal] sent · id=%s · recipients=%s", body.get("id"), body.get("recipients"))
        return {"ok": True, "id": body.get("id"), "recipients": body.get("recipients", 0)}
    except Exception as e:
        logger.warning("[onesignal] send failed: %s", e)
        return {"ok": False, "reason": "exception", "error": str(e)}
