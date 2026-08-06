import asyncio, os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def main():
    active = await db.calls.find({"status": "active"}).to_list(length=100)
    print("active calls:", len(active))
    for call in active:
        ended = now_iso()
        await db.calls.update_one(
            {"id": call["id"]},
            {"$set": {"status": "ended", "ended_at": ended, "duration_seconds": 0}},
        )
        # Insert a call_ended card so the chat no longer shows a stale LIVE card.
        already = await db.messages.find_one({"message_type": "call_ended", "metadata.call_id": call["id"]})
        if not already:
            await db.messages.insert_one({
                "id": f"clean-end-{call['id']}",
                "chat_id": call["chat_id"],
                "sender_id": "ai-system",
                "message_type": "call_ended",
                "body": "",
                "parent_message_id": None,
                "metadata": {
                    "call_id": call["id"],
                    "mode": call.get("mode", "audio"),
                    "status": "ended",
                    "started_by": call.get("started_by"),
                    "started_at": call.get("started_at"),
                    "ended_at": ended,
                    "duration_seconds": 0,
                    "participants": call.get("participants", []),
                },
                "reactions": {},
                "created_at": ended,
                "edited_at": None,
                "deleted_at": None,
            })
        print("ended call", call["id"], "in chat", call["chat_id"])


asyncio.run(main())
