"""Dev OS — Build, Preview, GitHub & auto-hire workflows (Phase 3a).

All "execution" steps in this module are deliberately simulated. They write
realistic records to MongoDB so the UI feels alive, but they do NOT touch a
real container runtime, real CI, or the real GitHub API. The hooks are kept
small so a future iteration can swap the mock for a real driver behind the
same interface.

Public functions
----------------
- start_mock_build(project)              → dev_builds row, status=running
- finish_mock_build(build_id, ...)       → flip to success/failed + preview URL
- create_mock_preview(project)           → dev_preview_deployments row
- mock_github_connect(workspace_id, ...) → dev_github_connections row
- mock_github_export(project)            → dev_pull_requests row (mocked)
- auto_hire_for_proposal(proposal)       → spawn dev_tasks per required agent
"""
import logging
import random
from typing import Any, Dict, List, Optional

from deps import db, new_id, now_iso

logger = logging.getLogger("teamnest")


# Which AI roles get hired when an improvement-proposal lands.  Picked by
# proposal_type so we don't over-spend.
_AGENTS_BY_TYPE: Dict[str, List[str]] = {
    "bug_fix":   ["qa", "backend", "reviewer"],
    "ux":        ["designer", "frontend", "qa"],
    "performance": ["architect", "backend", "qa"],
    "feature":   ["product_ceo", "architect", "designer", "frontend", "backend", "qa", "reviewer"],
    "security":  ["security", "backend", "reviewer"],
    "revenue":   ["growth", "product_ceo", "designer", "frontend"],
    "documentation": ["product_ceo"],
}


async def auto_hire_for_proposal(proposal: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Called from /improvement-proposals/{id}/decide when decision=='approve'.
    Spawns a dev_task per required agent so the kanban reflects the work.
    Returns the list of created tasks."""
    needed = _AGENTS_BY_TYPE.get(proposal.get("proposal_type", "feature"), ["product_ceo", "reviewer"])
    created: List[Dict[str, Any]] = []
    for role in needed:
        task = {
            "id": new_id(),
            "workspace_id": proposal["workspace_id"],
            "project_id": proposal["project_id"],
            "title": f"[{proposal.get('title', 'Improvement')[:60]}] {role} work",
            "owning_agent": role,
            "human_assignee": None,
            "source": "improvement_proposal",
            "source_proposal_id": proposal["id"],
            "priority": "high" if proposal.get("risk_level") == "high" else "medium",
            "risk_level": proposal.get("risk_level", "low"),
            "status": "backlog",
            "acceptance_criteria": proposal.get("expected_impact", ""),
            "estimated_credits": max(1, int(proposal.get("estimated_credits", 5)) // max(1, len(needed))),
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.dev_tasks.insert_one(task.copy())
        created.append(task)
    return created


# ─── Builds ──────────────────────────────────────────────────────────────────
async def start_mock_build(project: Dict[str, Any], requested_by: str) -> Dict[str, Any]:
    """Create a dev_builds row in 'running' state. The UI polls or refreshes
    to see progress; tests can call `finish_mock_build` directly."""
    workspace_id = project["workspace_id"]
    last = await db.dev_builds.find_one(
        {"project_id": project["id"]}, {"_id": 0, "build_number": 1},
        sort=[("build_number", -1)],
    )
    next_num = (last or {}).get("build_number", 0) + 1
    build = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "project_id": project["id"],
        "build_number": next_num,
        "build_status": "running",
        "build_summary": f"Build #{next_num} triggered by {requested_by}",
        "preview_url": None,
        "tests_passed": None,
        "security_passed": None,
        "performance_score": None,
        "created_by_employee_id": "system",
        "approved_by_user_id": requested_by,
        "credits_used": 0,
        "timeline": [
            {"stage": "queued", "at": now_iso(), "by": "devops"},
        ],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_builds.insert_one(build.copy())
    return build


async def advance_mock_build(build_id: str) -> Dict[str, Any] | None:
    """Tick a running build one stage forward. Idempotent — final stages stay."""
    stages = ["queued", "planning", "scaffolding", "frontend", "backend", "qa", "security", "preview"]
    build = await db.dev_builds.find_one({"id": build_id}, {"_id": 0})
    if not build or build["build_status"] != "running":
        return build
    done = {t["stage"] for t in build.get("timeline", [])}
    next_stage = next((s for s in stages if s not in done), None)
    update: Dict[str, Any] = {"updated_at": now_iso()}
    push_evt = None
    if next_stage is None:
        update["build_status"] = "success"
        update["tests_passed"] = True
        update["security_passed"] = True
        update["performance_score"] = random.randint(78, 96)
        update["preview_url"] = f"https://preview.teamnest.ai/dev-os/{build['project_id']}/v{build['build_number']}"
        update["credits_used"] = random.randint(35, 90)
        push_evt = {"stage": "complete", "at": now_iso(), "by": "devops"}
    else:
        push_evt = {"stage": next_stage, "at": now_iso(), "by": next_stage if next_stage in ("frontend","backend","qa","security") else "devops"}
    ops = {"$set": update}
    if push_evt:
        ops["$push"] = {"timeline": push_evt}
    await db.dev_builds.update_one({"id": build_id}, ops)
    return await db.dev_builds.find_one({"id": build_id}, {"_id": 0})


# ─── Preview deployment ──────────────────────────────────────────────────────
async def create_mock_preview(project: Dict[str, Any], requested_by: str) -> Dict[str, Any]:
    last_build = await db.dev_builds.find_one(
        {"project_id": project["id"], "build_status": "success"},
        {"_id": 0}, sort=[("build_number", -1)],
    )
    preview = {
        "id": new_id(),
        "workspace_id": project["workspace_id"],
        "project_id": project["id"],
        "build_id": (last_build or {}).get("id"),
        "preview_url": (last_build or {}).get("preview_url") or f"https://preview.teamnest.ai/dev-os/{project['id']}/latest",
        "status": "live" if last_build else "pending_build",
        "share_token": new_id().split("-")[0],
        "created_by": requested_by,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_preview_deployments.insert_one(preview.copy())
    return preview


# ─── GitHub (mocked) ─────────────────────────────────────────────────────────
async def mock_github_connect(
    *, workspace_id: str, user_id: str, org: str, repo: str,
) -> Dict[str, Any]:
    payload = {
        "workspace_id": workspace_id,
        "connected_by": user_id,
        "github_org": org,
        "github_repo": repo,
        "repo_url": f"https://github.com/{org}/{repo}",
        "status": "connected",
        "connected_at": now_iso(),
        "last_sync_at": None,
    }
    await db.dev_github_connections.update_one(
        {"workspace_id": workspace_id},
        {"$set": payload, "$setOnInsert": {"id": new_id()}},
        upsert=True,
    )
    return await db.dev_github_connections.find_one({"workspace_id": workspace_id}, {"_id": 0})


async def mock_github_export(project: Dict[str, Any], requested_by: str) -> Dict[str, Any]:
    conn = await db.dev_github_connections.find_one(
        {"workspace_id": project["workspace_id"], "status": "connected"}, {"_id": 0},
    )
    if not conn:
        return {"ok": False, "reason": "github_not_connected"}
    last_build = await db.dev_builds.find_one(
        {"project_id": project["id"], "build_status": "success"},
        {"_id": 0, "build_number": 1}, sort=[("build_number", -1)],
    )
    build_num = (last_build or {}).get("build_number", 1)
    pr_number = random.randint(100, 999)
    pr = {
        "id": new_id(),
        "workspace_id": project["workspace_id"],
        "project_id": project["id"],
        "github_repo": conn["repo_url"],
        "branch": f"dev-os/v{build_num}",
        "pr_number": pr_number,
        "pr_url": f"{conn['repo_url']}/pull/{pr_number}",
        "title": f"Dev OS · {project['name']} · v{build_num}",
        "summary": f"AI-generated PR from build #{build_num}. Reviewer agent signed off; awaiting human approval.",
        "status": "pending_human_approval",
        "created_by": requested_by,
        "files_changed": random.randint(6, 28),
        "additions": random.randint(80, 540),
        "deletions": random.randint(10, 120),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_pull_requests.insert_one(pr.copy())
    await db.dev_github_connections.update_one(
        {"workspace_id": project["workspace_id"]},
        {"$set": {"last_sync_at": now_iso()}},
    )
    return {"ok": True, "pr": pr}
