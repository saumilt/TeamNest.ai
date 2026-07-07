"""Welcome email — sent once on signup via Mailgun (with Resend stub fallback).

Fire-and-forget. Errors are logged but never bubble up — signup must not
fail because Mailgun is having a bad day.
"""
from __future__ import annotations
import logging
from typing import Any, Dict

logger = logging.getLogger("teamnest")


_WELCOME_HTML = """<!DOCTYPE html>
<html><body style="background:#0F0F12;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#e5e5e5;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#1a1a1d;border-radius:16px;padding:32px;border:1px solid #27272a;">
    <div style="font-size:24px;font-weight:700;color:#fbbf24;margin-bottom:16px;">🚀 Welcome to TeamNest, {name}!</div>
    <p style="color:#a1a1aa;line-height:1.6;">
      You just unlocked a chat platform that doubles as your AI engineering team. Here's what to try next:
    </p>
    <ul style="color:#d4d4d8;line-height:1.9;padding-left:20px;">
      <li>📱 Tap <strong>New chat → Development project</strong> to spin up a Dev OS room with an AI Dev Manager.</li>
      <li>💬 Inside any group chat, type <code style="background:#27272a;padding:2px 6px;border-radius:4px;">/dev-os new &lt;name&gt;</code> to link a project.</li>
      <li>🤖 Mention <code style="background:#27272a;padding:2px 6px;border-radius:4px;">@devmgr</code> in a dev chat to delegate work to specialists.</li>
      <li>🏷️ Categorize your chats (Engineering / Product / Marketing…) for a cleaner sidebar.</li>
    </ul>
    <a href="{app_url}" style="display:inline-block;margin-top:20px;background:#fbbf24;color:#000;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;">
      Open TeamNest →
    </a>
    <p style="color:#71717a;font-size:12px;margin-top:32px;line-height:1.6;">
      You're getting this because you just created a TeamNest account ({email}).
      If this wasn't you, please reply and we'll lock it down.
    </p>
  </div>
</body></html>
"""

_WELCOME_TEXT = (
    "Welcome to TeamNest, {name}!\n\n"
    "Get started:\n"
    "  • New chat → Development project (spin up a Dev OS room)\n"
    "  • /dev-os new <name> inside any chat to link a project\n"
    "  • @devmgr in a dev chat to delegate to specialists\n"
    "  • Categorize your chats for a cleaner sidebar\n\n"
    "Open TeamNest: {app_url}\n\n"
    "You're getting this because you just created a TeamNest account ({email})."
)


async def send_welcome(name: str, email: str, app_url: str = "https://teamnest.ai") -> Dict[str, Any]:
    if not email:
        return {"ok": False, "reason": "no_email"}
    safe_name = (name or "there").split("@")[0][:80]
    subject = f"Welcome to TeamNest, {safe_name} 🚀"
    html = _WELCOME_HTML.format(name=safe_name, email=email, app_url=app_url)
    text = _WELCOME_TEXT.format(name=safe_name, email=email, app_url=app_url)

    try:
        from services import mailgun_service, resend_service
        provider = mailgun_service if mailgun_service._configured() else resend_service
        result = await provider.send_email(
            to=[email],
            subject=subject,
            html=html,
            text=text,
            tags={"category": "welcome"},
        )
        if result.get("ok"):
            logger.info("[welcome] sent to %s · provider=%s · id=%s",
                        email, provider.__name__, result.get("id"))
        else:
            logger.warning("[welcome] send failed · %s · %s", email, result)
        return result
    except Exception as e:
        logger.warning("[welcome] exception sending to %s: %s", email, e)
        return {"ok": False, "reason": "exception", "error": str(e)}
