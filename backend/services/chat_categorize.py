"""Per-chat AI auto-categorization.

After the chat reaches a small message threshold (5 human messages by
default), we ask the LLM to classify it into one of the existing sidebar
categories so the user doesn't have to set it manually. Only runs if:
  - chat.category is null/empty (don't overwrite a manual choice)
  - chat.type == 'group' (DMs and personal AI chats don't need it)
  - chat.kind != 'development' (already engineering)

Cheap (one short LLM call per chat per lifetime).
"""
from __future__ import annotations
import logging
import os
from typing import Optional

from deps import db, now_iso

logger = logging.getLogger("teamnest")

CATEGORIES = ["engineering", "product", "sales", "marketing", "design", "ops", "general"]
HUMAN_MSG_THRESHOLD = 5


async def maybe_auto_categorize(chat: dict) -> Optional[str]:
    """Idempotent fire-and-forget. Returns the chosen category or None."""
    if chat.get("category"):
        return None
    if chat.get("type") != "group":
        return None
    if chat.get("kind") == "development":
        return None

    # Count distinct HUMAN authors' messages (skip ai-*).
    msgs = await db.messages.find(
        {"chat_id": chat["id"], "sender_id": {"$not": {"$regex": "^ai-"}}},
        {"_id": 0, "body": 1, "sender_id": 1, "created_at": 1},
    ).sort("created_at", 1).to_list(20)
    if len(msgs) < HUMAN_MSG_THRESHOLD:
        return None

    sample = "\n".join(f"- {m.get('body','')[:200]}" for m in msgs[:8])
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            return None
        prompt = (
            "Classify this team chat into EXACTLY ONE category from: "
            + ", ".join(CATEGORIES)
            + ". Respond with ONLY the category word — no punctuation, no explanation.\n\n"
            + "Chat sample:\n" + sample
        )
        chat_llm = (
            LlmChat(
                api_key=key,
                session_id=f"cat-{chat['id'][:8]}",
                system_message="You classify chats. Return one word.",
            )
            .with_model("openai", "gpt-5.4-mini")
        )
        raw = (await chat_llm.send_message(UserMessage(text=prompt))).strip().lower()
        # Clean up — strip quotes, take first word, validate.
        guess = raw.split()[0].strip(".,'\"`")
        if guess not in CATEGORIES:
            guess = "general"
    except Exception as e:
        logger.warning("[auto-categorize] failed: %s", e)
        return None

    await db.chats.update_one(
        {"id": chat["id"]},
        {"$set": {
            "category": guess,
            "category_source": "ai_auto",
            "updated_at": now_iso(),
        }},
    )
    return guess
