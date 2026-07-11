"""In-app notification feed (bell). Reads the shared `notifications` collection.

Notification doc shape:
  { id, user_id, type, title, body, read, created_at, meta:{...} }
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from deps import db, new_id, now_iso, require_user

router = APIRouter()


@router.get("/notifications")
async def list_notifications(current=Depends(require_user)):
    items = await db.notifications.find(
        {"user_id": current["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    unread = await db.notifications.count_documents({"user_id": current["id"], "read": False})
    return {"items": items, "unread_count": unread}


@router.post("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, current=Depends(require_user)):
    await db.notifications.update_one(
        {"id": notif_id, "user_id": current["id"]}, {"$set": {"read": True}})
    return {"ok": True}


class ReadAll(BaseModel):
    pass


@router.post("/notifications/read-all")
async def mark_all_read(current=Depends(require_user)):
    r = await db.notifications.update_many(
        {"user_id": current["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True, "updated": r.modified_count}


async def create_notification(user_id: str, ntype: str, title: str, body: str, meta: dict | None = None):
    await db.notifications.insert_one({
        "id": new_id(), "user_id": user_id, "type": ntype,
        "title": title, "body": body, "read": False, "meta": meta or {},
        "created_at": now_iso(),
    })
