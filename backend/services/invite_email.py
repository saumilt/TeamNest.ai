"""Workspace invitation emails (Mailgun → no-op if unconfigured).

Two flavours:
  * send_invite_email  — brand-new invitee: a tokenised "set your password" link
                         (reuses the password_reset_tokens flow, longer TTL).
  * send_added_email   — an existing TeamNest user added to another workspace:
                         a simple "you're in, open TeamNest" nudge (no token).

Fire-and-forget. Errors are logged, never raised — inviting must not fail
because email is down.
"""
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from deps import db, logger, new_id

# Invite set-password links live longer than a normal 1-hour reset link.
INVITE_TOKEN_TTL_DAYS = 7


def _hash_token(raw: str) -> str:
    return hashlib.sha256((raw or "").encode("utf-8")).hexdigest()


def _app_base() -> str:
    return (os.environ.get("PUBLIC_BACKEND_URL") or "").rstrip("/")


async def mint_invite_link(user_id: str) -> str:
    """Mint a single-use, 7-day set-password token (password_reset_tokens,
    kind="invite") and return the absolute set-password URL the invitee clicks.
    Shared by the invite endpoint and the expiry-reminder loop."""
    raw = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.password_reset_tokens.insert_one({
        "id": new_id(),
        "user_id": user_id,
        "token_hash": _hash_token(raw),
        "used": False,
        "created_at": now,
        "expires_at": now + timedelta(days=INVITE_TOKEN_TTL_DAYS),
        "kind": "invite",
    })
    return f"{_app_base()}/reset-password?token={raw}"

_INVITE_HTML = """\
<html><body style="background:#0F0F12;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#e5e5e5;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px;">
    <div style="font-size:22px;font-weight:800;color:#fbbf24;margin:0 0 12px;">You're invited to {workspace}</div>
    <p style="color:#a1a1aa;font-size:14px;line-height:22px;margin:0 0 20px;">
      Hi {name}, {inviter} invited you to join <strong style="color:#fff;">{workspace}</strong>
      on TeamNest — an AI-native team chat &amp; research workspace. Set your password to get started.
    </p>
    <a href="{link}" style="display:inline-block;background:#fbbf24;color:#000;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;">
      Accept invite &amp; set password
    </a>
    <p style="color:#71717a;font-size:12px;margin-top:20px;line-height:1.6;word-break:break-all;">
      Or paste this link into your browser (expires in 7 days):<br/>{link}
    </p>
    <p style="color:#52525b;font-size:11px;margin-top:24px;">
      You received this because {inviter} added {email} to a TeamNest workspace.
      If you weren't expecting this, you can ignore this email.
    </p>
  </div>
</body></html>"""

_INVITE_TEXT = (
    "You're invited to {workspace}\n\n"
    "Hi {name}, {inviter} invited you to join {workspace} on TeamNest.\n"
    "Set your password to get started (link expires in 7 days):\n\n{link}\n\n"
    "You received this because {inviter} added {email} to a TeamNest workspace. "
    "If you weren't expecting this, you can ignore this email."
)

_ADDED_HTML = """\
<html><body style="background:#0F0F12;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#e5e5e5;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px;">
    <div style="font-size:22px;font-weight:800;color:#fbbf24;margin:0 0 12px;">You've been added to {workspace}</div>
    <p style="color:#a1a1aa;font-size:14px;line-height:22px;margin:0 0 20px;">
      Hi {name}, {inviter} added you to <strong style="color:#fff;">{workspace}</strong> on TeamNest.
      Sign in with your existing TeamNest account and switch to it from the workspace menu.
    </p>
    <a href="{link}" style="display:inline-block;background:#fbbf24;color:#000;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;">
      Open TeamNest
    </a>
    <p style="color:#52525b;font-size:11px;margin-top:24px;">
      You received this because {inviter} added {email} to a TeamNest workspace.
    </p>
  </div>
</body></html>"""

_ADDED_TEXT = (
    "You've been added to {workspace}\n\n"
    "Hi {name}, {inviter} added you to {workspace} on TeamNest. "
    "Sign in with your existing account and switch to it from the workspace menu.\n\n{link}"
)


async def send_invite_email(
    *, name: str, email: str, workspace: str, inviter: str, link: str,
    reminder: bool = False,
) -> Dict[str, Any]:
    if not email:
        return {"ok": False, "reason": "no_email"}
    from services import mailgun_service
    safe_name = (name or "there").strip() or "there"
    ctx = {"name": safe_name, "email": email, "workspace": workspace or "a workspace",
           "inviter": inviter or "A teammate", "link": link}
    if reminder:
        subject = f"Reminder: your invite to {ctx['workspace']} is expiring soon"
    else:
        subject = f"{ctx['inviter']} invited you to {ctx['workspace']} on TeamNest"
    res = await mailgun_service.send_email(
        to=[email],
        subject=subject,
        html=_INVITE_HTML.format(**ctx),
        text=_INVITE_TEXT.format(**ctx),
        tags={"source": "workspace_invite_reminder" if reminder else "workspace_invite"},
    )
    if not res.get("ok"):
        logger.warning("[invite-email] not sent to %s: %s", email, res.get("reason"))
    else:
        logger.info("[invite-email%s] sent to %s · id=%s",
                    " reminder" if reminder else "", email, res.get("id"))
    return res


async def send_added_email(
    *, name: str, email: str, workspace: str, inviter: str, link: str,
) -> Dict[str, Any]:
    if not email:
        return {"ok": False, "reason": "no_email"}
    from services import mailgun_service
    safe_name = (name or "there").strip() or "there"
    ctx = {"name": safe_name, "email": email, "workspace": workspace or "a workspace",
           "inviter": inviter or "A teammate", "link": link}
    res = await mailgun_service.send_email(
        to=[email],
        subject=f"You've been added to {ctx['workspace']} on TeamNest",
        html=_ADDED_HTML.format(**ctx),
        text=_ADDED_TEXT.format(**ctx),
        tags={"source": "workspace_added"},
    )
    if not res.get("ok"):
        logger.warning("[added-email] not sent to %s: %s", email, res.get("reason"))
    return res
