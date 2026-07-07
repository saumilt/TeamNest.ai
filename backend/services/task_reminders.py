"""Background task reminder scheduler.

Wakes up once an hour, looks at all open tasks with a due_date, and fires a
reminder DM + mobile push at these milestones:

  - 3 days before  (label: "T-3d")
  - 1 day before   (label: "T-1d")
  - day-of         (label: "T-0")
  - 1 day overdue  (label: "T+1d")

Each milestone fires at most once per task (tracked in task.reminder_log).
"""
import asyncio
from datetime import datetime, timedelta, timezone

from deps import _post_reminder, db, logger, now_iso


MILESTONES = [
    ("T-3d", timedelta(days=3),  "{title} is due in 3 days."),
    ("T-1d", timedelta(days=1),  "{title} is due tomorrow."),
    ("T-0",  timedelta(days=0),  "{title} is due today."),
    ("T+1d", timedelta(days=-1), "{title} is overdue by 1 day."),
]


def _parse(dt_str: str) -> datetime | None:
    try:
        return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    except Exception:
        return None


async def _tick_once():
    """Single pass — fire any milestone that just became due."""
    now = datetime.now(timezone.utc)
    cursor = db.tasks.find(
        {
            "deleted_at": None,
            "status": {"$nin": ["completed"]},
            "due_date": {"$ne": None},
            "assigned_to": {"$ne": None},
        },
        {"_id": 0},
    )
    fired = 0
    async for task in cursor:
        due = _parse(task.get("due_date") or "")
        if not due:
            continue
        already = set(task.get("reminder_log") or [])
        for label, delta, template in MILESTONES:
            if label in already:
                continue
            # Fire when "now" has crossed the milestone moment.
            target = due - delta
            if now < target:
                continue
            try:
                await _post_reminder(
                    task["assigned_to"],
                    template.format(title=task["title"]),
                    task,
                )
                # Push to mobile if Firebase is configured.
                try:
                    from services.push_service import send_to_user as _push
                    asyncio.create_task(_push(
                        task["assigned_to"],
                        "Task reminder",
                        template.format(title=task["title"]),
                        {"task_id": task["id"], "type": "task_reminder", "milestone": label},
                    ))
                except Exception:
                    pass
            except Exception as e:
                logger.warning("[task-reminders] post failed for %s: %s", task["id"], e)
                continue
            await db.tasks.update_one(
                {"id": task["id"]},
                {"$push": {"reminder_log": label},
                 "$set": {"last_reminder_at": now_iso()}},
            )
            fired += 1
    if fired:
        logger.info("[task-reminders] fired %d reminder(s)", fired)
    return fired


async def reminder_loop(interval_seconds: int = 3600):
    """Run forever. Called from server.py startup. Sleeps between ticks."""
    # Small jitter on first run so multiple workers don't fire simultaneously.
    await asyncio.sleep(15)
    while True:
        try:
            await _tick_once()
        except Exception as e:
            logger.exception("[task-reminders] tick crashed: %s", e)
        await asyncio.sleep(interval_seconds)
