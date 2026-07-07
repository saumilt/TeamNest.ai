"""Round 2 cleanup: kill GuestExist/GuestTestChat and trivial AI threads."""
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
    ws_id = wm["workspace_id"]

    # Delete Guest* chats
    cd = await db.chats.delete_many(
        {
            "workspace_id": ws_id,
            "$or": [
                {"name": {"$regex": "Guest", "$options": "i"}},
                {"name": {"$regex": "test", "$options": "i"}},
                {"name": {"$regex": "^\\d", "$options": ""}},  # starts with digit
            ],
        }
    )
    print(f"Deleted Guest/test chats: {cd.deleted_count}")

    # Garbage collect orphan messages
    remaining = {c["id"] async for c in db.chats.find({"workspace_id": ws_id}, {"id": 1})}
    md = await db.messages.delete_many({"chat_id": {"$nin": list(remaining)}})
    print(f"Orphan messages: {md.deleted_count}")

    # Clean AI research threads with trivial / test queries
    if "ai_threads" in await db.list_collection_names():
        td = await db.ai_threads.delete_many(
            {
                "workspace_id": ws_id,
                "$or": [
                    {"query": {"$regex": "^say hi", "$options": "i"}},
                    {"query": {"$regex": "^TEST", "$options": "i"}},
                    {"query": {"$regex": "^hi$", "$options": "i"}},
                    {"query": {"$regex": "^test", "$options": "i"}},
                    {"query": {"$regex": "largest planet", "$options": "i"}},
                    {"query": {"$regex": "^what is \\d", "$options": "i"}},
                ],
            }
        )
        print(f"Trivial AI threads deleted: {td.deleted_count}")

    # Also clean orphan ai_responses
    if "ai_responses" in await db.list_collection_names():
        if "ai_threads" in await db.list_collection_names():
            valid_threads = {
                t["id"] async for t in db.ai_threads.find({"workspace_id": ws_id}, {"id": 1})
            }
            rd = await db.ai_responses.delete_many(
                {"thread_id": {"$nin": list(valid_threads)}}
            )
            print(f"Orphan AI responses: {rd.deleted_count}")

    print("\nFinal chat list:")
    async for c in db.chats.find(
        {"workspace_id": ws_id, "type": {"$ne": "personal_ai"}},
        {"_id": 0, "id": 1, "name": 1, "type": 1},
    ):
        print(f"  {c.get('type'):10} {c.get('name', '-')[:55]}")

    print("\nFinal AI threads:")
    if "ai_threads" in await db.list_collection_names():
        async for t in db.ai_threads.find({"workspace_id": ws_id}, {"_id": 0, "query": 1}).limit(15):
            print(f"  - {t.get('query', '-')[:70]}")


asyncio.run(main())
