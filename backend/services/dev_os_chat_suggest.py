"""Dev OS chat-native auto-suggest.

After each new chat message we cheaply check whether this chat looks like
it could benefit from a Dev OS project. If it does AND no project is yet
linked AND we haven't already nudged in the recent past, we post a soft
"Want to spin up a project from this thread?" hint.

Cheap heuristic only — no LLM call. Counts engineering / product /
"feature request" style keywords in the last N messages. We deliberately
keep this conservative so the suggestion feels like a smart nudge, not
spam.
"""
from __future__ import annotations
import logging
import re
from typing import Any, Dict

from deps import _broadcast_message, db, new_id, now_iso

logger = logging.getLogger("teamnest")

# Lowercased substrings — message body counts as a "signal" if it contains
# any of these (whole-word match where it matters).
_SIGNAL_PATTERNS = [
    re.compile(r"\b(bug|crash|error|broken|doesn'?t work|fails?)\b", re.I),
    re.compile(r"\b(feature|build|ship|deploy|prototype|MVP)\b", re.I),
    re.compile(r"\b(API|backend|frontend|database|schema|migration|endpoint)\b", re.I),
    re.compile(r"\b(launch|roadmap|sprint|release|milestone)\b", re.I),
    re.compile(r"\b(integration|webhook|OAuth|token)\b", re.I),
    re.compile(r"^\s*(can|could|should|let'?s)\s.+(build|add|create|make|fix)\b", re.I),
]

# Tunables
LOOKBACK_MESSAGES = 10
MIN_SIGNALS = 3
SUGGESTION_COOLDOWN_HOURS = 24


def _message_has_signal(body: str) -> bool:
    return any(p.search(body or "") for p in _SIGNAL_PATTERNS)


async def maybe_suggest(chat: Dict[str, Any], current: Dict[str, Any]) -> bool:
    """Idempotent / rate-limited Dev OS suggestion.
    Returns True if a suggestion was posted, False otherwise."""
    chat_id = chat["id"]

    # 1. Skip if a project is already linked — they don't need a nudge.
    already = await db.dev_projects.find_one(
        {"workspace_id": chat["workspace_id"], "related_chat_id": chat_id},
        {"_id": 0, "id": 1},
    )
    if already:
        return False

    # 2. Skip if we've nudged in the last N hours (looks at the chat
    # metadata flag we set after a successful suggestion).
    last_suggest = (chat.get("dev_os") or {}).get("last_suggest_at")
    if last_suggest:
        try:
            from datetime import datetime, timedelta, timezone
            ts = datetime.fromisoformat(last_suggest.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - ts < timedelta(hours=SUGGESTION_COOLDOWN_HOURS):
                return False
        except Exception:
            pass

    # 3. Count signals in the last `LOOKBACK_MESSAGES` non-system messages.
    recent = await db.messages.find(
        {"chat_id": chat_id, "message_type": {"$in": ["text", "ai-question", "ai-answer"]}},
        {"_id": 0, "body": 1, "message_type": 1},
    ).sort("created_at", -1).to_list(LOOKBACK_MESSAGES)
    signals = sum(1 for m in recent if _message_has_signal(m.get("body") or ""))
    if signals < MIN_SIGNALS:
        return False

    # 4. Atomically claim the "suggestion slot" so concurrent message handlers
    # can't post duplicate suggestions under a burst. We update_one with a
    # filter that only matches if last_suggest_at is still missing/old, and
    # only proceed if a doc was actually modified.
    from datetime import datetime, timedelta, timezone
    cutoff = (
        datetime.now(timezone.utc) - timedelta(hours=SUGGESTION_COOLDOWN_HOURS)
    ).isoformat()
    claim = await db.chats.update_one(
        {
            "id": chat_id,
            "$or": [
                {"dev_os.last_suggest_at": {"$exists": False}},
                {"dev_os.last_suggest_at": None},
                {"dev_os.last_suggest_at": {"$lt": cutoff}},
            ],
        },
        {"$set": {"dev_os.last_suggest_at": now_iso()}},
    )
    if claim.modified_count == 0:
        return False

    # 5. Post the nudge as an ai-system message (so it renders distinct).
    suggestion = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "ai-system",
        "body": (
            "🚀 **Dev OS suggestion** · I notice you're talking about building / shipping / fixing "
            "things in this chat. Want to spin up a **Dev OS project** linked to this conversation?\n\n"
            "Tap the 🚀 in the chat header, or reply with `/dev-os new <project name>`. "
            "You can also type `/dev-os help` to see all commands."
        ),
        "parent_message_id": None,
        "metadata": {"source": "dev_os_suggest", "signals": signals},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(suggestion.copy())
    await _broadcast_message(chat_id, suggestion)
    return True
