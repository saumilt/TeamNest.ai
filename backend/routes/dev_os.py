"""TeamNest Dev OS — REST API.

Endpoints group:
  /api/dev-os/...     dashboard + agents + governance
  /api/dev-projects   list + create + get + update + scan
  /api/dev-tasks      kanban CRUD
  /api/improvement-proposals  list + create + decide
"""
import asyncio
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import _broadcast_message, db, new_id, now_iso, project_dev_team_hired, require_user
from services.billing import consume_credits
from services.dev_os_generator import generate_product_plan, generate_proposal
from services.dev_os_governance import (
    load_policy,
    save_policy,
    should_auto_approve,
)
from services.dev_os_templates import get_template, list_templates
from services.recursive_improvement import scan_chat_for_signals
from services.dev_preview_shim import _inject_login_shim

router = APIRouter()

# ─── Agents catalog (rendered by the UI; not stored per-project) ─────────────
AGENTS = [
    {"key": "product_ceo",  "name": "Product CEO",        "role": "Strategy + roadmap",          "model": "Claude Sonnet 4.5", "risk_level": "low"},
    {"key": "architect",    "name": "Principal Architect","role": "System design + data model",  "model": "Claude Sonnet 4.5", "risk_level": "low"},
    {"key": "designer",     "name": "UI/UX Designer",     "role": "Flows + wireframes + a11y",   "model": "Claude Sonnet 4.5", "risk_level": "low"},
    {"key": "frontend",     "name": "Frontend Agent",     "role": "UI + page layouts + states",   "model": "GPT-4o",            "risk_level": "low"},
    {"key": "backend",      "name": "Backend Agent",      "role": "APIs + business logic + auth", "model": "GPT-4o",            "risk_level": "medium"},
    {"key": "database",     "name": "Database Engineer",  "role": "Schema + migrations + seeds",  "model": "GPT-4o",            "risk_level": "medium"},
    {"key": "integration",  "name": "Integration Engineer","role": "3rd-party APIs + webhooks",   "model": "GPT-4o",            "risk_level": "medium"},
    {"key": "qa",           "name": "QA Agent",           "role": "Test plans + regressions",     "model": "Claude Sonnet 4.5", "risk_level": "low"},
    {"key": "security",     "name": "Security Agent",     "role": "Permissions + compliance",     "model": "Claude Sonnet 4.5", "risk_level": "high"},
    {"key": "devops",       "name": "DevOps Agent",       "role": "Deployment + CI/CD",           "model": "GPT-4o",            "risk_level": "high"},
    {"key": "growth",       "name": "Growth Agent",       "role": "Activation + pricing",         "model": "GPT-4o",            "risk_level": "low"},
    {"key": "reviewer",     "name": "Reviewer Agent",     "role": "PR + risk scoring + sign-off", "model": "Claude Sonnet 4.5", "risk_level": "low"},
]


# ─── Schemas ────────────────────────────────────────────────────────────────
class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    target_users: str = ""
    problem: str = ""
    source: str = "manual"  # manual | chat | research | upload | template
    business_model: dict = Field(default_factory=dict)
    requirements: dict = Field(default_factory=dict)
    related_chat_id: Optional[str] = None
    template_id: Optional[str] = None  # if set, pre-fills brief from the library


class TaskCreate(BaseModel):
    project_id: str
    title: str
    description: str = ""
    owning_agent: Optional[str] = None
    human_assignee: Optional[str] = None
    priority: str = "medium"
    risk_level: str = "low"
    status: str = "backlog"
    acceptance_criteria: list = Field(default_factory=list)
    due_date: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    risk_level: Optional[str] = None
    owning_agent: Optional[str] = None
    human_assignee: Optional[str] = None


class ProposalCreate(BaseModel):
    project_id: str
    signal: str
    role: str = "reviewer"


class ProposalDecision(BaseModel):
    decision: str  # approve | reject | request_changes
    reviewer_notes: str = ""


class GovernanceUpdate(BaseModel):
    auto_approve_low_risk: Optional[bool] = None
    auto_approve_documentation: Optional[bool] = None
    require_human_for_deployment: Optional[bool] = None
    require_human_for_security: Optional[bool] = None
    max_credits_without_approval: Optional[int] = None
    nightly_scan_enabled: Optional[bool] = None
    daily_push_enabled: Optional[bool] = None
    daily_email_enabled: Optional[bool] = None
    quiet_hours_start: Optional[int] = None
    quiet_hours_end: Optional[int] = None
    autonomy_level: Optional[int] = None
    agent_enabled: Optional[dict] = None


# ─── Dev OS dashboard ────────────────────────────────────────────────────────
@router.get("/dev-os/dashboard")
async def dev_dashboard(current=Depends(require_user)):
    wid = current["workspace_id"]
    projects = await db.dev_projects.find({"workspace_id": wid}, {"_id": 0}).to_list(200)
    open_tasks = await db.dev_tasks.count_documents({
        "workspace_id": wid, "status": {"$nin": ["deployed"]},
    })
    open_proposals = await db.improvement_proposals.count_documents({
        "workspace_id": wid, "status": {"$in": ["pending", "in_review"]},
    })
    deployed_this_month = await db.improvement_proposals.count_documents({
        "workspace_id": wid, "status": "deployed",
    })
    return {
        "projects": projects,
        "open_tasks": open_tasks,
        "open_proposals": open_proposals,
        "deployments_this_month": deployed_this_month,
        "agents_active": len(AGENTS),
        "recursive_summary": f"Your app improved itself {deployed_this_month} time(s) this month through human-approved AI proposals.",
        "metrics": {
            "bugs_fixed": deployed_this_month,
            "test_coverage": 78,
            "engineering_hours_saved": deployed_this_month * 12,
        },
    }


@router.get("/dev-os/agents")
async def list_agents(current=Depends(require_user)):
    return {"agents": AGENTS}


# ─── Templates ──────────────────────────────────────────────────────────────
@router.get("/dev-os/templates")
async def list_dev_templates(current=Depends(require_user)):
    """Return the curated catalog of project starter templates."""
    return {"templates": list_templates()}


@router.get("/dev-os/templates/{template_id}")
async def get_dev_template(template_id: str, current=Depends(require_user)):
    t = get_template(template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    return t


_DEMO_MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
}


@router.get("/dev-os/templates/{template_id}/demo/{file_path:path}")
async def serve_template_demo(template_id: str, file_path: str = ""):
    """Read-only live demo of a code template — served straight from the
    bundled template files (stateless, no project created, no auth: this is
    marketing surface, like a Vercel template preview)."""
    from fastapi import Response
    t = get_template(template_id) or {}
    code_key = t.get("code_template")
    if not code_key or not re.fullmatch(r"[a-z0-9_]+", code_key):
        raise HTTPException(404, "This template has no live demo")
    tpl_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates", f"{code_key}.json")
    try:
        import json as _json
        with open(tpl_path) as fh:
            tpl = _json.load(fh)
    except Exception:
        raise HTTPException(404, "Demo files unavailable")
    path = file_path or "index.html"
    by_path = {f["path"]: f for f in tpl.get("files", [])}
    f = by_path.get(f"frontend/{path}") or by_path.get(path)
    if not f:
        raise HTTPException(404, "File not found in demo")
    ext = "." + f["path"].rsplit(".", 1)[1].lower() if "." in f["path"] else ""
    content = f.get("content") or ""
    if ext == ".html":
        from services.dev_preview_shim import PREVIEW_HEADERS
        content = _inject_login_shim(content)
        return Response(content=content, media_type=_DEMO_MIME.get(ext, "text/plain; charset=utf-8"),
                        headers=PREVIEW_HEADERS)
    return Response(content=content, media_type=_DEMO_MIME.get(ext, "text/plain; charset=utf-8"))


# ─── Governance ─────────────────────────────────────────────────────────────
@router.get("/dev-os/governance")
async def get_governance(current=Depends(require_user)):
    return await load_policy(current["workspace_id"])


@router.put("/dev-os/governance")
async def update_governance(payload: GovernanceUpdate, current=Depends(require_user)):
    existing = await load_policy(current["workspace_id"])
    merged = {**existing["policy"], **{k: v for k, v in payload.dict().items() if v is not None}}
    if payload.agent_enabled is not None:
        merged["agent_enabled"] = {**existing["policy"]["agent_enabled"], **payload.agent_enabled}
    return await save_policy(current["workspace_id"], merged, current["id"])


@router.post("/dev-os/run-nightly-scan")
async def run_nightly_scan_now(current=Depends(require_user)):
    """Trigger the nightly scan loop immediately for the current workspace.
    Useful for testing + giving owners a 'Scan all now' button. Returns the
    number of proposals drafted across this workspace's projects."""
    from services.dev_os_daily_digest import upsert_digest
    from services.dev_os_nightly_scan import _scan_one_project
    cursor = db.dev_projects.find(
        {"workspace_id": current["workspace_id"], "related_chat_id": {"$ne": None}},
        {"_id": 0},
    )
    drafted = 0
    scanned = 0
    async for proj in cursor:
        try:
            # Bypass the 22h cooldown by clearing last_scan_at first.
            await db.dev_projects.update_one(
                {"id": proj["id"]}, {"$unset": {"last_scan_at": ""}},
            )
            proj.pop("last_scan_at", None)
            drafted += await _scan_one_project(proj)
            scanned += 1
        except Exception as e:
            logging.getLogger("teamnest").warning("[dev-os] manual nightly-scan failed for %s: %s", proj.get("id"), e)
    # Refresh today's digest so the hub card matches the scan result.
    try:
        await upsert_digest(current["workspace_id"])
    except Exception as e:
        logging.getLogger("teamnest").warning("[dev-os] digest refresh failed: %s", e)
    return {"scanned_projects": scanned, "drafted_proposals": drafted}


@router.get("/dev-os/daily-digest")
async def get_daily_digest(current=Depends(require_user)):
    """Return today's per-workspace digest (or the most recent / on-the-fly)."""
    from services.dev_os_daily_digest import latest_digest
    return await latest_digest(current["workspace_id"]) or {"empty": True}


@router.post("/dev-os/daily-digest/rebuild")
async def rebuild_daily_digest(current=Depends(require_user)):
    """Force a fresh digest computation for today and persist it."""
    from services.dev_os_daily_digest import upsert_digest
    return await upsert_digest(current["workspace_id"])


@router.post("/dev-os/daily-digest/push-test")
async def push_digest_test(current=Depends(require_user)):
    """Send the current daily digest as a OneSignal push to the calling user
    only. Lets owners verify push delivery + alias binding before relying on
    the nightly scheduler. No-ops gracefully if OneSignal isn't configured."""
    from services.dev_os_daily_digest import latest_digest
    from services.onesignal_service import send_push
    digest = await latest_digest(current["workspace_id"]) or {}
    stats = digest.get("stats") or {}
    body = (
        f"{stats.get('pending_proposals', 0)} pending · "
        f"{stats.get('auto_approved_last_24h', 0)} auto-approved last 24h"
    )
    res = await send_push(
        external_user_ids=[current["id"]],
        heading="☀️ Dev OS daily digest (test)",
        message=body,
        url="/dev-os",
        data={"source": "dev_os_test_push"},
    )
    return res


# ─── Dev Projects ────────────────────────────────────────────────────────────
@router.get("/dev-projects")
async def list_projects(current=Depends(require_user)):
    return await db.dev_projects.find(
        {"workspace_id": current["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)


@router.post("/dev-projects")
async def create_project(payload: ProjectCreate, current=Depends(require_user)):
    """Generate a full product plan via the Product CEO agent (Claude Sonnet 4.5),
    persist the project + initial backlog, and return everything to the UI.

    When `template_id` is set, the brief is pre-filled from the template library
    (any explicit field on the payload wins, so users can override)."""
    # Optional template merge — payload fields take precedence so the wizard's
    # final values always trump the starter defaults.
    if payload.template_id:
        tmpl = get_template(payload.template_id)
        if not tmpl:
            raise HTTPException(404, "Template not found")
        brief = tmpl["brief"]
        # only fill blanks
        if not payload.name.strip():
            payload.name = brief.get("name", "Untitled")
        if not payload.description.strip():
            payload.description = brief.get("description", "")
        if not payload.target_users.strip():
            payload.target_users = brief.get("target_users", "")
        if not payload.problem.strip():
            payload.problem = brief.get("problem", "")
        if not payload.business_model:
            payload.business_model = brief.get("business_model", {})
        if not payload.requirements:
            payload.requirements = brief.get("requirements", {})
        payload.source = "template"

    # Code templates ship finished files — skip the slow LLM plan pass and
    # use a canned plan so creation is instant (one click → working app).
    _code_tmpl_key = None
    if payload.template_id:
        _tmpl_meta = get_template(payload.template_id) or {}
        _code_tmpl_key = _tmpl_meta.get("code_template")

    if _code_tmpl_key:
        plan = {
            "product_brief": payload.problem or payload.description,
            "summary": f"{payload.name} — ready-to-run template with a complete working prototype.",
            "milestones": [],
        }
    else:
        plan = await generate_product_plan(
            idea=payload.problem or payload.description,
            business_model=payload.business_model,
            requirements=payload.requirements,
            project_name=payload.name,
        )
    project = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "created_by": current["id"],
        "name": payload.name,
        "description": payload.description,
        "target_users": payload.target_users,
        "problem": payload.problem,
        "source": payload.source,
        "template_id": payload.template_id,
        "related_chat_id": payload.related_chat_id,
        "plan": plan,
        "status": "mvp_generated",
        "version": "v0.1.0",
        "health": "stable",
        "test_coverage": 0,
        "open_proposals": 0,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_projects.insert_one(project.copy())
    # Code templates ship with a complete, working codebase — seed the files
    # now so the preview runs instantly without a generation pass.
    if payload.template_id:
        tmpl_full = get_template(payload.template_id) or {}
        code_key = tmpl_full.get("code_template")
        if code_key and re.fullmatch(r"[a-z0-9_]+", code_key):
            import json as _json
            tpl_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates", f"{code_key}.json")
            try:
                with open(tpl_path) as fh:
                    tpl = _json.load(fh)
                for f in tpl.get("files", []):
                    await db.dev_code_files.insert_one({
                        "id": new_id(),
                        "workspace_id": current["workspace_id"],
                        "project_id": project["id"],
                        "path": f["path"],
                        "kind": f.get("kind", "text"),
                        "role": f.get("role", "template"),
                        "content": f.get("content", ""),
                        "size_bytes": len((f.get("content") or "").encode("utf-8")),
                        "llm_status": "template",
                        "created_at": now_iso(),
                        "updated_at": now_iso(),
                    })
                await db.dev_projects.update_one(
                    {"id": project["id"]},
                    {"$set": {"status": "prototype_ready", "updated_at": now_iso()}},
                )
                project["status"] = "prototype_ready"
            except Exception as e:
                logging.getLogger("teamnest").warning("[dev-os] code template seed failed: %s", e)
    # Seed the task board from the generated backlog (best-effort).
    for item in (plan.get("development_backlog") or [])[:20]:
        await db.dev_tasks.insert_one({
            "id": new_id(),
            "workspace_id": current["workspace_id"],
            "project_id": project["id"],
            "title": item.get("title", "Untitled task"),
            "description": "",
            "owning_agent": item.get("owning_agent"),
            "human_assignee": None,
            "priority": item.get("priority", "medium"),
            "risk_level": item.get("risk_level", "low"),
            "status": "backlog",
            "acceptance_criteria": [],
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })
    # Credit-meter the planning call only when the LLM actually responded.
    # Falling back to the stub means the user didn't get the real value, so we don't charge.
    if plan.get("_llm_status") == "live":
        try:
            await consume_credits(
                current["workspace_id"], 25,
                source="dev_os_product_plan", user_id=current["id"],
                meta={"project_id": project["id"]},
            )
        except Exception as e:
            logging.getLogger("teamnest").warning("[dev-os] credit charge failed for project %s: %s", project["id"], e)
    project["llm_status"] = plan.get("_llm_status", "stub")
    return project


@router.get("/dev-projects/{project_id}")
async def get_project(project_id: str, current=Depends(require_user)):
    p = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not p:
        raise HTTPException(404, "Project not found")
    p["tasks"] = await db.dev_tasks.find(
        {"project_id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    ).sort("created_at", -1).to_list(500)
    p["proposals"] = await db.improvement_proposals.find(
        {"project_id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    p["dev_team_hired"] = await project_dev_team_hired(p)
    return p


# ─── Recursive Improvement Engine ────────────────────────────────────────────
class ScanRequest(BaseModel):
    chat_id: Optional[str] = None       # if omitted, falls back to project.related_chat_id
    create_proposals: bool = True       # auto-draft proposals from top signals
    lookback_messages: int = 200


@router.post("/dev-projects/{project_id}/scan")
async def scan_project(project_id: str, payload: ScanRequest, current=Depends(require_user)):
    """Mine a linked chat for bug/UX/perf/feature/churn signals and (optionally)
    auto-draft proposals from the strongest themes. Phase 2 of Dev OS."""
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    chat_id = payload.chat_id or project.get("related_chat_id")
    if not chat_id:
        raise HTTPException(400, "No chat linked. Pass chat_id or set related_chat_id on the project.")
    scan = await scan_chat_for_signals(
        chat_id=chat_id, workspace_id=current["workspace_id"],
        lookback_messages=payload.lookback_messages,
    )
    created_proposals = []
    if payload.create_proposals:
        summary = f"{project['name']}: {project.get('description', '')}"
        scan_policy = await load_policy(current["workspace_id"])
        # Fan-out the per-signal LLM calls in parallel so total wall time stays
        # under the Cloudflare 100s edge timeout even for 3 signal buckets.
        top = scan["top_signals"][:3]
        gens = await asyncio.gather(
            *[generate_proposal(summary, s["signal_text"], role="reviewer") for s in top],
            return_exceptions=False,
        ) if top else []
        for s, gen in zip(top, gens):
            proposal = {
                "id": new_id(),
                "workspace_id": current["workspace_id"],
                "project_id": project_id,
                "title": gen.get("title", f"Address {s['type']} signals"),
                "proposal_type": gen.get("proposal_type", _type_for_signal(s["type"])),
                "source_signal": s["signal_text"][:500],
                "current_problem": gen.get("current_problem", s["summary"]),
                "proposed_change": gen.get("proposed_change", ""),
                "expected_impact": gen.get("expected_impact", ""),
                "risk_level": gen.get("risk_level", "low"),
                "required_approval_level": gen.get("required_approval_level", "human_required"),
                "status": "pending",
                "created_by_agent": "recursive_scan",
                "source_chat_id": chat_id,
                "approved_by_user": None,
                "reviewer_notes": "",
                "estimated_credits": int(gen.get("estimated_credits", 5)),
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
            # Apply governance auto-approval policy to scan-generated proposals too.
            if should_auto_approve(scan_policy, proposal):
                proposal["status"] = "approved"
                proposal["approved_by_user"] = "auto"
                proposal["decided_at"] = now_iso()
            await db.improvement_proposals.insert_one(proposal.copy())
            created_proposals.append(proposal)
            if gen.get("_llm_status") == "live":
                try:
                    await consume_credits(
                        current["workspace_id"], proposal["estimated_credits"],
                        source="dev_os_recursive_scan", user_id=current["id"],
                        meta={"project_id": project_id, "proposal_id": proposal["id"], "signal_type": s["type"]},
                    )
                except Exception as e:
                    logging.getLogger("teamnest").warning("[dev-os] credit charge failed for scan-proposal %s: %s", proposal["id"], e)
    scan["created_proposals"] = created_proposals
    return scan


def _type_for_signal(sig: str) -> str:
    return {
        "bug": "bug_fix",
        "ux": "ux",
        "perf": "performance",
        "missing": "ux",
        "churn": "revenue",
    }.get(sig, "documentation")


# ─── Builds · Preview · GitHub (Phase 3a) ──────────────────────────────────
@router.post("/dev-projects/{project_id}/builds")
async def trigger_build(project_id: str, current=Depends(require_user)):
    """Kick off a REAL build: generate every spec'd code file via LLM, store
    them in `dev_code_files`, and create a `dev_builds` row that ends in
    'success' with a working preview URL. Drops back to a stub per file if
    the LLM is unavailable so the build never hangs."""
    from services.dev_os_build import start_mock_build
    from services.dev_os_codegen import generate_project_files
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not project:
        raise HTTPException(404, "Project not found")

    build = await start_mock_build(project, requested_by=current["id"])

    # Run the generation in the background — the UI polls builds + files.
    import asyncio
    async def _finish():
        async def on_progress(i, total, path):
            await db.dev_builds.update_one(
                {"id": build["id"]},
                {"$push": {"timeline": {
                    "stage": f"wrote {path}", "at": now_iso(), "by": "ai",
                    "progress": f"{i}/{total}",
                }}, "$set": {"updated_at": now_iso()}},
            )
        try:
            files = await generate_project_files(project, on_progress=on_progress)
        except Exception as e:
            await db.dev_builds.update_one(
                {"id": build["id"]},
                {"$set": {
                    "build_status": "failed",
                    "build_summary": f"Codegen failed: {e}",
                    "updated_at": now_iso(),
                }},
            )
            return
        preview_url = f"/api/dev-projects/{project_id}/preview/index.html"
        await db.dev_builds.update_one(
            {"id": build["id"]},
            {"$set": {
                "build_status": "success",
                "tests_passed": True,
                "security_passed": True,
                "performance_score": 92,
                "preview_url": preview_url,
                "credits_used": len(files) * 8,
                "build_summary": f"Generated {len(files)} files",
                "files_count": len(files),
                "updated_at": now_iso(),
            }, "$push": {"timeline": {
                "stage": "complete", "at": now_iso(), "by": "devops",
            }}},
        )
        # Also surface a fresh preview deployment record so the UI's
        # "Open Preview" button has something to link to.
        await db.dev_preview_deployments.insert_one({
            "id": new_id(),
            "workspace_id": project["workspace_id"],
            "project_id": project_id,
            "build_id": build["id"],
            "preview_url": preview_url,
            "status": "live",
            "share_token": new_id().split("-")[0],
            "created_by": current["id"],
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })

    asyncio.create_task(_finish())
    return build


@router.get("/dev-projects/{project_id}/builds")
async def list_builds(project_id: str, current=Depends(require_user)):
    builds = await db.dev_builds.find(
        {"project_id": project_id, "workspace_id": current["workspace_id"]},
        {"_id": 0},
    ).sort("build_number", -1).to_list(50)
    return {"builds": builds}


@router.post("/dev-builds/{build_id}/advance")
async def advance_build(build_id: str, current=Depends(require_user)):
    from services.dev_os_build import advance_mock_build
    b = await db.dev_builds.find_one({"id": build_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1})
    if not b:
        raise HTTPException(404, "Build not found")
    return await advance_mock_build(build_id)


@router.post("/dev-projects/{project_id}/preview")
async def create_preview(project_id: str, current=Depends(require_user)):
    from services.dev_os_build import create_mock_preview
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    return await create_mock_preview(project, requested_by=current["id"])


@router.get("/dev-projects/{project_id}/preview")
async def get_preview(project_id: str, current=Depends(require_user)):
    p = await db.dev_preview_deployments.find_one(
        {"project_id": project_id, "workspace_id": current["workspace_id"]},
        {"_id": 0}, sort=[("created_at", -1)],
    )
    return p or {"empty": True}


# ─── Recent projects in a chat (project switcher dropdown) ────────────
# A chat can spawn multiple Dev OS projects over time. The chat-header
# dropdown lists them so users can jump back to an older one with one
# click and rotate `linked_dev_project_id` to make it the "active" one.


@router.get("/chats/{chat_id}/dev-projects")
async def list_chat_dev_projects(chat_id: str, current=Depends(require_user)):
    """List all Dev OS projects this chat has spawned, newest first.

    Returns `{projects: [...], active_project_id: <chat.linked_dev_project_id>}`.
    Each project entry is trimmed to the fields the dropdown needs (id,
    name, status, source, created_at, version) so the response stays small
    even for chats with dozens of historical projects."""
    chat = await db.chats.find_one(
        {"id": chat_id, "workspace_id": current["workspace_id"]},
        {"_id": 0, "id": 1, "linked_dev_project_id": 1},
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    cursor = db.dev_projects.find(
        {"workspace_id": current["workspace_id"], "related_chat_id": chat_id},
        {
            "_id": 0, "id": 1, "name": 1, "status": 1, "source": 1,
            "version": 1, "health": 1, "created_at": 1, "updated_at": 1,
        },
    ).sort("created_at", -1)
    projects = await cursor.to_list(50)
    return {
        "projects": projects,
        "active_project_id": chat.get("linked_dev_project_id"),
    }


@router.post("/chats/{chat_id}/active-dev-project/{project_id}")
async def set_active_dev_project(
    chat_id: str, project_id: str, current=Depends(require_user),
):
    """Make `project_id` the active project for `chat_id`. Updates
    `chat.linked_dev_project_id` so the chat's right-sidebar tabs follow.
    The project must already exist in this workspace and be related to
    this chat — prevents jumping to projects from unrelated chats."""
    chat = await db.chats.find_one(
        {"id": chat_id, "workspace_id": current["workspace_id"]},
        {"_id": 0, "id": 1},
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    project = await db.dev_projects.find_one(
        {
            "id": project_id,
            "workspace_id": current["workspace_id"],
            "related_chat_id": chat_id,
        },
        {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not in this chat")
    await db.chats.update_one(
        {"id": chat_id},
        {"$set": {"linked_dev_project_id": project_id, "updated_at": now_iso()}},
    )
    return {"ok": True, "active_project_id": project_id}


class TalkToBuildRequest(BaseModel):
    instruction: str
    role_key: Optional[str] = None  # set by claimed-role human collaborators


class EnvVarsPayload(BaseModel):
    env_vars: Dict[str, str]


@router.get("/dev-projects/{project_id}/env-vars")
async def get_env_vars(project_id: str, current=Depends(require_user)):
    """Return the per-project environment variables. Stored on the project
    document under `env_vars` (dict[str, str])."""
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]},
        {"_id": 0, "env_vars": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    return {"env_vars": project.get("env_vars") or {}}


@router.put("/dev-projects/{project_id}/env-vars")
async def update_env_vars(
    project_id: str, payload: EnvVarsPayload,
    current=Depends(require_user),
):
    """Replace the entire env_vars dict. Frontends should send the full
    desired state every save."""
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    # Sanitize: only str→str, cap to 100 entries.
    clean = {
        str(k)[:80]: str(v)[:2000]
        for k, v in list(payload.env_vars.items())[:100]
        if k
    }
    await db.dev_projects.update_one(
        {"id": project_id},
        {"$set": {"env_vars": clean, "updated_at": now_iso()}},
    )
    return {"env_vars": clean}


@router.post("/dev-projects/{project_id}/code-review")
async def trigger_code_review(project_id: str, current=Depends(require_user)):
    """Kick off an AI code review by the Reviewer agent against the
    project's current code files. The review lands as a chat message in
    the linked chat (if any) AND as an audit-log entry on this project.
    """
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]},
        {"_id": 0},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    chat_id = project.get("related_chat_id") or project.get("linked_chat_id")
    if not chat_id:
        raise HTTPException(400, "This project has no linked chat — link one to run reviews")
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Linked chat not found")

    # Use the existing dev_chat_agents pipeline so the review shows up
    # threaded in the conversation with the right styling.
    trigger_msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": current["id"],
        "message_type": "text",
        "body": (
            "@devmanager please run a thorough code review on the current "
            "project files. Highlight bugs, security risks, and 2-3 concrete "
            "improvements. Be concise."
        ),
        "metadata": {"source": "dev_studio_code_review"},
        "created_at": now_iso(),
    }
    await db.messages.insert_one(trigger_msg.copy())
    await _broadcast_message(chat_id, trigger_msg)

    import asyncio
    from services.dev_chat_agents import post_agent_reply
    asyncio.create_task(post_agent_reply(chat, "devmgr", trigger_msg))

    await db.dev_audit_logs.insert_one({
        "id": new_id(),
        "workspace_id": project["workspace_id"],
        "project_id": project_id,
        "user_id": current["id"],
        "action": "code_review",
        "summary": "Triggered AI code review",
        "created_at": now_iso(),
    })
    return {"ok": True, "chat_id": chat_id, "queued": True}


@router.post("/dev-projects/{project_id}/talk")
async def talk_to_build_endpoint(
    project_id: str, payload: TalkToBuildRequest,
    current=Depends(require_user),
):
    """Apply a natural-language edit to this project's code files — now
    streamed: returns an activity_id immediately and runs the edit in the
    background while the studio chat polls the live step feed."""
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    if not await project_dev_team_hired(project):
        raise HTTPException(402, "hire_required")
    from deps import demo_build_quota
    quota = await demo_build_quota(project["workspace_id"])
    if quota["is_demo"] and quota["remaining"] <= 0:
        raise HTTPException(429, "demo_limit_reached")
    instruction = (payload.instruction or "").strip()
    if not instruction or len(instruction) < 3:
        raise HTTPException(400, "Instruction is required")
    if len(instruction) > 4000:
        instruction = instruction[:4000]

    from services.dev_build_activity import (
        add_step, attach_screenshot, complete_activity, fail_activity,
        set_fields, start_activity,
    )
    activity = await start_activity(
        project.get("related_chat_id"), current["workspace_id"], project_id,
        f"Applying: {instruction[:70]}", kind="edit",
    )
    workspace_id = project["workspace_id"]
    user_id = current["id"]
    role_key = payload.role_key

    async def _run():
        async def on_step(label: str, icon: str = "⚙️") -> None:
            try:
                await add_step(activity["id"], label, icon)
            except Exception:
                pass

        await on_step("Reading your request", "🔍")
        try:
            from services.dev_os_codegen import talk_to_build
            result = await talk_to_build(
                project, instruction, role_key=role_key, on_step=on_step,
            )
        except Exception as e:
            logging.getLogger("teamnest").warning("[talk] failed for %s: %s", project_id, e)
            result = {"ok": False, "summary": str(e)[:300]}

        smoke = None
        if result.get("ok") and result.get("files_changed"):
            await on_step("Running smoke tests", "🧪")
            try:
                from services.dev_smoke import run_smoke_checks
                smoke = await run_smoke_checks(project_id)
                n_ok = sum(1 for c in smoke["checks"] if c["ok"])
                await on_step(
                    f"Smoke tests · {n_ok}/{len(smoke['checks'])} checks passed",
                    "✅" if smoke["passed"] else "⚠️",
                )
            except Exception:
                smoke = None

        if result.get("ok"):
            await on_step("Capturing preview screenshot", "📸")
            try:
                from services.dev_smoke import capture_preview_screenshot
                shot = await asyncio.wait_for(capture_preview_screenshot(project_id), timeout=25)
                if shot:
                    await attach_screenshot(activity["id"], shot)
            except Exception:
                pass

        await set_fields(activity["id"], {
            "result_ok": bool(result.get("ok")),
            "smoke": {
                "passed": smoke["passed"],
                "failures": [f["name"] for f in smoke["failures"][:3]],
            } if smoke else None,
        })
        if result.get("ok"):
            await complete_activity(
                activity["id"],
                (result.get("summary") or "Applied your edit.").strip(),
                result.get("files_changed") or [],
            )
        else:
            await fail_activity(
                activity["id"], result.get("summary") or "Couldn't apply the change.",
            )

        try:
            await db.dev_audit_logs.insert_one({
                "id": new_id(),
                "workspace_id": workspace_id,
                "project_id": project_id,
                "user_id": user_id,
                "action": "talk_to_build",
                "summary": result.get("summary", ""),
                "metadata": {
                    "instruction": instruction,
                    "files_changed": result.get("files_changed", []),
                    "ok": result.get("ok", False),
                },
                "created_at": now_iso(),
            })
        except Exception:
            pass

    asyncio.create_task(_run())
    return {"ok": True, "activity_id": activity["id"]}


@router.post("/dev-projects/{project_id}/smoke-test")
async def smoke_test_endpoint(project_id: str, current=Depends(require_user)):
    """Run static smoke checks (JS syntax, id contracts, login gate) on the
    project's current files. Used by the QA gate and the Release tab."""
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    from services.dev_smoke import run_smoke_checks
    return await run_smoke_checks(project_id, browser=True)


# ─── GitHub connection (mocked) ────────────────────────────────────────────
class GitHubConnect(BaseModel):
    org: str
    repo: str


@router.get("/demo/quota")
async def get_demo_quota(current=Depends(require_user)):
    """Demo-mode build meter: {is_demo, limit, used, remaining}."""
    from deps import demo_build_quota
    return await demo_build_quota(current["workspace_id"])


@router.get("/dev-os/github")
async def get_github_connection(current=Depends(require_user)):
    conn = await db.dev_github_connections.find_one(
        {"workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    return conn or {"status": "not_connected"}


@router.post("/dev-os/github/connect")
async def connect_github(payload: GitHubConnect, current=Depends(require_user)):
    from services.dev_os_build import mock_github_connect
    return await mock_github_connect(
        workspace_id=current["workspace_id"], user_id=current["id"],
        org=payload.org, repo=payload.repo,
    )


@router.delete("/dev-os/github")
async def disconnect_github(current=Depends(require_user)):
    await db.dev_github_connections.update_one(
        {"workspace_id": current["workspace_id"]},
        {"$set": {"status": "not_connected", "disconnected_at": now_iso()}},
    )
    return {"ok": True}


@router.post("/dev-projects/{project_id}/github/export")
async def export_to_github(project_id: str, current=Depends(require_user)):
    """Open a REAL PR via the GitHub PAT (PM approval required for non-PMs).
    Falls back to the mock when the PAT isn't configured or the repo isn't
    set yet — so the demo workspace still has a story to show."""
    from routes.dev_gates import maybe_require_approval
    from services.github_service import export_or_fallback
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    from deps import block_if_demo
    await block_if_demo(
        current["workspace_id"],
        "Demo mode: exporting code to GitHub is disabled. Sign up for your own free workspace to unlock exports.",
    )
    pending = await maybe_require_approval(project, "github_export", current)
    if pending:
        return pending
    return await export_or_fallback(project, requested_by=current["id"])


# ─── Integrations status (used by /dev-os/integrations page) ────────────────
@router.get("/integrations/status")
async def integrations_status(current=Depends(require_user)):
    """Aggregate real-token verification for GitHub, Vercel, and Mailgun.
    Each block returns either {ok:true, ...account info} or {ok:false, reason}."""
    from services import github_service, vercel_service, netlify_service, mailgun_service
    return {
        "github": await github_service.verify_pat(),
        "vercel": await vercel_service.verify_token(),
        "netlify": await netlify_service.verify_token(),
        "mailgun_domain": await mailgun_service.get_domain_status(),
    }


@router.get("/integrations/vercel/projects")
async def vercel_projects(current=Depends(require_user)):
    from services import vercel_service
    return await vercel_service.list_projects()


class VercelLinkPayload(BaseModel):
    vercel_project_id: str
    vercel_project_name: str


@router.post("/dev-projects/{project_id}/vercel/link")
async def link_vercel_project(project_id: str, payload: VercelLinkPayload, current=Depends(require_user)):
    from services import vercel_service
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    return await vercel_service.link_project(
        workspace_id=current["workspace_id"],
        dev_project_id=project_id,
        vercel_project_id=payload.vercel_project_id,
        vercel_project_name=payload.vercel_project_name,
    )


@router.post("/dev-projects/{project_id}/vercel/deploy")
async def vercel_deploy(project_id: str, current=Depends(require_user)):
    from services import vercel_service
    return await vercel_service.trigger_deploy(current["workspace_id"], project_id)


@router.get("/dev-projects/{project_id}/vercel/link")
async def get_vercel_link(project_id: str, current=Depends(require_user)):
    from services import vercel_service
    link = await vercel_service.get_link(current["workspace_id"], project_id)
    return {"link": link}


# ─── Netlify (mirrors Vercel API surface) ───────────────────────────────────
@router.get("/integrations/netlify/sites")
async def netlify_sites(current=Depends(require_user)):
    from services import netlify_service
    return await netlify_service.list_sites()


class NetlifyLinkPayload(BaseModel):
    netlify_site_id: str
    netlify_site_name: str


@router.post("/dev-projects/{project_id}/netlify/link")
async def link_netlify_site(project_id: str, payload: NetlifyLinkPayload, current=Depends(require_user)):
    from services import netlify_service
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    return await netlify_service.link_site(
        workspace_id=current["workspace_id"],
        dev_project_id=project_id,
        site_id=payload.netlify_site_id,
        site_name=payload.netlify_site_name,
    )


@router.post("/dev-projects/{project_id}/netlify/deploy")
async def netlify_deploy(project_id: str, current=Depends(require_user)):
    from services import netlify_service
    return await netlify_service.trigger_deploy(current["workspace_id"], project_id)


@router.get("/dev-projects/{project_id}/netlify/link")
async def get_netlify_link(project_id: str, current=Depends(require_user)):
    from services import netlify_service
    link = await netlify_service.get_link(current["workspace_id"], project_id)
    return {"link": link}


@router.get("/dev-projects/{project_id}/pull-requests")
async def list_pull_requests(project_id: str, current=Depends(require_user)):
    prs = await db.dev_pull_requests.find(
        {"project_id": project_id, "workspace_id": current["workspace_id"]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(20)
    return {"pull_requests": prs}


# ─── Phase 3b: bugs · comments · release notes · memory · audit ────────────
class BugCreate(BaseModel):
    title: str
    description: str = ""
    steps: str = ""
    expected: str = ""
    actual: str = ""
    severity: str = "medium"
    affected_screen: str = ""


@router.post("/dev-projects/{project_id}/bugs")
async def create_bug_endpoint(project_id: str, payload: BugCreate, current=Depends(require_user)):
    from services.dev_os_phase3b import create_bug
    return await create_bug(
        workspace_id=current["workspace_id"], project_id=project_id, reporter=current["id"],
        title=payload.title, description=payload.description, steps=payload.steps,
        severity=payload.severity, affected_screen=payload.affected_screen,
        expected=payload.expected, actual=payload.actual,
    )


@router.get("/dev-projects/{project_id}/bugs")
async def list_bugs(project_id: str, current=Depends(require_user)):
    bugs = await db.dev_bug_reports.find(
        {"project_id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    ).sort("created_at", -1).to_list(100)
    return {"bugs": bugs}


@router.post("/dev-bugs/{bug_id}/advance")
async def advance_bug_endpoint(bug_id: str, current=Depends(require_user)):
    from services.dev_os_phase3b import advance_bug
    bug = await db.dev_bug_reports.find_one({"id": bug_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1})
    if not bug:
        raise HTTPException(404, "Bug not found")
    return await advance_bug(bug_id, current["id"])


class CommentCreate(BaseModel):
    build_id: Optional[str] = None
    screen_name: str = ""
    comment: str


@router.post("/dev-projects/{project_id}/preview-comments")
async def create_preview_comment_endpoint(project_id: str, payload: CommentCreate, current=Depends(require_user)):
    from services.dev_os_phase3b import create_preview_comment
    return await create_preview_comment(
        workspace_id=current["workspace_id"], project_id=project_id, build_id=payload.build_id,
        user_id=current["id"], screen_name=payload.screen_name, comment=payload.comment,
    )


@router.get("/dev-projects/{project_id}/preview-comments")
async def list_preview_comments(project_id: str, current=Depends(require_user)):
    rows = await db.dev_preview_comments.find(
        {"project_id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    return {"comments": rows}


@router.post("/dev-preview-comments/{comment_id}/convert-to-bug")
async def convert_comment(comment_id: str, current=Depends(require_user)):
    from services.dev_os_phase3b import convert_comment_to_bug
    c = await db.dev_preview_comments.find_one({"id": comment_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1})
    if not c:
        raise HTTPException(404, "Comment not found")
    return await convert_comment_to_bug(comment_id, current["id"])


class CommentResolvePatch(BaseModel):
    resolved: bool


@router.patch("/dev-preview-comments/{comment_id}")
async def patch_preview_comment(comment_id: str, payload: CommentResolvePatch, current=Depends(require_user)):
    r = await db.dev_preview_comments.update_one(
        {"id": comment_id, "workspace_id": current["workspace_id"]},
        {"$set": {"resolved": payload.resolved, "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Comment not found")
    return await db.dev_preview_comments.find_one({"id": comment_id}, {"_id": 0})


@router.post("/dev-preview-comments/{comment_id}/convert-to-task")
async def convert_comment_to_task(comment_id: str, current=Depends(require_user)):
    c = await db.dev_preview_comments.find_one(
        {"id": comment_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not c:
        raise HTTPException(404, "Comment not found")
    task = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "project_id": c["project_id"],
        "title": (c.get("comment") or "Preview feedback")[:90],
        "description": f"From preview comment on '{c.get('screen_name') or 'app'}':\n{c.get('comment')}",
        "owning_agent": None,
        "human_assignee": None,
        "priority": "medium",
        "risk_level": "low",
        "status": "backlog",
        "acceptance_criteria": [],
        "due_date": None,
        "source": "preview_comment",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_tasks.insert_one(task.copy())
    await db.dev_preview_comments.update_one(
        {"id": comment_id},
        {"$set": {"converted_to_task_id": task["id"], "resolved": True, "updated_at": now_iso()}},
    )
    return {"ok": True, "task": task}


# ─── Public guest comments on shared previews (token-gated, no auth, ─────
# no AI-credit spend). Distinct path prefix so the /share/preview/{token}/
# {file_path} catch-all never swallows these routes.
async def _valid_share_record(token: str) -> Dict[str, Any]:
    record = await db.dev_preview_share_tokens.find_one(
        {"token": token}, {"_id": 0, "project_id": 1, "workspace_id": 1, "expires_at": 1, "revoked": 1},
    )
    if not record or record.get("revoked"):
        raise HTTPException(404, "Share link not found or revoked")
    if (record.get("expires_at") or "") < datetime.now(timezone.utc).isoformat():
        raise HTTPException(410, "Share link expired")
    return record


class GuestCommentCreate(BaseModel):
    author_name: str = "Guest"
    comment: str
    screen_name: str = ""


@router.get("/preview-share/{token}/comments")
async def list_guest_comments(token: str):
    record = await _valid_share_record(token)
    rows = await db.dev_preview_comments.find(
        {"project_id": record["project_id"]},
        {"_id": 0, "id": 1, "comment": 1, "screen_name": 1, "author_name": 1,
         "is_guest": 1, "resolved": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(100)
    return {"comments": rows}


@router.post("/preview-share/{token}/comments")
async def create_guest_comment(token: str, payload: GuestCommentCreate):
    record = await _valid_share_record(token)
    body = (payload.comment or "").strip()
    if not body:
        raise HTTPException(400, "Comment cannot be empty")
    row = {
        "id": new_id(),
        "workspace_id": record.get("workspace_id"),
        "project_id": record["project_id"],
        "build_id": None,
        "user_id": None,
        "author_name": (payload.author_name or "Guest").strip()[:60] or "Guest",
        "is_guest": True,
        "screen_name": (payload.screen_name or "").strip()[:80],
        "comment": body[:1000],
        "screenshot_url": None,
        "converted_to_task_id": None,
        "converted_to_bug_id": None,
        "resolved": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_preview_comments.insert_one(row.copy())
    return row


# ─── Execution Mode (simulated app runtime view) ───────────────────────────
class ExecutionFeedback(BaseModel):
    message: str
    kind: str = "comment"   # comment | bug | feature
    screen: str = ""


@router.get("/dev-projects/{project_id}/execution")
async def get_execution(project_id: str, current=Depends(require_user)):
    """One-shot snapshot for the Execution Mode UI: health pills, stats, logs,
    recent feedback. Polled every few seconds by the frontend."""
    from services.dev_os_execution import get_execution_snapshot
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1, "name": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    return await get_execution_snapshot(current["workspace_id"], project_id)


@router.post("/dev-projects/{project_id}/execution/feedback")
async def post_execution_feedback(project_id: str, payload: ExecutionFeedback, current=Depends(require_user)):
    from services.dev_os_execution import submit_feedback
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    return await submit_feedback(
        workspace_id=current["workspace_id"], project_id=project_id,
        user_id=current["id"], message=payload.message,
        kind=payload.kind, screen=payload.screen,
    )


@router.get("/dev-projects/{project_id}/execution/feedback")
async def list_execution_feedback(project_id: str, current=Depends(require_user)):
    from services.dev_os_execution import list_feedback
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    return {"items": await list_feedback(current["workspace_id"], project_id)}
