"""Login brute-force throttle (MongoDB-backed, no Redis).

Tracks failed sign-ins per (client-ip + email). After LOGIN_MAX_FAILS failures
inside a LOGIN_WINDOW_MIN window, the identifier is locked for LOGIN_LOCK_MIN
minutes and /auth/login returns 429 with a friendly Retry-After. A successful
sign-in clears the counter. Never enables account enumeration (the same generic
429 is returned regardless of whether the email exists)."""
import os
import time
from datetime import datetime, timedelta, timezone

from deps import db

MAX_FAILS = int(os.environ.get("LOGIN_MAX_FAILS", "7"))
WINDOW_MIN = int(os.environ.get("LOGIN_WINDOW_MIN", "15"))
LOCK_MIN = int(os.environ.get("LOGIN_LOCK_MIN", "15"))

_idx_ready = False


async def _ensure_idx():
    global _idx_ready
    if _idx_ready:
        return
    try:
        await db.login_attempts.create_index("identifier", unique=True)
        await db.login_attempts.create_index("expire_at", expireAfterSeconds=0)
    except Exception:
        pass
    _idx_ready = True


def client_ip(request) -> str:
    if request is None:
        return "?"
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return (request.client.host if request.client else "?") or "?"


def _identifier(request, email: str) -> str:
    return f"{client_ip(request)}:{(email or '').strip().lower()}"


async def check_locked(request, email: str) -> int:
    """Seconds remaining on an active lock, else 0."""
    await _ensure_idx()
    doc = await db.login_attempts.find_one({"identifier": _identifier(request, email)})
    if not doc:
        return 0
    rem = int((doc.get("locked_until_ts") or 0) - time.time())
    return rem if rem > 0 else 0


async def record_failure(request, email: str) -> int:
    """Increment the failure counter. Returns lock seconds if this failure
    triggered (or is inside) a lock, else 0."""
    await _ensure_idx()
    ident = _identifier(request, email)
    now = time.time()
    doc = await db.login_attempts.find_one({"identifier": ident})
    if not doc or (now - (doc.get("first_at_ts") or 0)) > WINDOW_MIN * 60:
        count, first_at = 1, now
    else:
        count, first_at = int(doc.get("count", 0)) + 1, (doc.get("first_at_ts") or now)
    locked_until_ts = now + LOCK_MIN * 60 if count >= MAX_FAILS else 0
    await db.login_attempts.update_one(
        {"identifier": ident},
        {"$set": {
            "identifier": ident,
            "count": count,
            "first_at_ts": first_at,
            "locked_until_ts": locked_until_ts,
            "expire_at": datetime.now(timezone.utc) + timedelta(hours=1),
        }},
        upsert=True,
    )
    return int(locked_until_ts - now) if locked_until_ts else 0


async def clear(request, email: str) -> None:
    await _ensure_idx()
    await db.login_attempts.delete_one({"identifier": _identifier(request, email)})
