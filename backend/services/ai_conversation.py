"""AI Conversation Mode — "Mention AI once, then continue naturally."

Once a user invokes @ai (or replies to an AI message, or is in a direct AI
chat), TeamNest keeps a short-lived, PER-USER AI session for that chat so the
user's follow-up messages route to the AI assistant without typing @ai again.

Sessions are user-specific: one person continuing with AI never forces other
group members into AI mode.

Phase 1 scope:
  * Direct "personal_ai" chats → every message auto-routes to the assistant.
  * Group / human chats → after an AI turn, follow-ups from that user are
    scored (fast heuristic, with an LLM tie-breaker for the ambiguous band)
    and routed to AI (high confidence), offered an inline choice (ambiguous),
    or left as a normal team message (low confidence).
  * Exits on: /exit-ai, /team, @mentioning a human, replying to a human
    message, an explicit Exit button, or 30-min inactivity.
"""
from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from deps import db, logger, new_id, now_iso

# ── Tunables (Phase 2 will make these workspace-configurable) ───────────────
TIMEOUT_MIN = 30
THRESHOLD_HIGH = 0.75
THRESHOLD_LOW = 0.45
# Below THRESHOLD_LOW but still plausibly a follow-up: hand these to the LLM
# tie-breaker instead of silently treating them as team chatter. This rescues
# natural phrasings ("can you list all the values…") that the fast heuristic
# under-scores.
AMBIGUOUS_FLOOR = 0.3
DEFAULT_ASSISTANT_ID = "ai"

EXIT_COMMANDS = {"/exit-ai", "/team", "/exit"}

FOLLOW_UP_SUGGESTIONS = [
    "Explain further",
    "Make shorter",
    "Create task",
    "Draft email",
    "Compare options",
]

_STRONG_STARTERS = (
    "explain", "summarize", "summarise", "rewrite", "compare", "draft",
    "list ", "list all", "can you", "could you", "would you", "will you",
    "give me", "give ", "show me", "show ", "tell me", "walk me",
    "break down", "break it", "break this", "elaborate", "go deeper",
    "expand", "simplify", "translate", "convert", "outline", "describe",
    "define", "what about", "how about", "why", "how ", "what ", "which ",
    "who ", "when ", "where ", "map out", "generate", "write ", "provide",
    "pull up", "make it", "make this", "in detail", "shorter", "longer",
    "another", "can this", "can it", "is it", "are they", "does ",
)
# Generic conversational lead-ins: weaker signal, so they only nudge the score
# into the LLM tie-breaker band rather than auto-routing (protects team chatter
# like "lets grab lunch tomorrow" from being sent to the AI).
_WEAK_STARTERS = (
    "yes", "yep", "yeah", "yup", "ok", "okay", "sure", "please", "pls ",
    "and ", "also ", "more", "next", "then", "continue", "keep going",
    "go ahead", "lets ", "let's ", "do ", "i want", "i need", "i'd like",
    "add ", "remove", "change the", "use the", "help me", "detail",
)
_REFERENCE_WORDS = (
    " this", " that", " it", " those", " these", "above", "previous",
    "last answer", "your answer", "the second", "second option", "earlier",
    "what you said", "what you just", "the first", "the third", "both options",
    "that pricing", "your last", "the same", " each", "by tract", "trait by",
    " them", " each one", "one by one",
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(s) -> Optional[datetime]:
    if not s:
        return None
    if isinstance(s, datetime):
        return s
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


# ── Session lifecycle ───────────────────────────────────────────────────────
async def get_active_session(chat_id: str, user_id: str) -> Optional[dict]:
    """Return the user's active, non-expired AI session for this chat, else
    None. Lazily ends sessions that have timed out."""
    sess = await db.ai_conversation_sessions.find_one(
        {"chat_id": chat_id, "user_id": user_id, "status": "active"}, {"_id": 0}
    )
    if not sess:
        return None
    exp = _parse_iso(sess.get("expires_at"))
    if exp and _now() >= exp:
        await end_session(chat_id, user_id, reason="timeout")
        return None
    return sess


async def start_or_refresh_session(
    *,
    workspace_id: Optional[str],
    chat_id: str,
    user_id: str,
    assistant_id: str = DEFAULT_ASSISTANT_ID,
    assistant_label: Optional[str] = None,
    latest_ai_message_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    topic: Optional[str] = None,
    start_message_id: Optional[str] = None,
) -> dict:
    """Create or bump the user's AI session for this chat. Idempotent. The
    expiry window comes from the effective (workspace+user) timeout setting;
    a timeout <= 0 means "keep active until the user exits" (no expiry)."""
    now = _now()
    from services.workspace_settings import get_effective_ai_settings
    eff = await get_effective_ai_settings(workspace_id, user_id)
    timeout = eff.get("timeout_minutes", TIMEOUT_MIN)
    expires = (now + timedelta(minutes=timeout)).isoformat() if timeout and timeout > 0 else None
    existing = await db.ai_conversation_sessions.find_one(
        {"chat_id": chat_id, "user_id": user_id, "status": "active"}, {"_id": 0}
    )
    set_fields = {
        "assistant_id": assistant_id,
        "status": "active",
        "last_activity_at": now.isoformat(),
        "expires_at": expires,
        "updated_at": now.isoformat(),
    }
    if assistant_label:
        set_fields["assistant_label"] = assistant_label
    if latest_ai_message_id:
        set_fields["latest_ai_message_id"] = latest_ai_message_id
    if thread_id:
        set_fields["thread_id"] = thread_id
    if topic:
        set_fields["topic"] = topic
    if existing:
        await db.ai_conversation_sessions.update_one(
            {"id": existing["id"]},
            {"$set": set_fields, "$inc": {"answer_count": 1}},
        )
        return {**existing, **set_fields, "answer_count": existing.get("answer_count", 0) + 1}
    doc = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "chat_id": chat_id,
        "user_id": user_id,
        "start_message_id": start_message_id,
        "context_summary": None,
        "answer_count": 1,
        "started_at": now.isoformat(),
        "created_at": now.isoformat(),
        "ended_at": None,
        "end_reason": None,
        **set_fields,
    }
    await db.ai_conversation_sessions.insert_one(doc.copy())
    return doc


async def end_session(chat_id: str, user_id: str, reason: str) -> None:
    await db.ai_conversation_sessions.update_one(
        {"chat_id": chat_id, "user_id": user_id, "status": "active"},
        {"$set": {"status": "ended", "ended_at": now_iso(), "end_reason": reason}},
    )


# ── Rolling conversation summary / context window ────────────────────────────
SUMMARY_EVERY_TURNS = 4


async def set_session_summary(chat_id: str, user_id: str, summary: str) -> None:
    await db.ai_conversation_sessions.update_one(
        {"chat_id": chat_id, "user_id": user_id, "status": "active"},
        {"$set": {"context_summary": summary, "updated_at": now_iso()}},
    )


def summary_block(session: Optional[dict]) -> str:
    """Formatted context block for injecting a session's rolling summary into
    the AI prompt. Empty string when there's no summary yet."""
    s = (session or {}).get("context_summary")
    if not s:
        return ""
    return (
        "[Structured summary of this ongoing AI conversation — preserve these "
        "decisions, facts and pending questions; stay consistent with them.]\n"
        f"{s}"
    )


# ── Multi-assistant switch banner ────────────────────────────────────────────
async def note_active_assistant(
    *, workspace_id: Optional[str], chat_id: str, user_id: str,
    assistant_id: str, assistant_label: str,
) -> None:
    """When the user switches the assistant they're addressing within a chat,
    post a small system note ("Active AI changed from @X to @Y") and update the
    session's active assistant. Per-user; no-op on first invocation."""
    session = await get_active_session(chat_id, user_id)
    prev = (session or {}).get("assistant_id")
    prev_label = (session or {}).get("assistant_label") or (f"@{prev}" if prev else None)
    if session and prev and prev != assistant_id:
        from deps import manager
        note = {
            "id": new_id(), "chat_id": chat_id, "sender_id": "ai-system",
            "message_type": "system", "body": f"Active AI changed from {prev_label} to {assistant_label}",
            "parent_message_id": None,
            "metadata": {"ai_assistant_switch": True, "for_user_id": user_id,
                         "from": prev_label, "to": assistant_label},
            "reactions": {}, "created_at": now_iso(), "edited_at": None, "deleted_at": None,
        }
        await db.messages.insert_one(note.copy())
        await manager.broadcast(chat_id, {"event": "message", "data": note})
    if session:
        await db.ai_conversation_sessions.update_one(
            {"id": session["id"]},
            {"$set": {"assistant_id": assistant_id, "assistant_label": assistant_label,
                      "updated_at": now_iso()}},
        )


async def log_routing_decision(
    *,
    workspace_id: Optional[str],
    chat_id: str,
    message_id: str,
    user_id: str,
    session_id: Optional[str],
    confidence: float,
    detected_follow_up: bool,
    reasons: List[str],
    final_recipient: str,
    user_override: Optional[str] = None,
) -> None:
    try:
        await db.ai_routing_decisions.insert_one({
            "id": new_id(),
            "workspace_id": workspace_id,
            "chat_id": chat_id,
            "message_id": message_id,
            "user_id": user_id,
            "active_session_id": session_id,
            "confidence_score": round(float(confidence), 3),
            "detected_follow_up": detected_follow_up,
            "routing_reasons": reasons,
            "user_override": user_override,
            "final_recipient": final_recipient,
            "created_at": now_iso(),
        })
    except Exception as e:  # pragma: no cover
        logger.warning("[ai-conv] routing log failed: %s", e)


# ── Human-mention / reference detection ─────────────────────────────────────
def mentions_human(body: str, member_names: List[str]) -> bool:
    """True if the message @mentions or directly names a human member (used to
    hand the turn back to the team)."""
    lower = f" {(body or '').lower()} "
    # Explicit @handle that isn't an AI handle.
    for m in re.finditer(r"@([a-z0-9_.-]{2,})", lower):
        h = m.group(1)
        if h in ("ai", "devmanager", "devmgr", "dev", "team"):
            continue
        return True
    for name in member_names:
        if not name:
            continue
        first = name.strip().split(" ")[0].lower()
        if len(first) >= 3 and (f" {first} " in lower or f" @{first} " in lower):
            return True
    return False


def _heuristic_score(
    body: str, seconds_since_activity: float
) -> Tuple[float, List[str]]:
    lower = (body or "").strip().lower()
    reasons: List[str] = []
    score = 0.0
    if any(lower.startswith(s) for s in _STRONG_STARTERS):
        score += 0.4
        reasons.append("followup_starter")
    elif any(lower.startswith(s) for s in _WEAK_STARTERS):
        score += 0.2
        reasons.append("weak_starter")
    if any(w in f" {lower}" for w in _REFERENCE_WORDS):
        score += 0.25
        reasons.append("reference_word")
    wc = len(lower.split())
    if wc <= 6:
        score += 0.2
        reasons.append("short_message")
    if lower.endswith("?"):
        score += 0.15
        reasons.append("question")
    if seconds_since_activity < 120:
        score += 0.2
        reasons.append("very_recent")
    elif seconds_since_activity < 600:
        score += 0.1
        reasons.append("recent")
    return min(score, 0.99), reasons


async def _llm_refine(body: str, topic: Optional[str]) -> Optional[float]:
    """Ambiguous-band tie-breaker: ask a fast model whether `body` is a
    follow-up to the ongoing AI conversation. Returns 0..1 or None on error."""
    try:
        from ai_service import complete
        prompt = (
            "An AI assistant and a user are having a conversation.\n"
            f"Conversation topic: {topic or 'unknown'}\n"
            f"The user just wrote: \"{body}\"\n\n"
            "Is this new message most likely a FOLLOW-UP directed at the AI "
            "assistant (as opposed to a normal message to human teammates)? "
            "Reply with ONLY a decimal between 0 and 1 (e.g. 0.82). Higher "
            "means more likely an AI follow-up."
        )
        raw = await complete(
            "You classify whether a chat message is a follow-up to an AI "
            "conversation. Output only a number between 0 and 1.",
            prompt,
            model_key="gpt-4o-mini",
        )
        m = re.search(r"(\d*\.?\d+)", str(raw))
        if not m:
            return None
        val = float(m.group(1))
        return max(0.0, min(1.0, val))
    except Exception as e:  # pragma: no cover
        logger.warning("[ai-conv] llm refine failed: %s", e)
        return None


async def score_follow_up(
    *, session: dict, body: str, workspace_id: Optional[str] = None,
    high_threshold: float = THRESHOLD_HIGH,
) -> Tuple[float, List[str]]:
    """Hybrid confidence that `body` is a follow-up to the active AI session.
    Fast heuristic first; LLM tie-breaker only when in the ambiguous band
    [THRESHOLD_LOW, high_threshold)."""
    last = _parse_iso(session.get("last_activity_at"))
    seconds = (_now() - last).total_seconds() if last else 9999
    score, reasons = _heuristic_score(body, seconds)
    # Ambiguous band → let a fast LLM decide. Floor lowered to AMBIGUOUS_FLOOR so
    # under-scored-but-plausible follow-ups still get an intelligent read
    # (the LLM also guards against false positives by returning a low score).
    if AMBIGUOUS_FLOOR <= score < high_threshold:
        llm = await _llm_refine(body, session.get("topic"))
        if llm is not None:
            reasons.append(f"llm_refined:{round(llm, 2)}")
            score = llm
    return score, reasons


# ── Orchestration: route a plain (untagged) message ─────────────────────────
def _trigger_ai(chat_id: str, user_id: str, body: str, attachments=None) -> None:
    """Fire the generic @ai handler in the background (lazy import avoids a
    circular dependency with services.ai_runtime)."""
    from services.ai_runtime import handle_ai_command
    asyncio.create_task(
        handle_ai_command(chat_id, user_id, body, ["gpt-4o-mini"], attachments=attachments)
    )


async def _trigger_for_session(session: Optional[dict], chat: dict, user: dict, msg: dict) -> None:
    """Route a follow-up to whichever assistant owns the session — the generic
    @ai, a catalog AI employee (`employee:<key>`), or a deployed employee
    (`deploy:<handle>`)."""
    aid = (session or {}).get("assistant_id") or "ai"
    body = msg.get("body") or ""
    attachments = (msg.get("metadata") or {}).get("attachments") or None
    if aid.startswith("employee:"):
        key = aid.split(":", 1)[1]
        from services.ai_employee_dispatcher import _run_employee
        asyncio.create_task(_run_employee(chat, user, msg, key, body))
    elif aid.startswith("deploy:"):
        handle = aid.split(":", 1)[1]
        from services.ai_employee_deploy_dispatcher import _respond

        async def _go():
            d = await db.ai_employee_deployments.find_one(
                {"workspace_id": chat.get("workspace_id"), "status": "active", "handle": handle},
                {"_id": 0},
            )
            if d and not (d.get("channel") == "chat" and d.get("chat_id") and d["chat_id"] != chat["id"]):
                await _respond(chat, user, msg, d)
        asyncio.create_task(_go())
    else:
        _trigger_ai(chat["id"], user["id"], body, attachments)


async def route_untagged_message(chat: dict, user: dict, msg: dict) -> dict:
    """Decide where a plain text message (no @ai / task / dev command) should
    go, honoring the user's AI Conversation Mode session. Returns a decision
    dict: {routed: 'ai'|'chat'|'ambiguous'}.

    Only called for text messages in non-development chats.
    """
    chat_id = chat["id"]
    user_id = user["id"]
    workspace_id = user.get("workspace_id")
    body = msg.get("body") or ""
    attachments = (msg.get("metadata") or {}).get("attachments") or None

    async def _log(final, conf, detected, reasons, session_id=None, override=None):
        await log_routing_decision(
            workspace_id=workspace_id, chat_id=chat_id, message_id=msg["id"],
            user_id=user_id, session_id=session_id, confidence=conf,
            detected_follow_up=detected, reasons=reasons, final_recipient=final,
            user_override=override,
        )

    # Direct AI chat → every message goes to the assistant, no @ai needed.
    # (This is the AI chat itself, so it is not gated by the auto-continue setting.)
    if chat.get("type") == "personal_ai":
        _trigger_ai(chat_id, user_id, body, attachments)
        await _log("ai", 1.0, True, ["direct_ai_chat"])
        return {"routed": "ai"}

    from services.workspace_settings import get_effective_ai_settings
    eff = await get_effective_ai_settings(workspace_id, user_id)
    if not eff["enabled"] or not eff["allow_in_group_chats"]:
        return {"routed": "chat"}
    high_threshold = eff["follow_up_threshold"]
    ask_when_ambiguous = eff["ask_when_ambiguous"]

    # Resolve reply target (if any).
    parent = None
    if msg.get("parent_message_id"):
        parent = await db.messages.find_one(
            {"id": msg["parent_message_id"]}, {"_id": 0}
        )
    is_reply_to_ai = bool(
        parent and (
            parent.get("sender_id") == "ai-system"
            or parent.get("message_type") in ("ai_answer", "ai_question")
            or str(parent.get("sender_id") or "").startswith("ai-")
        )
    )
    is_reply_to_human = bool(parent and not is_reply_to_ai)

    session = await get_active_session(chat_id, user_id)
    sid = (session or {}).get("id")

    # Replying to a human hands the turn back to the team (and exits AI mode).
    if is_reply_to_human:
        if session:
            await end_session(chat_id, user_id, "human_reply")
        await _log("chat", 0.0, False, ["reply_to_human"], sid)
        return {"routed": "chat"}

    # Replying to an AI message is an unambiguous follow-up.
    if is_reply_to_ai:
        await _trigger_for_session(session, chat, user, msg)
        await _log("ai", 0.95, True, ["reply_to_ai"], sid)
        return {"routed": "ai"}

    # No active session → normal team message (user must @ai to start).
    if not session:
        return {"routed": "chat"}

    # Addressing a human by @handle or name exits AI mode.
    member_ids = chat.get("member_ids") or []
    names: List[str] = []
    if member_ids:
        async for u in db.users.find(
            {"id": {"$in": member_ids, "$ne": user_id}}, {"_id": 0, "name": 1}
        ):
            if u.get("name"):
                names.append(u["name"])
    if mentions_human(body, names):
        await end_session(chat_id, user_id, "human_addressed")
        await _log("chat", 0.0, False, ["mentions_human"], sid)
        return {"routed": "chat"}

    # Score the follow-up (heuristic + LLM tie-breaker).
    score, reasons = await score_follow_up(
        session=session, body=body, workspace_id=workspace_id,
        high_threshold=high_threshold,
    )
    if score >= high_threshold:
        await _trigger_for_session(session, chat, user, msg)
        await _log("ai", score, True, reasons, sid)
        return {"routed": "ai"}
    if score >= THRESHOLD_LOW:
        # Ambiguous band. If the user opted out of being asked, auto-continue
        # to AI; otherwise offer the inline "Continue with AI?" choice.
        if not ask_when_ambiguous:
            await _trigger_for_session(session, chat, user, msg)
            await _log("ai", score, True, reasons + ["ask_disabled"], sid)
            return {"routed": "ai"}
        from deps import manager
        new_meta = {**(msg.get("metadata") or {}), "pending_ai_route": True}
        await db.messages.update_one({"id": msg["id"]}, {"$set": {"metadata": new_meta}})
        updated = await db.messages.find_one({"id": msg["id"]}, {"_id": 0})
        await manager.broadcast(chat_id, {"event": "message_updated", "data": updated})
        await _log("ambiguous", score, True, reasons, sid)
        return {"routed": "ambiguous"}
    await _log("chat", score, False, reasons, sid)
    return {"routed": "chat"}
