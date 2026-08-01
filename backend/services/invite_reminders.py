"""Invite-expiry reminder loop.

Nudges people who were invited but haven't accepted, shortly before their
7-day set-password link expires — so nobody gets left behind. Runs hourly.
Because only the token *hash* is stored (never the raw), a reminder mints a
fresh 7-day link and emails that. Capped at 2 reminders per invitee to avoid
nagging someone who's clearly not joining.
"""
import asyncio
from datetime import datetime, timedelta, timezone

from deps import db, logger
from services.invite_email import mint_invite_link, send_invite_email

REMIND_WITHIN_HOURS = 48   # nudge when a pending link enters its final 48h
MAX_REMINDERS = 2


async def _tick() -> None:
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(hours=REMIND_WITHIN_HOURS)
    reminded = 0
    cursor = db.password_reset_tokens.find(
        {"kind": "invite", "used": False, "reminded": {"$ne": True},
         "expires_at": {"$gte": now, "$lte": window_end}},
        {"_id": 0, "id": 1, "user_id": 1},
    )
    async for tok in cursor:
        # Mark this token handled up-front so a crash mid-loop can't double-send.
        await db.password_reset_tokens.update_one(
            {"id": tok["id"]}, {"$set": {"reminded": True}})
        user = await db.users.find_one({"id": tok["user_id"]}, {"_id": 0})
        if not user or user.get("status") != "invited":
            continue  # already accepted / removed
        if int(user.get("invite_reminders_sent") or 0) >= MAX_REMINDERS:
            continue
        ws = await db.workspaces.find_one({"id": user.get("workspace_id")},
                                          {"_id": 0, "name": 1})
        link = await mint_invite_link(user["id"])
        res = await send_invite_email(
            name=user.get("name"), email=user["email"],
            workspace=(ws or {}).get("name", "your workspace"),
            inviter="Your workspace admin", link=link, reminder=True,
        )
        if res.get("ok"):
            await db.users.update_one(
                {"id": user["id"]},
                {"$inc": {"invite_reminders_sent": 1},
                 "$set": {"last_invite_reminder_at": now.isoformat()}})
            reminded += 1
    if reminded:
        logger.info("[invite-reminder] sent %d expiry nudge(s)", reminded)


async def invite_reminder_loop(interval_seconds: int = 3600) -> None:
    await asyncio.sleep(120)  # jitter past other startup loops
    while True:
        try:
            await _tick()
        except Exception as e:
            logger.exception("[invite-reminder] tick crashed: %s", e)
        await asyncio.sleep(interval_seconds)
