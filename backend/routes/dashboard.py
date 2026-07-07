"""Home dashboard aggregation + AI Daily Standup Digest."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ai_service import EMERGENT_LLM_KEY, LlmChat, UserMessage
from deps import PROJ, _broadcast_message, db, new_id, now_iso, require_user

router = APIRouter()


class StandupRequest(BaseModel):
    chat_id: Optional[str] = None  # post into this chat if provided
    project_folder_id: Optional[str] = None  # scope tasks to this folder


@router.get("/dashboard")
async def dashboard(current=Depends(require_user)):
    today = datetime.now(timezone.utc).isoformat()[:10]
    my_tasks = await db.tasks.find(
        {"workspace_id": current["workspace_id"], "assigned_to": current["id"]},
        {"_id": 0},
    ).to_list(100)
    due_today = [t for t in my_tasks if (t.get("due_date") or "")[:10] == today]
    open_tasks = [t for t in my_tasks if t.get("status") != "completed"]

    chats = await db.chats.find(
        {"workspace_id": current["workspace_id"], "member_ids": current["id"]},
        {"_id": 0},
    ).to_list(50)
    recent_chats = []
    for c in chats[:10]:
        last = await db.messages.find_one(
            {"chat_id": c["id"], "deleted_at": None},
            {"_id": 0},
            sort=[("created_at", -1)],
        )
        c["last_message"] = last
        recent_chats.append(c)
    recent_chats.sort(
        key=lambda x: (x.get("last_message") or {}).get("created_at") or x["created_at"],
        reverse=True,
    )

    folders = await db.folders.find(
        {"workspace_id": current["workspace_id"]}, {"_id": 0}
    ).to_list(50)

    chat_ids = [c["id"] for c in chats]
    threads = await db.ai_threads.find(
        {"chat_id": {"$in": chat_ids}}, {"_id": 0}
    ).sort("created_at", -1).to_list(10)

    return {
        "open_tasks": open_tasks,
        "due_today": due_today,
        "recent_chats": recent_chats[:8],
        "folders": folders,
        "recent_threads": threads,
    }


@router.post("/standup/generate")
async def generate_standup(payload: StandupRequest, current=Depends(require_user)):
    """Generate a Daily Standup Digest for the workspace and optionally post it
    into a chat. Returns the AI-generated markdown so the UI can render it."""
    ws_id = current["workspace_id"]

    buckets = await _collect_standup_buckets(ws_id, payload.project_folder_id)
    if not any(buckets[k] for k in ("open_tasks", "completed_yesterday", "overdue", "due_today")):
        return {
            "markdown": "_No tasks tracked yet. Add a task with `@task ...` in any chat to start seeing your daily digest._",
            "stats": {"open": 0, "completed_yesterday": 0, "overdue": 0, "due_today": 0},
            "generated_at": now_iso(),
        }

    assignees = await _resolve_assignee_names(buckets["open_tasks"] + buckets["completed_yesterday"])
    markdown = await _generate_standup_markdown(buckets, assignees)
    stats = {
        "open": len(buckets["open_tasks"]),
        "completed_yesterday": len(buckets["completed_yesterday"]),
        "overdue": len(buckets["overdue"]),
        "due_today": len(buckets["due_today"]),
    }

    posted_message_id = None
    if payload.chat_id:
        posted_message_id = await _post_standup_to_chat(
            chat_id=payload.chat_id, ws_id=ws_id, current=current, markdown=markdown, stats=stats,
        )

    return {
        "markdown": markdown,
        "stats": stats,
        "posted_message_id": posted_message_id,
        "generated_at": now_iso(),
    }


async def _collect_standup_buckets(ws_id: str, project_folder_id: Optional[str]) -> dict:
    """Partition workspace tasks into the four standup buckets."""
    q: dict = {"workspace_id": ws_id}
    if project_folder_id:
        q["project_folder_id"] = project_folder_id
    all_tasks = await db.tasks.find(q, {"_id": 0}).to_list(500)
    now = datetime.now(timezone.utc)
    today_iso = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    yesterday_iso = (now - timedelta(days=1)).isoformat()

    open_tasks = [t for t in all_tasks if t.get("status") not in ("completed",)]
    completed_yesterday = [
        t for t in all_tasks
        if t.get("status") == "completed" and t.get("completed_at") and t["completed_at"] >= yesterday_iso
    ]
    overdue = [t for t in open_tasks if t.get("due_date") and t["due_date"] < today_iso]
    due_today = [t for t in open_tasks if (t.get("due_date") or "")[:10] == today_iso[:10]]
    return {
        "open_tasks": open_tasks,
        "completed_yesterday": completed_yesterday,
        "overdue": overdue,
        "due_today": due_today,
        "today_iso": today_iso,
    }


async def _resolve_assignee_names(tasks: list) -> dict:
    """Build {user_id → name} for every assignee in the given tasks."""
    assignee_ids = list({t["assigned_to"] for t in tasks if t.get("assigned_to")})
    if not assignee_ids:
        return {}
    out: dict = {}
    async for u in db.users.find({"id": {"$in": assignee_ids}}, PROJ):
        out[u["id"]] = u["name"]
    return out


def _format_standup_task(t: dict, assignees: dict) -> str:
    owner = assignees.get(t.get("assigned_to"), "—") if t.get("assigned_to") else "—"
    due = f" (due {t['due_date'][:10]})" if t.get("due_date") else ""
    return f"- **{t['title']}** · {owner}{due}"


def _build_standup_prompt(buckets: dict, assignees: dict) -> str:
    """Assemble the prompt input + instructions for the standup LLM call."""
    completed = buckets["completed_yesterday"]
    due_today = buckets["due_today"]
    overdue = buckets["overdue"]
    open_tasks = buckets["open_tasks"]
    summary_input = (
        f"Date: {buckets['today_iso'][:10]}\n"
        f"Open tasks: {len(open_tasks)}\n"
        f"Completed yesterday: {len(completed)}\n"
        f"Overdue: {len(overdue)}\n"
        f"Due today: {len(due_today)}\n\n"
        "COMPLETED YESTERDAY:\n" + ("\n".join(_format_standup_task(t, assignees) for t in completed[:15]) or "_(none)_") + "\n\n"
        "DUE TODAY:\n" + ("\n".join(_format_standup_task(t, assignees) for t in due_today[:15]) or "_(none)_") + "\n\n"
        "OVERDUE:\n" + ("\n".join(_format_standup_task(t, assignees) for t in overdue[:15]) or "_(none)_") + "\n\n"
        "NEXT UP (sample):\n" + "\n".join(_format_standup_task(t, assignees) for t in open_tasks[:10])
    )
    return (
        "You are TeamNest.ai's Daily Standup writer. Produce a tight, energetic markdown digest "
        "with these sections in order (skip a section ONLY if truly empty):\n"
        "## 🌅 Daily Standup — <date>\n\n"
        "**TL;DR** — one sentence summary of the team's state.\n\n"
        "### ✅ Closed yesterday\n- bullets\n\n"
        "### 🎯 Due today\n- bullets\n\n"
        "### 🔥 Overdue (needs unblocking)\n- bullets with @owner mentions\n\n"
        "### 💡 Suggested focus\n- 1-2 bullets recommending what the team should prioritize\n\n"
        "Keep total under 250 words. Be human, not robotic.\n\n"
        f"---\n{summary_input}\n---\n"
        "Output ONLY the markdown, no preamble."
    )


async def _generate_standup_markdown(buckets: dict, assignees: dict) -> str:
    """Call the LLM and return the markdown standup."""
    prompt = _build_standup_prompt(buckets, assignees)
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"standup-{new_id()[:8]}",
            system_message="You are a punchy, action-oriented daily standup writer.",
        ).with_model("openai", "gpt-5.4-mini")
        return str(await chat.send_message(UserMessage(text=prompt)))
    except Exception as e:
        raise HTTPException(500, f"Standup generation failed: {e}")


async def _post_standup_to_chat(chat_id: str, ws_id: str, current: dict, markdown: str, stats: dict) -> str:
    """Post the standup markdown into a chat as an ai-system message."""
    chat_doc = await db.chats.find_one(
        {"id": chat_id, "workspace_id": ws_id, "member_ids": current["id"]}, {"_id": 0},
    )
    if not chat_doc:
        raise HTTPException(404, "Chat not found or you're not a member")
    msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "text",
        "body": markdown,
        "parent_message_id": None,
        "metadata": {
            "kind": "standup_digest",
            "generated_by": current["id"],
            "stats": stats,
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(chat_id, msg)
    return msg["id"]
