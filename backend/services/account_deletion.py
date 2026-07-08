"""Account deletion — App Store 5.1.1(v) / privacy compliance.

Permanently deletes the user's identity + personal data. Workspaces the user
SOLELY owns are fully purged; workspaces they co-own are transferred to another
admin (or the oldest remaining member) before the user is removed.
"""
from deps import db, logger

# Workspace-scoped collections purged when a solely-owned workspace is deleted.
# Deleting from a collection that doesn't exist is a harmless no-op in Mongo.
WORKSPACE_COLLECTIONS = [
    "chats", "messages", "tasks", "folders", "files",
    "ai_threads", "ai_responses", "calls", "voice_notes",
    "dev_projects", "dev_tasks", "workspace_billing",
    "chat_ai_settings", "chat_ai_usage", "workspace_members",
]


async def _delete_workspace_data(workspace_id: str) -> None:
    for coll in WORKSPACE_COLLECTIONS:
        try:
            await db[coll].delete_many({"workspace_id": workspace_id})
        except Exception as e:
            logger.warning("[account-delete] purge %s failed: %s", coll, e)
    await db.workspaces.delete_one({"id": workspace_id})


async def delete_user_account(user: dict) -> dict:
    uid = user["id"]
    memberships = await db.workspace_members.find(
        {"user_id": uid}, {"_id": 0}
    ).to_list(200)

    purged = transferred = 0
    for m in memberships:
        ws_id = m["workspace_id"]
        others = await db.workspace_members.find(
            {
                "workspace_id": ws_id,
                "user_id": {"$ne": uid},
                "status": {"$ne": "removed"},
            },
            {"_id": 0},
        ).to_list(500)
        is_owner = m.get("role") == "owner"

        if is_owner and not others:
            await _delete_workspace_data(ws_id)
            purged += 1
        elif is_owner and others:
            others.sort(
                key=lambda x: (0 if x.get("role") == "admin" else 1, x.get("joined_at") or "")
            )
            new_owner = others[0]["user_id"]
            await db.workspace_members.update_one(
                {"workspace_id": ws_id, "user_id": new_owner}, {"$set": {"role": "owner"}}
            )
            await db.workspaces.update_one({"id": ws_id}, {"$set": {"owner_id": new_owner}})
            await db.workspace_members.delete_one({"workspace_id": ws_id, "user_id": uid})
            transferred += 1
        else:
            await db.workspace_members.delete_one({"workspace_id": ws_id, "user_id": uid})

    # User-keyed personal data anywhere it survived.
    try:
        await db.chats.delete_many({"type": "personal_ai", "created_by": uid})
    except Exception:
        pass
    for coll in ("devices", "workspace_members"):
        try:
            await db[coll].delete_many({"user_id": uid})
        except Exception:
            pass

    await db.users.delete_one({"id": uid})
    logger.info(
        "[account-delete] user %s deleted (purged=%d transferred=%d)", uid, purged, transferred
    )
    return {"workspaces_deleted": purged, "workspaces_transferred": transferred}
