"""AI research + inline-task background handlers.

Pulled out of server.py so they can be invoked from multiple routers (chats,
ai) without circular imports.
"""
import asyncio
import re
from typing import List, Optional

from ai_service import ask_models_parallel, synthesize_answer
from deps import (
    PROJ,
    _broadcast_message,
    _post_reminder,
    db,
    logger,
    new_id,
    now_iso,
)
from services.billing import (
    can_use_model,
    consume_credits,
    credit_cost_for_model,
)
from services.ai_conversation import (
    FOLLOW_UP_SUGGESTIONS,
    SUMMARY_EVERY_TURNS,
    get_active_session,
    set_session_summary,
    start_or_refresh_session,
    summary_block,
)


_SUMMARY_SYSTEM = (
    "You maintain a concise, structured running summary of an ongoing "
    "conversation between a user and an AI assistant. Keep it under 180 words."
)


async def _refresh_conversation_summary(chat_id: str, user_id: str, history_ctx: str) -> None:
    """Distill the recent conversation into a structured memory carried into
    future follow-up prompts. Fire-and-forget; best-effort."""
    try:
        from ai_service import complete
        prompt = (
            "Summarize the conversation below as compact bullet points under "
            "these headings (omit any that don't apply): Main topic, User goal, "
            "Key decisions, Pending questions, Requested output format, Active "
            "files. Preserve user corrections.\n\n"
            f"{history_ctx}"
        )
        summary = await complete(_SUMMARY_SYSTEM, prompt, model_key="gpt-4o-mini")
        if summary and summary.strip():
            await set_session_summary(chat_id, user_id, summary.strip()[:1500])
    except Exception as e:  # pragma: no cover
        logger.warning("[ai-conv] summary refresh failed: %s", e)



async def _post_ai_error(chat_id: str, thread_id: str, parent_msg_id: Optional[str], reason: str) -> dict:
    """Post a visible error answer so the chat never stays stuck on 'thinking'."""
    await db.ai_threads.update_one(
        {"id": thread_id, "status": {"$ne": "canceled"}}, {"$set": {"status": "error"}}
    )
    msg = {
        "id": new_id(), "chat_id": chat_id, "sender_id": "ai-system",
        "message_type": "ai_answer", "body": f"⚠️ {reason}",
        "parent_message_id": parent_msg_id,
        "metadata": {"thread_id": thread_id, "status": "error", "ai_error": True},
        "reactions": {}, "created_at": now_iso(), "edited_at": None, "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(chat_id, msg)
    return msg


async def _finalize_research(
    thread: dict,
    responses: List[dict],
    chat_id: str,
    parent_msg_id: Optional[str],
    favorite_model: Optional[str] = None,
    compare: bool = False,
    post_to_chat: bool = True,
) -> dict:
    """After all models have responded: auto-pick best, auto-synthesize, and
    (when `post_to_chat`) post the synthesized answer to the shared chat.
    Returns the posted message dict, or None when nothing was posted.

    `post_to_chat=False` is used for PRIVATE discussions: the synthesized answer
    is still stored on the thread (readable via the discussion panel) but is NOT
    broadcast into the shared human timeline.

    If only one model responded, skip synthesis and post that single answer
    directly. Auto-best tie-breaks toward the user's favorite model.

    When `compare=True` (user explicitly asked for a side-by-side via
    `@ai compare …`), the posted body includes EVERY model's answer stacked
    inline so the user sees the full comparison immediately — no extra
    click needed. The synthesized takeaway is still appended at the bottom.
    """

    def _score(r: dict) -> tuple:
        return (
            r.get("confidence_score") or 0,
            1 if (favorite_model and r.get("model_key") == favorite_model) else 0,
            1 if r.get("real") else 0,
        )

    best = max(responses, key=_score, default=None)
    if best:
        await db.ai_responses.update_one(
            {"id": best["id"]}, {"$set": {"selected_as_best": True}}
        )
        best["selected_as_best"] = True

    single_mode = len(responses) <= 1
    if single_mode and best:
        final_synthesis = best.get("answer") or ""
        synthesized_flag = False
    else:
        final_synthesis = await synthesize_answer(
            thread["question"], responses, thread["id"], preferred_best=best
        )
        synthesized_flag = True

    # ── Build the chat-bubble body ────────────────────────────────────
    # In compare mode we stitch every model's answer into one rich body so
    # the user sees the full side-by-side without ever clicking "Show all
    # comparisons". The synthesis is appended at the bottom as a takeaway.
    if compare and not single_mode:
        sections = []
        for r in responses:
            name = r.get("model_name") or r.get("model_key") or "AI"
            answer = (r.get("answer") or "").strip() or "_(no answer)_"
            badge = " ⭐" if best and r.get("id") == best.get("id") else ""
            sections.append(f"### {name}{badge}\n\n{answer}")
        comparison_block = "\n\n---\n\n".join(sections)
        final = (
            f"{comparison_block}\n\n---\n\n"
            f"### 💡 Synthesized takeaway\n\n{final_synthesis}"
        )
    else:
        final = final_synthesis

    # Don't clobber a "canceled" status — if the user hit Stop while this was
    # running, leave it canceled so the guard below discards the answer.
    await db.ai_threads.update_one(
        {"id": thread["id"], "status": {"$ne": "canceled"}},
        {"$set": {
            "status": "complete",
            "final_answer": final_synthesis,
            "auto_synthesized": synthesized_flag,
            "single_model": single_mode,
            "compare_mode": compare,
        }},
    )

    # Compute the credits this question cost so the UI can show "via GPT-4o
    # mini · 2 credits" with no extra round trips.
    credits_total = sum(
        credit_cost_for_model(r.get("model_key") or "")
        for r in responses if r.get("real")
    )
    credits_breakdown = [
        {"model_key": r.get("model_key"), "model_name": r.get("model_name"), "credits": credit_cost_for_model(r.get("model_key") or "")}
        for r in responses if r.get("real")
    ]

    answer_msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "ai_answer",
        "body": final,
        "parent_message_id": parent_msg_id,
        "metadata": {
            "thread_id": thread["id"],
            "models": thread["selected_models"],
            "status": "complete",
            "synthesized": synthesized_flag,
            "auto_synthesized": synthesized_flag,
            "single_model": single_mode,
            "compare_mode": compare,
            "best_model": best["model_name"] if best else None,
            "best_model_key": best["model_key"] if best else None,
            "response_count": len(responses),
            "credits_total": credits_total,
            "credits_breakdown": credits_breakdown,
            "follow_up_suggestions": FOLLOW_UP_SUGGESTIONS,
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    # Final "Stop AI" guard — re-check right before posting so a cancel that
    # landed during generation reliably discards the answer.
    if await _thread_canceled(thread["id"]):
        return None
    if not post_to_chat:
        # Private discussion — answer stays on the thread, not in the chat.
        return None
    await db.messages.insert_one(answer_msg.copy())
    await _broadcast_message(chat_id, answer_msg)
    return answer_msg


async def filter_models_by_credits(workspace_id: str, models: list) -> tuple[list, list]:
    """Return (allowed_models, blocked). `blocked` items: {model_key, reason}."""
    allowed: list = []
    blocked: list = []
    for m in models:
        ok, reason = await can_use_model(workspace_id, m)
        if ok:
            allowed.append(m)
        else:
            blocked.append({"model_key": m, "reason": reason})
    return allowed, blocked


async def deduct_credits_for_responses(
    workspace_id: str, user_id: str, responses: list, source: str = "ai_research",
    chat_id: Optional[str] = None,
) -> int:
    """Charge the workspace for every real (non-mock) model response. Returns
    the total credits deducted."""
    total = 0
    for r in responses:
        if not r.get("real"):
            continue
        cost = credit_cost_for_model(r.get("model_key") or "")
        await consume_credits(
            workspace_id,
            cost,
            source=source,
            model_key=r.get("model_key"),
            user_id=user_id,
            chat_id=chat_id,
            meta={"thread_id": r.get("research_thread_id")},
        )
        total += cost
    return total


async def build_chat_context(chat_id: str, before_iso: Optional[str] = None, limit: int = 16) -> str:
    """Recent conversation transcript for a chat, so inline `@ai` answers are
    context-aware (follow on from what was already discussed). Includes prior
    human messages AND prior AI answers, oldest→newest, PII kept as-is (internal
    team context). Excludes the running placeholder + build-progress noise."""
    q: dict = {
        "chat_id": chat_id,
        "deleted_at": None,
        "message_type": {"$nin": ["ai_question", "build_progress"]},
    }
    if before_iso:
        q["created_at"] = {"$lt": before_iso}
    rows = await db.messages.find(
        q, {"_id": 0, "sender_id": 1, "body": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(limit)
    rows.reverse()
    if not rows:
        return ""

    human_ids = {r["sender_id"] for r in rows if not str(r["sender_id"]).startswith("ai")}
    names: dict = {}
    if human_ids:
        async for u in db.users.find({"id": {"$in": list(human_ids)}}, {"_id": 0, "id": 1, "name": 1}):
            names[u["id"]] = u.get("name") or "Teammate"

    lines: List[str] = []
    for r in rows:
        body = (r.get("body") or "").strip()
        if not body:
            continue
        who = "AI" if str(r["sender_id"]).startswith("ai") else names.get(r["sender_id"], "Teammate")
        lines.append(f"{who}: {body[:600]}")
    return "\n".join(lines)


async def gather_recent_attachments(
    chat_id: str, before_iso: Optional[str] = None, limit_msgs: int = 30, max_files: int = 6,
) -> List[dict]:
    """Collect file attachments from recent messages in the chat (newest first,
    deduped by file id) so `@ai` can answer about documents uploaded in
    *earlier* messages — not just the one carrying the question."""
    q: dict = {"chat_id": chat_id, "deleted_at": None,
               "metadata.attachments": {"$exists": True, "$ne": []}}
    if before_iso:
        q["created_at"] = {"$lte": before_iso}
    rows = await db.messages.find(
        q, {"_id": 0, "metadata": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(limit_msgs)
    seen: set = set()
    out: List[dict] = []
    for r in rows:
        for a in (r.get("metadata") or {}).get("attachments") or []:
            fid = a.get("id") or a.get("file_id")
            if not fid or fid in seen:
                continue
            seen.add(fid)
            out.append(a)
            if len(out) >= max_files:
                return out
    return out


async def _thread_canceled(thread_id: str) -> bool:
    """True if the user hit 'Stop AI' for this thread while it was running."""
    t = await db.ai_threads.find_one({"id": thread_id}, {"_id": 0, "status": 1})
    return bool(t and t.get("status") == "canceled")


async def handle_ai_command(
    chat_id: str, user_id: str, question: str, models: List[str],
    compare: bool = False, attachments: Optional[List[dict]] = None,
):
    """Background entry-point for inline `@AI ...` commands in chat messages.

    `compare=True` means the user explicitly asked for a side-by-side view
    (`@ai compare …` / `@ai show comparison …`). When that's set we render
    every model's answer inline in the chat bubble — no extra click needed
    to see the comparison.

    `attachments` is the message's `metadata.attachments` list. When present we
    extract text from documents (pdf/docx/xlsx/csv/txt/json/md/pptx) and pass
    images to vision-capable models, so the AI can *research the data in the
    attached files*. The displayed question stays clean; only the model prompt
    is augmented with the extracted content.
    """
    user = await db.users.find_one({"id": user_id}, PROJ)
    favorite = (user or {}).get("preferences", {}).get("favorite_ai_model")
    workspace_id = (user or {}).get("workspace_id")

    # Manual "remember this" — store a durable memory, no model call.
    _q = question.strip()
    if re.match(r"(?i)^remember\b", _q):
        from services import learned_memory as _lm
        fact = re.sub(r"(?i)^remember( that| this)?\s*[:,-]?\s*", "", _q).strip()
        saved = await _lm.remember(workspace_id, user_id, fact, scope="personal", source="manual") if fact else None
        body = (f"Got it — I'll remember that: \"{fact}\"." if saved
                else "Tell me what to remember, e.g. \"@ai remember I prefer short answers\".")
        msg = {
            "id": new_id(), "chat_id": chat_id, "sender_id": "ai-system",
            "message_type": "ai_answer", "body": body, "parent_message_id": None,
            "metadata": {"memory_saved": bool(saved)}, "reactions": {},
            "created_at": now_iso(), "edited_at": None, "deleted_at": None,
        }
        await db.messages.insert_one(msg.copy())
        await _broadcast_message(chat_id, msg)
        return
    # ===== Per-chat AI Billing & Permissions gate =====
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if chat and user:
        from routes.chat_ai_settings import check_ai_allowed as _chk
        gate = await _chk(chat, user, estimated_credits=20)
        if not gate["allowed"]:
            msg = {
                "id": new_id(), "chat_id": chat_id, "sender_id": "ai-system",
                "message_type": "ai_answer", "body": f"⚠️ {gate['reason']}",
                "parent_message_id": None,
                "metadata": {"ai_blocked": True, "reason": gate["reason"]},
                "reactions": {}, "created_at": now_iso(),
                "edited_at": None, "deleted_at": None,
            }
            await db.messages.insert_one(msg.copy())
            await _broadcast_message(chat_id, msg)
            return
        # Apply per-chat feature toggles.
        settings = gate["settings"]
        premium_keys = {"chatgpt", "gpt-4o", "claude", "claude-sonnet", "claude-opus", "perplexity", "grok"}
        if not settings.get("premium_models_enabled", True):
            models = [m for m in models if m not in premium_keys]
        if not settings.get("multi_model_compare_enabled", True) and len(models) > 1:
            models = models[:1]
    # Filter out models the workspace can't afford
    allowed_models, blocked = await filter_models_by_credits(workspace_id, models) if workspace_id else (models, [])
    if not allowed_models:
        # No model can run — drop a friendly upgrade nudge in chat instead.
        msg = {
            "id": new_id(),
            "chat_id": chat_id,
            "sender_id": "ai-system",
            "message_type": "ai_answer",
            "body": (
                "**AI credits exhausted** for this workspace. Upgrade your plan "
                "from the Billing page to keep using premium models, or wait "
                "until your monthly allowance resets."
            ),
            "parent_message_id": None,
            "metadata": {"upgrade_required": True, "blocked": blocked},
            "reactions": {},
            "created_at": now_iso(),
            "edited_at": None,
            "deleted_at": None,
        }
        await db.messages.insert_one(msg.copy())
        await _broadcast_message(chat_id, msg)
        return
    thread = {
        "id": new_id(),
        "chat_id": chat_id,
        "question": question,
        "created_by": user_id,
        "selected_models": allowed_models,
        "final_answer": None,
        "status": "running",
        "votes": {},
        "public_token": None,
        "created_at": now_iso(),
    }
    await db.ai_threads.insert_one(thread.copy())

    placeholder = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "ai_question",
        "body": question,
        "parent_message_id": None,
        "metadata": {
            "thread_id": thread["id"],
            "models": allowed_models,
            "blocked": blocked,
            "status": "running",
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(placeholder.copy())
    await _broadcast_message(chat_id, placeholder)

    # ── Attachment research: extract document text + collect images ──────
    # Documents are inlined into the model prompt; images go to vision-capable
    # models. The stored thread/placeholder question stays clean for display.
    prompt_question = question
    # Personalized memory + conversation memory — ground every inline @ai answer.
    from services import learned_memory as _lm
    mem_block = await _lm.build_memory_profile_block(workspace_id, user_id)
    history_ctx = await build_chat_context(chat_id, placeholder["created_at"])
    conv_summary = summary_block(await get_active_session(chat_id, user_id))
    prefix = []
    if mem_block:
        prefix.append(mem_block)
    if conv_summary:
        prefix.append(conv_summary)
    if history_ctx:
        prefix.append(
            "[Conversation so far in this chat — use it as context to give a coherent, "
            "context-aware answer that follows on from what was already discussed. "
            "Resolve references like 'it', 'that', 'the previous one' against this history.]\n"
            f"{history_ctx}")
    if prefix:
        prompt_question = "\n\n".join(prefix) + f"\n\n[Current question]\n{question}"
    # Knowledge sources attached to this chat (e.g. an uploaded ZIP) — inject the
    # most relevant excerpts so @ai can answer over their contents.
    kctx = None
    try:
        from services.knowledge_search import knowledge_context
        kctx = await knowledge_context(chat_id, question)
        if kctx:
            prompt_question = f"{prompt_question}\n\n{kctx}"
    except Exception as e:
        logger.warning("[ai] knowledge context failed: %s", e)
    image_bytes: Optional[list] = None
    # Merge attachments on THIS message with documents uploaded earlier in the
    # chat, so questions like "what's the expiry date on the doc I sent?" work.
    merged_attachments: List[dict] = list(attachments or [])
    _seen_ids = {(a.get("id") or a.get("file_id")) for a in merged_attachments}
    try:
        for a in await gather_recent_attachments(chat_id, placeholder["created_at"]):
            fid = a.get("id") or a.get("file_id")
            if fid and fid not in _seen_ids:
                _seen_ids.add(fid)
                merged_attachments.append(a)
    except Exception as e:
        logger.warning("[ai] gather recent attachments failed: %s", e)
    if merged_attachments:
        try:
            from services.file_extract import extract_attachments
            extracted = await extract_attachments(merged_attachments, workspace_id)
            if extracted.get("text"):
                doc_text = extracted["text"]
                if len(doc_text) > 24000:   # keep the prompt within budget
                    doc_text = doc_text[:24000] + "\n…[truncated]"
                prompt_question = (
                    f"{prompt_question}\n\n"
                    "[Attached & previously-shared file contents in this chat — use these to "
                    "answer the question. Cite the file name when relevant.]\n"
                    f"{doc_text}"
                )
            if extracted.get("images"):
                image_bytes = extracted["images"]
        except Exception as e:
            logger.warning("[ai] attachment extraction failed: %s", e)

    responses = await ask_models_parallel(
        prompt_question, allowed_models, thread["id"], image_bytes_list=image_bytes,
    )
    # ── "Stop AI" checkpoint ─────────────────────────────────────────────
    # If the user hit Stop while the models were running, discard the result:
    # don't store responses, don't charge credits, don't post an answer. The
    # placeholder is already soft-deleted by the /ai/stop endpoint.
    if await _thread_canceled(thread["id"]):
        logger.info("[ai] thread %s canceled by user — discarding result", thread["id"])
        await db.messages.update_one(
            {"id": placeholder["id"], "deleted_at": None},
            {"$set": {"deleted_at": now_iso()}},
        )
        return
    for r in responses:
        r["id"] = new_id()
        r["research_thread_id"] = thread["id"]
        r["votes"] = {"best": [], "most_accurate": [], "best_citations": [], "most_useful": []}
        r["selected_as_best"] = False
        r["created_at"] = now_iso()
        await db.ai_responses.insert_one(r.copy())

    if workspace_id:
        await deduct_credits_for_responses(workspace_id, user_id, responses, source="ai_inline", chat_id=chat_id)
        # Per-chat usage ledger.
        from routes.chat_ai_settings import record_ai_usage as _rec
        for r in responses:
            if not r.get("real"):
                continue
            await _rec(
                chat_id=chat_id, user_id=user_id,
                credits=credit_cost_for_model(r.get("model_key") or ""),
                model=r.get("model_key"), workflow="inline",
                project_folder_id=(chat or {}).get("project_folder_id"),
            )

    try:
        answer_msg = await _finalize_research(
            thread, responses, chat_id, placeholder["id"],
            favorite_model=favorite, compare=compare,
        )
    except Exception as e:
        logger.exception("[ai] finalize failed: %s", e)
        answer_msg = await _post_ai_error(
            chat_id, thread["id"], placeholder["id"],
            "I hit an error composing the final answer. Please try again.",
        )

    # Canceled during finalize — answer was discarded; skip session/learning.
    if answer_msg is None:
        await db.messages.update_one(
            {"id": placeholder["id"], "deleted_at": None},
            {"$set": {"deleted_at": now_iso()}},
        )
        return

    # Mirror the answer into Slack (opt-in per workspace via Connectors).
    try:
        from services.bg import fire_and_forget
        from services import slack_service
        fire_and_forget(slack_service.notify_ai_answer(
            workspace_id, chat, question,
            (answer_msg or {}).get("body"), used_knowledge=bool(kctx),
        ))
    except Exception as e:
        logger.warning("[ai] slack mirror failed: %s", e)

    # AI Conversation Mode — keep (or start) this user's AI session so their
    # next follow-up routes to the assistant without another @ai mention.
    try:
        sess = await start_or_refresh_session(
            workspace_id=workspace_id,
            chat_id=chat_id,
            user_id=user_id,
            assistant_id="ai",
            latest_ai_message_id=answer_msg["id"] if answer_msg else None,
            thread_id=thread["id"],
            topic=(question or "")[:120],
            selected_models=allowed_models,
        )
        # Rolling summary — every few turns, distill the conversation into a
        # structured memory the assistant carries forward (Phase 2).
        if sess and sess.get("answer_count", 0) % SUMMARY_EVERY_TURNS == 0 and history_ctx:
            asyncio.create_task(_refresh_conversation_summary(chat_id, user_id, history_ctx))
    except Exception as e:
        logger.warning("[ai-conv] session refresh failed: %s", e)

    # Auto-learn durable facts/preferences from this exchange (fire-and-forget).
    if workspace_id:
        from services.bg import fire_and_forget
        fire_and_forget(_lm.extract_and_store(workspace_id, user_id, question, history_ctx or ""))


async def handle_inline_task(chat_id: str, creator: dict, source_msg_id: str, cmd: dict):
    try:
        await _do_inline_task(chat_id, creator, source_msg_id, cmd)
    except Exception as e:
        logger.exception("[inline-task] failed: %s", e)


async def _do_inline_task(chat_id: str, creator: dict, source_msg_id: str, cmd: dict):
    assignee_id = None
    assignee_name = None
    if cmd.get("assignee_name"):
        wanted = cmd["assignee_name"].lower().strip()
        members = await db.users.find(
            {"workspace_id": creator["workspace_id"]}, PROJ
        ).to_list(1000)
        for m in members:
            if m["name"].lower() == wanted:
                assignee_id, assignee_name = m["id"], m["name"]
                break
        if not assignee_id:
            for m in members:
                if m["name"].lower().startswith(wanted) or wanted in m["name"].lower():
                    assignee_id, assignee_name = m["id"], m["name"]
                    break

    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    task = {
        "id": new_id(),
        "workspace_id": creator["workspace_id"],
        "project_folder_id": chat.get("project_folder_id") if chat else None,
        "source_chat_id": chat_id,
        "source_message_id": source_msg_id,
        "title": cmd["title"],
        "description": f"Auto-created from chat by {creator['name']}.",
        "assigned_to": assignee_id,
        "created_by": creator["id"],
        "due_date": cmd.get("due_date"),
        "priority": cmd.get("priority", "medium"),
        "status": "todo",
        "created_at": now_iso(),
        "completed_at": None,
    }
    await db.tasks.insert_one(task.copy())

    parts = [f"Task created: \"{task['title']}\""]
    if assignee_name:
        parts.append(f"assigned to {assignee_name}")
    if task.get("due_date"):
        parts.append(f"due {task['due_date'][:10]}")
    parts.append(f"priority {task['priority']}")
    confirm_body = " · ".join(parts) + "."
    confirm = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "task",
        "body": confirm_body,
        "parent_message_id": source_msg_id,
        "metadata": {"task_id": task["id"]},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(confirm.copy())
    await _broadcast_message(chat_id, confirm)

    if assignee_id:
        due_text = f" Due {task['due_date'][:10]}." if task.get("due_date") else ""
        await _post_reminder(
            assignee_id,
            f'You have been assigned: "{task["title"]}".{due_text}',
            task,
        )
