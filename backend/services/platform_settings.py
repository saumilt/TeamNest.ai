"""App-level (global) platform settings, editable only by super admins.

Stored as a single document `platform_settings/global`. Cached briefly to keep
the credit-metering hot path cheap. These are PLATFORM-WIDE values (they apply
to every workspace), distinct from per-workspace settings.
"""
from __future__ import annotations

import time
from typing import Any, Dict

from deps import db, now_iso

# Editable integer keys + their defaults. Keep these in sync with
# services/billing.py plan definitions (free-plan grant defaults to 300/month).
DEFAULTS: Dict[str, int] = {
    "free_monthly_credits": 300,
    "pro_monthly_credits": 3000,
    "team_monthly_credits": 9000,
}

# Editable boolean feature flags + their defaults. These gate core platform
# capabilities app-wide and take effect immediately (no redeploy):
#   allow_workspace_deletion   — owners may close/delete their workspace
#   allow_subuser_deletion     — admins may remove members from group chats
#   require_template_approval  — marketplace submissions need admin approval
#                                (when False, submissions auto-publish)
# NOTE: the invite-only vs public-signup flag ("public_signup") is NOT stored
# here — it is backed by launch_settings (single source of truth) and handled
# in routes/superadmin.py so the signup gate stays consistent.
BOOL_DEFAULTS: Dict[str, bool] = {
    "allow_workspace_deletion": True,
    "allow_subuser_deletion": True,
    "require_template_approval": True,
}

_cache: Dict[str, Any] = {"data": None, "at": 0.0}
_TTL = 30.0


async def get_platform_settings(force: bool = False) -> Dict[str, Any]:
    now = time.time()
    if not force and _cache["data"] is not None and now - _cache["at"] < _TTL:
        return _cache["data"]
    doc = await db.platform_settings.find_one({"id": "global"}, {"_id": 0}) or {}
    data: Dict[str, Any] = {**DEFAULTS, **BOOL_DEFAULTS}
    for k in DEFAULTS:
        if doc.get(k) is not None:
            try:
                data[k] = int(doc[k])
            except (TypeError, ValueError):
                pass
    for k in BOOL_DEFAULTS:
        if doc.get(k) is not None:
            data[k] = bool(doc[k])
    _cache["data"] = data
    _cache["at"] = now
    return data


async def set_platform_settings(patch: Dict[str, Any]) -> Dict[str, Any]:
    clean: Dict[str, Any] = {}
    for k, v in (patch or {}).items():
        if k in DEFAULTS and v is not None:
            iv = int(v)
            if iv < 0:
                raise ValueError(f"{k} must be >= 0")
            clean[k] = iv
        elif k in BOOL_DEFAULTS and v is not None:
            clean[k] = bool(v)
    if clean:
        await db.platform_settings.update_one(
            {"id": "global"},
            {"$set": {**clean, "updated_at": now_iso()}},
            upsert=True,
        )
        _cache["data"] = None  # invalidate
    return await get_platform_settings(force=True)


async def free_monthly_credits() -> int:
    s = await get_platform_settings()
    return int(s.get("free_monthly_credits") or DEFAULTS["free_monthly_credits"])


async def flag(name: str) -> bool:
    """Return the current value of a boolean feature flag."""
    s = await get_platform_settings()
    return bool(s.get(name, BOOL_DEFAULTS.get(name, False)))
