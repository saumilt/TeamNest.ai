"""Automation Builder (Drop 2).

Natural-language automations: describe → parse into WHEN / GET / THEN → save →
manual Run/Test. Real execution is limited to a SAFE recipe (read overdue tasks
or recent research, summarize with AI, post to a chat). Any other action type is
recorded as "simulated" in the run timeline until real triggers/actions land.
No private chain-of-thought is exposed — only a user-facing reasoning summary.
"""
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ai_service import complete
from deps import _broadcast_message, db, new_id, now_iso, require_user

router = APIRouter()

RISK_LEVELS = {"low", "medium", "high"}

TEMPLATES = [
    {"category": "Management", "key": "daily_digest", "title": "Daily team digest",
     "prompt": "Every morning summarize overdue tasks and post the digest to our team chat.", "risk": "low"},
    {"category": "Management", "key": "overdue_report", "title": "Overdue task report",
     "prompt": "Summarize all overdue tasks and post the report to our team chat.", "risk": "low"},
    {"category": "Management", "key": "weekly_project", "title": "Weekly project summary",
     "prompt": "Every Monday summarize recent AI research and post it to our team chat.", "risk": "low"},
    {"category": "Sales", "key": "lead_research", "title": "Research new leads",
     "prompt": "When a new CRM lead is created, research the company and post a briefing to sales.", "risk": "medium"},
    {"category": "Sales", "key": "followup", "title": "Follow up after meeting",
     "prompt": "After a meeting, draft a follow-up email to the attendees.", "risk": "medium"},
    {"category": "Marketing", "key": "competitor", "title": "Competitor monitoring",
     "prompt": "Every week summarize competitor updates and post them to the marketing chat.", "risk": "low"},
    {"category": "Finance", "key": "invoice_reminder", "title": "Invoice approval reminder",
     "prompt": "Remind finance about pending invoice approvals every Monday.", "risk": "low"},
    {"category": "Students", "key": "deadlines", "title": "Assignment deadline reminders",
     "prompt": "Summarize upcoming assignment deadlines and post them to my group chat.", "risk": "low"},
    {"category": "Personal", "key": "research_digest", "title": "Weekly research digest",
     "prompt": "Every week summarize my recent AI research and post it to my notes chat.", "risk": "low"},
]


# ----- models -----
class ParseRequest(BaseModel):
    prompt: str


class AutomationStep(BaseModel):
    kind: str  # get | ai | post | app | notify | condition
    label: str
    config: dict = Field(default_factory=dict)


class AutomationTrigger(BaseModel):
    type: str = "manual"  # scheduled | event | condition | manual
    label: str = "Manual — run on demand"
    config: dict = Field(default_factory=dict)


class AutomationCreate(BaseModel):
    name: str
    description: str = ""
    nl_prompt: str = ""
    trigger: AutomationTrigger = Field(default_factory=AutomationTrigger)
    steps: List[AutomationStep] = Field(default_factory=list)
    risk: str = "low"
    target_chat_id: Optional[str] = None
    status: str = "active"


class AutomationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    target_chat_id: Optional[str] = None
    steps: Optional[List[AutomationStep]] = None
    trigger: Optional[AutomationTrigger] = None
    risk: Optional[str] = None


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def _steps_from_plan(plan: dict) -> List[dict]:
    steps: List[dict] = []
    get = plan.get("get") or {}
    if get.get("source") and get["source"] != "none":
        steps.append({"kind": "get", "label": get.get("label") or f"Get {get['source']}",
                      "config": {"source": get["source"]}})
    for t in (plan.get("then") or []):
        action = (t.get("action") or "").lower()
        label = t.get("label") or action
        target = t.get("target")
        if action == "summarize":
            steps.append({"kind": "ai", "label": label or "Summarize with AI", "config": {"op": "summarize"}})
        elif action == "post_chat":
            steps.append({"kind": "post", "label": label or "Post to chat", "config": {"target": target}})
        elif action == "draft_email":
            steps.append({"kind": "ai", "label": label or "Draft an email", "config": {"op": "draft_email"}})
        else:
            steps.append({"kind": "app", "label": label or action, "config": {"action": action, "target": target}})
    return steps


@router.post("/automations/parse")
async def parse_automation(payload: ParseRequest, current=Depends(require_user)):
    """LLM parse of a plain-English request into a WHEN/GET/THEN plan. Does NOT save."""
    prompt = (payload.prompt or "").strip()
    if not prompt:
        raise HTTPException(400, "Describe what you want to automate")
    sys = "You convert a plain-English automation request into a structured plan. Output STRICT JSON only, no prose."
    instruction = (
        "Convert the request into JSON with EXACTLY these keys:\n"
        '- "name": short title, max 6 words\n'
        '- "trigger": {"type": one of scheduled|event|condition|manual, "label": human text e.g. "Monday at 8 AM"}\n'
        '- "get": {"source": one of overdue_tasks|recent_research|crm_leads|none, "label": human text}\n'
        '- "then": array of {"action": one of summarize|post_chat|draft_email|update_crm|notify|create_task, '
        '"label": human text, "target": optional e.g. a chat name}\n'
        '- "risk": one of low|medium|high (high if it sends external email, deletes data, spends money, '
        "or changes permissions; medium if it updates an external system; otherwise low)\n\n"
        f'Request: "{prompt}"\n\nJSON:'
    )
    raw = await complete(sys, instruction, "claude")
    text = raw.strip()
    if "```" in text:
        text = text.split("```")[1].replace("json", "", 1).strip() if text.count("```") >= 2 else text
    start, end = text.find("{"), text.rfind("}")
    plan = {}
    if start != -1 and end != -1:
        try:
            plan = json.loads(text[start:end + 1])
        except Exception:
            plan = {}
    if not plan:
        # graceful fallback so the UI never dead-ends
        plan = {
            "name": prompt[:40],
            "trigger": {"type": "manual", "label": "Manual — run on demand"},
            "get": {"source": "none", "label": ""},
            "then": [{"action": "summarize", "label": "Summarize with AI"}],
            "risk": "low",
        }
    trig = plan.get("trigger") or {}
    risk = (plan.get("risk") or "low").lower()
    if risk not in RISK_LEVELS:
        risk = "low"
    return {
        "name": plan.get("name") or prompt[:40],
        "description": prompt,
        "nl_prompt": prompt,
        "trigger": {"type": (trig.get("type") or "manual"), "label": trig.get("label") or "Manual — run on demand", "config": {}},
        "steps": _steps_from_plan(plan),
        "risk": risk,
    }


@router.get("/automations/templates")
async def automation_templates(current=Depends(require_user)):
    return {"templates": TEMPLATES}


@router.get("/automations/stats")
async def automation_stats(current=Depends(require_user)):
    ws = current["workspace_id"]
    running = await db.automations.count_documents({"workspace_id": ws, "status": "active"})
    needs_approval = await db.automations.count_documents(
        {"workspace_id": ws, "status": "active", "risk": "high"}
    )
    failed = await db.automation_runs.count_documents({"workspace_id": ws, "status": "failed"})
    successes = await db.automation_runs.count_documents(
        {"workspace_id": ws, "status": {"$in": ["success", "partial"]}}
    )
    ai_runs = await db.automation_runs.count_documents({"workspace_id": ws, "used_ai": True})
    return {
        "running": running,
        "needs_approval": needs_approval,
        "failed": failed,
        "saved_hours": round(successes * 0.25, 2),
        "credits_used": ai_runs,
    }


@router.get("/automations")
async def list_automations(current=Depends(require_user)):
    ws = current["workspace_id"]
    items = await db.automations.find({"workspace_id": ws}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"items": items}


@router.post("/automations")
async def create_automation(payload: AutomationCreate, current=Depends(require_user)):
    risk = payload.risk if payload.risk in RISK_LEVELS else "low"
    doc = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "user_id": current["id"],
        "name": payload.name.strip() or "Untitled automation",
        "description": payload.description,
        "nl_prompt": payload.nl_prompt,
        "trigger": payload.trigger.model_dump(),
        "steps": [s.model_dump() for s in payload.steps],
        "risk": risk,
        "status": payload.status if payload.status in {"active", "paused", "draft"} else "active",
        "target_chat_id": payload.target_chat_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "last_run_at": None,
    }
    await db.automations.insert_one(doc.copy())
    return _clean(doc)


@router.get("/automations/{automation_id}")
async def get_automation(automation_id: str, current=Depends(require_user)):
    doc = await db.automations.find_one(
        {"id": automation_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "Automation not found")
    runs = await db.automation_runs.find(
        {"automation_id": automation_id}, {"_id": 0}
    ).sort("started_at", -1).to_list(20)
    return {"automation": doc, "runs": runs}


@router.patch("/automations/{automation_id}")
async def update_automation(automation_id: str, payload: AutomationUpdate, current=Depends(require_user)):
    doc = await db.automations.find_one(
        {"id": automation_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "Automation not found")
    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.description is not None:
        updates["description"] = payload.description
    if payload.status in {"active", "paused", "draft"}:
        updates["status"] = payload.status
    if payload.target_chat_id is not None:
        updates["target_chat_id"] = payload.target_chat_id
    if payload.steps is not None:
        updates["steps"] = [s.model_dump() for s in payload.steps]
    if payload.trigger is not None:
        updates["trigger"] = payload.trigger.model_dump()
    if payload.risk in RISK_LEVELS:
        updates["risk"] = payload.risk
    updates["updated_at"] = now_iso()
    await db.automations.update_one({"id": automation_id}, {"$set": updates})
    doc.update(updates)
    return doc


@router.delete("/automations/{automation_id}")
async def delete_automation(automation_id: str, current=Depends(require_user)):
    res = await db.automations.delete_one(
        {"id": automation_id, "workspace_id": current["workspace_id"]}
    )
    if not res.deleted_count:
        raise HTTPException(404, "Automation not found")
    await db.automation_runs.delete_many({"automation_id": automation_id})
    return {"ok": True}


@router.get("/automations/{automation_id}/runs")
async def list_runs(automation_id: str, current=Depends(require_user)):
    doc = await db.automations.find_one(
        {"id": automation_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1}
    )
    if not doc:
        raise HTTPException(404, "Automation not found")
    runs = await db.automation_runs.find(
        {"automation_id": automation_id}, {"_id": 0}
    ).sort("started_at", -1).to_list(50)
    return {"runs": runs}


async def _execute(automation: dict, current: dict):
    """Run the safe recipe for real; log everything else as simulated."""
    ws = automation["workspace_id"]
    uid = current["id"]
    timeline = [{"at": now_iso(), "message": f"Automation '{automation['name']}' started", "kind": "start"}]

    def log(msg, kind="step"):
        timeline.append({"at": now_iso(), "message": msg, "kind": kind})

    steps = automation.get("steps", [])
    get_source = next((s.get("config", {}).get("source") for s in steps if s["kind"] == "get"), None)
    content, source_label = None, None

    if get_source == "overdue_tasks":
        today = now_iso()[:10]
        tasks = await db.tasks.find(
            {"workspace_id": ws, "status": {"$nin": ["completed", "done", "archived"]}},
            {"_id": 0, "title": 1, "due_date": 1},
        ).to_list(200)
        overdue = [t for t in tasks if t.get("due_date") and t["due_date"][:10] < today]
        source_label = "overdue tasks"
        log(f"Found {len(overdue)} overdue task(s)")
        content = "\n".join(f"- {t['title']} (due {t.get('due_date', '')[:10]})" for t in overdue[:30]) or "No overdue tasks right now."
    elif get_source == "recent_research":
        chat_ids = [c["id"] async for c in db.chats.find({"workspace_id": ws, "member_ids": uid}, {"id": 1, "_id": 0})]
        threads = []
        if chat_ids:
            threads = await db.ai_threads.find(
                {"chat_id": {"$in": chat_ids}}, {"_id": 0, "question": 1, "final_answer": 1, "created_at": 1}
            ).sort("created_at", -1).to_list(10)
        source_label = "recent research"
        log(f"Found {len(threads)} recent research thread(s)")
        content = "\n\n".join(
            f"Q: {t.get('question', '')}\nA: {(t.get('final_answer') or '')[:400]}" for t in threads[:8]
        ) or "No recent research yet."

    used_ai = False
    summary = None
    has_summarize = any(s["kind"] == "ai" and s.get("config", {}).get("op") == "summarize" for s in steps)
    if content is not None and has_summarize:
        try:
            summary = await complete(
                "You are a concise operations assistant.",
                f"Summarize the following {source_label} into a short, skimmable update with bullet points "
                f"and one recommended next step:\n\n{content}",
                "claude",
            )
            used_ai = True
            log("AI summarized the results")
        except Exception:
            summary = content
            log("AI summary unavailable — used the raw list", "warn")
    body = summary or content

    post_step = next((s for s in steps if s["kind"] == "post"), None)
    posted_chat = None
    if post_step and body:
        target_chat_id = automation.get("target_chat_id")
        if not target_chat_id:
            name = (post_step.get("config", {}) or {}).get("target")
            if name:
                c = await db.chats.find_one(
                    {"workspace_id": ws, "name": {"$regex": f"^{name}$", "$options": "i"}}, {"_id": 0, "id": 1}
                )
                target_chat_id = c["id"] if c else None
        if target_chat_id:
            msg = {
                "id": new_id(),
                "chat_id": target_chat_id,
                "sender_id": "ai-system",
                "message_type": "text",
                "body": f"🤖 **{automation['name']}**\n\n{body}",
                "parent_message_id": None,
                "metadata": {"event": "automation", "automation_id": automation["id"]},
                "reactions": {},
                "created_at": now_iso(),
                "edited_at": None,
                "deleted_at": None,
            }
            await db.messages.insert_one(msg.copy())
            await _broadcast_message(target_chat_id, msg)
            posted_chat = target_chat_id
            log("Posted the update to the target chat", "done")
        else:
            log("No target chat resolved — post skipped (simulated)", "sim")

    for s in steps:
        if s["kind"] == "app":
            log(f"Simulated: {s['label']} — real execution coming soon", "sim")

    if posted_chat:
        status = "success"
    elif post_step:
        status = "partial"
    else:
        status = "simulated"

    bits = []
    if source_label:
        bits.append(f"read {source_label}")
    if used_ai:
        bits.append("summarized with AI")
    if posted_chat:
        bits.append("posted the update to chat")
    reasoning = "TeamNest " + ", ".join(bits) + "." if bits else "Nothing to run for this automation yet."
    return timeline, status, reasoning, posted_chat, used_ai


@router.post("/automations/{automation_id}/run")
async def run_automation(automation_id: str, current=Depends(require_user)):
    automation = await db.automations.find_one(
        {"id": automation_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not automation:
        raise HTTPException(404, "Automation not found")

    started = now_iso()
    try:
        timeline, status, reasoning, posted_chat, used_ai = await _execute(automation, current)
    except Exception as e:  # noqa: BLE001
        timeline = [{"at": started, "message": "Automation failed", "kind": "error"},
                    {"at": now_iso(), "message": str(e)[:200], "kind": "error"}]
        status, reasoning, posted_chat, used_ai = "failed", "The automation hit an error while running.", None, False

    run = {
        "id": new_id(),
        "automation_id": automation_id,
        "workspace_id": current["workspace_id"],
        "status": status,
        "reasoning_summary": reasoning,
        "posted_chat_id": posted_chat,
        "used_ai": used_ai,
        "timeline": timeline,
        "started_at": started,
        "finished_at": now_iso(),
    }
    await db.automation_runs.insert_one(run.copy())
    await db.automations.update_one({"id": automation_id}, {"$set": {"last_run_at": now_iso()}})
    return _clean(run)
