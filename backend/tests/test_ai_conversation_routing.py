"""Regression: AI Conversation Mode auto-continue for natural follow-ups.

Covers the fix for "can you list all the values…" style follow-ups being
mis-routed to the team instead of continuing with the AI in group chats.
"""
import asyncio
import sys

sys.path.insert(0, "/app/backend")

import pytest  # noqa: E402

from deps import db, new_id, now_iso  # noqa: E402
from services import ai_conversation as aic  # noqa: E402


@pytest.mark.asyncio
async def test_natural_followups_route_to_ai_and_chatter_stays():
    ws_id = None  # None -> service uses defaults (enabled, allow group, ask=False)
    user = {"id": f"test-{new_id()}", "workspace_id": ws_id, "name": "Tester"}
    chat = {
        "id": f"chat-{new_id()}",
        "workspace_id": ws_id,
        "type": "group",
        "kind": "team",
        "member_ids": [user["id"]],
        "name": "Routing Test",
    }
    await db.chats.insert_one(chat.copy())
    try:
        # Start an active AI session for this user in the chat.
        await aic.start_or_refresh_session(
            workspace_id=ws_id, chat_id=chat["id"], user_id=user["id"],
            topic="property appraisal valuation",
        )

        async def route(body):
            msg = {
                "id": f"m-{new_id()}", "chat_id": chat["id"], "sender_id": user["id"],
                "message_type": "text", "body": body, "parent_message_id": None,
                "metadata": {}, "created_at": now_iso(),
            }
            await db.messages.insert_one(msg.copy())
            return (await aic.route_untagged_message(chat, user, msg))["routed"]

        # The exact phrasings the user reported — must continue with AI now.
        assert await route("can you list all value tract by tract") == "ai"
        assert await route("yes list value tract by tract") == "ai"
        # Clear team chatter must NOT be hijacked into AI.
        assert await route("hey mike are you free at 3pm") == "chat"
    finally:
        # Cleanup all artifacts.
        await db.chats.delete_many({"id": chat["id"]})
        await db.messages.delete_many({"chat_id": chat["id"]})
        await db.ai_conversation_sessions.delete_many({"chat_id": chat["id"]})
        await db.ai_routing_decisions.delete_many({"chat_id": chat["id"]})
        await db.ai_threads.delete_many({"chat_id": chat["id"]})


if __name__ == "__main__":
    asyncio.run(test_natural_followups_route_to_ai_and_chatter_stays())
    print("PASS: natural follow-ups route to AI; team chatter stays in chat")
