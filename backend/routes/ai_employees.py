"""AI Employee subscription & trial management.

Per-workspace state lives in `ai_employee_subscriptions` and `ai_employee_waitlist`.
Per-employee credit usage lives in `ai_employee_credit_ledger`.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ai_employees_catalog import (
    ACTIVE_EMPLOYEES,
    ALL_EMPLOYEES,
    COMING_SOON_EMPLOYEES,
    get_employee,
    public_employee,
)
from deps import db, new_id, now_iso, require_user

router = APIRouter()


# ----- Pydantic -----
class WaitlistJoin(BaseModel):
    note: Optional[str] = None


class TrialStart(BaseModel):
    display_first_name: Optional[str] = None


class RenameEmployee(BaseModel):
    display_first_name: str


# Default first names per employee role — used when the user doesn't pick one.
DEFAULT_FIRST_NAMES = {
    "cmo": "Priya",
    "sales": "Marcus",
    "paralegal": "Diana",
    "bookkeeper": "Henry",
    "financial_modeler": "Elena",
    "restaurant_orders": "Mira",
    "bill_pay": "Sam",
}


def _sanitize_first_name(raw: Optional[str], fallback_key: str) -> str:
    """Clean a user-supplied first name; fall back to per-role default."""
    if not raw:
        return DEFAULT_FIRST_NAMES.get(fallback_key, "Alex")
    cleaned = "".join(ch for ch in raw.strip() if ch.isalpha() or ch in (" ", "-", "'"))
    cleaned = cleaned[:24].strip() or DEFAULT_FIRST_NAMES.get(fallback_key, "Alex")
    # Capitalise first letter of each word.
    return " ".join(p.capitalize() for p in cleaned.split())


class SubscriptionAction(BaseModel):
    """Used for pause / resume / cancel."""
    note: Optional[str] = None


class CreditAdjust(BaseModel):
    amount: int
    reason: str


# ----- Helpers -----
def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso_in(days: int) -> str:
    return (_utcnow() + timedelta(days=days)).isoformat()


async def _find_sub(workspace_id: str, employee_key: str) -> Optional[Dict[str, Any]]:
    return await db.ai_employee_subscriptions.find_one(
        {"workspace_id": workspace_id, "employee_key": employee_key},
        {"_id": 0},
    )


def _trial_status(sub: Dict[str, Any], now: datetime) -> Optional[str]:
    """Trial-phase substatus, or None when the sub isn't in a trial."""
    trial_end = sub.get("trial_ends_at")
    if not trial_end or sub.get("phase") != "trial":
        return None
    end_dt = datetime.fromisoformat(trial_end.replace("Z", "+00:00"))
    if now < end_dt:
        days_left = (end_dt - now).days
        if days_left <= 1:
            return "trial_ending_today"
        if days_left <= 3:
            return "trial_ending_soon"
        return "trial_active"
    return "active" if sub.get("auto_convert", True) else "trial_expired"


def _derive_status(sub: Dict[str, Any]) -> str:
    """Compute the live status from the stored fields. Stored 'status' wins
    for paused/cancelled (admin actions); time-based transitions are derived.

    Cancellation grace period:
      - If `cancel_at_period_end=True` AND we're before `access_ends_at`,
        the subscription keeps working but reports 'cancelling' so the UI
        can show "access until <date>". Once the deadline passes the stored
        status flips to 'cancelled'.
    """
    raw = sub.get("status")
    if raw == "paused":
        return "paused"
    now = _utcnow()

    # Pending cancellation: still active until access_ends_at.
    if sub.get("cancel_at_period_end") and sub.get("access_ends_at"):
        end_dt = datetime.fromisoformat(sub["access_ends_at"].replace("Z", "+00:00"))
        return "cancelling" if now < end_dt else "cancelled"

    if raw == "cancelled":
        return "cancelled"

    trial = _trial_status(sub, now)
    if trial:
        return trial
    return raw or "active"


async def _serialize_sub(sub: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(sub)
    out["status"] = _derive_status(sub)
    return out


# ----- Catalog endpoints -----
@router.get("/ai-employees")
async def list_ai_employees(current=Depends(require_user)):
    """Return every employee (active + coming soon) annotated with this
    workspace's subscription state."""
    workspace_id = current["workspace_id"]
    subs = await db.ai_employee_subscriptions.find(
        {"workspace_id": workspace_id}, {"_id": 0}
    ).to_list(100)
    sub_by_key = {s["employee_key"]: s for s in subs}

    waitlist = await db.ai_employee_waitlist.find(
        {"workspace_id": workspace_id}, {"_id": 0}
    ).to_list(100)
    waitlist_keys = {w["employee_key"] for w in waitlist}

    result = []
    for emp in ALL_EMPLOYEES:
        pub = public_employee(emp)
        sub = sub_by_key.get(emp["key"])
        if sub:
            pub["subscription"] = await _serialize_sub(sub)
        else:
            pub["subscription"] = None
        pub["on_waitlist"] = emp["key"] in waitlist_keys
        result.append(pub)
    return {
        "employees": result,
        "active_count": len(ACTIVE_EMPLOYEES),
        "coming_soon_count": len(COMING_SOON_EMPLOYEES),
    }


@router.get("/ai-employees/{key}")
async def get_ai_employee(key: str, current=Depends(require_user)):
    emp = get_employee(key)
    if not emp:
        raise HTTPException(404, "Employee not found")
    pub = public_employee(emp)
    sub = await _find_sub(current["workspace_id"], key)
    pub["subscription"] = await _serialize_sub(sub) if sub else None
    # Bring in recent activity if subscribed.
    if sub:
        activity = await db.ai_employee_activity.find(
            {"workspace_id": current["workspace_id"], "employee_key": key},
            {"_id": 0},
        ).sort("created_at", -1).to_list(20)
        pub["recent_activity"] = activity
        ledger = await db.ai_employee_credit_ledger.find(
            {"workspace_id": current["workspace_id"], "employee_key": key},
            {"_id": 0},
        ).sort("at", -1).to_list(50)
        pub["credit_ledger"] = ledger
    return pub


# ----- Trial / subscription lifecycle -----
@router.post("/ai-employees/{key}/trial")
async def start_trial(key: str, payload: TrialStart = TrialStart(), current=Depends(require_user)):
    emp = get_employee(key)
    if not emp:
        raise HTTPException(404, "Employee not found")
    if emp["status"] != "active":
        raise HTTPException(400, "This employee is Coming Soon — join the waitlist instead.")
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only workspace owners or admins can start AI employee trials.")

    existing = await _find_sub(current["workspace_id"], key)
    if existing and existing.get("status") not in ("cancelled",):
        raise HTTPException(400, "This employee already has an active subscription or trial.")

    trial_days = emp.get("trial_days", 7)
    display_first_name = _sanitize_first_name(payload.display_first_name, key)
    sub = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "employee_key": key,
        "started_by": current["id"],
        "display_first_name": display_first_name,
        "display_full_name": f"{display_first_name} AI",
        "phase": "trial",
        "status": "trial_active",
        "trial_started_at": now_iso(),
        "trial_ends_at": _iso_in(trial_days),
        "trial_credits_total": emp.get("trial_credits", 0),
        "trial_credits_used": 0,
        "monthly_credits_total": emp.get("monthly_credits", 0),
        "monthly_credits_used": 0,
        "monthly_price": emp.get("monthly_price", 0),
        "auto_convert": True,
        "credit_limit_override": None,
        "per_task_credit_limit": None,
        "approval_threshold_credits": 50,
        "stripe_subscription_id": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.ai_employee_subscriptions.update_one(
        {"workspace_id": current["workspace_id"], "employee_key": key},
        {"$set": sub},
        upsert=True,
    )
    # Activity log + audit
    await db.ai_employee_activity.insert_one(
        {
            "id": new_id(),
            "workspace_id": current["workspace_id"],
            "employee_key": key,
            "actor_id": current["id"],
            "kind": "trial_started",
            "summary": f"{display_first_name} AI ({emp['name']}) trial started ({trial_days} days)",
            "created_at": now_iso(),
        }
    )
    return await _serialize_sub(sub)


@router.post("/ai-employees/{key}/rename")
async def rename_employee(key: str, payload: RenameEmployee, current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owners/admins can rename AI employees.")
    sub = await _find_sub(current["workspace_id"], key)
    if not sub:
        raise HTTPException(404, "No active subscription for this employee.")
    new_first = _sanitize_first_name(payload.display_first_name, key)
    await db.ai_employee_subscriptions.update_one(
        {"workspace_id": current["workspace_id"], "employee_key": key},
        {"$set": {
            "display_first_name": new_first,
            "display_full_name": f"{new_first} AI",
            "updated_at": now_iso(),
        }},
    )
    await db.ai_employee_activity.insert_one({
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "employee_key": key,
        "actor_id": current["id"],
        "kind": "renamed",
        "summary": f"Renamed to {new_first} AI",
        "created_at": now_iso(),
    })
    return {"ok": True, "display_first_name": new_first, "display_full_name": f"{new_first} AI"}


async def _update_sub_status(workspace_id: str, key: str, new_status: str, current_id: str, kind: str, summary: str):
    sub = await _find_sub(workspace_id, key)
    if not sub:
        raise HTTPException(404, "No subscription found")
    await db.ai_employee_subscriptions.update_one(
        {"workspace_id": workspace_id, "employee_key": key},
        {"$set": {"status": new_status, "updated_at": now_iso()}},
    )
    await db.ai_employee_activity.insert_one(
        {
            "id": new_id(),
            "workspace_id": workspace_id,
            "employee_key": key,
            "actor_id": current_id,
            "kind": kind,
            "summary": summary,
            "created_at": now_iso(),
        }
    )
    sub["status"] = new_status
    return sub


@router.post("/ai-employees/{key}/pause")
async def pause_employee(key: str, _: SubscriptionAction = SubscriptionAction(), current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Admins only")
    emp = get_employee(key) or {}
    return await _update_sub_status(
        current["workspace_id"], key, "paused", current["id"],
        "paused", f"{emp.get('name', key)} paused",
    )


@router.post("/ai-employees/{key}/resume")
async def resume_employee(key: str, _: SubscriptionAction = SubscriptionAction(), current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Admins only")
    sub = await _find_sub(current["workspace_id"], key)
    if not sub:
        raise HTTPException(404, "No subscription found")
    # Resume back to active or trial_active depending on phase.
    new_status = "trial_active" if sub.get("phase") == "trial" else "active"
    emp = get_employee(key) or {}
    return await _update_sub_status(
        current["workspace_id"], key, new_status, current["id"],
        "resumed", f"{emp.get('name', key)} resumed",
    )


@router.post("/ai-employees/{key}/cancel")
async def cancel_employee(key: str, _: SubscriptionAction = SubscriptionAction(), current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Admins only")
    sub = await _find_sub(current["workspace_id"], key)
    if not sub:
        raise HTTPException(404, "No subscription found")
    emp = get_employee(key) or {}

    # Determine the end of the current paid/trial period — that's when access ends.
    if sub.get("phase") == "trial" and sub.get("trial_ends_at"):
        access_until = sub["trial_ends_at"]
    else:
        # Active paid: extend to 30 days from `created_at` (or last renewal).
        # We don't have Stripe period end stored, so approximate as 30 days
        # rolling from the most recent activation.
        anchor = sub.get("activated_at") or sub.get("created_at") or now_iso()
        anchor_dt = datetime.fromisoformat(anchor.replace("Z", "+00:00"))
        # Find the next anniversary >= now.
        end_dt = anchor_dt
        while end_dt < _utcnow():
            end_dt += timedelta(days=30)
        access_until = end_dt.isoformat()

    await db.ai_employee_subscriptions.update_one(
        {"workspace_id": current["workspace_id"], "employee_key": key},
        {"$set": {
            "cancel_at_period_end": True,
            "auto_convert": False,
            "access_ends_at": access_until,
            "cancelled_at": now_iso(),
            "updated_at": now_iso(),
        }},
    )
    await db.ai_employee_activity.insert_one({
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "employee_key": key,
        "actor_id": current["id"],
        "kind": "cancel_requested",
        "summary": f"{emp.get('name', key)} cancelled — access until {access_until[:10]}",
        "created_at": now_iso(),
    })
    refreshed = await _find_sub(current["workspace_id"], key)
    return await _serialize_sub(refreshed)


@router.post("/ai-employees/{key}/uncancel")
async def uncancel_employee(key: str, current=Depends(require_user)):
    """Owner changed their mind — clear the pending cancellation."""
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Admins only")
    sub = await _find_sub(current["workspace_id"], key)
    if not sub:
        raise HTTPException(404, "No subscription found")
    if not sub.get("cancel_at_period_end"):
        raise HTTPException(400, "Subscription is not pending cancellation.")
    await db.ai_employee_subscriptions.update_one(
        {"workspace_id": current["workspace_id"], "employee_key": key},
        {
            "$set": {"auto_convert": True, "updated_at": now_iso()},
            "$unset": {"cancel_at_period_end": "", "access_ends_at": "", "cancelled_at": ""},
        },
    )
    refreshed = await _find_sub(current["workspace_id"], key)
    return await _serialize_sub(refreshed)


# ----- Waitlist (Coming Soon) -----
@router.post("/ai-employees/{key}/waitlist")
async def join_waitlist(key: str, payload: WaitlistJoin, current=Depends(require_user)):
    emp = get_employee(key)
    if not emp:
        raise HTTPException(404, "Employee not found")
    if emp["status"] != "coming_soon":
        raise HTTPException(400, "This employee is already available — start a trial.")
    record = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "employee_key": key,
        "user_id": current["id"],
        "user_name": current.get("name"),
        "user_email": current.get("email"),
        "note": payload.note,
        "created_at": now_iso(),
    }
    await db.ai_employee_waitlist.update_one(
        {"workspace_id": current["workspace_id"], "employee_key": key, "user_id": current["id"]},
        {"$set": record},
        upsert=True,
    )
    return {"ok": True, "joined_at": record["created_at"]}


# ----- Credit ledger -----
async def deduct_employee_credits(
    workspace_id: str,
    employee_key: str,
    user_id: str,
    credits: int,
    reason: str,
    task_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Deduct credits from this employee's bucket. Trial credits drain first,
    then monthly credits. Records ledger entry. Returns dict with `ok`,
    `remaining_trial`, `remaining_monthly`."""
    sub = await _find_sub(workspace_id, employee_key)
    if not sub:
        return {"ok": False, "error": "no_subscription"}
    if _derive_status(sub) in ("paused", "cancelled"):
        return {"ok": False, "error": "subscription_inactive"}

    in_trial = sub.get("phase") == "trial"
    if in_trial:
        used = sub.get("trial_credits_used", 0) + credits
        await db.ai_employee_subscriptions.update_one(
            {"workspace_id": workspace_id, "employee_key": employee_key},
            {"$set": {"trial_credits_used": used, "updated_at": now_iso()}},
        )
    else:
        used = sub.get("monthly_credits_used", 0) + credits
        await db.ai_employee_subscriptions.update_one(
            {"workspace_id": workspace_id, "employee_key": employee_key},
            {"$set": {"monthly_credits_used": used, "updated_at": now_iso()}},
        )

    await db.ai_employee_credit_ledger.insert_one(
        {
            "id": new_id(),
            "workspace_id": workspace_id,
            "employee_key": employee_key,
            "user_id": user_id,
            "credits": credits,
            "reason": reason,
            "task_id": task_id,
            "at": now_iso(),
        }
    )
    return {
        "ok": True,
        "phase": sub.get("phase"),
        "credits_used_now": credits,
    }


@router.get("/ai-employees/_/savings")
async def savings_dashboard(current=Depends(require_user)):
    """Per-employee + workspace-total: tasks completed, hours saved, and
    estimated dollar savings based on market billable rates."""
    workspace_id = current["workspace_id"]
    now = _utcnow()
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc).isoformat()

    pipeline = [
        {"$match": {"workspace_id": workspace_id}},
        {"$group": {
            "_id": "$employee_key",
            "tasks": {"$sum": 1},
            "hours_saved": {"$sum": "$estimated_hours_saved"},
            "tasks_this_month": {
                "$sum": {"$cond": [{"$gte": ["$completed_at", month_start]}, 1, 0]},
            },
            "hours_this_month": {
                "$sum": {
                    "$cond": [
                        {"$gte": ["$completed_at", month_start]},
                        "$estimated_hours_saved",
                        0,
                    ],
                },
            },
            "last_task_at": {"$max": "$completed_at"},
        }},
    ]
    rows = await db.ai_employee_tasks.aggregate(pipeline).to_list(50)
    by_key = {r["_id"]: r for r in rows}

    out = []
    total_tasks = 0
    total_hours = 0.0
    total_savings = 0.0
    monthly_savings = 0.0
    for key in ("cmo", "sales", "paralegal", "bookkeeper"):
        emp = get_employee(key)
        if not emp:
            continue
        sub = await _find_sub(workspace_id, key)
        if not sub:
            continue
        rate = emp.get("market_billable_rate_usd", 100)
        r = by_key.get(key, {})
        tasks = r.get("tasks", 0)
        hours = round(r.get("hours_saved", 0) or 0, 2)
        month_tasks = r.get("tasks_this_month", 0)
        month_hours = round(r.get("hours_this_month", 0) or 0, 2)
        emp_savings = round(hours * rate, 2)
        emp_month_savings = round(month_hours * rate, 2)
        total_tasks += tasks
        total_hours += hours
        total_savings += emp_savings
        monthly_savings += emp_month_savings
        out.append({
            "employee_key": key,
            "employee_name": emp["name"],
            "display_full_name": sub.get("display_full_name") or emp["name"],
            "market_billable_rate_usd": rate,
            "tasks_completed": tasks,
            "hours_saved": hours,
            "dollar_savings": emp_savings,
            "tasks_this_month": month_tasks,
            "hours_this_month": month_hours,
            "monthly_dollar_savings": emp_month_savings,
            "monthly_price": emp.get("monthly_price", 0),
            "monthly_roi_multiple": round(
                emp_month_savings / emp.get("monthly_price", 1), 1,
            ) if emp.get("monthly_price") else None,
            "last_task_at": r.get("last_task_at"),
        })
    return {
        "employees": out,
        "totals": {
            "tasks_completed": total_tasks,
            "hours_saved": round(total_hours, 2),
            "dollar_savings": round(total_savings, 2),
            "monthly_dollar_savings": round(monthly_savings, 2),
        },
    }


@router.get("/ai-employees/_/usage")
async def credit_usage_dashboard(current=Depends(require_user)):
    """Roll-up of credit usage across every subscribed employee."""
    workspace_id = current["workspace_id"]
    subs = await db.ai_employee_subscriptions.find(
        {"workspace_id": workspace_id}, {"_id": 0}
    ).to_list(100)
    out = []
    total_used = 0
    total_included = 0
    for s in subs:
        emp = get_employee(s["employee_key"])
        if not emp:
            continue
        in_trial = s.get("phase") == "trial"
        used = s.get("trial_credits_used", 0) if in_trial else s.get("monthly_credits_used", 0)
        included = s.get("trial_credits_total", 0) if in_trial else s.get("monthly_credits_total", 0)
        total_used += used
        total_included += included
        out.append({
            "employee_key": s["employee_key"],
            "employee_name": emp["name"],
            "status": _derive_status(s),
            "phase": s.get("phase"),
            "credits_used": used,
            "credits_included": included,
            "percent_used": round((used / included * 100), 1) if included else 0,
            "monthly_price": emp.get("monthly_price"),
        })
    return {
        "employees": out,
        "total_used": total_used,
        "total_included": total_included,
    }


# ----- Activity & Approval queue feeders -----
async def log_employee_activity(
    workspace_id: str,
    employee_key: str,
    actor_id: str,
    kind: str,
    summary: str,
    metadata: Optional[Dict[str, Any]] = None,
):
    await db.ai_employee_activity.insert_one(
        {
            "id": new_id(),
            "workspace_id": workspace_id,
            "employee_key": employee_key,
            "actor_id": actor_id,
            "kind": kind,
            "summary": summary,
            "metadata": metadata or {},
            "created_at": now_iso(),
        }
    )


@router.post("/ai-employees/{key}/convert-to-paid")
async def convert_to_paid(key: str, current=Depends(require_user)):
    """Manually finalize trial → paid conversion. Records the subscription
    transition; Stripe write-back is handled by the billing router (the
    employee fee is added as a metered line item on the next invoice)."""
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Admins only")
    sub = await _find_sub(current["workspace_id"], key)
    if not sub:
        raise HTTPException(404, "No subscription")
    emp = get_employee(key) or {}
    now = now_iso()
    update = {
        "phase": "paid",
        "status": "active",
        "monthly_credits_total": emp.get("monthly_credits", 0),
        "monthly_credits_used": 0,  # reset bucket on conversion
        "paid_started_at": now,
        "next_billing_at": (datetime.fromisoformat(now.replace("Z", "+00:00")) + timedelta(days=30)).isoformat(),
        "updated_at": now,
    }
    await db.ai_employee_subscriptions.update_one(
        {"workspace_id": current["workspace_id"], "employee_key": key},
        {"$set": update},
    )
    await log_employee_activity(
        current["workspace_id"], key, current["id"],
        "trial_converted_to_paid",
        f"{emp.get('name', key)} trial → paid (${emp.get('monthly_price', 0)}/mo, "
        f"{emp.get('monthly_credits', 0):,} credits)",
        {"monthly_price": emp.get("monthly_price")},
    )
    return {"ok": True, **update}


async def auto_convert_expired_trials():
    """Scheduled job — flips every trial that has passed its end date and
    has auto_convert=True to paid status. Run on startup + every 6 hours."""
    now = datetime.now(timezone.utc).isoformat()
    expired = await db.ai_employee_subscriptions.find(
        {
            "phase": "trial",
            "auto_convert": True,
            "status": {"$nin": ["paused", "cancelled"]},
            "trial_ends_at": {"$lt": now},
        },
        {"_id": 0},
    ).to_list(500)
    converted = 0
    for sub in expired:
        emp = get_employee(sub["employee_key"])
        if not emp:
            continue
        await db.ai_employee_subscriptions.update_one(
            {"id": sub["id"]},
            {"$set": {
                "phase": "paid",
                "status": "active",
                "monthly_credits_total": emp.get("monthly_credits", 0),
                "monthly_credits_used": 0,
                "paid_started_at": now_iso(),
                "next_billing_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                "updated_at": now_iso(),
            }},
        )
        await log_employee_activity(
            sub["workspace_id"], sub["employee_key"], "system",
            "trial_auto_converted",
            f"{emp.get('name')} trial auto-converted to paid ($ {emp.get('monthly_price', 0)}/mo)",
        )
        converted += 1
    return converted
