"""In-app notification feed (bell). Reads the shared `notifications` collection.

Notification doc shape:
  { id, user_id, type, title, body, read, created_at, meta:{...} }
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from deps import db, new_id, now_iso, require_user

router = APIRouter()


@router.get("/notifications")
async def list_notifications(category: str = "all", current=Depends(require_user)):
    q = {"user_id": current["id"]}
    if category == "ai":
        q["category"] = "ai"
    elif category == "human":
        q["category"] = {"$ne": "ai"}  # legacy notifs (no category) count as human
    items = await db.notifications.find(
        q, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    unread = await db.notifications.count_documents({"user_id": current["id"], "read": False})
    ai_unread = await db.notifications.count_documents(
        {"user_id": current["id"], "read": False, "category": "ai"}
    )
    return {"items": items, "unread_count": unread, "ai_unread_count": ai_unread}


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


async def create_notification(
    user_id: str, ntype: str, title: str, body: str,
    meta: dict | None = None, category: str = "human",
):
    # Respect per-user "mute AI notifications" for AI-category events.
    if category == "ai":
        u = await db.users.find_one({"id": user_id}, {"_id": 0, "notification_prefs": 1})
        if ((u or {}).get("notification_prefs") or {}).get("mute_ai_notifications"):
            return
    await db.notifications.insert_one({
        "id": new_id(), "user_id": user_id, "type": ntype, "category": category,
        "title": title, "body": body, "read": False, "meta": meta or {},
        "created_at": now_iso(),
    })
