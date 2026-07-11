"""Password-reset email (Mailgun → no-op if unconfigured)."""
from typing import Any, Dict

from deps import logger

_HTML = """\
<html><body style="background:#0F0F12;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#e5e5e5;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px;">
    <h2 style="color:#fff;margin:0 0 8px;">Reset your password</h2>
    <p style="color:#a1a1aa;font-size:14px;line-height:22px;margin:0 0 20px;">
      Hi {name}, we received a request to reset your TeamNest password. This link expires in 1 hour.
      If you didn't request this, you can safely ignore this email.
    </p>
    <a href="{link}" style="display:inline-block;background:#fbbf24;color:#000;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;">
      Reset password
    </a>
    <p style="color:#71717a;font-size:12px;margin-top:20px;word-break:break-all;">
      Or paste this link into your browser:<br/>{link}
    </p>
  </div>
</body></html>"""

_TEXT = (
    "Hi {name},\n\n"
    "We received a request to reset your TeamNest password. Open the link below "
    "to choose a new password (expires in 1 hour):\n\n{link}\n\n"
    "If you didn't request this, you can safely ignore this email.\n"
)


async def send_reset_email(name: str, email: str, link: str) -> Dict[str, Any]:
    from services import mailgun_service
    safe_name = (name or "there").strip() or "there"
    res = await mailgun_service.send_email(
        to=[email],
        subject="Reset your TeamNest password",
        html=_HTML.format(name=safe_name, link=link),
        text=_TEXT.format(name=safe_name, link=link),
        tags={"source": "password_reset"},
    )
    if not res.get("ok"):
        logger.warning("[password-reset] email not sent to %s: %s", email, res.get("reason"))
    return res
