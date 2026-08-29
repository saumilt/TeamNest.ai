"""AI research, voting, synthesis, polish, task extraction, model list."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from ai_service import (
    MODEL_CONFIG,
    ask_models_parallel,
    complete,
    extract_task,
    improve_message,
    suggest_tasks,
    synthesize_answer,
)
from deps import (
    PROJ,
    _broadcast_message,
    db,
    logger,
    new_id,
    now_iso,
    require_user,
)
from models import (
    AIExtractTaskRequest,
    AIImproveRequest,
    AIResearchCreate,
    AISuggestTasksRequest,
    AIVote,
    RunModelsRequest,
    ThreadPublishRequest,
    ThreadVisibilityUpdate,
)
from services.ai_runtime import (
    _finalize_research,
    deduct_credits_for_responses,
    filter_models_by_credits,
)
from services.billing import get_usage, is_comparison_allowed
from routes.chat_ai_settings import check_ai_allowed, record_ai_usage
from services.memory_rag import (
    build_rag_context,
    format_memory_sources,
    record_memory,
    retrieve_memory,
)
from storage import get_object

router = APIRouter()

PREMIUM_MODEL_KEYS = {"chatgpt", "gpt-4o", "claude", "claude-sonnet", "claude-opus", "perplexity", "grok"}


async def _gate_research_models(chat, current, payload):
    """Apply per-chat AI permission + feature toggles and credit gating.

    Returns (allowed_models, blocked); raises HTTPException when disallowed.
    """
    gate = await check_ai_allowed(chat, current, estimated_credits=20)
    if not gate["allowed"]:
        raise HTTPException(403, gate["reason"])

    settings = gate["settings"]
    requested = list(payload.selected_models or [])
    if not settings.get("premium_models_enabled", True):
        requested = [m for m in requested if m not in PREMIUM_MODEL_KEYS]
        if not requested:
            raise HTTPException(403, "Premium models are disabled for this group.")
    if not settings.get("multi_model_compare_enabled", True) and len(requested) > 1:
        requested = requested[:1]

    # Paid-only gate: multi-model comparison requires a paid (Pro/Team) or
    # unlimited workspace. Free-plan users still get the single AI answer, so
    # silently cap the request to one model instead of erroring.
    if len(requested) > 1 and not await is_comparison_allowed(current["workspace_id"]):
        requested = requested[:1]

    allowed_models, blocked = await filter_models_by_credits(
        current["workspace_id"], requested
    )
    if not allowed_models:
        raise HTTPException(
            402,
            "AI credits exhausted. Upgrade your plan from the Billing page "
            "or wait until your monthly allowance resets.",
        )
    return allowed_models, blocked


async def _build_research_context(payload, chat, current):
    """Retrieve memory context + image bytes and build the enriched prompt.

    Returns (memory_mode, memory_items, image_bytes_list, enriched_question).
    """
    memory_mode = payload.memory_mode or "chat"
    memory_items = await retrieve_memory(
        workspace_id=current["workspace_id"],
        query=payload.question,
        chat_id=payload.chat_id,
        project_folder_id=chat.get("project_folder_id"),
        mode=memory_mode,  # type: ignore[arg-type]
        selected_ids=payload.selected_memory_ids,
        limit=4,  # reduced from 8 → keeps context tight + ~30% faster
        user_role=current.get("role"),
    )
    enriched_question = payload.question
    if memory_items:
        enriched_question = (
            f"{build_rag_context(memory_items)}\n\n"
            f"=== Current question ===\n{payload.question}"
        )

    # Vision — load image bytes from uploaded files (same workspace only).
    image_bytes_list = []
    if payload.image_file_ids:
        ids = payload.image_file_ids[:4]  # cap to avoid runaway token costs
        cursor = db.files.find(
            {
                "id": {"$in": ids},
                "workspace_id": current["workspace_id"],
                "is_deleted": False,
                "is_image": True,
            },
            {"_id": 0, "storage_path": 1, "id": 1},
        )
        async for rec in cursor:
            try:
                data, _ = get_object(rec["storage_path"])
                image_bytes_list.append(data)
            except Exception as e:
                logger.warning("Failed to load image %s for AI: %s", rec.get("id"), e)
        if image_bytes_list and not payload.question.strip():
            enriched_question = (
                enriched_question
                or "Describe and analyze the attached image(s) in detail."
            )
    return memory_mode, memory_items, image_bytes_list, enriched_question


async def _persist_research_question(
    payload, current, allowed_models, blocked, memory_mode, memory_items, image_bytes_list
):
    """Insert the question message + research thread, broadcast, return (q_msg, thread)."""
    q_msg = {
        "id": new_id(),
        "chat_id": payload.chat_id,
        "sender_id": current["id"],
        "message_type": "ai_question",
        "body": payload.question,
        "parent_message_id": None,
        "metadata": {
            "models": allowed_models,
            "blocked": blocked,
            "status": "running",
            "memory_mode": memory_mode,
            "memory_sources_count": len(memory_items),
            "image_count": len(image_bytes_list),
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(q_msg.copy())

    thread = {
        "id": new_id(),
        "chat_id": payload.chat_id,
        "question": payload.question,
        "title": (getattr(payload, "title", None) or payload.question).strip()[:80],
        "created_by": current["id"],
        "selected_models": allowed_models,
        "final_answer": None,
        "status": "running",
        "votes": {},
        "public_token": None,
        "memory_mode": memory_mode,
        "memory_source_ids": [m["id"] for m in memory_items],
        "linked_human_message_id": getattr(payload, "linked_message_id", None),
        # New individual research (started from a message) is Private by default;
        # in-chat research keeps sharing with the chat. Creator can change later.
        "visibility": "private" if getattr(payload, "linked_message_id", None) else "chat",
        "created_at": now_iso(),
    }
    await db.ai_threads.insert_one(thread.copy())

    await db.messages.update_one(
        {"id": q_msg["id"]}, {"$set": {"metadata.thread_id": thread["id"]}}
    )
    q_msg["metadata"]["thread_id"] = thread["id"]
    await _broadcast_message(payload.chat_id, q_msg)
    return q_msg, thread


async def _record_research_usage(payload, current, chat, responses):
    """Per-chat usage ledger for AI Billing & Permissions reports."""
    from services.billing import credit_cost_for_model as _cc
    for r in responses:
        if not r.get("real"):
            continue
        await record_ai_usage(
            chat_id=payload.chat_id,
            user_id=current["id"],
            credits=_cc(r.get("model_key") or ""),
            model=r.get("model_key"),
            workflow="research",
            project_folder_id=chat.get("project_folder_id"),
        )


async def _record_research_memory(payload, current, chat, thread):
    """Auto-record the completed thread as retrievable memory."""
    final_thread = await db.ai_threads.find_one({"id": thread["id"]}, {"_id": 0})
    if final_thread and final_thread.get("final_answer"):
        await record_memory(
            workspace_id=current["workspace_id"],
            source_type="ai_thread",
            source_id=thread["id"],
            raw_content=f"Q: {payload.question}\n\nA: {final_thread['final_answer']}",
            chat_id=payload.chat_id,
            project_folder_id=chat.get("project_folder_id"),
            title=payload.question[:140],
            memory_type="research",
            visibility="chat",
            created_by=current["id"],
        )


@router.post("/ai/research")
async def create_research(payload: AIResearchCreate, current=Depends(require_user)):
    chat = await db.chats.find_one({"id": payload.chat_id, "member_ids": current["id"]})
    if not chat:
        raise HTTPException(404, "Chat not found")

    allowed_models, blocked = await _gate_research_models(chat, current, payload)
    memory_mode, memory_items, image_bytes_list, enriched_question = (
        await _build_research_context(payload, chat, current)
    )
    # When the discussion is started from a specific human message, seed that
    # message as context for the models (kept out of the stored question).
    if payload.linked_message_id:
        src = await db.messages.find_one(
            {"id": payload.linked_message_id, "chat_id": payload.chat_id},
            {"_id": 0, "body": 1},
        )
        if src and src.get("body"):
            enriched_question = (
                f'Context — a teammate wrote:\n"{src["body"]}"\n\n'
                f"Question: {enriched_question}"
            )
    q_msg, thread = await _persist_research_question(
        payload, current, allowed_models, blocked,
        memory_mode, memory_items, image_bytes_list,
    )

    responses = await ask_models_parallel(
        enriched_question,
        allowed_models,
        thread["id"],
        image_bytes_list=image_bytes_list or None,
    )
    for r in responses:
        r["id"] = new_id()
        r["research_thread_id"] = thread["id"]
        r["votes"] = {"best": [], "most_accurate": [], "best_citations": [], "most_useful": []}
        r["selected_as_best"] = False
        r["created_at"] = now_iso()
        await db.ai_responses.insert_one(r.copy())

    await deduct_credits_for_responses(
        current["workspace_id"], current["id"], responses, source="ai_research",
        chat_id=payload.chat_id,
    )

    await _record_research_usage(payload, current, chat, responses)

    is_private = bool(thread.get("visibility") and thread["visibility"] != "chat")

    await _finalize_research(
        thread,
        responses,
        payload.chat_id,
        q_msg["id"],
        favorite_model=(current.get("preferences") or {}).get("favorite_ai_model"),
        post_to_chat=not is_private,
    )

    # Only feed shared (chat-visible) research into chat memory/RAG.
    if not is_private:
        await _record_research_memory(payload, current, chat, thread)

    out = await get_research(thread["id"], current)
    out["usage"] = await get_usage(current["workspace_id"])
    out["blocked_models"] = blocked
    out["memory_sources"] = format_memory_sources(memory_items)
    out["memory_mode"] = memory_mode
    return out


async def _thread_access(thread: dict, user: dict) -> bool:
    """Can `user` view this discussion? Creator always; 'chat' → any chat
    member; 'shared' → explicit permission; 'private' → creator only."""
    if not thread:
        return False
    if thread.get("created_by") == user["id"]:
        return True
    vis = thread.get("visibility") or "chat"
    if vis == "chat":
        chat = await db.chats.find_one(
            {"id": thread["chat_id"], "member_ids": user["id"]}, {"_id": 0, "id": 1}
        )
        return bool(chat)
    if vis == "shared":
        perm = await db.ai_discussion_permissions.find_one(
            {"discussion_id": thread["id"], "user_id": user["id"]}, {"_id": 0, "id": 1}
        )
        return bool(perm)
    return False  # private


@router.get("/ai/research/{thread_id}")
async def get_research(thread_id: str, current=Depends(require_user)):
    thread = await db.ai_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Thread not found")
    if not await _thread_access(thread, current):
        raise HTTPException(403, "You don't have access to this discussion")
    responses = await db.ai_responses.find(
        {"research_thread_id": thread_id}, {"_id": 0}
    ).to_list(20)
    return {"thread": thread, "responses": responses}


PUBLISH_HEADERS = {
    "executive_summary": "AI Research — Executive Summary",
    "recommendation": "AI Research — Recommendation",
    "key_findings": "AI Research — Key Findings",
    "action_items": "AI Research — Action Items",
    "risks": "AI Research — Risks",
    "custom": "AI Research Summary",
}

_PUBLISH_PROMPTS = {
    "executive_summary": "Write a tight executive summary (3-5 sentences).",
    "recommendation": "State the single clearest recommendation, then 2-4 bullet reasons.",
    "key_findings": "List the 3-6 most important findings as concise bullets.",
    "action_items": "List concrete next-step action items as a checklist (- [ ] …).",
    "risks": "List the key risks / caveats as concise bullets.",
}


async def _summarize_for_publish(ptype: str, question: str, answer: str) -> str:
    """Condense an AI discussion's final answer into the chosen publish format."""
    instruction = _PUBLISH_PROMPTS.get(ptype, _PUBLISH_PROMPTS["executive_summary"])
    prompt = (
        f"{instruction}\n\nKeep it short, skimmable and in Markdown. Do not add a "
        f"title/header (the app adds one). Base it ONLY on the research below.\n\n"
        f"Question: {question}\n\nResearch answer:\n{answer}"
    )
    try:
        return (await complete(
            "You turn AI research into a concise, publishable team update.",
            prompt,
            model_key="gpt-4o-mini",
        )).strip()
    except Exception:
        # Fall back to a trimmed excerpt so publish never hard-fails.
        return (answer or "").strip()[:800]


@router.patch("/ai/threads/{thread_id}/visibility")
async def set_thread_visibility(
    thread_id: str, payload: ThreadVisibilityUpdate, current=Depends(require_user)
):
    thread = await db.ai_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Thread not found")
    if thread.get("created_by") != current["id"]:
        raise HTTPException(403, "Only the creator can change visibility")
    await db.ai_threads.update_one(
        {"id": thread_id}, {"$set": {"visibility": payload.visibility}}
    )
    await db.ai_discussion_permissions.delete_many({"discussion_id": thread_id})
    if payload.visibility == "shared":
        from routes.notifications_feed import create_notification
        for uid in payload.shared_user_ids or []:
            await db.ai_discussion_permissions.insert_one({
                "id": new_id(),
                "discussion_id": thread_id,
                "user_id": uid,
                "access_level": "read",
                "granted_by": current["id"],
                "created_at": now_iso(),
            })
            await create_notification(
                uid,
                "ai_discussion_shared",
                "AI discussion shared with you",
                f'{current.get("name", "A teammate")} shared "{thread.get("title") or "an AI discussion"}"',
                meta={"thread_id": thread_id, "chat_id": thread.get("chat_id")},
                category="ai",
            )
    return {"ok": True, "visibility": payload.visibility}


@router.post("/ai/threads/{thread_id}/publish")
async def publish_thread(
    thread_id: str, payload: ThreadPublishRequest, current=Depends(require_user)
):
    thread = await db.ai_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Thread not found")
    if not await _thread_access(thread, current):
        raise HTTPException(403, "You don't have access to this discussion")
    answer = thread.get("final_answer") or ""
    if payload.publication_type == "custom":
        summary = (payload.custom_text or "").strip()
    else:
        summary = await _summarize_for_publish(
            payload.publication_type, thread.get("question", ""), answer
        )
    if not summary:
        raise HTTPException(400, "Nothing to publish yet")
    header = PUBLISH_HEADERS.get(payload.publication_type, "AI Research Summary")
    msg = {
        "id": new_id(),
        "chat_id": thread["chat_id"],
        "sender_id": current["id"],
        "message_type": "text",
        "body": f"**{header}**\n\n{summary}",
        "parent_message_id": None,
        "metadata": {
            "ai_publication": {
                "thread_id": thread_id,
                "type": payload.publication_type,
                "title": thread.get("title"),
            }
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(thread["chat_id"], msg)
    await db.ai_publications.insert_one({
        "id": new_id(),
        "discussion_id": thread_id,
        "chat_message_id": msg["id"],
        "published_by": current["id"],
        "publication_type": payload.publication_type,
        "selected_content": summary,
        "created_at": now_iso(),
    })
    return msg


@router.post("/ai/threads/{thread_id}/save-knowledge")
async def save_thread_knowledge(thread_id: str, current=Depends(require_user)):
    thread = await db.ai_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Thread not found")
    if not await _thread_access(thread, current):
        raise HTTPException(403, "You don't have access to this discussion")
    item = await record_memory(
        workspace_id=current["workspace_id"],
        source_type="ai_thread_knowledge",
        source_id=thread_id,
        raw_content=f"Q: {thread.get('question','')}\n\nA: {thread.get('final_answer','')}",
        created_by=current["id"],
        chat_id=thread.get("chat_id"),
        title=thread.get("title"),
        memory_type="insight",
        visibility="workspace",
    )
    return {"ok": True, "saved": bool(item)}


async def _run_extra_models(thread_id, question, models, workspace_id, user_id, chat):
    """Background: run additional models on a thread, persist responses, bill.

    Does NOT re-synthesize or post a new chat message — the comparison is shown
    inline; synthesis happens only when the user explicitly requests it.
    """
    from services.billing import credit_cost_for_model as _cc

    try:
        responses = await ask_models_parallel(question, models, thread_id)
        for r in responses:
            r["id"] = new_id()
            r["research_thread_id"] = thread_id
            r["votes"] = {"best": [], "most_accurate": [], "best_citations": [], "most_useful": []}
            r["selected_as_best"] = False
            r["created_at"] = now_iso()
            await db.ai_responses.insert_one(r.copy())

        await deduct_credits_for_responses(workspace_id, user_id, responses, source="ai_research", chat_id=chat.get("id"))
        for r in responses:
            if not r.get("real"):
                continue
            await record_ai_usage(
                chat_id=chat["id"],
                user_id=user_id,
                credits=_cc(r.get("model_key") or ""),
                model=r.get("model_key"),
                workflow="research",
                project_folder_id=chat.get("project_folder_id"),
            )
    except Exception as e:
        logger.exception("run_extra_models failed for thread %s: %s", thread_id, e)
    finally:
        await db.ai_threads.update_one({"id": thread_id}, {"$set": {"status": "complete"}})


@router.post("/ai/research/{thread_id}/run-models")
async def run_models(
    thread_id: str,
    payload: RunModelsRequest,
    background: BackgroundTasks,
    current=Depends(require_user),
):
    """Add & run more models on an existing thread. Idempotent: models that
    already have a response are skipped. Runs in the background; the client
    polls GET /ai/research/{id} to see them appear (skeletons → answers)."""
    thread = await db.ai_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Thread not found")
    chat = await db.chats.find_one({"id": thread["chat_id"], "member_ids": current["id"]})
    if not chat:
        raise HTTPException(404, "Chat not found")

    # Paid-only gate: running multiple models to compare is a Pro/Team feature.
    if not await is_comparison_allowed(current["workspace_id"]):
        raise HTTPException(
            402,
            {
                "code": "comparison_paid_only",
                "message": "Multi-model AI comparison is a Pro/Team feature. "
                "Upgrade from the Billing page to compare models.",
            },
        )

    existing_docs = await db.ai_responses.find(
        {"research_thread_id": thread_id}, {"model_key": 1, "_id": 0}
    ).to_list(50)
    existing = {d.get("model_key") for d in existing_docs}
    requested = [m for m in (payload.selected_models or []) if m in MODEL_CONFIG and m not in existing]
    if not requested:
        return await get_research(thread_id, current)

    gate = await check_ai_allowed(chat, current, estimated_credits=20)
    if not gate["allowed"]:
        raise HTTPException(403, gate["reason"])
    if not gate["settings"].get("premium_models_enabled", True):
        requested = [m for m in requested if m not in PREMIUM_MODEL_KEYS]
    if not requested:
        return await get_research(thread_id, current)

    allowed_models, blocked = await filter_models_by_credits(current["workspace_id"], requested)
    if not allowed_models:
        raise HTTPException(402, "AI credits exhausted. Upgrade your plan from the Billing page.")

    new_selected = list(dict.fromkeys(list(thread.get("selected_models") or []) + allowed_models))
    await db.ai_threads.update_one(
        {"id": thread_id}, {"$set": {"selected_models": new_selected, "status": "running"}}
    )
    background.add_task(
        _run_extra_models,
        thread_id, thread["question"], allowed_models,
        current["workspace_id"], current["id"], chat,
    )

    out = await get_research(thread_id, current)
    out["blocked_models"] = blocked
    return out


@router.get("/ai/threads")
async def list_threads(current=Depends(require_user), limit: int = 20):
    chat_ids = [
        c["id"]
        for c in await db.chats.find(
            {"workspace_id": current["workspace_id"], "member_ids": current["id"]},
            {"id": 1, "_id": 0},
        ).to_list(1000)
    ]
    threads = await db.ai_threads.find(
        {"chat_id": {"$in": chat_ids}}, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    return threads


@router.post("/ai/responses/{response_id}/vote")
async def vote_response(response_id: str, payload: AIVote, current=Depends(require_user)):
    resp = await db.ai_responses.find_one({"id": response_id}, {"_id": 0})
    if not resp:
        raise HTTPException(404, "Response not found")
    votes = resp.get("votes") or {"best": [], "most_accurate": [], "best_citations": [], "most_useful": []}
    cat = payload.vote_category
    voters = set(votes.get(cat, []))
    if current["id"] in voters:
        voters.discard(current["id"])
    else:
        voters.add(current["id"])
    votes[cat] = list(voters)
    await db.ai_responses.update_one({"id": response_id}, {"$set": {"votes": votes}})
    updated = await db.ai_responses.find_one({"id": response_id}, {"_id": 0})
    return updated


@router.post("/ai/responses/{response_id}/select-best")
async def select_best(
    response_id: str, resynthesize: bool = True, current=Depends(require_user)
):
    resp = await db.ai_responses.find_one({"id": response_id}, {"_id": 0})
    if not resp:
        raise HTTPException(404, "Response not found")
    thread_id = resp["research_thread_id"]
    await db.ai_responses.update_many(
        {"research_thread_id": thread_id}, {"$set": {"selected_as_best": False}}
    )
    await db.ai_responses.update_one({"id": response_id}, {"$set": {"selected_as_best": True}})

    if resynthesize:
        try:
            thread = await db.ai_threads.find_one({"id": thread_id}, {"_id": 0})
            all_responses = await db.ai_responses.find(
                {"research_thread_id": thread_id}, {"_id": 0}
            ).to_list(20)
            for r in all_responses:
                r["selected_as_best"] = r["id"] == response_id
            new_best = next((r for r in all_responses if r["id"] == response_id), None)
            final = await synthesize_answer(
                thread["question"], all_responses, thread_id, preferred_best=new_best
            )
            await db.ai_threads.update_one(
                {"id": thread_id}, {"$set": {"final_answer": final}}
            )
            msg = {
                "id": new_id(),
                "chat_id": thread["chat_id"],
                "sender_id": "ai-system",
                "message_type": "ai_answer",
                "body": final,
                "parent_message_id": None,
                "metadata": {
                    "thread_id": thread_id,
                    "synthesized": True,
                    "resynthesized": True,
                    "best_model": new_best["model_name"] if new_best else None,
                    "best_model_key": new_best["model_key"] if new_best else None,
                    "by_user": current["id"],
                },
                "reactions": {},
                "created_at": now_iso(),
                "edited_at": None,
                "deleted_at": None,
            }
            await db.messages.insert_one(msg.copy())
            await _broadcast_message(thread["chat_id"], msg)
        except Exception as e:
            logger.exception("[select-best] resynth failed: %s", e)
            return {"ok": True, "resynthesized": False, "resynth_error": str(e)[:200]}
    return {"ok": True, "resynthesized": resynthesize}


@router.post("/ai/research/{thread_id}/synthesize")
async def synthesize(thread_id: str, current=Depends(require_user)):
    thread = await db.ai_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Thread not found")
    responses = await db.ai_responses.find(
        {"research_thread_id": thread_id}, {"_id": 0}
    ).to_list(20)
    final = await synthesize_answer(thread["question"], responses, thread_id)
    await db.ai_threads.update_one(
        {"id": thread_id}, {"$set": {"final_answer": final}}
    )
    msg = {
        "id": new_id(),
        "chat_id": thread["chat_id"],
        "sender_id": "ai-system",
        "message_type": "ai_answer",
        "body": final,
        "parent_message_id": None,
        "metadata": {"thread_id": thread_id, "synthesized": True},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(thread["chat_id"], msg)
    return {"final_answer": final}


@router.post("/ai/improve")
async def improve(payload: AIImproveRequest, current=Depends(require_user)):
    result = await improve_message(
        payload.text, payload.action, payload.target_language or "English"
    )
    return {"improved": result, "original": payload.text}


@router.post("/ai/extract-task")
async def ai_extract_task(payload: AIExtractTaskRequest, current=Depends(require_user)):
    members = await db.users.find(
        {"workspace_id": current["workspace_id"]}, PROJ
    ).to_list(1000)
    member_dicts = [
        {"id": m["id"], "name": m["name"], "role": m.get("role", "member")}
        for m in members
    ]
    result = await extract_task(payload.message_body, member_dicts)
    valid_ids = {m["id"] for m in member_dicts}
    if result.get("suggested_assignee_id") not in valid_ids:
        result["suggested_assignee_id"] = None
    return result


@router.post("/ai/suggest-tasks")
async def ai_suggest_tasks(payload: AISuggestTasksRequest, current=Depends(require_user)):
    """Analyze a message and return 1..N suggested tasks. Each comes with title,
    description, priority, a suggested assignee, and a relative due-date offset.
    """
    members = await db.users.find(
        {"workspace_id": current["workspace_id"]}, PROJ
    ).to_list(1000)
    member_dicts = [
        {"id": m["id"], "name": m["name"], "role": m.get("role", "member")}
        for m in members
    ]
    tasks_out = await suggest_tasks(
        payload.message_body, member_dicts, max_tasks=max(1, min(payload.max_tasks, 8))
    )

    now = datetime.now(timezone.utc)
    for t in tasks_out:
        offset: Optional[int] = t.pop("suggested_due_offset_days", None)
        if isinstance(offset, int) and offset >= 0:
            t["suggested_due_date"] = (
                (now + timedelta(days=offset))
                .replace(hour=23, minute=59, second=0, microsecond=0)
                .isoformat()
            )
        else:
            t["suggested_due_date"] = None
    return {"tasks": tasks_out}


@router.get("/ai/models")
async def list_models():
    return [
        {
            "key": k,
            "name": v["display"],
            "real": v.get("real", v.get("engine") in ("emergent", "openai_compat")),
            "model": v["model"],
        }
        for k, v in MODEL_CONFIG.items()
    ]


class DraftEmailRequest(BaseModel):
    content: str
    tone: Optional[str] = None


@router.post("/ai/draft-email")
async def draft_email(payload: DraftEmailRequest, current=Depends(require_user)):
    """Turn any AI answer (or arbitrary text) into a ready-to-edit email draft.
    Draft-only — does NOT send. Sending would require the email connector + an
    approval per the risk policy."""
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(400, "Nothing to draft from")
    tone = (payload.tone or "professional and concise").strip()
    sys = "You draft clear, ready-to-send business emails. Output only the email."
    prompt = (
        f"Draft a {tone} email based on the content below.\n"
        "Return the first line as 'SUBJECT: <subject>', then a blank line, then the body.\n\n"
        f"CONTENT:\n{content[:6000]}"
    )
    text = await complete(sys, prompt, "claude")
    subject, body = "", text.strip()
    for line in text.splitlines():
        if line.strip().upper().startswith("SUBJECT:"):
            subject = line.split(":", 1)[1].strip()
            body = text.split(line, 1)[1].lstrip("\n").strip()
            break
    return {"subject": subject or "(no subject)", "body": body}


class DoActionRequest(BaseModel):
    entity_type: str  # task | document | chat
    entity_id: str
    action: str


_DO_ACTIONS = {
    "task": {
        "summarize": ("Summarize this task into 2-4 skimmable bullets and one recommended next step.", "Summary"),
        "subtasks": ("Break this task into 3-6 concrete, checkbox-style subtasks. Return only the checklist.", "Subtasks"),
        "update": ("Draft a brief, friendly status-update message a teammate could post about this task.", "Status update"),
        "draft_email": ("Draft a professional email about this task. First line 'SUBJECT: <subject>', blank line, then body.", "Email draft"),
    },
    "document": {
        "summarize": ("Summarize this document into 3-5 skimmable bullets and one recommended next step.", "Summary"),
        "action_items": ("Extract the concrete action items (and owners if mentioned) as a checklist.", "Action items"),
        "draft_email": ("Draft a professional email that shares the key points of this document. First line 'SUBJECT: <subject>', blank line, then body.", "Email draft"),
    },
    "chat": {
        "summarize": ("Summarize this conversation into 3-5 skimmable bullets.", "Summary"),
        "reply": ("Draft a helpful, professional reply to the latest message in this conversation.", "Draft reply"),
        "decisions": ("Extract the key decisions and any open questions from this conversation as two short lists.", "Decisions & questions"),
        "draft_email": ("Draft a professional email recapping this conversation. First line 'SUBJECT: <subject>', blank line, then body.", "Email draft"),
    },
}


async def _do_action_context(entity_type: str, entity_id: str, ws: str, uid: str):
    """Return (title, context_text, automate_prompt) for the target entity, or raise 404."""
    if entity_type == "task":
        t = await db.tasks.find_one({"id": entity_id, "workspace_id": ws}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Task not found")
        ctx = (f"Task: {t.get('title', '')}\nDescription: {t.get('description', '') or '(none)'}\n"
               f"Status: {t.get('status', '')}\nPriority: {t.get('priority', '') or 'normal'}\n"
               f"Due: {(t.get('due_date') or '')[:10] or '(none)'}")
        return t.get("title") or "Task", ctx, "When tasks like this are overdue, summarize them and post to our team chat."
    if entity_type == "document":
        s = await db.knowledge_sources.find_one({"id": entity_id, "workspace_id": ws}, {"_id": 0})
        if not s:
            raise HTTPException(404, "Document not found")
        chunks = await db.knowledge_chunks.find(
            {"source_id": entity_id}, {"_id": 0, "text": 1}
        ).sort("chunk_index", 1).to_list(12)
        body = "\n\n".join(c.get("text", "") for c in chunks)[:6000] or "(document is still processing or has no extracted text)"
        return s.get("name") or "Document", f"Document: {s.get('name', '')}\n\n{body}", "Every week summarize new documents and post a digest to our team chat."
    if entity_type == "chat":
        chat = await db.chats.find_one({"id": entity_id, "member_ids": uid}, {"_id": 0, "id": 1, "name": 1})
        if not chat:
            raise HTTPException(404, "Chat not found")
        msgs = await db.messages.find(
            {"chat_id": entity_id, "deleted_at": None}, {"_id": 0, "body": 1, "sender_id": 1}
        ).sort("created_at", -1).to_list(40)
        msgs.reverse()
        transcript = "\n".join(f"- {(m.get('body') or '')[:400]}" for m in msgs if m.get("body"))[:6000] or "(no messages yet)"
        return chat.get("name") or "Chat", f"Conversation:\n{transcript}", "Every Monday summarize this chat and post a recap to the team."
    raise HTTPException(400, "Unsupported entity type")


@router.get("/ai/do-actions")
async def do_actions_catalog(entity_type: str, current=Depends(require_user)):
    """List the available 'Do this for me' actions for an entity type."""
    acts = _DO_ACTIONS.get(entity_type)
    if not acts:
        raise HTTPException(400, "Unsupported entity type")
    return {"actions": [{"key": k, "label": v[1]} for k, v in acts.items()]}


@router.post("/ai/do-action")
async def do_action(payload: DoActionRequest, current=Depends(require_user)):
    """Contextual one-tap AI action ('Do this for me') on a task, document, or
    chat. Draft-only — returns AI text plus follow-ups (copy / automate /
    draft email). Never writes or sends on its own."""
    acts = _DO_ACTIONS.get(payload.entity_type)
    if not acts or payload.action not in acts:
        raise HTTPException(400, "Unsupported action")
    instruction, title = acts[payload.action]
    ctx_title, context, automate_prompt = await _do_action_context(
        payload.entity_type, payload.entity_id, current["workspace_id"], current["id"]
    )
    sys = "You are a concise, helpful operations assistant. Output only the requested content, no preamble."
    result = await complete(sys, f"{instruction}\n\nCONTEXT:\n{context}", "claude")
    followups = [{"kind": "copy", "label": "Copy"}]
    if payload.action != "automate":
        followups.append({"kind": "automate", "label": "Automate this", "prompt": automate_prompt})
    if payload.action != "draft_email":
        followups.append({"kind": "draft_email", "label": "Draft email", "content": result[:4000]})
    return {
        "entity_type": payload.entity_type, "entity_id": payload.entity_id,
        "action": payload.action, "title": f"{title}: {ctx_title}"[:120],
        "result": (result or "").strip(), "followups": followups,
    }


@router.get("/ai/activity")
async def ai_activity(current=Depends(require_user)):
    """Recent AI activity for the AI hub 'Activity' tab: research completed,
    approvals requested, and knowledge saved — newest first."""
    uid = current["id"]
    ws = current["workspace_id"]
    chat_ids = [
        c["id"]
        async for c in db.chats.find(
            {"workspace_id": ws, "member_ids": uid}, {"id": 1, "_id": 0}
        )
    ]
    events = []

    if chat_ids:
        threads = (
            await db.ai_threads.find(
                {"chat_id": {"$in": chat_ids}},
                {"_id": 0, "id": 1, "question": 1, "chat_id": 1, "created_at": 1, "status": 1},
            )
            .sort("created_at", -1)
            .to_list(15)
        )
        for t in threads:
            events.append({
                "type": "research",
                "title": (t.get("question") or "AI research")[:140],
                "status": t.get("status") or "complete",
                "chat_id": t.get("chat_id"),
                "thread_id": t.get("id"),
                "at": t.get("created_at"),
            })

    approvals = (
        await db.approvals.find({"workspace_id": ws}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(10)
    )
    for a in approvals:
        events.append({
            "type": "approval",
            "title": (a.get("title") or "Approval requested")[:140],
            "status": a.get("status") or "pending",
            "at": a.get("created_at"),
        })

    mems = (
        await db.memory_items.find(
            {"workspace_id": ws, "status": {"$in": ["active", "outdated"]}},
            {"_id": 0, "id": 1, "title": 1, "memory_type": 1, "created_at": 1},
        )
        .sort("created_at", -1)
        .to_list(10)
    )
    for m in mems:
        events.append({
            "type": "knowledge",
            "title": (m.get("title") or "Knowledge saved")[:140],
            "status": m.get("memory_type") or "note",
            "at": m.get("created_at"),
        })

    events.sort(key=lambda e: e.get("at") or "", reverse=True)
    return {"items": events[:30]}


class MeetingPrepRequest(BaseModel):
    chat_id: Optional[str] = None
    call_id: Optional[str] = None
    meeting_id: Optional[str] = None


@router.post("/ai/meeting-prep")
async def meeting_prep(payload: MeetingPrepRequest, current=Depends(require_user)):
    """'Prepare me' — brief the user for the next upcoming meeting (from the
    in-app calendar) using its chat history + the workspace's documents.
    Falls back to the current chat when no meeting is scheduled. Read-only."""
    ws = current["workspace_id"]
    now_dt = datetime.now(timezone.utc).isoformat()

    # Resolve the target meeting: explicit id > next upcoming (chat-scoped, then workspace).
    meeting = None
    if payload.meeting_id:
        meeting = await db.meetings.find_one({"id": payload.meeting_id, "workspace_id": ws}, {"_id": 0})
    if not meeting:
        q = {"workspace_id": ws, "start_at": {"$gte": now_dt}}
        if payload.chat_id:
            q["chat_id"] = payload.chat_id
        meeting = await db.meetings.find_one(q, {"_id": 0}, sort=[("start_at", 1)])
    if not meeting and payload.chat_id:
        # no chat-scoped meeting — try the soonest workspace meeting
        meeting = await db.meetings.find_one(
            {"workspace_id": ws, "start_at": {"$gte": now_dt}}, {"_id": 0}, sort=[("start_at", 1)]
        )

    chat_id = payload.chat_id or (meeting or {}).get("chat_id")
    if not chat_id and payload.call_id:
        call = await db.calls.find_one({"id": payload.call_id}, {"_id": 0, "chat_id": 1})
        chat_id = call.get("chat_id") if call else None
    if not chat_id and not meeting:
        raise HTTPException(400, "No meeting context")

    chat = None
    if chat_id:
        chat = await db.chats.find_one({"id": chat_id, "workspace_id": ws}, {"_id": 0})

    convo = "(no recent messages)"
    if chat_id:
        msgs = (
            await db.messages.find({"chat_id": chat_id}, {"_id": 0, "body": 1, "created_at": 1})
            .sort("created_at", -1).to_list(30)
        )
        convo = "\n".join(f"- {(m.get('body') or '')[:200]}" for m in reversed(msgs) if m.get("body"))[:5000] or "(no recent messages)"

    docs = (
        await db.knowledge_sources.find({"workspace_id": ws}, {"_id": 0, "name": 1})
        .sort("created_at", -1).to_list(8)
    )
    doclist = ", ".join(d.get("name", "") for d in docs) or "none"

    title = (meeting or {}).get("title") or (chat.get("name") if chat else None) or "Meeting"
    when_line = ""
    if meeting:
        att = ", ".join(meeting.get("attendees") or []) or "not specified"
        when_line = f"Scheduled: {meeting.get('start_at')}\nAttendees: {att}\n"
        if meeting.get("notes"):
            when_line += f"Agenda notes: {meeting['notes']}\n"

    sys = "You are an executive assistant preparing someone for a meeting. Be concise and practical."
    prompt = (
        f"Prepare me for the upcoming meeting: '{title}'.\n{when_line}"
        f"Related conversation:\n{convo}\n\nAvailable documents: {doclist}\n\n"
        "Produce, with short bold headings: (1) a 2-3 sentence context recap, "
        "(2) 3-5 likely talking points or open questions, (3) any pending decisions, "
        "(4) one suggested goal for the meeting."
    )
    brief = await complete(sys, prompt, "claude")
    return {
        "chat_id": chat_id,
        "title": title,
        "brief": brief,
        "meeting": meeting,
    }
