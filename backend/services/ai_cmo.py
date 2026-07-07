"""AI CMO inline command + workflow handler.

Triggered by chat messages starting with `@AI CMO ...`. Runs a single GPT-4o
call with the CMO system prompt, posts the result back to the chat, and
deducts credits from the employee's bucket.
"""
import asyncio
from typing import Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

from ai_employees_catalog import get_employee
from ai_service import EMERGENT_LLM_KEY
from deps import _broadcast_message, db, new_id, now_iso
from routes.ai_employees import deduct_employee_credits, log_employee_activity

# Roughly: 1 credit ≈ 200 tokens (GPT-4o input+output). CMO workflows ~3K tokens.
CMO_CREDITS_PER_TASK = 15


def _matches_cmo(body: str) -> Optional[str]:
    """Return the question if the body starts with @AI CMO, else None."""
    if not body:
        return None
    stripped = body.strip()
    lower = stripped.lower()
    for prefix in ("@ai cmo", "@aicmo", "@cmo"):
        if lower.startswith(prefix):
            return stripped[len(prefix):].strip()
    return None


async def handle_cmo_message(chat: dict, sender: dict, message: dict) -> None:
    """Background handler — runs CMO, posts answer to chat, logs everything.

    Silently no-ops if the workspace has no active CMO subscription, but
    posts a system message telling the user how to start the trial.
    """
    emp = get_employee("cmo")
    if not emp:
        return
    question = _matches_cmo(message.get("body", "")) or message["body"]

    workspace_id = chat["workspace_id"]
    sub = await db.ai_employee_subscriptions.find_one(
        {"workspace_id": workspace_id, "employee_key": "cmo"}, {"_id": 0}
    )
    if not sub or sub.get("status") in ("cancelled", "paused"):
        sys_msg = {
            "id": new_id(),
            "chat_id": chat["id"],
            "sender_id": "ai-system",
            "message_type": "text",
            "body": (
                "⚠️ **AI CMO is not active in this workspace.** Owners can start "
                "a 7-day trial from the AI Employees page."
            ),
            "parent_message_id": None,
            "metadata": {"event": "ai_employee_not_subscribed", "employee_key": "cmo"},
            "reactions": {},
            "created_at": now_iso(),
            "edited_at": None,
            "deleted_at": None,
        }
        await db.messages.insert_one(sys_msg.copy())
        await _broadcast_message(chat["id"], sys_msg)
        return

    # Post a placeholder "thinking" message so the user gets immediate feedback.
    placeholder = {
        "id": new_id(),
        "chat_id": chat["id"],
        "sender_id": "ai-cmo",
        "message_type": "ai_answer",
        "body": "_AI CMO is drafting…_",
        "parent_message_id": message.get("id"),
        "metadata": {"employee_key": "cmo", "status": "running"},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(placeholder.copy())
    await _broadcast_message(chat["id"], placeholder)

    try:
        chat_session = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"cmo-{chat['id']}",
            system_message=emp["system_prompt"],
        ).with_model("openai", "gpt-5.4")
        answer = await chat_session.send_message(UserMessage(text=question))
        answer_text = str(answer).strip() or "_(empty response)_"
        status = "complete"
    except Exception as e:
        answer_text = f"⚠️ AI CMO failed: {e}"
        status = "error"

    # Update the placeholder in place so threading stays intact.
    await db.messages.update_one(
        {"id": placeholder["id"]},
        {
            "$set": {
                "body": answer_text,
                "metadata.status": status,
                "edited_at": now_iso(),
            }
        },
    )
    placeholder["body"] = answer_text
    placeholder["metadata"]["status"] = status
    await _broadcast_message(chat["id"], placeholder)

    # Credit deduction + activity log.
    if status == "complete":
        await deduct_employee_credits(
            workspace_id=workspace_id,
            employee_key="cmo",
            user_id=sender["id"],
            credits=CMO_CREDITS_PER_TASK,
            reason=f"CMO reply in {chat.get('name') or chat['id'][:8]}",
            task_id=placeholder["id"],
        )
        await log_employee_activity(
            workspace_id=workspace_id,
            employee_key="cmo",
            actor_id=sender["id"],
            kind="reply",
            summary=question[:140],
            metadata={"message_id": placeholder["id"]},
        )


def schedule_cmo_if_addressed(chat: dict, sender: dict, message: dict) -> bool:
    """If the message addresses AI CMO, schedule the handler. Returns True if scheduled."""
    if _matches_cmo(message.get("body", "")) is not None:
        asyncio.create_task(handle_cmo_message(chat, sender, message))
        return True
    return False
