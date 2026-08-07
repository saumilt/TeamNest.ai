#!/usr/bin/env python3
"""Seed a call_missed card and a call_recap card into the Marketing Site Refresh
chat in the demo workspace so the mobile UI test can render them. Prints IDs.
"""
import asyncio
import sys

sys.path.insert(0, "/app/backend")
from deps import db, new_id, now_iso, _broadcast_message  # noqa: E402


async def main():
    chat = await db.chats.find_one({"name": "Marketing Site Refresh"}, {"_id": 0})
    if not chat:
        print("NO CHAT")
        return
    amit = await db.users.find_one({"email": "amit@demo.team"}, {"_id": 0})
    priya = await db.users.find_one({"email": "priya@demo.team"}, {"_id": 0})
    call_id = new_id()
    missed = {
        "id": new_id(),
        "chat_id": chat["id"],
        "sender_id": "ai-system",
        "message_type": "call_missed",
        "body": "",
        "parent_message_id": None,
        "metadata": {
            "call_id": call_id,
            "mode": "audio",
            "from_id": priya["id"],
            "from_name": priya["name"],
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(missed.copy())
    await _broadcast_message(chat["id"], missed)

    recap = {
        "id": new_id(),
        "chat_id": chat["id"],
        "sender_id": "ai-system",
        "message_type": "call_recap",
        "body": "",
        "parent_message_id": None,
        "metadata": {
            "call_id": new_id(),
            "mode": "audio",
            "duration_seconds": 480,
            "count": 3,
            "highlights": [
                {"kind": "decision", "note": "Ship the marketing site on Monday."},
                {"kind": "action_item", "note": "Send updated copy to design by EOD."},
                {"kind": "risk", "note": "Legal review may block the launch."},
            ],
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(recap.copy())
    await _broadcast_message(chat["id"], recap)

    print(f"CHAT_ID={chat['id']}")
    print(f"MISSED_ID={missed['id']}")
    print(f"RECAP_ID={recap['id']}")
    print(f"MISSED_CALL_ID={call_id}")


if __name__ == "__main__":
    asyncio.run(main())
