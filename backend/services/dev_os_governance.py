"""TeamNest Dev OS — Governance & Agent Policies (Phase 2).

Per-workspace policy document that controls:
- Which agents are enabled
- Auto-approval threshold per risk level
- Deployment gates (require human sign-off for DevOps / Security)

Single document per workspace stored at `agent_policies`. We load it lazily
and fall back to safe defaults so the rest of Dev OS keeps working even
before the workspace owner customises anything.
"""
from typing import Any, Dict, List

from deps import db, new_id, now_iso

# Default policy = conservative: nothing auto-approves, everything goes to human.
DEFAULT_POLICY: Dict[str, Any] = {
    "auto_approve_low_risk": False,        # if true, low-risk proposals approve themselves
    "auto_approve_documentation": True,    # docs-only proposals are always safe
    "require_human_for_deployment": True,
    "require_human_for_security": True,
    "max_credits_without_approval": 10,    # any proposal costing more needs human OK
    "nightly_scan_enabled": True,          # opt-out switch for the background scheduler
    "daily_push_enabled": True,            # send mobile push when a digest has content
    "quiet_hours_start": 22,               # 24h, workspace local time; pushes deferred during this window
    "quiet_hours_end": 7,                  # 24h end of DND window (wraps midnight if end < start)
    "daily_email_enabled": False,          # email digest via Resend (requires RESEND_API_KEY)
    "agent_enabled": {
        "product_ceo": True,
        "architect":   True,
        "designer":    True,
        "frontend":    True,
        "backend":     True,
        "database":    True,
        "integration": True,
        "qa":          True,
        "security":    True,
        "devops":      True,
        "growth":      True,
        "reviewer":    True,
    },
    # Autonomy ladder — gates what agents may DO before a human signs off:
    #   0 Suggest only · 1 Plan + draft · 2 Build preview only · 3 Approved exec
    #   4 Recursive mode · 5 Controlled production auto for low-risk only
    "autonomy_level": 2,
}


async def load_policy(workspace_id: str) -> Dict[str, Any]:
    """Return the workspace policy, creating a default if missing."""
    doc = await db.agent_policies.find_one({"workspace_id": workspace_id}, {"_id": 0})
    if doc:
        # merge with defaults so newly-added keys behave sanely on old docs
        merged = {**DEFAULT_POLICY, **doc.get("policy", {})}
        merged_agents = {**DEFAULT_POLICY["agent_enabled"], **merged.get("agent_enabled", {})}
        merged["agent_enabled"] = merged_agents
        return {"workspace_id": workspace_id, "policy": merged, "updated_at": doc.get("updated_at")}
    return {"workspace_id": workspace_id, "policy": DEFAULT_POLICY, "updated_at": None}


async def save_policy(workspace_id: str, policy: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    merged = {**DEFAULT_POLICY, **policy}
    merged["agent_enabled"] = {**DEFAULT_POLICY["agent_enabled"], **policy.get("agent_enabled", {})}
    payload = {
        "workspace_id": workspace_id,
        "policy": merged,
        "updated_at": now_iso(),
        "updated_by": user_id,
    }
    await db.agent_policies.update_one(
        {"workspace_id": workspace_id},
        {"$set": payload, "$setOnInsert": {"id": new_id(), "created_at": now_iso()}},
        upsert=True,
    )
    return payload


def should_auto_approve(policy: Dict[str, Any], proposal: Dict[str, Any]) -> bool:
    """Decide if a freshly-drafted proposal can skip the human review queue."""
    p = policy.get("policy", policy)  # accept either wrapped or raw
    if proposal.get("proposal_type") == "documentation" and p.get("auto_approve_documentation"):
        return True
    if proposal.get("required_approval_level") == "human_required":
        return False
    if proposal.get("estimated_credits", 0) > p.get("max_credits_without_approval", 10):
        return False
    risk = proposal.get("risk_level", "medium")
    if risk == "low" and p.get("auto_approve_low_risk"):
        return True
    return False


def disabled_agents(policy: Dict[str, Any]) -> List[str]:
    p = policy.get("policy", policy)
    return [k for k, v in (p.get("agent_enabled") or {}).items() if not v]
