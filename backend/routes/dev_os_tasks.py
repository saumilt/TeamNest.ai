"""Dev OS — tasks, improvement proposals and team role assignments."""
import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import _broadcast_message, db, new_id, now_iso, require_user

router = APIRouter()
logger = logging.getLogger("teamnest")

from services.dev_os_generator import generate_proposal
from services.dev_os_governance import load_policy, should_auto_approve
from services.billing import consume_credits
from routes.dev_os import ProposalCreate, ProposalDecision, TaskCreate, TaskUpdate

# ─── Dev Tasks ───────────────────────────────────────────────────────────────
@router.get("/dev-tasks")
async def list_tasks(project_id: Optional[str] = None, current=Depends(require_user)):
    q = {"workspace_id": current["workspace_id"]}
    if project_id:
        q["project_id"] = project_id
    return await db.dev_tasks.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/dev-tasks")
async def create_task(payload: TaskCreate, current=Depends(require_user)):
    task = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        **payload.model_dump(),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_tasks.insert_one(task.copy())
    return task


@router.patch("/dev-tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, current=Depends(require_user)):
    diff = {k: v for k, v in payload.model_dump().items() if v is not None}
    diff["updated_at"] = now_iso()
    await db.dev_tasks.update_one(
        {"id": task_id, "workspace_id": current["workspace_id"]}, {"$set": diff},
    )
    return await db.dev_tasks.find_one({"id": task_id}, {"_id": 0})


# ─── Improvement Proposals ───────────────────────────────────────────────────
@router.get("/improvement-proposals")
async def list_proposals(project_id: Optional[str] = None, current=Depends(require_user)):
    q = {"workspace_id": current["workspace_id"]}
    if project_id:
        q["project_id"] = project_id
    return await db.improvement_proposals.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/improvement-proposals")
async def create_proposal(payload: ProposalCreate, current=Depends(require_user)):
    project = await db.dev_projects.find_one(
        {"id": payload.project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    summary = f"{project['name']}: {project.get('description', '')}"
    gen = await generate_proposal(summary, payload.signal, role=payload.role)
    proposal = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "project_id": payload.project_id,
        "title": gen.get("title", "Untitled proposal"),
        "proposal_type": gen.get("proposal_type", "documentation"),
        "source_signal": payload.signal,
        "current_problem": gen.get("current_problem", ""),
        "proposed_change": gen.get("proposed_change", ""),
        "expected_impact": gen.get("expected_impact", ""),
        "risk_level": gen.get("risk_level", "low"),
        "required_approval_level": gen.get("required_approval_level", "human_required"),
        "status": "pending",
        "created_by_agent": payload.role,
        "approved_by_user": None,
        "reviewer_notes": "",
        "estimated_credits": int(gen.get("estimated_credits", 5)),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    # Governance: auto-approve safe proposals so the human queue stays focused.
    policy = await load_policy(current["workspace_id"])
    if should_auto_approve(policy, proposal):
        proposal["status"] = "approved"
        proposal["approved_by_user"] = "auto"
        proposal["decided_at"] = now_iso()
    await db.improvement_proposals.insert_one(proposal.copy())
    if gen.get("_llm_status") == "live":
        try:
            await consume_credits(
                current["workspace_id"], proposal["estimated_credits"],
                source="dev_os_proposal", user_id=current["id"],
                meta={"project_id": payload.project_id, "proposal_id": proposal["id"]},
            )
        except Exception as e:
            logging.getLogger("teamnest").warning("[dev-os] credit charge failed for proposal %s: %s", proposal["id"], e)
    proposal["llm_status"] = gen.get("_llm_status", "stub")
    return proposal


@router.post("/improvement-proposals/{pid}/decide")
async def decide_proposal(pid: str, payload: ProposalDecision, current=Depends(require_user)):
    proposal = await db.improvement_proposals.find_one(
        {"id": pid, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    decision_map = {"approve": "approved", "reject": "rejected", "request_changes": "in_review"}
    if payload.decision not in decision_map:
        raise HTTPException(400, "Invalid decision")
    await db.improvement_proposals.update_one(
        {"id": pid},
        {"$set": {
            "status": decision_map[payload.decision],
            "approved_by_user": current["id"] if payload.decision == "approve" else None,
            "reviewer_notes": payload.reviewer_notes,
            "decided_at": now_iso(),
            "updated_at": now_iso(),
        }},
    )
    updated = await db.improvement_proposals.find_one({"id": pid}, {"_id": 0})
    # Auto-hire AI employees + spawn tasks when a proposal is approved.
    hired_tasks = []
    if payload.decision == "approve":
        from services.dev_os_build import auto_hire_for_proposal
        try:
            hired_tasks = await auto_hire_for_proposal(updated)
        except Exception as e:
            import logging
            logging.getLogger("teamnest").warning("[dev-os] auto-hire failed for %s: %s", pid, e)
    updated["hired_tasks"] = hired_tasks
    return updated



# ─── Team role assignments (humans claim AI counterpart roles) ───────
# Workspace members can claim roles like "frontend", "backend", "qa". When a
# member sends an instruction with their `role_key`, the AI bias their
# response toward that specialist's perspective so multiple humans + AIs can
# collaborate on the same project from different angles.
#
# Storage: `dev_projects.role_claims = {role_key: {user_id, user_name,
# claimed_at}}`. Single human per role; one role per human at a time.

# Roles that humans can claim — mirrors the dev_chat_agents ROLES that are
# implementers (excludes coordinator-only `devmgr`).
CLAIMABLE_ROLE_KEYS = [
    "architect", "frontend", "backend", "database", "qa", "security",
    "devops", "reviewer", "designer", "product", "docs", "growth",
]


def _role_label(role_key: str) -> str:
    # Lazy import to avoid a circular import at module load time.
    from services.dev_chat_agents import ROLES
    return ROLES.get(role_key, {}).get("label", role_key.title())


@router.get("/dev-projects/{project_id}/role-claims")
async def list_role_claims(project_id: str, current=Depends(require_user)):
    """Return the current map of role_key → claimer for this project, plus the
    catalog of claimable roles. The UI uses this to render the Team Roles
    strip in DevStudio."""
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]},
        {"_id": 0, "role_claims": 1},
    )
    if project is None:
        raise HTTPException(404, "Project not found")
    from services.dev_chat_agents import ROLES
    catalog = [
        {
            "role_key": k,
            "label": ROLES[k]["label"],
            "emoji": ROLES[k].get("emoji", "✨"),
        }
        for k in CLAIMABLE_ROLE_KEYS if k in ROLES
    ]
    return {
        "role_claims": project.get("role_claims") or {},
        "catalog": catalog,
    }


@router.post("/dev-projects/{project_id}/role-claims/{role_key}")
async def claim_role(project_id: str, role_key: str, current=Depends(require_user)):
    """Claim a role for the current user on this project. Releases any other
    role the user might be holding so each user has at most one role at a
    time. Errors out if another user already holds that role."""
    role_key = (role_key or "").strip().lower()
    if role_key not in CLAIMABLE_ROLE_KEYS:
        raise HTTPException(400, "Unknown role")
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]},
        {"_id": 0, "id": 1, "role_claims": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    claims = dict(project.get("role_claims") or {})
    existing = claims.get(role_key)
    if existing and existing.get("user_id") != current["id"]:
        raise HTTPException(
            409,
            f"Role already claimed by {existing.get('user_name') or 'another teammate'}",
        )
    # Release any other role held by this user (one-role-per-user invariant).
    for k in list(claims.keys()):
        if claims[k].get("user_id") == current["id"] and k != role_key:
            claims.pop(k, None)
    claims[role_key] = {
        "user_id": current["id"],
        "user_name": current.get("name") or current.get("email") or "Teammate",
        "claimed_at": now_iso(),
    }
    await db.dev_projects.update_one(
        {"id": project_id},
        {"$set": {"role_claims": claims, "updated_at": now_iso()}},
    )
    return {"ok": True, "role_claims": claims, "claimed_role_key": role_key, "label": _role_label(role_key)}


@router.delete("/dev-projects/{project_id}/role-claims/{role_key}")
async def release_role(project_id: str, role_key: str, current=Depends(require_user)):
    """Release the role this user holds.

    Returns 200 with the current claims map. No-op (still 200) when the role
    isn't held by anyone — making this safe to call defensively. Errors with
    403 if the role is held by someone else."""
    role_key = (role_key or "").strip().lower()
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": current["workspace_id"]},
        {"_id": 0, "id": 1, "role_claims": 1},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    claims = dict(project.get("role_claims") or {})
    holder = claims.get(role_key)
    if not holder:
        return {"ok": True, "role_claims": claims}
    if holder.get("user_id") != current["id"]:
        raise HTTPException(403, "You don't hold this role")
    claims.pop(role_key, None)
    await db.dev_projects.update_one(
        {"id": project_id},
        {"$set": {"role_claims": claims, "updated_at": now_iso()}},
    )
    return {"ok": True, "role_claims": claims}


