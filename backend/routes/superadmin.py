"""Super-admin, app-level (global) platform settings.

Only platform super admins (deps.is_super_admin) can read/update these. It
exposes the per-plan monthly credit allowances plus a set of boolean feature
flags that gate core platform capabilities app-wide:
  - public_signup             (invite-only vs open to public — backed by launch_settings)
  - allow_workspace_deletion  (owners may close/delete their workspace)
  - allow_subuser_deletion    (admins may remove members from group chats)
  - require_template_approval (marketplace submissions need admin approval)
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import db, require_super_admin
from services.platform_settings import (
    BOOL_DEFAULTS,
    DEFAULTS,
    get_platform_settings,
    set_platform_settings,
)

router = APIRouter()


class PlatformSettingsPatch(BaseModel):
    free_monthly_credits: Optional[int] = None
    pro_monthly_credits: Optional[int] = None
    team_monthly_credits: Optional[int] = None
    allow_workspace_deletion: Optional[bool] = None
    allow_subuser_deletion: Optional[bool] = None
    require_template_approval: Optional[bool] = None
    # Backed by launch_settings (single source of truth for the signup gate).
    public_signup: Optional[bool] = None


DEFAULTS_OUT = {**DEFAULTS, **BOOL_DEFAULTS, "public_signup": False}


async def _public_signup_enabled() -> bool:
    """Invite-only launch is 'off' when the launch mode is open (or open signup
    is explicitly allowed)."""
    from services.launch_core import get_settings
    ls = await get_settings()
    return ls.get("mode") == "open" or bool(ls.get("allow_open_signup"))


async def _set_public_signup(enabled: bool) -> None:
    """Flip the launch gate so it takes effect immediately for /auth/signup."""
    from services.launch_core import get_settings
    await get_settings()  # ensure the doc exists
    patch = (
        {"mode": "open", "allow_open_signup": True}
        if enabled
        else {"mode": "invite_only", "allow_open_signup": False}
    )
    await db.launch_settings.update_one({"id": "global"}, {"$set": patch}, upsert=True)


async def _settings_payload() -> dict:
    data = await get_platform_settings(force=True)
    data["public_signup"] = await _public_signup_enabled()
    return data


@router.get("/superadmin/settings")
async def read_settings(current=Depends(require_super_admin)):
    return {"settings": await _settings_payload(), "defaults": DEFAULTS_OUT}


@router.put("/superadmin/settings")
async def update_settings(
    payload: PlatformSettingsPatch, current=Depends(require_super_admin)
):
    body = payload.dict()
    public_signup = body.pop("public_signup", None)
    patch = {k: v for k, v in body.items() if v is not None}
    try:
        if patch:
            await set_platform_settings(patch)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if public_signup is not None:
        await _set_public_signup(bool(public_signup))
    return {"settings": await _settings_payload(), "defaults": DEFAULTS_OUT}
