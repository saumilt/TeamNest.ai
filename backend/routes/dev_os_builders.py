"""Dev OS — plain-English Builder specs (data model, roles, logic, workflows…)."""
import json
import logging
import os
import re
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import db, new_id, now_iso, project_dev_team_hired, require_user
from services.billing import consume_credits

router = APIRouter()
logger = logging.getLogger("teamnest")


async def _require_hired(project: Dict[str, Any]) -> None:
    if not await project_dev_team_hired(project):
        raise HTTPException(402, "hire_required")

BUILDER_KEYS = {"data", "roles", "logic", "workflow", "form", "report", "integration"}

FIELD_TYPES = ["text", "number", "date", "email", "currency", "yes/no", "dropdown", "file"]
PERMS = ["view", "create", "edit", "delete", "approve", "export", "settings"]
CHARTS = ["bar chart", "line chart", "pie chart", "table only", "KPI cards"]
SERVICES = ["Stripe", "Email", "SMS", "Slack", "Google Sheets", "Webhook", "Other"]

ITEMS_KEY = {
    "data": "entities", "roles": "roles", "logic": "rules", "workflow": "flows",
    "form": "forms", "report": "reports", "integration": "integrations",
}

SCHEMA_HINTS = {
    "data": (
        '{"entities":[{"name":"<entity name>","fields":[{"name":"<field name>","type":"<one of: '
        + ", ".join(FIELD_TYPES) + '>"}],"relations":"<optional plain sentence, or empty string>"}]}'
    ),
    "roles": (
        '{"roles":[{"name":"<role name>","perms":{'
        + ",".join(f'"{p}":true|false' for p in PERMS)
        + '},"notes":"<optional notes, or empty string>"}]}'
    ),
    "logic": '{"rules":[{"when":"<condition in plain English>","then":"<action in plain English>"}]}',
    "workflow": '{"flows":[{"trigger":"<when this happens>","steps":["<step 1>","<step 2>"]}]}',
    "form": (
        '{"forms":[{"name":"<form purpose>","where":"<where it appears>","fields":[{"label":"<field label>","type":"<one of: '
        + ", ".join(FIELD_TYPES) + '>"}]}]}'
    ),
    "report": (
        '{"reports":[{"measure":"<what to measure>","group":"<grouped by, or empty string>","chart":"<one of: '
        + ", ".join(CHARTS) + '>"}]}'
    ),
    "integration": (
        '{"integrations":[{"service":"<one of: ' + ", ".join(SERVICES)
        + '>","what":"<what it should do>"}]}'
    ),
}


def _coerce_choice(value: Any, options: List[str], default: str) -> str:
    v = str(value or "").strip().lower()
    for o in options:
        if v == o.lower():
            return o
    return default


def _sanitize_spec(builder_key: str, spec: Any) -> Dict[str, Any]:
    """Coerce an LLM-produced spec into the exact shape the frontend editors expect."""
    items_key = ITEMS_KEY[builder_key]
    raw_items = spec.get(items_key) if isinstance(spec, dict) else None
    if not isinstance(raw_items, list):
        raise HTTPException(502, "AI returned an unexpected format — try rephrasing")
    out: List[Dict[str, Any]] = []
    for it in raw_items[:30]:
        if not isinstance(it, dict):
            continue
        if builder_key == "data":
            fields = [
                {"name": str(f.get("name", "")).strip(), "type": _coerce_choice(f.get("type"), FIELD_TYPES, "text")}
                for f in (it.get("fields") or []) if isinstance(f, dict)
            ] or [{"name": "", "type": "text"}]
            out.append({"name": str(it.get("name", "")).strip(), "fields": fields,
                        "relations": str(it.get("relations", "") or "")})
        elif builder_key == "roles":
            perms_in = it.get("perms") or {}
            perms = {p: bool(perms_in.get(p)) for p in PERMS if perms_in.get(p)}
            out.append({"name": str(it.get("name", "")).strip(), "perms": perms or {"view": True},
                        "notes": str(it.get("notes", "") or "")})
        elif builder_key == "logic":
            out.append({"when": str(it.get("when", "")).strip(), "then": str(it.get("then", "")).strip()})
        elif builder_key == "workflow":
            steps = [str(s).strip() for s in (it.get("steps") or []) if str(s).strip()] or [""]
            out.append({"trigger": str(it.get("trigger", "")).strip(), "steps": steps})
        elif builder_key == "form":
            fields = [
                {"label": str(f.get("label", "")).strip(), "type": _coerce_choice(f.get("type"), FIELD_TYPES, "text")}
                for f in (it.get("fields") or []) if isinstance(f, dict)
            ] or [{"label": "", "type": "text"}]
            out.append({"name": str(it.get("name", "")).strip(),
                        "where": str(it.get("where", "") or ""), "fields": fields})
        elif builder_key == "report":
            out.append({"measure": str(it.get("measure", "")).strip(),
                        "group": str(it.get("group", "") or ""),
                        "chart": _coerce_choice(it.get("chart"), CHARTS, "bar chart")})
        elif builder_key == "integration":
            out.append({"service": _coerce_choice(it.get("service"), SERVICES, "Other"),
                        "what": str(it.get("what", "")).strip()})
    if not out:
        raise HTTPException(502, "AI returned an empty spec — try adding more detail")
    return {items_key: out}


def _parse_llm_json(raw: str) -> Any:
    text = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise HTTPException(502, "AI returned an unexpected format — try again")
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        raise HTTPException(502, "AI returned invalid JSON — try again")


class BuilderSpecPut(BaseModel):
    spec: Dict[str, Any]


class BuilderGenerateIn(BaseModel):
    text: str


async def _get_project(project_id: str, current) -> Dict[str, Any]:
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.delete("/dev-projects/{project_id}")
async def delete_dev_project(project_id: str, current=Depends(require_user)):
    """Delete a project and all its related data (workspace-scoped)."""
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    await db.dev_projects.delete_one({"id": project_id})
    for coll in ("dev_code_files", "dev_builds", "dev_tasks",
                 "dev_preview_deployments", "dev_prod_releases", "dev_audit_logs"):
        await db[coll].delete_many({"project_id": project_id})
    return {"ok": True, "deleted": project_id}


@router.get("/dev-projects/{project_id}/builders")
async def get_builder_specs(project_id: str, current=Depends(require_user)):
    project = await _get_project(project_id, current)
    return {"specs": project.get("builder_specs") or {}}


@router.put("/dev-projects/{project_id}/builders/{builder_key}")
async def put_builder_spec(
    project_id: str, builder_key: str, payload: BuilderSpecPut, current=Depends(require_user),
):
    if builder_key not in BUILDER_KEYS:
        raise HTTPException(400, f"Unknown builder '{builder_key}'")
    project = await _get_project(project_id, current)
    await _require_hired(project)
    await db.dev_projects.update_one(
        {"id": project_id},
        {"$set": {
            f"builder_specs.{builder_key}": payload.spec,
            "updated_at": now_iso(),
        }},
    )
    await db.dev_audit_logs.insert_one({
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "project_id": project_id,
        "action": "builder_spec_saved",
        "detail": {"builder": builder_key},
        "actor_id": current.get("id"),
        "created_at": now_iso(),
    })
    return {"ok": True, "builder": builder_key}


@router.post("/dev-projects/{project_id}/builders/{builder_key}/generate")
async def generate_builder_spec(
    project_id: str, builder_key: str, payload: BuilderGenerateIn, current=Depends(require_user),
):
    """Plain-English text → AI-generated structured spec. Auto-saves the spec as a draft."""
    if builder_key not in BUILDER_KEYS:
        raise HTTPException(400, f"Unknown builder '{builder_key}'")
    text = payload.text.strip()
    if not text:
        raise HTTPException(400, "Describe what you want first")
    project = await _get_project(project_id, current)
    await _require_hired(project)
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(503, "AI is not configured on this server")

    existing = (project.get("builder_specs") or {}).get(builder_key) or {}
    prompt = (
        "You are helping a non-technical user configure their app via a visual builder.\n"
        f"Builder type: {builder_key}\n"
        f"Return ONLY a JSON object with this exact shape:\n{SCHEMA_HINTS[builder_key]}\n\n"
        + (f"Existing spec (merge new requirements into it, keep entries still relevant, "
           f"update ones that changed, never duplicate):\n{json.dumps(existing)}\n\n" if existing.get(ITEMS_KEY[builder_key]) else "")
        + f"User's plain-English description:\n{text}\n\n"
        "Rules: use only the allowed enum values shown in the shape; keep names short and human-readable; "
        "reply with ONLY the JSON object, no markdown, no commentary."
    )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = (
            LlmChat(
                api_key=key,
                session_id=f"builder-{project_id[:8]}-{builder_key}",
                system_message="You convert plain-English app requirements into strict JSON specs. Reply with ONLY the JSON object.",
            ).with_model("openai", "gpt-5.4-mini")
        )
        raw = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.warning("[builders] AI generation failed for %s/%s: %s", project_id, builder_key, e)
        raise HTTPException(502, "AI generation failed — please try again")

    spec = _sanitize_spec(builder_key, _parse_llm_json(raw))

    await db.dev_projects.update_one(
        {"id": project_id},
        {"$set": {f"builder_specs.{builder_key}": spec, "updated_at": now_iso()}},
    )
    await db.dev_audit_logs.insert_one({
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "project_id": project_id,
        "action": "builder_spec_ai_generated",
        "detail": {"builder": builder_key, "chars": len(text)},
        "actor_id": current.get("id"),
        "created_at": now_iso(),
    })
    try:
        await consume_credits(
            current["workspace_id"], 5,
            source="builder_ai_generate", user_id=current["id"],
            meta={"project_id": project_id, "builder": builder_key},
        )
    except Exception as e:
        logger.warning("[builders] credit charge failed: %s", e)
    return {"ok": True, "builder": builder_key, "spec": spec}


@router.post("/dev-projects/{project_id}/builders/{builder_key}/suggest")
async def suggest_builder_spec(
    project_id: str, builder_key: str, current=Depends(require_user),
):
    """One-tap AI audit: reads the app's brief, code and existing specs and
    proposes entries this builder is missing. Appends to the existing spec."""
    if builder_key not in BUILDER_KEYS:
        raise HTTPException(400, f"Unknown builder '{builder_key}'")
    project = await _get_project(project_id, current)
    await _require_hired(project)
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(503, "AI is not configured on this server")

    brief = (
        (project.get("plan") or {}).get("product_brief")
        or project.get("description") or project.get("name", "")
    )
    specs = project.get("builder_specs") or {}
    from services.dev_os_codegen import list_project_files
    files = await list_project_files(project_id)
    code_ctx = ""
    for f in files:
        if f["path"] in ("frontend/index.html", "frontend/app.js"):
            code_ctx += f"\n### {f['path']}\n{(f.get('content') or '')[:3500]}\n"

    prompt = (
        f"You are auditing an app to propose the '{builder_key}' configuration it is missing.\n"
        f"App brief: {brief[:600]}\n\n"
        f"Existing builder specs (all builders):\n{json.dumps(specs)[:2500]}\n\n"
        f"App code excerpts:{code_ctx[:8000] or ' (no code generated yet)'}\n\n"
        f"Propose 3-5 NEW high-value entries this app clearly lacks for the '{builder_key}' builder — "
        "specific to THIS product, not generic. Return the FULL updated spec: keep every existing "
        f"entry unchanged and append your proposals. Shape:\n{SCHEMA_HINTS[builder_key]}\n"
        "Rules: use only the allowed enum values; keep names short and human-readable; "
        "reply with ONLY the JSON object, no markdown, no commentary."
    )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = (
            LlmChat(
                api_key=key,
                session_id=f"builder-suggest-{project_id[:8]}-{builder_key}",
                system_message="You audit apps and propose missing configuration as strict JSON specs. Reply with ONLY the JSON object.",
            ).with_model("openai", "gpt-5.4-mini")
        )
        raw = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.warning("[builders] AI suggest failed for %s/%s: %s", project_id, builder_key, e)
        raise HTTPException(502, "AI suggestion failed — please try again")

    spec = _sanitize_spec(builder_key, _parse_llm_json(raw))

    await db.dev_projects.update_one(
        {"id": project_id},
        {"$set": {f"builder_specs.{builder_key}": spec, "updated_at": now_iso()}},
    )
    await db.dev_audit_logs.insert_one({
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "project_id": project_id,
        "action": "builder_spec_ai_suggested",
        "detail": {"builder": builder_key},
        "actor_id": current.get("id"),
        "created_at": now_iso(),
    })
    try:
        await consume_credits(
            current["workspace_id"], 5,
            source="builder_ai_suggest", user_id=current["id"],
            meta={"project_id": project_id, "builder": builder_key},
        )
    except Exception as e:
        logger.warning("[builders] credit charge failed: %s", e)
    return {"ok": True, "builder": builder_key, "spec": spec}


@router.get("/dev-projects/{project_id}/build-ideas")
async def get_build_ideas(project_id: str, current=Depends(require_user)):
    """4 app-specific 'potential improvement' chips for the studio chat."""
    project = await _get_project(project_id, current)
    from services.dev_chat_ideas import _llm_build_ideas
    ideas = await _llm_build_ideas(project)
    return {"ideas": ideas}
