import asyncio, os
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


async def main():
    future = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    res = await db.invite_codes.update_one(
        {"code": "DEVOS100"},
        {"$set": {"status": "active", "used_count": 0, "max_uses": 100, "expires_at": future}},
    )
    print("matched", res.matched_count, "modified", res.modified_count)
    doc = await db.invite_codes.find_one({"code": "DEVOS100"}, {"_id": 0, "code": 1, "status": 1, "used_count": 1, "max_uses": 1, "expires_at": 1})
    print("now:", doc)


asyncio.run(main())
