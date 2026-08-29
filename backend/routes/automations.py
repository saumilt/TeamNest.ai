"""Automation Builder (Drop 2).

Natural-language automations: describe → parse into WHEN / GET / THEN → save →
manual Run/Test. Real execution is limited to a SAFE recipe (read overdue tasks
or recent research, summarize with AI, post to a chat). Any other action type is
recorded as "simulated" in the run timeline until real triggers/actions land.
No private chain-of-thought is exposed — only a user-facing reasoning summary.
"""
import json
import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ai_service import complete
from deps import _broadcast_message, _post_reminder, db, logger, new_id, now_iso, require_user

router = APIRouter()

RISK_LEVELS = {"low", "medium", "high"}
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
RUN_COOLDOWN_SECONDS = 20
CONDITION_COOLDOWN_HOURS = 12
# Only high-risk actions require approval by default (medium auto-runs with a
# recommendation). Each workspace can tighten this via automation_policies.
DEFAULT_POLICY = {"low": False, "medium": False, "high": True}
# Runaway-loop guard: cap how many times a single automation can run per hour
# (covers manual Test runs + autonomous trigger fires).
AUTOMATION_MAX_RUNS_PER_HOUR = int(os.environ.get("AUTOMATION_MAX_RUNS_PER_HOUR", "30"))
# Which collection a given external event polls against in the tick loop.
EVENT_COLLECTIONS = {"crm_lead_created": "external_contacts", "task_created": "tasks"}

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


def _parse_iso(s):
    try:
        return datetime.fromisoformat((s or "").replace("Z", "+00:00"))
    except Exception:
        return None


def compute_next_run(trigger: dict, after: datetime = None) -> Optional[str]:
    """Next fire time (ISO) for a scheduled trigger, else None."""
    after = after or datetime.now(timezone.utc)
    if (trigger or {}).get("type") != "scheduled":
        return None
    sched = (trigger.get("config") or {}).get("schedule") or {}
    freq = sched.get("freq") or "daily"
    hh, mm = 8, 0
    try:
        parts = (sched.get("time") or "08:00").split(":")
        hh, mm = int(parts[0]), int(parts[1])
    except Exception:
        pass
    if freq == "hourly":
        return (after + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0).isoformat()
    candidate = after.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if freq == "weekly":
        wd = sched.get("weekday")
        target = WEEKDAYS.index(wd) if wd in WEEKDAYS else 0
        days = (target - after.weekday()) % 7
        candidate = (after + timedelta(days=days)).replace(hour=hh, minute=mm, second=0, microsecond=0)
        if candidate <= after:
            candidate += timedelta(days=7)
        return candidate.isoformat()
    if candidate <= after:
        candidate += timedelta(days=1)
    return candidate.isoformat()


async def _get_policy(ws: str) -> dict:
    doc = await db.automation_policies.find_one({"workspace_id": ws}, {"_id": 0})
    if not doc:
        return dict(DEFAULT_POLICY)
    return {k: bool(doc.get(k, DEFAULT_POLICY[k])) for k in DEFAULT_POLICY}


async def _requires_approval(automation: dict) -> bool:
    policy = await _get_policy(automation["workspace_id"])
    return policy.get(automation.get("risk", "low"), False)


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
        '- "trigger": {"type": one of scheduled|event|condition|manual, "label": human text e.g. "Monday at 8 AM", '
        '"schedule": {"freq": daily|weekly|hourly, "time": "HH:MM" 24h, "weekday": mon|tue|wed|thu|fri|sat|sun or null} '
        '(ONLY when type is scheduled), '
        '"condition": overdue_tasks|stalled_projects (ONLY when type is condition), '
        '"event": crm_lead_created|email_received|task_created (ONLY when type is event)}\n'
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
    ttype = trig.get("type") or "manual"
    tconfig = {}
    if ttype == "scheduled":
        sched = trig.get("schedule") or {}
        tconfig["schedule"] = {
            "freq": sched.get("freq") or "daily",
            "time": sched.get("time") or "08:00",
            "weekday": sched.get("weekday") if sched.get("weekday") in WEEKDAYS else None,
        }
    elif ttype == "condition":
        tconfig["condition"] = trig.get("condition") or "overdue_tasks"
    elif ttype == "event":
        tconfig["event"] = trig.get("event") or "crm_lead_created"
    return {
        "name": plan.get("name") or prompt[:40],
        "description": prompt,
        "nl_prompt": prompt,
        "trigger": {"type": ttype, "label": trig.get("label") or "Manual — run on demand", "config": tconfig},
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
    needs_approval = await db.automation_runs.count_documents(
        {"workspace_id": ws, "status": "pending_approval"}
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
        "next_run_at": compute_next_run(payload.trigger.model_dump()),
        "last_condition_fire_at": None,
        "last_event_check_at": now_iso(),
    }
    await db.automations.insert_one(doc.copy())
    return _clean(doc)


class PolicyUpdate(BaseModel):
    low: Optional[bool] = None
    medium: Optional[bool] = None
    high: Optional[bool] = None


@router.get("/automations/pending")
async def list_pending(current=Depends(require_user)):
    """Runs waiting on approval in this workspace, annotated with automation name/risk."""
    runs = await db.automation_runs.find(
        {"workspace_id": current["workspace_id"], "status": "pending_approval"}, {"_id": 0}
    ).sort("started_at", -1).to_list(100)
    ids = list({r["automation_id"] for r in runs})
    autos = await db.automations.find(
        {"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "risk": 1, "trigger": 1}
    ).to_list(100)
    amap = {a["id"]: a for a in autos}
    for r in runs:
        a = amap.get(r["automation_id"]) or {}
        r["automation_name"] = a.get("name") or "Automation"
        r["risk"] = a.get("risk") or "high"
        r["trigger_label"] = (a.get("trigger") or {}).get("label")
    return {"items": runs}


@router.get("/automations/policy")
async def get_policy(current=Depends(require_user)):
    return {"policy": await _get_policy(current["workspace_id"])}


@router.put("/automations/policy")
async def set_policy(payload: PolicyUpdate, current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owners and admins can change the approval policy")
    ws = current["workspace_id"]
    policy = await _get_policy(ws)
    for k in ("low", "medium", "high"):
        v = getattr(payload, k)
        if v is not None:
            policy[k] = bool(v)
    await db.automation_policies.update_one(
        {"workspace_id": ws}, {"$set": {"workspace_id": ws, **policy}}, upsert=True
    )
    return {"policy": policy}


@router.get("/automations/suggestions")
async def automation_suggestions(current=Depends(require_user)):
    """Derive a few 'Suggested Automations' from real workspace signals."""
    ws = current["workspace_id"]
    uid = current["id"]
    existing = await db.automations.find(
        {"workspace_id": ws}, {"_id": 0, "nl_prompt": 1, "name": 1}
    ).to_list(200)
    blob = " ".join(((a.get("nl_prompt") or "") + " " + (a.get("name") or "")).lower() for a in existing)
    out: List[dict] = []

    today = now_iso()[:10]
    tasks = await db.tasks.find(
        {"workspace_id": ws, "status": {"$nin": ["completed", "done", "archived"]}}, {"_id": 0, "due_date": 1, "created_at": 1}
    ).to_list(1000)
    overdue = sum(1 for t in tasks if t.get("due_date") and t["due_date"][:10] < today)
    if overdue > 0 and "overdue" not in blob:
        out.append({
            "key": "overdue_digest", "title": "Daily overdue-task digest",
            "reason": f"You have {overdue} overdue task(s) right now.",
            "prompt": "Every morning at 8 AM summarize overdue tasks and post the digest to our team chat.",
            "risk": "low",
        })

    chat_ids = [c["id"] async for c in db.chats.find({"workspace_id": ws, "member_ids": uid}, {"id": 1, "_id": 0})]
    research_ct = await db.ai_threads.count_documents({"chat_id": {"$in": chat_ids}}) if chat_ids else 0
    if research_ct >= 3 and "research" not in blob:
        out.append({
            "key": "research_digest", "title": "Weekly research digest",
            "reason": f"You've run {research_ct} AI research threads — capture them weekly.",
            "prompt": "Every Monday summarize my recent AI research and post it to my notes chat.",
            "risk": "low",
        })

    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    stalled = sum(1 for t in tasks if (t.get("created_at") or "") < cutoff)
    if stalled > 0 and "stalled" not in blob and len(out) < 3:
        out.append({
            "key": "stalled_alert", "title": "Weekly stalled-work alert",
            "reason": f"{stalled} task(s) have been open for over a week.",
            "prompt": "Every week summarize tasks that have been open more than a week and post them to our team chat.",
            "risk": "low",
        })
    return {"suggestions": out}


@router.get("/automations/insights")
async def automation_insights(current=Depends(require_user)):
    """Per-automation + workspace run analytics: totals, success rate, estimated
    hours saved, and a 7-day daily run sparkline. Computed from recent runs."""
    ws = current["workspace_id"]
    runs = await db.automation_runs.find(
        {"workspace_id": ws}, {"_id": 0, "automation_id": 1, "status": 1, "started_at": 1}
    ).sort("started_at", -1).to_list(2000)

    days = [(datetime.now(timezone.utc) - timedelta(days=i)).date().isoformat() for i in range(6, -1, -1)]
    day_idx = {d: i for i, d in enumerate(days)}

    def _blank():
        return {"runs": 0, "success": 0, "failed": 0, "pending": 0, "saved_hours": 0.0,
                "success_rate": 0, "series": [0] * 7, "last_status": None, "last_run_at": None}

    by: dict = {}
    ws_roll = _blank()
    for r in runs:
        aid = r.get("automation_id")
        st = r.get("status")
        for bucket in (by.setdefault(aid, _blank()), ws_roll):
            bucket["runs"] += 1
            if st in ("success", "partial"):
                bucket["success"] += 1
            elif st == "failed":
                bucket["failed"] += 1
            elif st == "pending_approval":
                bucket["pending"] += 1
        d = (r.get("started_at") or "")[:10]
        if d in day_idx:
            by[aid]["series"][day_idx[d]] += 1
            ws_roll["series"][day_idx[d]] += 1
        if by[aid]["last_run_at"] is None:
            by[aid]["last_run_at"] = r.get("started_at")
            by[aid]["last_status"] = st

    def _finalize(b):
        completed = b["runs"] - b["pending"]
        b["success_rate"] = round(100 * b["success"] / completed) if completed else 0
        b["saved_hours"] = round(b["success"] * 0.25, 2)
        return b

    for b in by.values():
        _finalize(b)
    _finalize(ws_roll)
    return {"by_automation": by, "workspace": ws_roll}


CANVAS_TEMPLATES = [
    {
        "key": "daily_overdue_digest", "title": "Daily overdue-task digest",
        "description": "Every morning, summarize overdue tasks and post to a chat.", "category": "Productivity",
        "plan": {
            "name": "Daily overdue-task digest", "risk": "low",
            "trigger": {"type": "scheduled", "label": "Every day at 08:00", "config": {"schedule": {"freq": "daily", "time": "08:00", "weekday": None}}},
            "steps": [
                {"kind": "get", "label": "Get overdue tasks", "config": {"source": "overdue_tasks"}},
                {"kind": "ai", "label": "Summarize with AI", "config": {"op": "summarize"}},
                {"kind": "post", "label": "Post to a chat", "config": {"target": ""}},
            ],
        },
    },
    {
        "key": "weekly_research_digest", "title": "Weekly research digest",
        "description": "Every Monday, recap recent AI research to a chat.", "category": "Knowledge",
        "plan": {
            "name": "Weekly research digest", "risk": "low",
            "trigger": {"type": "scheduled", "label": "Every Monday at 09:00", "config": {"schedule": {"freq": "weekly", "time": "09:00", "weekday": "mon"}}},
            "steps": [
                {"kind": "get", "label": "Get recent AI research", "config": {"source": "recent_research"}},
                {"kind": "ai", "label": "Summarize with AI", "config": {"op": "summarize"}},
                {"kind": "post", "label": "Post to a chat", "config": {"target": ""}},
            ],
        },
    },
    {
        "key": "new_lead_welcome", "title": "New CRM lead → draft welcome email",
        "description": "When a new CRM lead appears, draft a welcome email.", "category": "Sales",
        "plan": {
            "name": "New lead welcome email", "risk": "medium",
            "trigger": {"type": "event", "label": "When a CRM lead is created", "config": {"event": "crm_lead_created"}},
            "steps": [
                {"kind": "get", "label": "Get CRM leads", "config": {"source": "crm_leads"}},
                {"kind": "ai", "label": "Draft an email", "config": {"op": "draft_email"}},
            ],
        },
    },
    {
        "key": "stalled_projects_alert", "title": "Stalled-projects alert",
        "description": "When work stalls, summarize it and notify the team.", "category": "Ops",
        "plan": {
            "name": "Stalled-projects alert", "risk": "low",
            "trigger": {"type": "condition", "label": "When projects stall", "config": {"condition": "stalled_projects"}},
            "steps": [
                {"kind": "get", "label": "Get overdue tasks", "config": {"source": "overdue_tasks"}},
                {"kind": "ai", "label": "Summarize with AI", "config": {"op": "summarize"}},
                {"kind": "post", "label": "Post to a chat", "config": {"target": ""}},
            ],
        },
    },
    {
        "key": "new_task_notify", "title": "New task → notify team",
        "description": "When a task is created, summarize it and post to a chat.", "category": "Productivity",
        "plan": {
            "name": "New task notification", "risk": "low",
            "trigger": {"type": "event", "label": "When a task is created", "config": {"event": "task_created"}},
            "steps": [
                {"kind": "ai", "label": "Summarize with AI", "config": {"op": "summarize"}},
                {"kind": "post", "label": "Post to a chat", "config": {"target": ""}},
            ],
        },
    },
]


@router.get("/automations/canvas-templates")
async def canvas_templates(current=Depends(require_user)):
    """Ready-made full workflow plans that open directly in the visual canvas."""
    return {"templates": CANVAS_TEMPLATES}


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
        updates["next_run_at"] = compute_next_run(updates["trigger"])
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


async def _do_run(automation, actor, source, started, run_id=None, approver=None):
    """Actually execute the safe recipe and persist a run doc (or update an
    existing pending run in place after approval)."""
    try:
        timeline, status, reasoning, posted_chat, used_ai = await _execute(automation, actor)
    except Exception as e:  # noqa: BLE001
        timeline = [{"at": started, "message": "Automation failed", "kind": "error"},
                    {"at": now_iso(), "message": str(e)[:200], "kind": "error"}]
        status, reasoning, posted_chat, used_ai = "failed", "The automation hit an error while running.", None, False

    doc = {
        "automation_id": automation["id"],
        "workspace_id": automation["workspace_id"],
        "status": status,
        "trigger_source": source,
        "reasoning_summary": reasoning,
        "posted_chat_id": posted_chat,
        "used_ai": used_ai,
        "timeline": timeline,
        "started_at": started,
        "finished_at": now_iso(),
    }
    if approver:
        doc["approved_by"] = approver
    if run_id:
        await db.automation_runs.update_one({"id": run_id}, {"$set": doc})
        doc["id"] = run_id
    else:
        doc["id"] = new_id()
        await db.automation_runs.insert_one(doc.copy())
    await db.automations.update_one({"id": automation["id"]}, {"$set": {"last_run_at": now_iso()}})
    try:
        from routes.apps import emit_zapier_event
        await emit_zapier_event(
            automation["workspace_id"], "automation.run",
            {"automation": automation.get("name"), "status": status, "summary": reasoning},
        )
    except Exception:
        pass
    return _clean(doc)


async def _notify_approval(automation: dict, run: dict) -> None:
    """Best-effort: DM the workspace owners/admins + the automation creator that
    a run is waiting on approval."""
    ws = automation["workspace_id"]
    admins = await db.users.find(
        {"workspace_id": ws, "role": {"$in": ["owner", "admin"]}}, {"_id": 0, "id": 1}
    ).to_list(50)
    ids = {u["id"] for u in admins}
    if automation.get("user_id"):
        ids.add(automation["user_id"])
    for uid in ids:
        try:
            await _post_reminder(
                uid,
                f'⚡ Automation "{automation["name"]}" needs your approval before it can run.',
                {"id": run["id"]},
            )
        except Exception:
            pass


async def _maybe_execute(automation: dict, actor: dict, source: str, can_approve: bool = False):
    """Gate high-risk automations behind approval, otherwise run the recipe.
    When approval is required and the caller can't self-approve, a
    `pending_approval` run is recorded + owners/admins are notified."""
    started = now_iso()
    if await _requires_approval(automation) and not can_approve:
        run = {
            "id": new_id(),
            "automation_id": automation["id"],
            "workspace_id": automation["workspace_id"],
            "status": "pending_approval",
            "trigger_source": source,
            "reasoning_summary": "Waiting for approval — this automation includes higher-risk actions.",
            "posted_chat_id": None,
            "used_ai": False,
            "timeline": [
                {"at": started, "message": f"Trigger fired ({source}) — waiting for approval", "kind": "start"},
                {"at": started, "message": "High-risk actions are gated by your workspace policy.", "kind": "warn"},
            ],
            "started_at": started,
            "finished_at": None,
            "approved_by": None,
        }
        await db.automation_runs.insert_one(run.copy())
        await db.automations.update_one({"id": automation["id"]}, {"$set": {"last_run_at": now_iso()}})
        await _notify_approval(automation, run)
        return _clean(run)
    return await _do_run(automation, actor, source, started)


async def _rate_limited(automation_id: str) -> bool:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    recent = await db.automation_runs.count_documents(
        {"automation_id": automation_id, "started_at": {"$gte": cutoff}}
    )
    return recent >= AUTOMATION_MAX_RUNS_PER_HOUR


@router.post("/automations/{automation_id}/run")
async def run_automation(automation_id: str, current=Depends(require_user)):
    automation = await db.automations.find_one(
        {"id": automation_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not automation:
        raise HTTPException(404, "Automation not found")
    if await _rate_limited(automation_id):
        raise HTTPException(429, f"This automation already ran {AUTOMATION_MAX_RUNS_PER_HOUR}× in the last hour. Try again later.")
    can_approve = current.get("role") in ("owner", "admin")
    return await _maybe_execute(automation, current, "manual", can_approve=can_approve)


@router.post("/automations/runs/{run_id}/approve")
async def approve_run(run_id: str, current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owners and admins can approve automations")
    run = await db.automation_runs.find_one(
        {"id": run_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not run:
        raise HTTPException(404, "Run not found")
    if run.get("status") != "pending_approval":
        raise HTTPException(400, "This run is not pending approval")
    automation = await db.automations.find_one(
        {"id": run["automation_id"], "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not automation:
        raise HTTPException(404, "Automation not found")
    actor = {
        "id": automation.get("user_id") or current["id"],
        "workspace_id": current["workspace_id"],
        "role": current.get("role"),
        "name": current.get("name"),
    }
    return await _do_run(
        automation, actor, run.get("trigger_source") or "approved",
        run.get("started_at") or now_iso(), run_id=run_id, approver=current["id"],
    )


@router.post("/automations/runs/{run_id}/reject")
async def reject_run(run_id: str, current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owners and admins can reject automations")
    run = await db.automation_runs.find_one(
        {"id": run_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not run:
        raise HTTPException(404, "Run not found")
    if run.get("status") != "pending_approval":
        raise HTTPException(400, "This run is not pending approval")
    await db.automation_runs.update_one(
        {"id": run_id},
        {"$set": {"status": "rejected", "approved_by": current["id"], "finished_at": now_iso()}},
    )
    run.update({"status": "rejected", "approved_by": current["id"]})
    return _clean(run)


# ===== TRIGGER ENGINE (driven by server.py's 60s tick loop) =====
async def _condition_met(automation: dict):
    """Evaluate an internal condition trigger → (met: bool, detail: str)."""
    cond = ((automation.get("trigger") or {}).get("config") or {}).get("condition") or "overdue_tasks"
    ws = automation["workspace_id"]
    if cond == "stalled_projects":
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        n = await db.tasks.count_documents(
            {"workspace_id": ws, "status": {"$nin": ["completed", "done", "archived"]}, "created_at": {"$lt": cutoff}}
        )
        return (n > 0, f"{n} stalled item(s)")
    today = now_iso()[:10]
    tasks = await db.tasks.find(
        {"workspace_id": ws, "status": {"$nin": ["completed", "done", "archived"]}}, {"_id": 0, "due_date": 1}
    ).to_list(1000)
    n = sum(1 for t in tasks if t.get("due_date") and t["due_date"][:10] < today)
    return (n > 0, f"{n} overdue task(s)")


async def _event_count_since(automation: dict, since: str) -> int:
    """Count new records for an external event trigger since a timestamp."""
    ev = ((automation.get("trigger") or {}).get("config") or {}).get("event") or "crm_lead_created"
    coll = EVENT_COLLECTIONS.get(ev)
    if not coll or not since:
        return 0
    return await db[coll].count_documents(
        {"workspace_id": automation["workspace_id"], "created_at": {"$gt": since}}
    )


async def _run_autonomous(automation: dict, source: str):
    actor = {
        "id": automation.get("user_id"),
        "workspace_id": automation["workspace_id"],
        "role": "system",
        "name": "TeamNest",
    }
    if await _rate_limited(automation["id"]):
        return
    await _maybe_execute(automation, actor, source, can_approve=False)


async def run_due_automations():
    """One tick: fire any scheduled/condition/event automations that are due.
    Called every 60s from server.py's in-process loop (no external cron)."""
    now = datetime.now(timezone.utc)
    now_s = now.isoformat()
    autos = await db.automations.find(
        {"status": "active", "trigger.type": {"$in": ["scheduled", "condition", "event"]}}, {"_id": 0}
    ).to_list(500)
    for a in autos:
        try:
            ttype = (a.get("trigger") or {}).get("type")
            if ttype == "scheduled":
                nra = a.get("next_run_at")
                if not nra:
                    await db.automations.update_one(
                        {"id": a["id"]}, {"$set": {"next_run_at": compute_next_run(a["trigger"], now)}}
                    )
                    continue
                dt = _parse_iso(nra)
                if dt and dt <= now:
                    await _run_autonomous(a, "scheduled")
                    await db.automations.update_one(
                        {"id": a["id"]}, {"$set": {"next_run_at": compute_next_run(a["trigger"], now)}}
                    )
            elif ttype == "condition":
                last = _parse_iso(a.get("last_condition_fire_at") or "")
                if last and (now - last).total_seconds() < CONDITION_COOLDOWN_HOURS * 3600:
                    continue
                met, _detail = await _condition_met(a)
                if met:
                    await _run_autonomous(a, "condition")
                    await db.automations.update_one(
                        {"id": a["id"]}, {"$set": {"last_condition_fire_at": now_s}}
                    )
            elif ttype == "event":
                since = a.get("last_event_check_at") or a.get("created_at")
                new_ct = await _event_count_since(a, since)
                await db.automations.update_one({"id": a["id"]}, {"$set": {"last_event_check_at": now_s}})
                if new_ct > 0:
                    await _run_autonomous(a, "event")
        except Exception:  # noqa: BLE001
            logger.exception("automation tick failed for %s", a.get("id"))
