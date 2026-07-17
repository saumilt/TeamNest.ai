"""Keep references to fire-and-forget background tasks so the event loop does
not garbage-collect them mid-run (asyncio only holds a weak reference)."""
import asyncio
from typing import Set

_TASKS: Set[asyncio.Task] = set()


def fire_and_forget(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)
    return task
