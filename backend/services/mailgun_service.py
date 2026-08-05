"""Mailgun — transactional email helper.

Mirrors `resend_service.py` so the rest of the code can switch providers by
import alone. The Resend stub is kept for back-compat; new code should
import from this module.

Configure via env:
  MAILGUN_API_KEY   — primary or domain-sending key from Mailgun dashboard
  MAILGUN_DOMAIN    — verified sending domain (e.g. "mg.teamnest.ai")
  MAILGUN_FROM      — sender, e.g. "TeamNest <postmaster@mg.teamnest.ai>"
  MAILGUN_BASE_URL  — optional, defaults to https://api.mailgun.net (use
                      https://api.eu.mailgun.net for EU region domains)

Any missing required env => `send_email` no-ops with a structured
`{ok: False, reason: ...}` so callers don't need try/except.
"""
import json
import os
from typing import Any, Dict, List, Optional

import httpx

from deps import logger

_API_KEY = os.environ.get("MAILGUN_API_KEY")
_DOMAIN = os.environ.get("MAILGUN_DOMAIN")
_FROM = os.environ.get("MAILGUN_FROM")
_BASE = (os.environ.get("MAILGUN_BASE_URL") or "https://api.mailgun.net").rstrip("/")


def _configured() -> bool:
    return bool(_API_KEY and _DOMAIN and _FROM)


def _url() -> str:
    return f"{_BASE}/v3/{_DOMAIN}/messages"


async def send_email(
    *,
    to: List[str],
    subject: str,
    html: str,
    text: Optional[str] = None,
    reply_to: Optional[str] = None,
    cc: Optional[List[str]] = None,
    tags: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    if not _configured():
        logger.warning("[mailgun] not configured — skipping email to %d recipient(s)", len(to))
        return {"ok": False, "reason": "not_configured"}
    if not to:
        return {"ok": False, "reason": "no_recipients"}

    data: Dict[str, Any] = {
        "from": _FROM,
        "to": to,
        "subject": subject,
        "html": html,
        "o:require-tls": "yes",
    }
    if cc:
        data["cc"] = cc
    if text:
        data["text"] = text
    if reply_to:
        data["h:Reply-To"] = reply_to
    if tags:
        # Mailgun supports up to 3 tags per message.
        for v in list(tags.values())[:3]:
            data.setdefault("o:tag", [])
            data["o:tag"].append(str(v))

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(_url(), auth=("api", _API_KEY), data=data)
        try:
            body = resp.json()
        except Exception:
            body = {"raw": resp.text}
        if resp.status_code >= 400:
            logger.warning("[mailgun] HTTP %s · %s", resp.status_code, body)
            return {"ok": False, "reason": "http_error", "status": resp.status_code, "body": body}
        return {"ok": True, "id": body.get("id"), "message": body.get("message")}
    except Exception as e:
        logger.warning("[mailgun] send failed: %s", e)
        return {"ok": False, "reason": "exception", "error": str(e)}


async def send_batch(
    *,
    recipients: List[Dict[str, str]],   # [{"email": ..., "name": ...}, ...]
    subject: str,
    html: str,
    text: Optional[str] = None,
) -> Dict[str, Any]:
    """Up to 1000 personalized sends in one API call via recipient-variables."""
    if not _configured():
        return {"ok": False, "reason": "not_configured"}
    if not recipients:
        return {"ok": False, "reason": "no_recipients"}
    if len(recipients) > 1000:
        return {"ok": False, "reason": "batch_too_large"}

    to_list = [r["email"] for r in recipients]
    recipient_vars = {
        r["email"]: {k: v for k, v in r.items() if k != "email"}
        for r in recipients
    }
    data: Dict[str, Any] = {
        "from": _FROM,
        "to": to_list,
        "subject": subject,
        "html": html,
        "recipient-variables": json.dumps(recipient_vars),
        "o:require-tls": "yes",
    }
    if text:
        data["text"] = text

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(_url(), auth=("api", _API_KEY), data=data)
        try:
            body = resp.json()
        except Exception:
            body = {"raw": resp.text}
        if resp.status_code >= 400:
            logger.warning("[mailgun] batch HTTP %s · %s", resp.status_code, body)
            return {"ok": False, "reason": "http_error", "status": resp.status_code, "body": body}
        return {"ok": True, "id": body.get("id"), "message": body.get("message"), "count": len(to_list)}
    except Exception as e:
        logger.warning("[mailgun] batch send failed: %s", e)
        return {"ok": False, "reason": "exception", "error": str(e)}


async def fetch_events(recipient: str, limit: int = 25) -> Dict[str, Any]:
    """`GET /v3/{domain}/events?recipient=…` — pull recent delivery events for
    one recipient (accepted / delivered / opened / failed …). Powers the
    on-demand invite delivery analytics on the Team page. Read-only, best-effort."""
    if not _configured():
        return {"ok": False, "reason": "not_configured", "items": []}
    if not recipient:
        return {"ok": False, "reason": "no_recipient", "items": []}
    try:
        async with httpx.AsyncClient(timeout=12) as c:
            r = await c.get(
                f"{_BASE}/v3/{_DOMAIN}/events",
                auth=("api", _API_KEY),
                params={"recipient": recipient, "limit": limit},
            )
        try:
            body = r.json()
        except Exception:
            body = {}
        if r.status_code >= 400:
            return {"ok": False, "reason": "http_error", "status": r.status_code, "items": []}
        return {"ok": True, "items": (body or {}).get("items", []) or []}
    except Exception as e:
        logger.warning("[mailgun] fetch_events failed for %s: %s", recipient, e)
        return {"ok": False, "reason": "exception", "error": str(e), "items": []}


# Re-export the digest renderer so existing callers can stay one-import simple.


async def get_domain_status() -> Dict[str, Any]:
    """`GET /v3/domains/{domain}` — surface SPF / DKIM / MX verification state
    for the configured sending domain. Powers the integrations page DNS card."""
    if not _configured():
        return {"ok": False, "reason": "not_configured"}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{_BASE}/v3/domains/{_DOMAIN}", auth=("api", _API_KEY))
        try:
            body = r.json()
        except Exception:
            body = {"raw": r.text}
        if r.status_code >= 400:
            return {"ok": False, "reason": "http_error", "status": r.status_code, "body": body}
        domain = (body or {}).get("domain") or {}
        sending = (body or {}).get("sending_dns_records") or []
        receiving = (body or {}).get("receiving_dns_records") or []
        records = []
        for rec in sending + receiving:
            name = (rec.get("name") or "").lower()
            rtype = rec.get("record_type")
            if rtype == "TXT" and ("dkim" in name or "_domainkey" in name):
                purpose = "DKIM"
            elif rtype == "TXT" and "spf" in (rec.get("value", "")).lower():
                purpose = "SPF"
            elif rtype == "MX":
                purpose = "MX"
            elif rtype == "CNAME":
                purpose = "TRACKING"
            else:
                purpose = "OTHER"
            records.append({
                "purpose": purpose,
                "record_type": rtype,
                "name": rec.get("name"),
                "value_preview": (rec.get("value") or "")[:80],
                "valid": rec.get("valid") == "valid",
            })
        return {
            "ok": True,
            "domain": domain.get("name"),
            "state": domain.get("state"),
            "is_verified": domain.get("state") == "active",
            "spam_action": domain.get("spam_action"),
            "records": records,
        }
    except Exception as e:
        logger.warning("[mailgun] get_domain_status failed: %s", e)
        return {"ok": False, "reason": "exception", "error": str(e)}

from services.resend_service import render_digest_email  # noqa: E402,F401
