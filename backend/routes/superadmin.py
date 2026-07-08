"""Super-admin, app-level (global) platform settings.

Only platform super admins (deps.is_super_admin) can read/update these. Today it
exposes the per-plan monthly credit allowances (the free-plan grant being the
headline configurable value).
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from deps import require_super_admin
from services.platform_settings import (
    DEFAULTS,
    get_platform_settings,
    set_platform_settings,
)

router = APIRouter()


class PlatformSettingsPatch(BaseModel):
    free_monthly_credits: Optional[int] = None
    pro_monthly_credits: Optional[int] = None
    team_monthly_credits: Optional[int] = None


@router.get("/superadmin/settings")
async def read_settings(current=Depends(require_super_admin)):
    data = await get_platform_settings(force=True)
    return {"settings": data, "defaults": DEFAULTS}


@router.put("/superadmin/settings")
async def update_settings(
    payload: PlatformSettingsPatch, current=Depends(require_super_admin)
):
    patch = {k: v for k, v in payload.dict().items() if v is not None}
    try:
        data = await set_platform_settings(patch)
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(400, str(e))
    return {"settings": data, "defaults": DEFAULTS}
