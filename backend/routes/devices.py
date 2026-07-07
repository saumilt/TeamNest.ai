"""Device registration endpoint for mobile push notifications.

The native iOS / Android wrappers (via Capacitor) call POST /api/devices/register
on app launch to upload their APNs / FCM token. We store one record per
(user_id, token) so backend services can later batch-send pushes.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import db, now_iso, require_user

router = APIRouter()


class DeviceRegister(BaseModel):
    token: str
    platform: Literal["ios", "android", "web"]
    app_version: Optional[str] = None


@router.post("/devices/register")
async def register_device(payload: DeviceRegister, current=Depends(require_user)):
    token = payload.token.strip()
    if not token:
        raise HTTPException(400, "Empty device token")

    doc = {
        "user_id": current["id"],
        "token": token,
        "platform": payload.platform,
        "app_version": payload.app_version,
        "updated_at": now_iso(),
    }
    # Upsert on (user_id, token) so re-launches don't create duplicates.
    await db.devices.update_one(
        {"user_id": current["id"], "token": token},
        {"$set": doc, "$setOnInsert": {"created_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


@router.delete("/devices/register")
async def unregister_device(token: str, current=Depends(require_user)):
    await db.devices.delete_one({"user_id": current["id"], "token": token})
    return {"ok": True}


@router.get("/devices")
async def list_devices(current=Depends(require_user)):
    cursor = db.devices.find(
        {"user_id": current["id"]}, {"_id": 0}
    ).sort("updated_at", -1)
    return [d async for d in cursor]
