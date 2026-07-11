"""Deployed AI Employee responder.

When a chat message @-mentions the handle of an AI employee that was deployed
via the Builder (Phase 3), that employee auto-responds in the chat using its
full configuration (profile + saved style + knowledge + permissions +
escalation rules) — the same runtime the sandbox uses.
"""
import asyncio
import re
from typing import List

from deps import _broadcast_message, db, new_id, now_iso
from services.ai_employee_runtime import build_system_prompt, generate_reply

HANDLE_RE = re.compile(r"@([a-z0-9_-]{2,40})", re.I)


async def _load_config(eid: str, ws: str):
    emp = await db.ai_employees.find_one({"id": eid, "workspace_id": ws}, {"_id": 0})
    if not emp:
        return None
    style_doc = await db.ai_employee_style_profiles.find_one(
        {"employee_id": eid, "status": "saved"}, {"_id": 0})
    style = style_doc.get("profile") if style_doc else None
    docs = await db.ai_employee_training_documents.find({"employee_id": eid}, {"_id": 0}).to_list(20)
    examples = await db.ai_employee_examples.find({"employee_id": eid}, {"_id": 0}).to_list(20)
    esc = await db.ai_employee_escalation_rules.find({"employee_id": eid}, {"_id": 0}).to_list(50)
    perm_doc = await db.ai_employee_permissions.find_one({"employee_id": eid}, {"_id": 0})
    perm = (perm_doc or {}).get("permission_level", "Answer only")
    return emp, style, docs, examples, esc, perm


async def _recent_history(chat_id: str) -> List[str]:
    rows = await db.messages.find(
        {"chat_id": chat_id, "deleted_at": None},
        {"_id": 0, "sender_id": 1, "body": 1, "metadata": 1},
    ).sort("created_at", -1).limit(11).to_list(11)
    rows.reverse()
    lines: List[str] = []
    for m in rows:
        body = m.get("body") or ""
        if not body or body.startswith("_"):
            continue
        who = (m.get("metadata", {}).get("ai_display_name")
               if m.get("sender_id", "").startswith("ai-") else "Teammate")
        lines.append(f"[{who or 'AI'}] {body[:280]}")
    return lines[-10:]


async def _respond(chat: dict, sender: dict, message: dict, deployment: dict) -> None:
    ws = chat["workspace_id"]
    eid = deployment["employee_id"]
    cfg = await _load_config(eid, ws)
    if not cfg:
        return
    emp, style, docs, examples, esc, perm = cfg
    handle = deployment.get("handle", "")
    display = emp.get("name") or f"@{handle}"

    body = message.get("body", "")
    question = re.sub(rf"@{re.escape(handle)}\b", "", body, flags=re.I).strip() or body.strip()

    placeholder = {
        "id": new_id(), "chat_id": chat["id"], "sender_id": f"ai-emp-{eid}",
        "message_type": "ai_answer", "body": f"_{display} is thinking…_",
        "parent_message_id": message.get("id"),
        "metadata": {"deployed_employee_id": eid, "handle": handle,
                     "ai_display_name": display, "ai_role": emp.get("job_title") or "AI Employee",
                     "status": "running"},
        "reactions": {}, "created_at": now_iso(), "edited_at": None, "deleted_at": None,
    }
    await db.messages.insert_one(placeholder.copy())
    await _broadcast_message(chat["id"], placeholder)

    system = build_system_prompt(emp, style, docs, examples, perm, esc)
    history = await _recent_history(chat["id"])
    if history:
        system += ("\n\nRecent conversation in this chat (oldest first) — use it "
                   "for context:\n" + "\n".join(history))
    try:
        result = await asyncio.wait_for(generate_reply(system, question), timeout=60.0)
        answer = result["reply"] or "_(empty response)_"
        escalated = result["escalated"]
        status = "complete"
    except asyncio.TimeoutError:
        answer = f"⚠️ {display} took too long to respond — please try again."
        escalated, status = False, "error"
    except Exception as e:
        answer = f"⚠️ {display} failed: {e}"
        escalated, status = False, "error"

    await db.messages.update_one(
        {"id": placeholder["id"]},
        {"$set": {"body": answer, "metadata.status": status,
                  "metadata.escalated": escalated, "edited_at": now_iso()}},
    )
    placeholder["body"] = answer
    placeholder["metadata"]["status"] = status
    placeholder["metadata"]["escalated"] = escalated
    await _broadcast_message(chat["id"], placeholder)

    if escalated:
        await _notify_escalation(emp, chat, sender, question, answer)

    # Corporate billing — count the triggering user as a monthly-active user
    # of this deployed employee (best-effort; only bills workspace-enabled ones).
    if status == "complete":
        try:
            from services.ai_employee_billing import record_ai_employee_usage
            await record_ai_employee_usage(ws, eid, sender.get("id"))
        except Exception:
            pass


async def _notify_escalation(emp, chat, sender, question, answer):
    """Alert the employee's creator + workspace owners when an escalation fires."""
    from routes.notifications_feed import create_notification
    ws = chat["workspace_id"]
    recipients = set()
    if emp.get("creator_user_id"):
        recipients.add(emp["creator_user_id"])
    async for m in db.workspace_members.find(
        {"workspace_id": ws, "role": {"$in": ["owner", "admin"]}}, {"_id": 0, "user_id": 1}
    ):
        if m.get("user_id"):
            recipients.add(m["user_id"])
    recipients.discard(f"ai-emp-{emp['id']}")
    title = f"{emp.get('name', 'AI employee')} escalated a request"
    body = f'In "{chat.get("name") or "a chat"}": "{question[:140]}" — {answer[:160]}'
    for uid in recipients:
        await create_notification(
            uid, "escalation", title, body,
            meta={"chat_id": chat["id"], "employee_id": emp["id"], "handle": emp.get("deployment_handle", "")},
        )


def schedule_deployed_employee_if_mentioned(chat: dict, sender: dict, message: dict) -> bool:
    """If the message @-mentions a deployed AI employee's handle, schedule its reply."""
    body = (message.get("body") or "")
    if "@" not in body:
        return False
    handles = {h.lower() for h in HANDLE_RE.findall(body)}
    if not handles:
        return False

    async def _go():
        deps = await db.ai_employee_deployments.find(
            {"workspace_id": chat["workspace_id"], "status": "active",
             "handle": {"$in": list(handles)}}, {"_id": 0}).to_list(10)
        for d in deps:
            # Chat-bound deployments only respond inside their bound chat.
            if d.get("channel") == "chat" and d.get("chat_id") and d["chat_id"] != chat["id"]:
                continue
            await _respond(chat, sender, message, d)

    asyncio.create_task(_go())
    return True
