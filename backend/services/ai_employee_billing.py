"""AI Employee corporate billing engine (Phase 3).

Computes the monthly cost ledger for AI employees deployed inside a workspace:

  total = base_monthly_fee + (per_user_fee × active_users) + credit/license extras
  platform_fee = total × platform_fee_percent
  creator_earnings = total − platform_fee   (0 when TeamNest owns the employee)

Defaults (configurable by Super Admin via `ai_employee_billing_rules/global`):
  • minimum builder fee ........ $10 / employee / month
  • per-user fee ............... $3  / active user / month
  • platform fee .............. 30%  (creator keeps 70%)

No real money is moved here — this is the computed ledger that dashboards read
and that a payment rail (Stripe) can later settle against.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional

from deps import db, now_iso

DEFAULT_RULES = {
    "id": "global",
    "min_builder_fee": 10.0,
    "per_user_fee": 3.0,
    "platform_fee_percent": 30.0,
    "creator_revenue_percent": 70.0,
    "charge_draft_employees": False,
    "charge_only_deployed": True,
    "free_trial_days": 14,
    "category_overrides": {},
}


def current_period() -> str:
    """Billing period key, e.g. '2026-07'."""
    n = datetime.now(timezone.utc)
    return f"{n.year:04d}-{n.month:02d}"


async def get_billing_rules() -> dict:
    doc = await db.ai_employee_billing_rules.find_one({"id": "global"}, {"_id": 0})
    if not doc:
        doc = {**DEFAULT_RULES, "created_at": now_iso(), "updated_at": now_iso()}
        await db.ai_employee_billing_rules.insert_one(doc.copy())
    return {**DEFAULT_RULES, **doc}


async def update_billing_rules(patch: dict) -> dict:
    allowed = {
        "min_builder_fee", "per_user_fee", "platform_fee_percent",
        "creator_revenue_percent", "charge_draft_employees",
        "charge_only_deployed", "free_trial_days", "category_overrides",
    }
    update = {k: v for k, v in patch.items() if k in allowed}
    # Keep platform + creator percentages consistent.
    if "platform_fee_percent" in update and "creator_revenue_percent" not in update:
        update["creator_revenue_percent"] = round(100.0 - float(update["platform_fee_percent"]), 2)
    update["updated_at"] = now_iso()
    await db.ai_employee_billing_rules.update_one(
        {"id": "global"}, {"$set": update}, upsert=True
    )
    return await get_billing_rules()


async def record_ai_employee_usage(workspace_id: str, employee_id: str, user_id: str) -> None:
    """Mark a user as a monthly-active user of a deployed AI employee.

    Best-effort; only counts users of employees that are actually enabled for
    the workspace so ad-hoc sandbox chatter isn't billed.
    """
    if not (workspace_id and employee_id and user_id) or str(user_id).startswith("ai-"):
        return
    deployed = await db.workspace_ai_employees.find_one(
        {"workspace_id": workspace_id, "employee_id": employee_id, "status": "active"},
        {"_id": 0, "id": 1},
    )
    if not deployed:
        return
    period = current_period()
    now = now_iso()
    await db.workspace_ai_employee_users.update_one(
        {"workspace_id": workspace_id, "employee_id": employee_id,
         "user_id": user_id, "billing_period": period},
        {"$inc": {"usage_count": 1},
         "$set": {"last_seen_at": now, "active_user_counted": True},
         "$setOnInsert": {"id": _new(), "first_seen_at": now}},
        upsert=True,
    )


def _new() -> str:
    from deps import new_id
    return new_id()


def _pct(rules: dict, category: Optional[str], key: str) -> float:
    ov = (rules.get("category_overrides") or {}).get(category or "", {})
    if key in ov:
        return float(ov[key])
    return float(rules.get(key, 0))


async def _active_users(workspace_id: str, employee_id: str, period: str) -> int:
    return await db.workspace_ai_employee_users.count_documents({
        "workspace_id": workspace_id, "employee_id": employee_id,
        "billing_period": period, "usage_count": {"$gt": 0},
    })


async def _employee_meta(employee_id: str) -> dict:
    return await db.ai_employees.find_one(
        {"id": employee_id},
        {"_id": 0, "name": 1, "creator_user_id": 1, "industry": 1,
         "installed_from_listing_id": 1, "department": 1},
    ) or {"name": "(deleted)"}


async def compute_deployment_billing(dep: dict, rules: dict, period: str) -> dict:
    """Build the ledger row for one workspace deployment."""
    emp = await _employee_meta(dep["employee_id"])
    category = emp.get("industry")
    platform_pct = float(dep.get("platform_fee_percent") or _pct(rules, category, "platform_fee_percent"))

    base_fee = float(dep.get("base_monthly_fee") or rules["min_builder_fee"])
    per_user = float(dep.get("per_user_monthly_fee") or rules["per_user_fee"])
    if dep.get("status") != "active" and rules.get("charge_only_deployed", True):
        base_fee = 0.0

    active = await _active_users(dep["workspace_id"], dep["employee_id"], period)
    per_user_total = round(per_user * active, 2)
    marketplace_license_fee = float(dep.get("marketplace_license_fee") or 0)
    ai_credit_charges = float(dep.get("ai_credit_charges") or 0)
    total = round(base_fee + per_user_total + marketplace_license_fee + ai_credit_charges, 2)

    platform_fee = round(total * platform_pct / 100.0, 2)
    # TeamNest-owned employees (no external creator) → platform keeps 100%.
    teamnest_owned = not emp.get("creator_user_id")
    creator_earnings = 0.0 if teamnest_owned else round(total - platform_fee, 2)
    if teamnest_owned:
        platform_fee = total

    return {
        "workspace_id": dep["workspace_id"],
        "employee_id": dep["employee_id"],
        "employee_name": emp.get("name"),
        "creator_user_id": emp.get("creator_user_id"),
        "teamnest_owned": teamnest_owned,
        "billing_period": period,
        "active_users": active,
        "base_fee": base_fee,
        "per_user_fee_rate": per_user,
        "per_user_fee_total": per_user_total,
        "marketplace_license_fee": marketplace_license_fee,
        "ai_credit_charges": ai_credit_charges,
        "total_fee": total,
        "platform_fee_percent": platform_pct,
        "platform_fee": platform_fee,
        "creator_earnings": creator_earnings,
        "status": dep.get("status"),
    }


async def workspace_ledger(workspace_id: str, period: Optional[str] = None) -> dict:
    period = period or current_period()
    rules = await get_billing_rules()
    deps = await db.workspace_ai_employees.find(
        {"workspace_id": workspace_id}, {"_id": 0}
    ).to_list(500)
    rows = [await compute_deployment_billing(d, rules, period) for d in deps]
    return {
        "period": period,
        "rows": rows,
        "totals": {
            "workspace_total": round(sum(r["total_fee"] for r in rows), 2),
            "platform_fee": round(sum(r["platform_fee"] for r in rows), 2),
            "creator_earnings": round(sum(r["creator_earnings"] for r in rows), 2),
            "active_employees": sum(1 for r in rows if r["status"] == "active"),
            "active_users": sum(r["active_users"] for r in rows),
        },
        "rules": rules,
    }


async def creator_ledger(creator_user_id: str, period: Optional[str] = None) -> dict:
    """Earnings across every workspace that deployed an employee this creator owns."""
    period = period or current_period()
    rules = await get_billing_rules()
    my_emp_ids = [
        e["id"] async for e in db.ai_employees.find(
            {"creator_user_id": creator_user_id}, {"_id": 0, "id": 1})
    ]
    if not my_emp_ids:
        return {"period": period, "rows": [], "totals": _empty_creator_totals()}
    deps = await db.workspace_ai_employees.find(
        {"employee_id": {"$in": my_emp_ids}}, {"_id": 0}
    ).to_list(1000)
    rows = [await compute_deployment_billing(d, rules, period) for d in deps]
    gross = round(sum(r["total_fee"] for r in rows), 2)
    platform = round(sum(r["platform_fee"] for r in rows), 2)
    return {
        "period": period,
        "rows": rows,
        "totals": {
            "licensed_workspaces": len({r["workspace_id"] for r in rows}),
            "gross_revenue": gross,
            "platform_fee": platform,
            "net_earnings": round(gross - platform, 2),
            "active_users": sum(r["active_users"] for r in rows),
        },
    }


def _empty_creator_totals() -> dict:
    return {"licensed_workspaces": 0, "gross_revenue": 0.0, "platform_fee": 0.0,
            "net_earnings": 0.0, "active_users": 0}


async def platform_ledger(period: Optional[str] = None) -> dict:
    """Super-admin view — platform-wide revenue, payouts, spend."""
    period = period or current_period()
    rules = await get_billing_rules()
    deps = await db.workspace_ai_employees.find({}, {"_id": 0}).to_list(5000)
    rows = [await compute_deployment_billing(d, rules, period) for d in deps]
    return {
        "period": period,
        "totals": {
            "platform_revenue": round(sum(r["platform_fee"] for r in rows), 2),
            "creator_payouts": round(sum(r["creator_earnings"] for r in rows), 2),
            "workspace_spend": round(sum(r["total_fee"] for r in rows), 2),
            "active_deployments": sum(1 for r in rows if r["status"] == "active"),
            "workspaces": len({r["workspace_id"] for r in rows}),
            "active_users": sum(r["active_users"] for r in rows),
        },
        "top_employees": sorted(rows, key=lambda r: r["total_fee"], reverse=True)[:10],
        "rules": rules,
    }
