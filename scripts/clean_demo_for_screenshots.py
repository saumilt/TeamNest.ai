"""One-off: clean test artifacts from the demo workspace before screenshots."""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path("/app/backend/.env"))

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    amit = await db.users.find_one({"email": "amit@demo.team"})
    wm = await db.workspace_members.find_one({"user_id": amit["id"], "role": "owner"})
    ws = await db.workspaces.find_one({"id": wm["workspace_id"]})
    print(f"Workspace: {ws['name']} ({ws['id']})")

    # Delete any chat/task whose name contains TEST_ (case-insensitive)
    cd = await db.chats.delete_many(
        {"workspace_id": ws["id"], "name": {"$regex": "TEST_", "$options": "i"}}
    )
    td = await db.tasks.delete_many(
        {"workspace_id": ws["id"], "title": {"$regex": "TEST_", "$options": "i"}}
    )
    print(f"Deleted chats={cd.deleted_count} tasks={td.deleted_count}")

    # Garbage collect orphan messages
    remaining = {c["id"] async for c in db.chats.find({"workspace_id": ws["id"]}, {"id": 1})}
    md = await db.messages.delete_many({"chat_id": {"$nin": list(remaining)}})
    print(f"Orphan messages deleted: {md.deleted_count}")

    print("\nRemaining real chats:")
    async for c in db.chats.find(
        {"workspace_id": ws["id"]}, {"id": 1, "name": 1, "type": 1, "_id": 0}
    ).sort("created_at", -1):
        print(f"  {c.get('type', '?'):10} {c.get('name', '-')[:55]:55} ({c['id'][:8]})")

    print("\nRemaining real tasks:")
    async for t in (
        db.tasks.find({"workspace_id": ws["id"]}, {"_id": 0})
        .sort("created_at", -1)
        .limit(20)
    ):
        print(f"  [{t.get('status', '?'):>10}] {t.get('title', '-')[:60]}")


asyncio.run(main())
