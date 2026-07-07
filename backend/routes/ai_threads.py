"""Phase 4 — AI thread collaboration: continue, branch, version history.

Threads now grow over time. Each "continue" or "branch" creates a new version
that retains a pointer to the original and to its predecessor, building a tree.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from ai_service import ask_models_parallel
from deps import _broadcast_message, db, new_id, now_iso, require_user
from models import AIThreadBranch, AIThreadContinue
from services.ai_runtime import (
    _finalize_research,
    deduct_credits_for_responses,
    filter_models_by_credits,
)
from services.memory_rag import (
    build_rag_context,
    format_memory_sources,
    retrieve_memory,
)

router = APIRouter()


async def _get_thread_or_404(thread_id: str, user_id: str) -> dict:
    thread = await db.ai_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Thread not found")
    chat = await db.chats.find_one({"id": thread["chat_id"], "member_ids": user_id}, {"_id": 0})
    if not chat:
        raise HTTPException(403, "You don't have access to this thread")
    return thread


async def _record_version(thread_id: str, payload: dict) -> dict:
    cnt = await db.ai_thread_versions.count_documents({"thread_id": thread_id})
    version = {
        "id": new_id(),
        "thread_id": thread_id,
        "version_number": cnt + 1,
        "created_at": now_iso(),
        **payload,
    }
    await db.ai_thread_versions.insert_one(version.copy())
    version.pop("_id", None)
    return version


@router.get("/ai/threads/{thread_id}/versions")
async def list_versions(thread_id: str, current=Depends(require_user)):
    await _get_thread_or_404(thread_id, current["id"])
    versions = await db.ai_thread_versions.find(
        {"thread_id": thread_id}, {"_id": 0}
    ).sort("version_number", 1).to_list(100)
    return {"versions": versions}


@router.get("/ai/threads/{thread_id}/memory-sources")
async def list_memory_sources(thread_id: str, current=Depends(require_user)):
    """Return the memory items that were used to ground this AI thread's answer."""
    thread = await _get_thread_or_404(thread_id, current["id"])
    ids = thread.get("memory_source_ids") or []
    if not ids:
        return {"sources": [], "memory_mode": thread.get("memory_mode")}
    items = await db.memory_items.find(
        {"id": {"$in": ids}, "workspace_id": current["workspace_id"]},
        {"_id": 0},
    ).to_list(50)
    return {"sources": items, "memory_mode": thread.get("memory_mode")}


@router.get("/ai/threads/{thread_id}/branches")
async def list_branches(thread_id: str, current=Depends(require_user)):
    await _get_thread_or_404(thread_id, current["id"])
    branches = await db.ai_threads.find(
        {"parent_thread_id": thread_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"branches": branches}


@router.post("/ai/threads/{thread_id}/continue")
async def continue_thread(thread_id: str, payload: AIThreadContinue, current=Depends(require_user)):
    """Continue an AI research thread with a follow-up question. Builds a
    richer prompt by injecting the previous final answer plus retrieved memory.
    """
    thread = await _get_thread_or_404(thread_id, current["id"])
    chat = await db.chats.find_one({"id": thread["chat_id"]}, {"_id": 0})
    selected_models = payload.selected_models or thread.get("selected_models") or ["gpt-4o-mini"]

    allowed_models, blocked = await filter_models_by_credits(current["workspace_id"], selected_models)
    if not allowed_models:
        raise HTTPException(402, "AI credits exhausted")

    memory_items = await retrieve_memory(
        workspace_id=current["workspace_id"],
        query=payload.question,
        chat_id=thread["chat_id"],
        project_folder_id=(chat or {}).get("project_folder_id"),
        mode=payload.memory_mode or "chat",  # type: ignore[arg-type]
        limit=8,
    )

    enriched_question = _build_continue_prompt(thread, payload, memory_items)

    # Post user-visible question message
    q_msg = {
        "id": new_id(),
        "chat_id": thread["chat_id"],
        "sender_id": current["id"],
        "message_type": "ai_question",
        "body": f"Follow-up: {payload.question}",
        "parent_message_id": None,
        "metadata": {
            "thread_id": thread_id,
            "continued": True,
            "models": allowed_models,
            "status": "running",
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(q_msg.copy())
    await _broadcast_message(thread["chat_id"], q_msg)

    responses = await ask_models_parallel(enriched_question, allowed_models, thread_id)
    for r in responses:
        r["id"] = new_id()
        r["research_thread_id"] = thread_id
        r["votes"] = {"best": [], "most_accurate": [], "best_citations": [], "most_useful": []}
        r["selected_as_best"] = False
        r["created_at"] = now_iso()
        await db.ai_responses.insert_one(r.copy())

    await deduct_credits_for_responses(
        current["workspace_id"], current["id"], responses, source="ai_continue"
    )

    answer_msg = await _finalize_research(
        thread, responses, thread["chat_id"], q_msg["id"],
        favorite_model=(current.get("preferences") or {}).get("favorite_ai_model"),
    )

    # Bookkeeping: record version
    final_answer = (await db.ai_threads.find_one({"id": thread_id}, {"_id": 0}) or {}).get("final_answer")
    await _record_version(thread_id, {
        "kind": "continue",
        "question": payload.question,
        "added_context": payload.added_context,
        "selected_models": allowed_models,
        "response_summary": [r.get("model_key") for r in responses],
        "final_answer": final_answer,
        "created_by": current["id"],
    })

    return {
        "ok": True,
        "thread_id": thread_id,
        "answer_message_id": answer_msg.get("id"),
        "blocked_models": blocked,
        "memory_sources": format_memory_sources(memory_items),
    }


def _build_continue_prompt(thread: dict, payload: AIThreadContinue, memory_items: list) -> str:
    parts: List[str] = []
    if thread.get("question"):
        parts.append(f"Earlier in this thread, the team asked: {thread['question']}")
    if thread.get("final_answer"):
        parts.append(f"The previously-agreed answer was:\n{thread['final_answer'][:1500]}")
    if payload.added_context:
        parts.append(f"New context just added by the team:\n{payload.added_context}")
    if memory_items:
        parts.append(build_rag_context(memory_items))
    parts.append(f"Follow-up question: {payload.question}")
    parts.append(
        "Provide an updated, decision-quality answer. If the new question or "
        "context conflicts with prior conclusions, surface the conflict and "
        "recommend how to reconcile it. Cite memory items with [#] where used."
    )
    return "\n\n".join(parts)


@router.post("/ai/threads/{thread_id}/branch")
async def branch_thread(thread_id: str, payload: AIThreadBranch, current=Depends(require_user)):
    """Fork a thread into a new scenario branch — creates a sibling ai_thread
    record with `parent_thread_id` set."""
    parent = await _get_thread_or_404(thread_id, current["id"])
    selected_models = payload.selected_models or parent.get("selected_models") or ["gpt-4o-mini"]

    allowed_models, blocked = await filter_models_by_credits(current["workspace_id"], selected_models)
    if not allowed_models:
        raise HTTPException(402, "AI credits exhausted")

    new_thread = {
        "id": new_id(),
        "chat_id": parent["chat_id"],
        "question": f"[{payload.branch_name}] {payload.scenario_description}",
        "created_by": current["id"],
        "selected_models": allowed_models,
        "final_answer": None,
        "status": "running",
        "votes": {},
        "public_token": None,
        "parent_thread_id": thread_id,
        "branch_name": payload.branch_name,
        "scenario_description": payload.scenario_description,
        "created_at": now_iso(),
    }
    await db.ai_threads.insert_one(new_thread.copy())

    chat = await db.chats.find_one({"id": parent["chat_id"]}, {"_id": 0})
    memory_items = await retrieve_memory(
        workspace_id=current["workspace_id"],
        query=payload.scenario_description,
        chat_id=parent["chat_id"],
        project_folder_id=(chat or {}).get("project_folder_id"),
        mode="project",
        limit=8,
    )
    prompt = _build_branch_prompt(parent, payload, memory_items)

    q_msg = {
        "id": new_id(),
        "chat_id": parent["chat_id"],
        "sender_id": current["id"],
        "message_type": "ai_question",
        "body": f"New scenario branch — {payload.branch_name}: {payload.scenario_description}",
        "parent_message_id": None,
        "metadata": {
            "thread_id": new_thread["id"],
            "parent_thread_id": thread_id,
            "branch_name": payload.branch_name,
            "models": allowed_models,
            "status": "running",
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(q_msg.copy())
    await _broadcast_message(parent["chat_id"], q_msg)

    responses = await ask_models_parallel(prompt, allowed_models, new_thread["id"])
    for r in responses:
        r["id"] = new_id()
        r["research_thread_id"] = new_thread["id"]
        r["votes"] = {"best": [], "most_accurate": [], "best_citations": [], "most_useful": []}
        r["selected_as_best"] = False
        r["created_at"] = now_iso()
        await db.ai_responses.insert_one(r.copy())

    await deduct_credits_for_responses(
        current["workspace_id"], current["id"], responses, source="ai_branch"
    )

    answer_msg = await _finalize_research(
        new_thread, responses, parent["chat_id"], q_msg["id"],
        favorite_model=(current.get("preferences") or {}).get("favorite_ai_model"),
    )

    await _record_version(new_thread["id"], {
        "kind": "branch",
        "branch_name": payload.branch_name,
        "scenario_description": payload.scenario_description,
        "selected_models": allowed_models,
        "response_summary": [r.get("model_key") for r in responses],
        "final_answer": (await db.ai_threads.find_one({"id": new_thread["id"]}, {"_id": 0}) or {}).get("final_answer"),
        "created_by": current["id"],
    })

    return {
        "ok": True,
        "thread_id": new_thread["id"],
        "parent_thread_id": thread_id,
        "branch_name": payload.branch_name,
        "answer_message_id": answer_msg.get("id"),
        "blocked_models": blocked,
        "memory_sources": format_memory_sources(memory_items),
    }


def _build_branch_prompt(parent: dict, payload: AIThreadBranch, memory_items: list) -> str:
    parts = [
        "You are exploring an alternative scenario for an earlier team decision.",
        f"Original question: {parent.get('question','')}",
    ]
    if parent.get("final_answer"):
        parts.append(f"Earlier conclusion:\n{parent['final_answer'][:1500]}")
    parts.append(f"Scenario branch: {payload.branch_name}")
    parts.append(f"New assumptions / conditions:\n{payload.scenario_description}")
    if memory_items:
        parts.append(build_rag_context(memory_items))
    parts.append(
        "Re-evaluate the original question under these new assumptions. State explicitly "
        "where your conclusion diverges from the earlier one and why. Keep it decision-ready."
    )
    return "\n\n".join(parts)
