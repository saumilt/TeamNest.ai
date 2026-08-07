import asyncio, os, uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

CHAT_ID = "5e2e2e58-b77c-4c60-acd4-f05a1ca2ee02"  # demo "Marketing Site Refresh" group


async def main():
    chat = await db.chats.find_one({"id": CHAT_ID}, {"_id": 0, "id": 1, "name": 1})
    print("chat:", chat)
    if not chat:
        return
    now = datetime.now(timezone.utc).isoformat()
    await db.messages.delete_many({"chat_id": CHAT_ID, "message_type": "call_recap", "metadata.demo_seed": True})
    msg = {
        "id": f"demo-recap-{uuid.uuid4().hex[:8]}",
        "chat_id": CHAT_ID,
        "sender_id": "ai-system",
        "message_type": "call_recap",
        "body": "",
        "parent_message_id": None,
        "metadata": {
            "demo_seed": True,
            "call_id": "demo-call",
            "mode": "video",
            "duration_seconds": 742,
            "count": 4,
            "highlights": [
                {"kind": "decision", "note": "Ship the new hero copy by Friday."},
                {"kind": "action_item", "note": "Sarah to finalize the pricing table."},
                {"kind": "risk", "note": "Analytics migration may slip a week."},
                {"kind": "question", "note": "Do we need legal review for the new claims?"},
            ],
        },
        "reactions": {},
        "created_at": now,
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    print("inserted recap message", msg["id"])


asyncio.run(main())
