"""Workspace AI-Employee licensing & deployment (Phase 3).

Workspace owners/admins enable AI employees for their team (whole workspace,
departments, roles, or selected users), set pricing, and view billing. Creators
see their earnings; Super Admins see platform revenue and configure the global
revenue-share rules.

Routes prefixed /api. Specific routes are declared before parameterized ones.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import db, new_id, now_iso, require_super_admin, require_user
from services.ai_employee_billing import (
    creator_ledger,
    current_period,
    get_billing_rules,
    platform_ledger,
    update_billing_rules,
    workspace_ledger,
)

router = APIRouter()


def _owner_only(current: dict):
    if not current.get("is_super_admin") and current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Workspace owner or admin only")


class DeployConfig(BaseModel):
    availability_scope: str = "workspace"  # workspace|departments|roles|users
    enabled_departments: List[str] = []
    enabled_roles: List[str] = []
    enabled_users: List[str] = []
    base_monthly_fee: Optional[float] = None
    per_user_monthly_fee: Optional[float] = None
    platform_fee_percent: Optional[float] = None
    monthly_budget: Optional[float] = None
    central_learning_allowed: bool = False
    approval_required: bool = True


# ── Consent / pricing preview (SPECIFIC) ─────────────────────────────────
@router.get("/workspace-ai/employees/{eid}/consent-preview")
async def consent_preview(eid: str, current=Depends(require_user)):
    _owner_only(current)
    emp = await db.ai_employees.find_one(
        {"id": eid}, {"_id": 0, "name": 1, "job_title": 1, "creator_user_id": 1,
                      "permissions_risk_level": 1, "industry": 1})
    if not emp:
        raise HTTPException(404, "AI employee not found")
    rules = await get_billing_rules()
    perm = await db.ai_employee_permissions.find_one(
        {"employee_id": eid}, {"_id": 0, "permission_level": 1})
    base = rules["min_builder_fee"]
    per_user = rules["per_user_fee"]
    teamnest_owned = not emp.get("creator_user_id")
    return {
        "employee": emp,
        "permission_level": (perm or {}).get("permission_level", "Answer only"),
        "pricing": {
            "base_monthly_fee": base,
            "per_user_monthly_fee": per_user,
            "platform_fee_percent": rules["platform_fee_percent"],
            "creator_revenue_percent": 0 if teamnest_owned else rules["creator_revenue_percent"],
            "teamnest_owned": teamnest_owned,
            "free_trial_days": rules["free_trial_days"],
        },
        "disclosure": (
            f"Enable this AI employee for your team. Base fee is ${base:.0f}/month "
            f"plus ${per_user:.0f}/month per active user. TeamNest receives a "
            f"{rules['platform_fee_percent']:.0f}% platform fee."
        ),
        "notes": [
            "This AI employee cannot send messages or change records unless you grant write access and approval rules.",
            "Central learning is optional and off by default. Only sanitized patterns may be used.",
        ],
    }


# ── Deployment CRUD ──────────────────────────────────────────────────────
@router.get("/workspace-ai/employees")
async def list_workspace_employees(current=Depends(require_user)):
    _owner_only(current)
    ws = current["workspace_id"]
    rows = await db.workspace_ai_employees.find({"workspace_id": ws}, {"_id": 0}).to_list(500)
    out = []
    for r in rows:
        emp = await db.ai_employees.find_one(
            {"id": r["employee_id"]}, {"_id": 0, "name": 1, "job_title": 1, "status": 1})
        out.append({**r, "employee": emp or {"name": "(deleted)"}})
    return {"employees": out}


@router.post("/workspace-ai/employees/{eid}/enable")
async def enable_employee(eid: str, cfg: DeployConfig, current=Depends(require_user)):
    _owner_only(current)
    ws = current["workspace_id"]
    emp = await db.ai_employees.find_one({"id": eid}, {"_id": 0, "id": 1, "industry": 1})
    if not emp:
        raise HTTPException(404, "AI employee not found")
    rules = await get_billing_rules()
    now = now_iso()
    doc = {
        "workspace_id": ws,
        "employee_id": eid,
        "enabled_by_owner_id": current["id"],
        "availability_scope": cfg.availability_scope,
        "enabled_departments": cfg.enabled_departments,
        "enabled_roles": cfg.enabled_roles,
        "enabled_users": cfg.enabled_users,
        "base_monthly_fee": cfg.base_monthly_fee if cfg.base_monthly_fee is not None else rules["min_builder_fee"],
        "per_user_monthly_fee": cfg.per_user_monthly_fee if cfg.per_user_monthly_fee is not None else rules["per_user_fee"],
        "platform_fee_percent": cfg.platform_fee_percent if cfg.platform_fee_percent is not None else rules["platform_fee_percent"],
        "creator_revenue_percent": rules["creator_revenue_percent"],
        "monthly_budget": cfg.monthly_budget,
        "central_learning_allowed": cfg.central_learning_allowed,
        "approval_required": cfg.approval_required,
        "status": "active",
        "updated_at": now,
    }
    existing = await db.workspace_ai_employees.find_one(
        {"workspace_id": ws, "employee_id": eid}, {"_id": 0, "id": 1})
    if existing:
        await db.workspace_ai_employees.update_one(
            {"id": existing["id"]}, {"$set": doc})
        doc["id"] = existing["id"]
    else:
        doc["id"] = new_id()
        doc["created_at"] = now
        await db.workspace_ai_employees.insert_one(doc.copy())
    return {"ok": True, "deployment": doc}


@router.patch("/workspace-ai/employees/{eid}")
async def update_employee(eid: str, cfg: DeployConfig, current=Depends(require_user)):
    _owner_only(current)
    ws = current["workspace_id"]
    update = {
        "availability_scope": cfg.availability_scope,
        "enabled_departments": cfg.enabled_departments,
        "enabled_roles": cfg.enabled_roles,
        "enabled_users": cfg.enabled_users,
        "central_learning_allowed": cfg.central_learning_allowed,
        "approval_required": cfg.approval_required,
        "updated_at": now_iso(),
    }
    # Only overwrite pricing when explicitly provided (don't null it out).
    for k in ("base_monthly_fee", "per_user_monthly_fee", "platform_fee_percent", "monthly_budget"):
        v = getattr(cfg, k)
        if v is not None:
            update[k] = v
    r = await db.workspace_ai_employees.update_one(
        {"workspace_id": ws, "employee_id": eid}, {"$set": update},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Deployment not found")
    return {"ok": True}


@router.post("/workspace-ai/employees/{eid}/disable")
async def disable_employee(eid: str, current=Depends(require_user)):
    _owner_only(current)
    ws = current["workspace_id"]
    r = await db.workspace_ai_employees.update_one(
        {"workspace_id": ws, "employee_id": eid},
        {"$set": {"status": "disabled", "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Deployment not found")
    return {"ok": True}


# ── Billing dashboards ───────────────────────────────────────────────────
@router.get("/workspace-ai/billing/workspace")
async def billing_workspace(period: Optional[str] = None, current=Depends(require_user)):
    _owner_only(current)
    return await workspace_ledger(current["workspace_id"], period)


@router.get("/workspace-ai/billing/creator")
async def billing_creator(period: Optional[str] = None, current=Depends(require_user)):
    return await creator_ledger(current["id"], period)


@router.get("/workspace-ai/billing/admin")
async def billing_admin(period: Optional[str] = None, current=Depends(require_super_admin)):
    return await platform_ledger(period)


# ── Admin revenue-share rules ────────────────────────────────────────────
class RulesPatch(BaseModel):
    min_builder_fee: Optional[float] = None
    per_user_fee: Optional[float] = None
    platform_fee_percent: Optional[float] = None
    creator_revenue_percent: Optional[float] = None
    charge_draft_employees: Optional[bool] = None
    charge_only_deployed: Optional[bool] = None
    free_trial_days: Optional[int] = None
    category_overrides: Optional[dict] = None


@router.get("/workspace-ai/billing-rules")
async def get_rules(current=Depends(require_user)):
    return await get_billing_rules()


@router.put("/workspace-ai/billing-rules")
async def put_rules(patch: RulesPatch, current=Depends(require_super_admin)):
    return await update_billing_rules({k: v for k, v in patch.dict().items() if v is not None})


@router.get("/workspace-ai/period")
async def period():
    return {"period": current_period()}
