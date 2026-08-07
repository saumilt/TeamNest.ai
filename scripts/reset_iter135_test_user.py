"""Reset the iter-135 test user's plan + credits to a clean state."""
import asyncio, os, sys
sys.path.insert(0, "/app/backend")
from motor.motor_asyncio import AsyncIOMotorClient

TEST_USER_ID = "8aaa964b-5880-4f2c-bc4f-4d910f08d3d4"

async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    u = await db.users.find_one({"id": TEST_USER_ID}, {"_id": 0, "id": 1, "workspace_id": 1, "iap_workspace_id": 1})
    if not u:
        print("user not found")
        return
    ws = u.get("iap_workspace_id") or u.get("workspace_id")
    print("user:", u["id"], "ws:", ws)
    r = await db.workspace_billing.update_one(
        {"workspace_id": ws},
        {"$set": {"plan_id": "free", "status": "active", "credits_purchased_extra": 0, "cancel_at_period_end": False, "iap_provider": None, "iap_expires_at": None}},
    )
    print("reset workspace_billing:", r.modified_count)
    # Purge test grants for this test window (keep production ones alone)
    r2 = await db.iap_credit_grants.delete_many({"user_id": TEST_USER_ID})
    print("deleted iap_credit_grants:", r2.deleted_count)
    r3 = await db.rc_events.delete_many({"event_id": {"$regex": "^iter135-|^cleanup-"}})
    print("deleted rc_events:", r3.deleted_count)
    sub = await db.workspace_billing.find_one({"workspace_id": ws}, {"_id": 0, "plan_id": 1, "credits_purchased_extra": 1})
    print("final:", sub)

asyncio.run(main())
