"""Resend — minimal transactional email helper.

Mirrors `onesignal_service.py` in structure and graceful failure modes.

Configure via env:
  RESEND_API_KEY   — server-side API key from resend.com/api-keys
  RESEND_FROM      — verified sender, e.g. "TeamNest <noreply@yourdomain.com>"

If either is missing, `send_email` no-ops with a structured `{ok, reason}`
return so callers don't have to wrap in try/except.

The HTML payload is plain — callers compose strings. Keeps this file 1 dep
deep (just httpx) and trivially testable.
"""
import os
from typing import Any, Dict, List, Optional

import httpx

from deps import logger

_API_URL = "https://api.resend.com/emails"
_API_KEY = os.environ.get("RESEND_API_KEY")
_FROM = os.environ.get("RESEND_FROM")


def _configured() -> bool:
    return bool(_API_KEY and _FROM)


async def send_email(
    *,
    to: List[str],
    subject: str,
    html: str,
    reply_to: Optional[str] = None,
    tags: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    if not _configured():
        logger.warning("[resend] not configured — skipping email to %d recipient(s)", len(to))
        return {"ok": False, "reason": "not_configured"}
    if not to:
        return {"ok": False, "reason": "no_recipients"}

    payload: Dict[str, Any] = {
        "from": _FROM,
        "to": to,
        "subject": subject,
        "html": html,
    }
    if reply_to:
        payload["reply_to"] = reply_to
    if tags:
        payload["tags"] = [{"name": k, "value": v} for k, v in tags.items()]

    headers = {
        "Authorization": f"Bearer {_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(_API_URL, json=payload, headers=headers)
        body = resp.json()
        if resp.status_code >= 400:
            logger.warning("[resend] HTTP %s · %s", resp.status_code, body)
            return {"ok": False, "reason": "http_error", "status": resp.status_code, "body": body}
        return {"ok": True, "id": body.get("id")}
    except Exception as e:
        logger.warning("[resend] send failed: %s", e)
        return {"ok": False, "reason": "exception", "error": str(e)}


def render_digest_email(workspace_name: str, digest: Dict[str, Any]) -> str:
    """Tiny HTML template — keeps inline styles to dodge most CSS quirks."""
    stats = digest.get("stats") or {}
    pending = stats.get("pending_proposals", 0)
    auto = stats.get("auto_approved_last_24h", 0)
    themes = stats.get("top_themes") or {}
    theme_html = ""
    if themes:
        chips = " ".join(
            f'<span style="display:inline-block;padding:4px 10px;margin:2px;background:#1e293b;color:#94a3b8;border-radius:999px;font-size:12px">{k} · {v}</span>'
            for k, v in list(themes.items())[:4]
        )
        theme_html = f'<div style="margin:16px 0">{chips}</div>'

    return f"""<!doctype html>
<html><body style="margin:0;padding:24px;background:#0f172a;color:#e2e8f0;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#111827;border-radius:16px;padding:24px;border:1px solid #1f2937">
    <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#64748b">{workspace_name} · Dev OS daily digest</div>
    <h1 style="font-size:22px;margin:6px 0 14px;color:#f8fafc">{digest.get('headline', 'Today at a glance')}</h1>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0">
      <div style="background:#1e293b;border-radius:12px;padding:14px">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase">Pending</div>
        <div style="font-size:26px;font-weight:700">{pending}</div>
      </div>
      <div style="background:#1e293b;border-radius:12px;padding:14px">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase">Auto-approved 24h</div>
        <div style="font-size:26px;font-weight:700">{auto}</div>
      </div>
    </div>
    {theme_html}
    <a href="/dev-os" style="display:inline-block;margin-top:10px;padding:10px 18px;background:#fbbf24;color:#000;border-radius:999px;text-decoration:none;font-weight:600">Open Dev OS →</a>
  </div>
</body></html>"""
