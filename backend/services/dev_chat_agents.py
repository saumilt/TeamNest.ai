"""Dev Chat — AI agent roles, mention parsing, and LLM-backed replies.

This is the core of the "Emergent-inside-a-chat" experience. When a user
posts in a development chat:

  • `@AI` or `@AI ...`       → existing all-LLM ensemble (unchanged)
  • `@devmanager` (`@devmgr`) → THE single AI dev agent — handles product
    planning, architecture, coding, QA, security and release internally.

There are no visible specialist sub-agents anymore. Legacy tokens like
`@architect`, `@qa`, `@frontend` still work as aliases but all route to
the Dev Manager.
"""
from __future__ import annotations
import logging
import re
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

from deps import _broadcast_message, db, new_id, now_iso

logger = logging.getLogger("teamnest")


# ─── Live "typing" pulse ─────────────────────────────────────────────────────
# While @devmanager thinks/edits, pulse the chat's WS typing event every 2.5s
# so the frontend shows "@devmanager is working…" like a real teammate typing.
@asynccontextmanager
async def _typing_pulse(chat_id: str, sender: str = "ai-agent-devmgr"):
    import asyncio
    from deps import manager

    async def pulse():
        while True:
            try:
                await manager.broadcast(
                    chat_id,
                    {"event": "typing", "data": {"user_id": sender, "typing": True}},
                )
            except Exception:
                pass
            await asyncio.sleep(2.5)

    task = asyncio.create_task(pulse())
    try:
        yield
    finally:
        task.cancel()
        try:
            await manager.broadcast(
                chat_id,
                {"event": "typing", "data": {"user_id": sender, "typing": False}},
            )
        except Exception:
            pass


# ─── Role registry ──────────────────────────────────────────────────────────
# Single-agent model: `@devmanager` is the ONLY visible AI dev entity. It
# handles planning, coding, QA, security and release internally.

ROLES: Dict[str, Dict[str, Any]] = {
    "devmgr": {
        "mention": "devmanager",
        "label": "Dev Manager",
        "emoji": "🎯",
        "color": "amber",
        "is_coordinator": True,
        "is_developer": True,
        "system_prompt": (
            "You are @devmanager — the single AI engineer who personally runs "
            "the ENTIRE development lifecycle for this team: product planning, "
            "architecture, frontend, backend, database, QA, security review, "
            "and release. There is NO team of sub-agents — never delegate, "
            "never @mention other roles, never say you'll 'hand this off'. "
            "Always speak in first person: 'I'll build…', 'I'm running QA "
            "now', 'I've shipped the fix'.\n\n"
            "**Working model:** you work instantly inside this chat. Do NOT "
            "promise calendar deadlines like 'by Friday' — use language like "
            "'building it now', 'ready in about a minute'.\n\n"
            "Read the most recent chat messages and the linked project state, "
            "then EITHER: (a) answer briefly if the question is simple, OR "
            "(b) state a short plain-English plan and confirm exactly what "
            "you're building/fixing right now. No jargon — talk like you're "
            "explaining to a non-technical teammate. Keep replies under 8 "
            "sentences. Be decisive."
        ),
    },
}

DEV_ROLE_KEYS = ["devmgr"]

# Legacy specialist tokens still typed by long-time users — all of them are
# aliases for the Dev Manager now.
_LEGACY_ROLE_TOKENS = frozenset((
    "architect", "frontend", "backend", "database", "qa", "security",
    "devops", "reviewer", "designer", "product", "docs", "growth",
    "dev", "devs", "developers",
))


# ─── Mention parsing ────────────────────────────────────────────────────────
# Match @word at start of string or after whitespace. Case-insensitive on the
# token; the canonical role key is always lowercase.
_MENTION_RE = re.compile(r"(?:^|\s)@([a-zA-Z][a-zA-Z0-9_-]{1,32})")


def parse_role_mentions(body: str) -> List[str]:
    """Return ["devmgr"] when the body summons the Dev Manager, else [].

    All development work is handled by the single `@devmanager` agent.
    Legacy specialist tokens (`@architect`, `@qa`, `@frontend`, …) are kept
    as aliases and route to the Dev Manager too. The existing `@ai` mention
    is handled elsewhere and intentionally ignored here."""
    body = body or ""
    for raw in _MENTION_RE.findall(body):
        tok = raw.lower()
        if tok in ("ai", "ai-compare"):
            continue                # handled by existing ensemble route
        if tok in ("devmgr", "devmanager", "dev-manager") or tok in _LEGACY_ROLE_TOKENS:
            return ["devmgr"]
    return []


# ─── LLM-backed agent replies ───────────────────────────────────────────────
async def _load_attachment_context(
    trigger_msg: Dict[str, Any], workspace_id: str,
) -> tuple[List[bytes], List[tuple]]:
    """Pull attached images (bytes for vision) + small text files (inlined
    content) from the trigger message's uploads. Best-effort — a broken
    attachment never blocks the agent reply."""
    atts = (trigger_msg.get("metadata") or {}).get("attachments") or []
    images: List[bytes] = []
    texts: List[tuple] = []
    if not atts:
        return images, texts
    from storage import get_object
    for a in atts[:4]:
        rec = await db.files.find_one(
            {"id": a.get("id"), "workspace_id": workspace_id, "is_deleted": False},
            {"_id": 0, "storage_path": 1, "content_type": 1, "original_filename": 1},
        )
        if not rec:
            continue
        try:
            data, _ = get_object(rec["storage_path"])
        except Exception:
            continue
        ct = rec.get("content_type") or ""
        if ct.startswith("image/"):
            images.append(data)
        elif ct.startswith("text/") or ct in ("application/json", "text/csv"):
            texts.append((
                rec.get("original_filename") or "file",
                data[:4000].decode("utf-8", "ignore"),
            ))
    return images, texts


async def _gather_context(chat: Dict[str, Any]) -> Dict[str, Any]:
    """Pull the project + last N messages for the LLM prompt."""
    project = await db.dev_projects.find_one(
        {"workspace_id": chat["workspace_id"], "related_chat_id": chat["id"]},
        {"_id": 0},
    )
    recent = await db.messages.find(
        {"chat_id": chat["id"]},
        {"_id": 0, "sender_id": 1, "body": 1, "message_type": 1, "created_at": 1, "metadata": 1},
    ).sort("created_at", -1).to_list(20)
    recent.reverse()
    return {"project": project, "messages": recent}


def _format_transcript(messages: List[Dict[str, Any]]) -> str:
    lines = []
    for m in messages[-15:]:
        sender = m.get("sender_id") or "?"
        if sender == "ai-system":
            who = "AI"
        elif sender.startswith("ai-agent-"):
            who = f"AI/{sender.replace('ai-agent-', '')}"
        else:
            who = sender[:8]
        body = (m.get("body") or "")[:400]
        lines.append(f"[{who}] {body}")
    return "\n".join(lines)


async def _call_role_llm(
    role_key: str,
    chat: Dict[str, Any],
    trigger_msg: Dict[str, Any],
    ctx: Optional[Dict[str, Any]] = None,
) -> str:
    """Single LLM round for one role. Falls back to a deterministic stub
    string when the LLM key isn't configured or the call fails, so a Dev
    Chat still feels responsive in dev / demo modes.

    `ctx` is an optional pre-computed context (from `_gather_context`) so
    a fan-out (`@dev`) doesn't re-query the chat history per role."""
    role = ROLES.get(role_key) or {}
    if ctx is None:
        ctx = await _gather_context(chat)
    project_name = (ctx["project"] or {}).get("name") or "(no linked project)"
    pillars = (ctx["project"] or {}).get("plan", {}).get("pillars") or []
    transcript = _format_transcript(ctx["messages"])
    user_msg = (trigger_msg.get("body") or "")[:600]

    system = role.get("system_prompt") or "You are a helpful AI engineer."
    user_prompt = (
        f"Project: {project_name}\n"
        f"Pillars: {', '.join(pillars[:5]) or '—'}\n\n"
        f"Recent chat (oldest → newest):\n{transcript}\n\n"
        f"The user just said:\n{user_msg}\n\n"
        f"Respond as the {role.get('label', role_key)}. Be specific and decisive."
    )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        import os
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            raise RuntimeError("EMERGENT_LLM_KEY not set")
        session_id = f"devchat-{chat['id']}-{role_key}"
        chat_llm = (
            LlmChat(api_key=key, session_id=session_id, system_message=system)
            .with_model("openai", "gpt-5.4-mini")
        )
        resp = await chat_llm.send_message(UserMessage(text=user_prompt))
        return (resp or "").strip() or _stub_reply(role_key)
    except Exception as e:
        logger.warning("[dev-chat] LLM call failed for %s: %s — using stub", role_key, e)
        return _stub_reply(role_key)


def _stub_reply(role_key: str) -> str:
    label = (ROLES.get(role_key) or {}).get("label", role_key)
    return (
        f"_({label} stub — LLM unavailable.)_ "
        f"I'd jump in here, but my brain is offline. Top of mind: "
        f"scope this tight, ship a thin slice, and make sure tests + telemetry land before merge."
    )


async def post_agent_reply(
    chat: Dict[str, Any],
    role_key: str,
    trigger_msg: Dict[str, Any],
    ctx: Optional[Dict[str, Any]] = None,
    cascade_depth: int = 0,
) -> None:
    """Run the role's LLM and post the reply as an ai-agent message so the
    frontend can style it with a role badge.

    Also auto-creates a task scoped to the AI agent so users can see what
    work was delegated and track when it completes. Tasks are visible in
    the workspace Tasks list with an AI badge (assigned_to is null but
    metadata.ai_assignee_role identifies the agent).

    `cascade_depth` tracks how many AI-to-AI delegations have already fired
    in this chain. When the Dev Manager replies and @mentions specialists in
    its body (e.g. "@architect draft the schema"), we fire those specialists
    automatically — so the user sees a real cascading team response instead
    of a Dev Manager that promises work but never delivers. Capped at depth=1
    to prevent runaway ping-pong (Architect → Frontend → Architect loops).

    Wrapped in a broad try/except at the task boundary so a single bad LLM
    response in a fan-out can never silently kill the asyncio task."""
    try:
        role = ROLES.get(role_key)
        if not role:
            return

        # ── Create the AI task in "in_progress" state up front ────────
        # Lets the human team see "AI architect: drafting data model…" in
        # the Tasks panel while the LLM call is still running. Marked done
        # once the reply lands. Skips silently if task creation fails so a
        # bad workspace state never blocks the chat reply.
        ai_task_id = None
        try:
            from datetime import datetime, timezone
            trigger_body = (trigger_msg.get("body") or "").strip()
            # Build a clean title — strip the @-mentions out so it reads naturally.
            clean = re.sub(r"@[a-zA-Z][a-zA-Z0-9_-]{1,32}", "", trigger_body).strip(" ,:.;")
            short = (clean or "Drafted by AI").split("\n", 1)[0]
            if len(short) > 90:
                short = short[:87] + "…"
            ai_task_id = new_id()
            await db.tasks.insert_one({
                "id": ai_task_id,
                "workspace_id": chat["workspace_id"],
                "project_folder_id": chat.get("project_folder_id"),
                "source_chat_id": chat["id"],
                "source_message_id": trigger_msg.get("id"),
                "title": f"AI {role['label']}: {short}",
                "description": trigger_body[:800],
                "assigned_to": None,           # AI agent — no user
                "created_by": trigger_msg.get("sender_id") or "ai-system",
                "due_date": None,
                "priority": "medium",
                "status": "in_progress",
                "metadata": {
                    "ai_assignee_role": role_key,
                    "ai_assignee_label": role["label"],
                    "source": "dev_chat_agent",
                },
                "created_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": None,
                "deleted_at": None,
            })
        except Exception as e:
            logger.warning("[dev-chat] could not create AI task: %s", e)

        text = ""
        async with _typing_pulse(chat["id"]):
            text = await _call_role_llm(role_key, chat, trigger_msg, ctx=ctx)
        body = f"{role['emoji']} **{role['label']}** · {text}"
        msg = {
            "id": new_id(),
            "chat_id": chat["id"],
            "sender_id": f"ai-agent-{role_key}",
            "message_type": "ai-agent",
            "body": body,
            "parent_message_id": trigger_msg.get("id"),
            "metadata": {
                "source": "dev_chat_agent",
                "role": role_key,
                "role_label": role["label"],
                "cascade_depth": cascade_depth,
                "ai_task_id": ai_task_id,
            },
            "reactions": {},
            "created_at": now_iso(),
            "edited_at": None,
            "deleted_at": None,
        }
        await db.messages.insert_one(msg.copy())
        await _broadcast_message(chat["id"], msg)

        # ── Auto-start a Dev OS project on devmgr's first reply ─────
        # If @devmanager is being asked to plan a real product (>40 chars,
        # contains build/create/develop/app/project keywords) AND this chat
        # doesn't already have a linked dev project, create one + trigger
        # an initial build + post a "🚀 Project created · Open Studio →"
        # follow-up message. Closes the chat → studio gap the user asked for.
        if role_key == "devmgr" and cascade_depth == 0:
            try:
                await _maybe_auto_start_project(chat, trigger_msg)
            except Exception as e:
                logger.warning("[dev-chat] auto-start failed: %s", e)

        # ── Mark the task complete now that the agent has shipped ─────
        if ai_task_id:
            try:
                await db.tasks.update_one(
                    {"id": ai_task_id},
                    {"$set": {
                        "status": "completed",
                        "completed_at": now_iso(),
                        "metadata.ai_result_message_id": msg["id"],
                    }},
                )
            except Exception as e:
                logger.warning("[dev-chat] could not mark AI task done: %s", e)

    except Exception as e:
        logger.exception("[dev-chat] post_agent_reply failed for %s: %s", role_key, e)


async def maybe_handle_dev_chat_mentions(chat: Dict[str, Any], trigger_msg: Dict[str, Any]) -> bool:
    """Top-level entry called from /chats/{id}/messages send.

    Returns True if at least one role reply was scheduled. Fires in any chat
    that mentions one of the dev roles by name (`@architect`, `@qa`, etc.) —
    not just `kind=='development'` chats. The `@dev` token itself is still
    a UI-side picker only and is intentionally skipped by `parse_role_mentions`.
    Additionally, in development chats with an active linked project, plain
    actionable messages (no @mention) implicitly route to the Dev Manager.
    Computes chat context ONCE and reuses it across the fan-out.
    """
    roles = parse_role_mentions(trigger_msg.get("body") or "")
    if not roles and _should_implicit_devmgr(chat, trigger_msg):
        # Plain comment in a dev chat with an active project ("i can't read
        # the fonts…") — the dev team is listening, no @mention needed.
        roles = ["devmgr"]
    if not roles:
        return False
    # ── Paywall: @devmanager only works once hired on this chat ─────────
    if not chat.get("dev_team_hired"):
        import asyncio
        clean_ask = re.sub(r"@[\w-]+", "", trigger_msg.get("body") or "").strip()
        if not chat.get("devmgr_teaser_used") and len(clean_ask) >= 15:
            # First-task-free teaser: one short plan preview (no code), then the wall.
            asyncio.create_task(_post_plan_teaser(chat, trigger_msg))
        else:
            await _post_hire_prompt(chat, trigger_msg)
        return True
    # ── Demo-mode rate limit: N builds per rolling hour ─────────────────
    from deps import demo_build_quota
    quota = await demo_build_quota(chat["workspace_id"])
    if quota["is_demo"] and quota["remaining"] <= 0:
        await _post_demo_limit_msg(chat, trigger_msg, quota)
        return True
    import asyncio
    ctx = await _gather_context(chat)   # one shared context for the burst
    try:
        images, file_texts = await _load_attachment_context(trigger_msg, chat["workspace_id"])
        ctx["images"], ctx["file_texts"] = images, file_texts
    except Exception as e:
        logger.warning("[dev-chat] attachment load failed: %s", e)
        ctx["images"], ctx["file_texts"] = [], []
    for r in roles:
        asyncio.create_task(post_agent_reply(chat, r, trigger_msg, ctx=ctx))
    return True


async def _post_hire_prompt(chat: Dict[str, Any], trigger_msg: Dict[str, Any]) -> None:
    """@devmanager is gated behind the one-time hire — post a checkout prompt
    card instead of running any LLM work. Throttled to one card per 2 minutes."""
    import os
    from datetime import datetime, timedelta, timezone
    last = await db.messages.find_one(
        {"chat_id": chat["id"], "metadata.hire_prompt": {"$exists": True}},
        {"_id": 0, "created_at": 1}, sort=[("created_at", -1)],
    )
    if last:
        try:
            ts = datetime.fromisoformat(str(last["created_at"]).replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - ts < timedelta(minutes=2):
                return
        except (ValueError, TypeError):
            pass
    price = float(os.environ.get("HIRE_DEVMANAGER_PRICE_USD", "199"))
    msg = {
        "id": new_id(),
        "chat_id": chat["id"],
        "sender_id": "ai-agent-devmgr",
        "message_type": "ai-agent",
        "body": (
            "🔒 **@devmanager** isn't hired on this chat yet. Hire your AI dev "
            f"manager once (${price:g} one-time, no subscription) and I'll plan, "
            "build, test and ship this for you — right here in the chat."
        ),
        "parent_message_id": trigger_msg.get("id"),
        "metadata": {"source": "dev_chat_agent", "hire_prompt": {"price_usd": price}},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(chat["id"], msg)


async def _post_plan_teaser(chat: Dict[str, Any], trigger_msg: Dict[str, Any]) -> None:
    """First-task-free teaser: one short LLM plan preview (explicitly no code),
    followed by the hire paywall card. Runs at most once per chat."""
    import os
    await db.chats.update_one({"id": chat["id"]}, {"$set": {"devmgr_teaser_used": True}})
    ask = re.sub(r"@[\w-]+", "", trigger_msg.get("body") or "").strip()
    text = ""
    try:
        key = os.environ.get("EMERGENT_LLM_KEY")
        if key:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            llm = LlmChat(
                api_key=key,
                session_id=f"teaser-{chat['id'][:8]}",
                system_message=(
                    "You are @devmanager, an AI dev manager. Produce a SHORT build-plan "
                    "preview in markdown, max 12 lines total: a one-line vision, "
                    "'**Key screens**' (3-4 bullets), '**Data model**' (3-4 entities, one line), "
                    "'**Build phases**' (3 numbered steps with rough timing). "
                    "Never write code. No preamble, no closing questions."
                ),
            ).with_model("openai", "gpt-5.4-mini")
            async with _typing_pulse(chat["id"]):
                text = (await llm.send_message(UserMessage(text=f"The user asked: {ask[:600]}"))).strip()
    except Exception as e:
        logger.warning("[dev-chat] plan teaser LLM failed: %s", e)
    if not text:
        text = (
            f"**Vision** — {ask[:120]}\n\n"
            "**Key screens** — Dashboard · main list + detail views · settings\n\n"
            "**Data model** — Users · core records · activity log\n\n"
            "**Build phases** — 1) Scaffold + auth (minutes) 2) Core flows 3) Polish + QA"
        )
    msg = {
        "id": new_id(),
        "chat_id": chat["id"],
        "sender_id": "ai-agent-devmgr",
        "message_type": "ai-agent",
        "body": (
            "🎬 **Dev Manager** · Free plan preview — here's how I'd build it:\n\n"
            f"{text}\n\n"
            "_This is a preview — no code gets written until you hire me._"
        ),
        "parent_message_id": trigger_msg.get("id"),
        "metadata": {"source": "dev_chat_agent", "role": "devmgr",
                     "role_label": "Dev Manager", "plan_teaser": True},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(chat["id"], msg)
    await _post_hire_prompt(chat, trigger_msg)


async def _post_demo_limit_msg(chat: Dict[str, Any], trigger_msg: Dict[str, Any], quota: dict) -> None:
    """Friendly demo rate-limit notice (throttled to 1 per 2 minutes)."""
    from datetime import datetime, timedelta, timezone
    last = await db.messages.find_one(
        {"chat_id": chat["id"], "metadata.demo_limit": {"$exists": True}},
        {"_id": 0, "created_at": 1}, sort=[("created_at", -1)],
    )
    if last:
        try:
            ts = datetime.fromisoformat(str(last["created_at"]).replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - ts < timedelta(minutes=2):
                return
        except (ValueError, TypeError):
            pass
    msg = {
        "id": new_id(),
        "chat_id": chat["id"],
        "sender_id": "ai-agent-devmgr",
        "message_type": "ai-agent",
        "body": (
            f"⏳ **Demo limit reached** — the demo workspace allows {quota['limit']} AI builds "
            "per hour and they're all used up. The meter resets within the hour, or sign up "
            "for your own free workspace to build without demo limits."
        ),
        "parent_message_id": trigger_msg.get("id"),
        "metadata": {"source": "dev_chat_agent", "demo_limit": {"limit": quota["limit"]}},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(chat["id"], msg)


# ─── Public schema for the frontend (autocomplete) ──────────────────────────
def roles_for_mention_picker() -> List[Dict[str, Any]]:
    """JSON-safe role manifest for the frontend MentionPopover."""
    return [
        {
            "key": "devmgr",
            "trigger": "@devmanager",
            "label": "Dev Manager",
            "desc": "Your whole dev team in one AI — plans, builds, tests & ships",
            "badge": "AI",
            "color": "amber",
            "is_group": False,
        },
    ]


# ─── Auto-start a Dev OS project from a chat ────────────────────────
_PROJECT_KEYWORDS = (
    "build", "create", "develop", "make", "design", "develop", "ship",
    "app", "application", "project", "system", "platform", "tool",
    "website", "site", "service", "product", "mvp", "prototype",
)


from services.dev_chat_ideas import (
    _is_continuation,
    _llm_build_ideas,
    _looks_actionable,
    _post_build_recommendations,
    _strip_leadins,
)


def _should_implicit_devmgr(chat: Dict[str, Any], trigger_msg: Dict[str, Any]) -> bool:
    """Plain (mention-less) messages route to the Dev Manager when this is a
    development chat with an active linked project and the message asks for
    actual work — so 'i can't read the fonts' gets activity, not silence."""
    if chat.get("kind") != "development":
        return False
    if not chat.get("linked_dev_project_id"):
        return False
    if (trigger_msg.get("message_type") or "text") != "text":
        return False
    body = (trigger_msg.get("body") or "").strip()
    if len(body) < 12 or body.startswith("/"):
        return False
    return _looks_actionable(body)


async def _route_as_continuation(
    chat: Dict[str, Any],
    trigger_msg: Dict[str, Any],
    existing_project: Dict[str, Any],
    instruction: str,
    images: Optional[List[bytes]] = None,
    file_texts: Optional[List[tuple]] = None,
) -> None:
    """Apply the user's instruction to the existing project via
    `talk_to_build` with a live step-by-step activity card, then post a
    follow-up CTA + fresh feature recommendations."""
    project_id = existing_project["id"]
    studio_path = f"/dev-os/projects/{project_id}/studio"

    from services.dev_build_activity import (
        add_step, complete_activity, fail_activity, start_activity,
    )
    activity = await start_activity(
        chat["id"], chat["workspace_id"], project_id,
        f"Editing {existing_project.get('name', 'your project')}", kind="edit",
    )

    async def on_step(label: str, icon: str = "⚙️") -> None:
        try:
            await add_step(activity["id"], label, icon)
        except Exception:
            pass

    if file_texts:
        instruction += "\n\nAttached file contents:\n" + "\n".join(
            f"--- {n} ---\n{t}" for n, t in file_texts
        )

    await on_step(
        "Reading your request" + (" + attached screenshot(s)" if images else ""), "🔍",
    )
    try:
        from services.dev_os_codegen import talk_to_build
        async with _typing_pulse(chat["id"]):
            result = await talk_to_build(
                existing_project, instruction,
                on_step=on_step, image_bytes_list=images or None,
            )
    except Exception as e:
        logger.warning("[auto-continuation] talk_to_build failed: %s", e)
        result = {"ok": False, "reason": "error", "summary": str(e)}

    if result.get("ok"):
        changed = result.get("files_changed") or []
        summary = (result.get("summary") or "Applied your edit.").strip()
        await on_step("Capturing preview screenshot", "📸")
        try:
            import asyncio as _aio
            from services.dev_build_activity import attach_screenshot
            from services.dev_smoke import capture_preview_screenshot
            shot = await _aio.wait_for(capture_preview_screenshot(project_id), timeout=25)
            if shot:
                await attach_screenshot(activity["id"], shot)
        except Exception:
            pass
        await on_step("Refreshing live preview", "🚀")
        await complete_activity(activity["id"], summary, changed)
        risky = any(
            ("server.py" in p or "schema" in p or "auth" in p.lower()) for p in changed
        )
        risk_label = "🟡 Needs review — backend/schema touched" if risky else "🟢 Safe change — UI only"
        body = (
            f"✏️ **Continuing {existing_project.get('name', 'your project')}** — "
            f"{summary}\n\n"
            + (f"_Files updated: {', '.join(changed)}_\n" if changed else "")
            + f"_Risk: {risk_label}_\n\n"
            + f"[**Open DevStudio →**]({studio_path}) to review the change "
            f"and iterate. Reply with another edit any time — I'll keep "
            f"refining this project. To start a brand-new project instead, "
            f"ask me to *build / create* something new."
        )
    else:
        await fail_activity(
            activity["id"], result.get("summary") or "Could not apply the edit.",
        )
        body = (
            f"📌 You already have a project linked here — "
            f"**{existing_project.get('name', 'your project')}**.\n\n"
            f"[**Open DevStudio →**]({studio_path}) to continue working on "
            f"it. If you wanted to start a brand-new project, reply with "
            f"the new product idea and I'll spin one up fresh."
        )

    follow_up = {
        "id": new_id(),
        "chat_id": chat["id"],
        "sender_id": "ai-system",
        "message_type": "ai-system",
        "body": body,
        "parent_message_id": trigger_msg.get("id"),
        "metadata": {
            "source": "auto_continuation",
            "project_id": project_id,
            "studio_url": studio_path,
            "cta": {"label": "Open DevStudio", "href": studio_path},
            "files_changed": result.get("files_changed") or [],
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(follow_up.copy())
    await _broadcast_message(chat["id"], follow_up)

    # Make sure the chat's linked_dev_project_id points at this project so
    # the right-rail tabs follow.
    await db.chats.update_one(
        {"id": chat["id"]},
        {"$set": {"linked_dev_project_id": project_id, "updated_at": now_iso()}},
    )

    if result.get("ok"):
        try:
            await _post_build_recommendations(chat, existing_project)
        except Exception as e:
            logger.warning("[auto-continuation] recommendations failed: %s", e)


def _smoke_checks(files: List[Dict[str, Any]]) -> tuple:
    """Fast content sanity checks on the generated bundle → (passed, total)."""
    by_path = {f["path"]: (f.get("content") or "") for f in files}
    checks = [
        "<html" in by_path.get("frontend/index.html", "").lower(),
        len(by_path.get("frontend/app.js", "")) > 80,
        len(by_path.get("frontend/styles.css", "")) > 20,
        "FastAPI" in by_path.get("backend/server.py", ""),
        "CREATE TABLE" in by_path.get("backend/schema.sql", "").upper(),
        "def test_" in by_path.get("tests/test_basic.py", ""),
    ]
    return sum(1 for ok in checks if ok), len(checks)



async def _maybe_auto_start_project(
    chat: Dict[str, Any], trigger_msg: Dict[str, Any],
) -> None:
    """If the user @devmgr'd a real product request, either create a new
    Dev OS project OR edit the most-recent project in this chat (when the
    request looks like a continuation), then post a follow-up message
    with a one-click DevStudio link.

    Behavior changes:
      • iter 72: removed the hard short-circuit when a project already
        exists — multiple projects per chat is a first-class behavior.
        60-second rate-limit per chat still prevents double-tap dupes.
      • iter 73: when an existing project exists and the new request looks
        like a continuation (edit verbs like 'add/change/fix/update/...'
        OR ≥30% token overlap with the existing project's brief), we
        forward the instruction to `talk_to_build` against the existing
        project and post a 'Edits applied' CTA — instead of creating a
        whole new project from scratch.
    """
    if chat.get("related_chat_id"):
        return  # already a dev-chat with its own project
    # Rate-limit: if we already created a project for this chat in the last
    # 60s, don't create another. Prevents double-tap dupes without blocking
    # a deliberate "new idea, new project" later in the same conversation.
    recent_cutoff = (
        datetime.now(timezone.utc) - timedelta(seconds=60)
    ).isoformat()
    too_recent = await db.dev_projects.find_one(
        {
            "workspace_id": chat["workspace_id"],
            "related_chat_id": chat["id"],
            "source": "auto_devmgr",
            "created_at": {"$gte": recent_cutoff},
        },
        {"_id": 0, "id": 1},
    )
    if too_recent:
        return

    body = (trigger_msg.get("body") or "").lower()
    # Strip @-mentions before length check
    stripped = re.sub(r"@[a-zA-Z][a-zA-Z0-9_-]{1,32}", "", body).strip()
    if len(stripped) < 20:
        return

    # Attached screenshots / files feed the build as design + content context.
    try:
        images, file_texts = await _load_attachment_context(trigger_msg, chat["workspace_id"])
    except Exception as e:
        logger.warning("[auto-start] attachment load failed: %s", e)
        images, file_texts = [], []

    # ─── Continuation detection ───────────────────────────────────────
    # Prefer the chat's ACTIVE project pointer (works for projects created
    # via spin-up, templates, or auto_devmgr alike); fall back to the most
    # recent auto_devmgr project for this chat. If the new request looks
    # like an edit/refinement of that project's brief, route through
    # talk_to_build instead of spinning up a parallel project. We check
    # continuation BEFORE the project-keyword gate so prompts like 'add a
    # status column' (which lack words like 'build/create/app') still
    # route correctly.
    proj_fields = {"_id": 0, "id": 1, "name": 1, "description": 1, "plan": 1, "workspace_id": 1}
    latest_existing = None
    linked_id = chat.get("linked_dev_project_id")
    if linked_id:
        latest_existing = await db.dev_projects.find_one(
            {"id": linked_id, "workspace_id": chat["workspace_id"]}, proj_fields,
        )
    if not latest_existing:
        latest_existing = await db.dev_projects.find_one(
            {
                "workspace_id": chat["workspace_id"],
                "related_chat_id": chat["id"],
                "source": "auto_devmgr",
            },
            proj_fields,
            sort=[("created_at", -1)],
        )
    if latest_existing and _is_continuation(stripped, latest_existing):
        await _route_as_continuation(
            chat, trigger_msg, latest_existing, stripped,
            images=images, file_texts=file_texts,
        )
        return

    # New-project gate: must mention what we're building.
    if not any(k in body for k in _PROJECT_KEYWORDS):
        return

    # Derive a short project name from the user's request — first 8 words
    # after the mention, title-cased.
    name_seed = " ".join(stripped.split()[:8]) or "New project"
    name = name_seed[:60].strip(".,;:!").title()

    project_id = new_id()
    project = {
        "id": project_id,
        "workspace_id": chat["workspace_id"],
        "created_by": trigger_msg.get("sender_id") or "ai-system",
        "name": name,
        "description": (trigger_msg.get("body") or "")[:600],
        "target_users": "",
        "problem": "",
        "source": "auto_devmgr",
        "related_chat_id": chat["id"],
        "category": "engineering",
        "plan": {
            "product_brief": (trigger_msg.get("body") or "")[:1000],
            "_llm_status": "stub",
        },
        "status": "draft",
        "version": "v0.1.0",
        "health": "stable",
        "test_coverage": 0,
        "open_proposals": 0,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_projects.insert_one(project.copy())
    await db.chats.update_one(
        {"id": chat["id"]},
        {"$set": {"linked_dev_project_id": project_id, "updated_at": now_iso()}},
    )

    # Post a system message with the studio link.
    studio_path = f"/dev-os/projects/{project_id}/studio"
    follow_up = {
        "id": new_id(),
        "chat_id": chat["id"],
        "sender_id": "ai-system",
        "message_type": "ai-system",
        "body": (
            f"🚀 **Project created** — **{name}**\n\n"
            f"I've spun up a Dev OS project from your request. I'm "
            f"generating a **working** prototype right now (~60s) — login, "
            f"dashboard, and CRUD all live in the preview. "
            f"[**Open DevStudio →**]({studio_path}) to sign in with "
            f"`demo@example.com` / `demo` and iterate with 'Talk to your "
            f"build'.\n\n"
            f"💡 The preview's data lives in the browser (localStorage). "
            f"Your production-ready FastAPI backend with auth, DB and SQL "
            f"schema is already generated alongside — click **Hire Dev Team "
            f"· $599** when you're ready for the AI team to wire it up and "
            f"ship to GitHub + a live deploy."
        ),
        "parent_message_id": trigger_msg.get("id"),
        "metadata": {
            "source": "auto_start_project",
            "project_id": project_id,
            "studio_url": studio_path,
            "cta": {"label": "Open DevStudio", "href": studio_path},
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(follow_up.copy())
    await _broadcast_message(chat["id"], follow_up)

    # Trigger the build asynchronously so files start arriving — with a live
    # Emergent-style activity card streaming each step into the chat.
    try:
        import asyncio
        from services.dev_build_activity import (
            add_step, complete_activity, fail_activity, start_activity,
        )
        from services.dev_os_build import start_mock_build
        from services.dev_os_codegen import generate_project_files

        async def _build():
            activity = await start_activity(
                chat["id"], chat["workspace_id"], project_id,
                f"Building {name}", kind="build",
            )
            build = await start_mock_build(project, requested_by=project["created_by"])
            try:
                await add_step(
                    activity["id"],
                    "Analyzing your request"
                    + (" + attached screenshot(s)" if images else ""),
                    "🔍",
                )
                await add_step(
                    activity["id"],
                    "Planning the app — frontend, API, schema & tests", "📐",
                )

                brief = (project.get("plan") or {}).get("product_brief") or name
                if file_texts:
                    brief += "\n\nAttached file contents:\n" + "\n".join(
                        f"--- {n} ---\n{t}" for n, t in file_texts
                    )

                async def on_progress(i, total, path):
                    await add_step(activity["id"], f"Wrote {path} ({i}/{total})", "✍️")

                files = await generate_project_files(
                    project, brief=brief, on_progress=on_progress,
                    image_bytes_list=images or None,
                )

                await add_step(activity["id"], "Running smoke tests", "🧪")
                try:
                    from services.dev_smoke import run_smoke_checks
                    smoke = await run_smoke_checks(project_id, browser=True)
                    n_ok = sum(1 for c in smoke["checks"] if c["ok"])
                    icon = "✅" if smoke["passed"] else "⚠️"
                    detail = "" if smoke["passed"] else (
                        " — " + "; ".join(f["name"] for f in smoke["failures"][:2])
                    )
                    await add_step(
                        activity["id"],
                        f"Smoke tests · {n_ok}/{len(smoke['checks'])} checks passed{detail}",
                        icon,
                    )
                except Exception:
                    passed, total_checks = _smoke_checks(files)
                    await add_step(
                        activity["id"],
                        f"Smoke tests · {passed}/{total_checks} checks passed", "✅",
                    )
                await add_step(activity["id"], "Capturing preview screenshot", "📸")
                try:
                    from services.dev_build_activity import attach_screenshot
                    from services.dev_smoke import capture_preview_screenshot
                    shot = await asyncio.wait_for(capture_preview_screenshot(project_id), timeout=25)
                    if shot:
                        await attach_screenshot(activity["id"], shot)
                except Exception:
                    pass
                await add_step(activity["id"], "Deploying live preview", "🚀")

                preview_url = f"/api/dev-projects/{project_id}/preview/index.html"
                await db.dev_builds.update_one(
                    {"id": build["id"]},
                    {"$set": {
                        "build_status": "success",
                        "tests_passed": True,
                        "preview_url": preview_url,
                        "files_count": len(files),
                        "build_summary": f"Generated {len(files)} files",
                        "updated_at": now_iso(),
                    }},
                )
                await db.dev_preview_deployments.insert_one({
                    "id": new_id(),
                    "workspace_id": project["workspace_id"],
                    "project_id": project_id,
                    "build_id": build["id"],
                    "preview_url": preview_url,
                    "status": "live",
                    "share_token": new_id().split("-")[0],
                    "created_by": project["created_by"],
                    "created_at": now_iso(),
                    "updated_at": now_iso(),
                })
                await complete_activity(
                    activity["id"],
                    f"Build complete — {len(files)} files generated, "
                    f"{passed}/{total_checks} checks passed. The live preview "
                    f"is ready on the right →",
                    [f["path"] for f in files],
                )
                try:
                    await _post_build_recommendations(chat, project)
                except Exception as e:
                    logger.warning("[auto-start] recommendations failed: %s", e)
            except Exception as e:
                logger.warning("[auto-start] build failed: %s", e)
                try:
                    await fail_activity(activity["id"], f"Build failed: {e}")
                except Exception:
                    pass

        asyncio.create_task(_build())
    except Exception as e:
        logger.warning("[auto-start] could not schedule build: %s", e)
