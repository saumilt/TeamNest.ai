"""Generic @AI <employee> inline command handler.

Dispatches prompt-only employees (CMO, Sales, Paralegal) through a single
code path. Bookkeeper has its own dedicated route surface and is not
handled here.
"""
import asyncio
import re
from typing import Dict, List, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

from ai_employees_catalog import ACTIVE_EMPLOYEES, get_employee
from ai_service import EMERGENT_LLM_KEY
from deps import _broadcast_message, db, new_id, now_iso
from routes.ai_employees import deduct_employee_credits, log_employee_activity

# Mention prefixes accepted for each prompt-only employee.
EMPLOYEE_TRIGGERS = {
    "cmo": ("@ai cmo", "@aicmo", "@cmo"),
    "sales": ("@ai sales", "@aisales", "@sales"),
    "paralegal": ("@ai paralegal", "@aiparalegal", "@paralegal"),
    "restaurant_orders": ("@ai restaurant", "@airestaurant", "@restaurant", "@ai orders", "@orders"),
    "bill_pay": ("@ai bill pay", "@ai billpay", "@aibillpay", "@billpay", "@ai ap", "@ap"),
}


async def _build_trigger_map(workspace_id: str) -> Dict[str, tuple[str, ...]]:
    """Builds the trigger map for a workspace, extending the canonical
    `@cmo`/`@sales`/... prefixes with each employee's user-chosen first name
    (e.g. `@priya` once the workspace renames their CMO to Priya AI)."""
    triggers: Dict[str, tuple[str, ...]] = {k: tuple(v) for k, v in EMPLOYEE_TRIGGERS.items()}
    subs = await db.ai_employee_subscriptions.find(
        {"workspace_id": workspace_id, "employee_key": {"$in": list(EMPLOYEE_TRIGGERS.keys())}},
        {"_id": 0, "employee_key": 1, "display_first_name": 1},
    ).to_list(20)
    for s in subs:
        first = (s.get("display_first_name") or "").strip().lower()
        if not first:
            continue
        first_collapsed = first.replace(" ", "")
        extra = (f"@{first_collapsed}", f"@{first_collapsed}ai")
        existing = triggers.get(s["employee_key"], ())
        triggers[s["employee_key"]] = tuple(dict.fromkeys(existing + extra))
    return triggers

# Map our internal model name to emergent provider/model.
PROVIDER_MAP = {
    "chatgpt": ("openai", "gpt-4o"),
    "gpt-4o": ("openai", "gpt-4o"),
    "gpt-4o-mini": ("openai", "gpt-4o-mini"),
    "claude": ("anthropic", "claude-sonnet-4-6"),
    "claude-haiku": ("anthropic", "claude-haiku-4-5-20251001"),
    "gemini": ("gemini", "gemini-3.5-flash"),
}


def _match_employee_with_map(body: str, trigger_map: Dict[str, tuple[str, ...]]) -> Optional[tuple[str, str]]:
    """Same as `_match_employee` but uses the workspace's resolved triggers."""
    if not body:
        return None
    stripped = body.strip()
    lower = stripped.lower()
    # Match longest prefix first so `@aicmo` beats `@cmo`/`@ai` ordering.
    candidates: List[tuple[int, str, str]] = []
    for key, prefixes in trigger_map.items():
        for p in prefixes:
            if lower.startswith(p):
                candidates.append((len(p), key, p))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    _, key, prefix = candidates[0]
    return key, stripped[len(prefix):].strip()


def _match_employee(body: str) -> Optional[tuple[str, str]]:
    """Backwards-compatible matcher using canonical triggers only."""
    return _match_employee_with_map(body, {k: tuple(v) for k, v in EMPLOYEE_TRIGGERS.items()})


async def _run_employee(chat: dict, sender: dict, message: dict, employee_key: str, question: str) -> None:
    emp = get_employee(employee_key)
    if not emp:
        return

    # ===== Per-chat AI Billing & Permissions gate =====
    from routes.chat_ai_settings import check_ai_allowed, record_ai_usage
    gate = await check_ai_allowed(chat, sender, estimated_credits=emp.get("credits_per_task_estimate", 15))
    if not gate["allowed"]:
        sys_msg = {
            "id": new_id(), "chat_id": chat["id"], "sender_id": "ai-system",
            "message_type": "text", "body": f"⚠️ {gate['reason']}",
            "parent_message_id": message.get("id"),
            "metadata": {"event": "ai_blocked_by_group_settings", "reason": gate["reason"]},
            "reactions": {}, "created_at": now_iso(),
            "edited_at": None, "deleted_at": None,
        }
        await db.messages.insert_one(sys_msg.copy())
        await _broadcast_message(chat["id"], sys_msg)
        return

    workspace_id = chat["workspace_id"]
    sub = await db.ai_employee_subscriptions.find_one(
        {"workspace_id": workspace_id, "employee_key": employee_key}, {"_id": 0}
    )
    # Newly-graduated catalog employees (e.g. restaurant_orders, bill_pay) might
    # not yet have a subscription doc in any workspace. Auto-bootstrap a 7-day
    # trial on first @-mention so the experience stays seamless once we flip a
    # catalog entry to status='active'.
    if not sub:
        from datetime import datetime, timedelta, timezone
        trial_end = (datetime.now(timezone.utc) + timedelta(days=emp.get("trial_days", 7))).isoformat()
        sub = {
            "id": new_id(),
            "workspace_id": workspace_id,
            "employee_key": employee_key,
            "status": "trial",
            "trial_ends_at": trial_end,
            "credits_remaining": emp.get("trial_credits", 0) or emp.get("monthly_credits", 0),
            "display_first_name": None,
            "display_full_name": None,
            "auto_subscribed": True,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.ai_employee_subscriptions.update_one(
            {"workspace_id": workspace_id, "employee_key": employee_key},
            {"$setOnInsert": sub},
            upsert=True,
        )
    if sub.get("status") in ("cancelled", "paused"):
        sys_msg = {
            "id": new_id(),
            "chat_id": chat["id"],
            "sender_id": "ai-system",
            "message_type": "text",
            "body": (
                f"⚠️ **{emp['name']} is not active in this workspace.** Owners can start "
                f"a 7-day trial from the AI Employees page."
            ),
            "parent_message_id": None,
            "metadata": {"event": "ai_employee_not_subscribed", "employee_key": employee_key},
            "reactions": {},
            "created_at": now_iso(),
            "edited_at": None,
            "deleted_at": None,
        }
        await db.messages.insert_one(sys_msg.copy())
        await _broadcast_message(chat["id"], sys_msg)
        return

    display_first = sub.get("display_first_name") or emp["name"]
    display_full = sub.get("display_full_name") or f"{display_first} AI"

    placeholder = {
        "id": new_id(),
        "chat_id": chat["id"],
        "sender_id": f"ai-{employee_key}",
        "message_type": "ai_answer",
        "body": f"_{display_full} is thinking…_",
        "parent_message_id": message.get("id"),
        "metadata": {
            "employee_key": employee_key,
            "status": "running",
            "ai_display_name": display_full,
            "ai_role": emp["name"],
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(placeholder.copy())
    await _broadcast_message(chat["id"], placeholder)

    provider, model = PROVIDER_MAP.get(emp.get("default_model", "chatgpt"), ("openai", "gpt-4o"))

    # ── AI CMO: pull connected social analytics so we can reason about them ──
    context_block = ""
    if employee_key == "cmo":
        snaps = await db.social_connections.find(
            {"workspace_id": workspace_id},
            {"_id": 0, "access_token": 0, "refresh_token": 0},
        ).to_list(20)
        if snaps:
            lines = []
            for s in snaps:
                snap = s.get("last_snapshot") or {}
                if not snap:
                    continue
                if s["platform"] == "youtube":
                    lines.append(
                        f"- YouTube {s.get('display_name')}: {snap.get('subscribers', 0):,} subscribers, "
                        f"{snap.get('views', 0):,} views across {snap.get('videos', 0)} videos."
                    )
                elif s["platform"] == "instagram":
                    lines.append(
                        f"- Instagram {snap.get('username') or s.get('display_name')}: "
                        f"{snap.get('followers', 0):,} followers, {snap.get('media_count', 0)} posts."
                    )
                elif s["platform"] == "facebook":
                    lines.append(
                        f"- Facebook Page {snap.get('name') or s.get('display_name')}: "
                        f"{snap.get('fans', 0):,} fans, {snap.get('followers', 0):,} followers."
                    )
            if lines:
                context_block = (
                    "\n\nLatest social analytics for this workspace (refreshed by the user):\n"
                    + "\n".join(lines)
                    + "\n\nReference these numbers concretely in your reply."
                )

    # ── Personalised persona prefix + recent chat memory ────────────────────
    persona_block = (
        f"\n\nYou are addressed in this workspace as '{display_full}' "
        f"(first name: {display_first}). When introducing yourself, sign off "
        f"as {display_first}. Speak in first person."
    )
    # Pull the last 10 messages of this chat as recall context so you can
    # answer follow-ups, remember what was discussed, and behave like a real
    # teammate who has been listening to the conversation.
    recent = await db.messages.find(
        {"chat_id": chat["id"], "deleted_at": None},
        {"_id": 0, "sender_id": 1, "body": 1, "created_at": 1, "metadata": 1},
    ).sort("created_at", -1).limit(11).to_list(11)
    recent.reverse()
    # Exclude the in-flight user message + the placeholder.
    history_lines: List[str] = []
    for m in recent:
        if m.get("body") is None or m.get("body", "").startswith("_"):
            continue
        if m.get("sender_id", "").startswith("ai-"):
            who = m.get("metadata", {}).get("ai_display_name") or "AI"
        else:
            who = m.get("sender_id", "user")[:8]
        body_text = (m.get("body") or "")[:280]
        history_lines.append(f"[{who}] {body_text}")
    history_block = ""
    if history_lines:
        history_block = (
            "\n\nRecent conversation in this chat (oldest first), so you remember "
            "what's been discussed:\n" + "\n".join(history_lines[-10:])
        )

    try:
        chat_session = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"{employee_key}-{chat['id']}",
            system_message=emp["system_prompt"] + persona_block + context_block + history_block,
        ).with_model(provider, model)
        # Cap the LLM call so users never sit forever on "thinking…". Sonnet
        # 4.5 can take 20-30s for long replies; 60s is a generous upper bound.
        answer = await asyncio.wait_for(
            chat_session.send_message(UserMessage(text=question)), timeout=60.0,
        )
        answer_text = str(answer).strip() or "_(empty response)_"
        status = "complete"
    except asyncio.TimeoutError:
        answer_text = (
            f"⚠️ {emp['name']} took longer than 60s to respond. "
            "This usually means the AI provider is under load — please try again."
        )
        status = "error"
    except Exception as e:
        answer_text = f"⚠️ {emp['name']} failed: {e}"
        status = "error"

    await db.messages.update_one(
        {"id": placeholder["id"]},
        {"$set": {"body": answer_text, "metadata.status": status, "edited_at": now_iso()}},
    )
    placeholder["body"] = answer_text
    placeholder["metadata"]["status"] = status
    await _broadcast_message(chat["id"], placeholder)

    if status == "complete":
        credits = emp.get("credits_per_task_estimate", 15)
        await deduct_employee_credits(
            workspace_id=workspace_id, employee_key=employee_key,
            user_id=sender["id"], credits=credits,
            reason=f"{emp['name']} reply in {chat.get('name') or chat['id'][:8]}",
            task_id=placeholder["id"],
        )
        # Log the task completion for the savings dashboard. We don't add a
        # row to the Tasks board (that would be spammy) — instead we keep a
        # lightweight `ai_employee_tasks` ledger.
        await db.ai_employee_tasks.insert_one({
            "id": new_id(),
            "workspace_id": workspace_id,
            "employee_key": employee_key,
            "display_full_name": display_full,
            "chat_id": chat["id"],
            "message_id": placeholder["id"],
            "question": question[:280],
            "answer_preview": answer_text[:200],
            "credits_used": credits,
            "estimated_hours_saved": emp.get("hours_saved_per_task", 0.5),
            "completed_at": now_iso(),
            "completed_by_user": sender["id"],
        })
        await log_employee_activity(
            workspace_id=workspace_id, employee_key=employee_key,
            actor_id=sender["id"], kind="reply", summary=question[:140],
            metadata={"message_id": placeholder["id"]},
        )
        # Per-chat usage ledger (employee work).
        await record_ai_usage(
            chat_id=chat["id"], user_id=sender["id"],
            credits=credits, employee_key=employee_key,
            workflow="employee",
            project_folder_id=chat.get("project_folder_id"),
        )
        # AI Conversation Mode — keep this user's session pointed at THIS
        # employee so untagged follow-ups continue with it (no re-mention).
        try:
            from services import ai_conversation as _aiconv
            label = "@" + (emp.get("name") or "AI").replace("AI ", "", 1).replace(" ", "")
            await _aiconv.note_active_assistant(
                workspace_id=workspace_id, chat_id=chat["id"], user_id=sender["id"],
                assistant_id=f"employee:{employee_key}", assistant_label=label,
            )
            await _aiconv.start_or_refresh_session(
                workspace_id=workspace_id, chat_id=chat["id"], user_id=sender["id"],
                assistant_id=f"employee:{employee_key}", assistant_label=label,
                latest_ai_message_id=placeholder["id"], topic=question[:120],
            )
        except Exception:
            pass


def schedule_employee_if_addressed(chat: dict, sender: dict, message: dict) -> bool:
    """If the message addresses any prompt-only AI employee, schedule the
    handler. Resolves the workspace's per-employee custom names too."""
    body = (message.get("body") or "").strip()
    if not body.startswith("@"):
        return False

    async def _go():
        triggers = await _build_trigger_map(chat["workspace_id"])
        matched = _match_employee_with_map(message.get("body", ""), triggers)
        if not matched:
            return
        key, question = matched
        await _run_employee(chat, sender, message, key, question)

    asyncio.create_task(_go())
    return True
