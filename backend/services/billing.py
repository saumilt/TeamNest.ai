"""Subscription plans + AI credit metering.

Pricing math:
  cost_credits = ceil(actual_model_cost_usd * 1.4 * 1000)

i.e. 1 credit ≈ $0.001 of margined cost (vendor cost + 40% margin).

The credit cost of an AI response depends on the model used. Premium models
(GPT-4o, Claude Sonnet, Gemini Pro, Perplexity, Grok) burn more credits than
fast/cheap models (Claude Haiku, Gemini Flash, GPT-4o-mini).

Plans:
  free   — $0/mo   — 300 credits/month, all models, with upgrade prompts.
  pro    — $20/mo  — 6,000 credits/month, all models.
  team   — $50/mo  — 18,000 credits/month, all models, priority workspace.

When a workspace exhausts its credits the user can:
  * keep using FREE models (Claude Haiku / Gemini Flash / GPT-4o-mini) up to a
    small extra allowance (~50 credits "grace") OR
  * upgrade their plan to add capacity, OR
  * wait until next monthly reset.
"""
from __future__ import annotations

import math
import os
from datetime import datetime, timezone
from typing import Tuple

from deps import db, logger, new_id, now_iso
try:
    from deps import SUPER_ADMIN_EMAILS
except Exception:  # pragma: no cover
    SUPER_ADMIN_EMAILS = set()

# ---------------------------------------------------------------------------
# Plan + Pricing config
# ---------------------------------------------------------------------------
PLANS = {
    "free": {
        "id": "free",
        "name": "Free",
        "price_usd": 0,
        "monthly_credits": 300,
        "credit_cap": 300,
        "max_workspaces_per_user": 3,
        "max_members": 5,
        "premium_models": True,
        "all_features": False,
        "per_seat": False,
        "live_transcription": False,
        "unlimited_transcription": False,
        "screen_sharing": True,
        "stripe_price_id": None,  # No checkout for free
        "description": "For trying it out. 300 AI credits / month.",
        "perks": [
            "All AI models",
            "Up to 5 teammates",
            "Voice notes & post-call summaries",
            "Audio & video calls (credits apply)",
            "300 AI credits / month / workspace",
        ],
    },
    "student": {
        "id": "student",
        "name": "Student",
        "price_usd": 6.99,
        "monthly_credits": 2500,
        "max_workspaces_per_user": 3,
        "max_members": 10,          # can invite classmates to collaborate…
        "solo_ai_seat": True,       # …but only the account owner can use AI
        "requires_edu": True,       # gated behind .edu email verification
        "premium_models": True,
        "all_features": False,
        "per_seat": False,
        "live_transcription": False,
        "unlimited_transcription": False,
        "screen_sharing": True,
        "stripe_price_id": os.environ.get("STRIPE_STUDENT_PRICE_ID"),
        "description": "For students. Collaborate + compare AI models, solo.",
        "perks": [
            "2,500 AI credits / month",
            "All AI models + multi-model comparison",
            "Invite classmates to collaborate (AI stays solo — yours only)",
            "Requires .edu email verification",
            "Voice notes & post-call summaries",
        ],
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "price_usd": 9.99,
        "monthly_credits": 3000,
        "max_workspaces_per_user": 25,
        "max_members": 50,
        "premium_models": True,
        "all_features": True,
        "per_seat": True,
        "live_transcription": False,  # post-call only on Pro
        "unlimited_transcription": False,  # 10 cr/min applies
        "screen_sharing": True,
        "stripe_price_id": os.environ.get("STRIPE_PRO_PRICE_ID"),
        "stripe_price_id_annual": os.environ.get("STRIPE_PRO_ANNUAL_PRICE_ID"),
        "annual_price_usd": 99,  # ≈ 17% off vs $9.99×12
        "description": "Pay only for the seats you use.",
        "perks": [
            "Everything in Free",
            "3,000 AI credits / seat / month",
            "Audio & video calls (10 cr/min for transcription · 20 cr/summary)",
            "Post-call transcription & summaries",
            "Screen sharing",
            "PDF & Word exports",
            "Approval workflows",
            "Priority support",
        ],
    },
    "team": {
        "id": "team",
        "name": "Team",
        "price_usd": 19.99,
        "monthly_credits": 9000,
        "max_workspaces_per_user": 100,
        "max_members": 250,
        "premium_models": True,
        "all_features": True,
        "per_seat": True,
        "live_transcription": True,
        "unlimited_transcription": True,  # free transcription
        "screen_sharing": True,
        "stripe_price_id": os.environ.get("STRIPE_TEAM_PRICE_ID"),
        "stripe_price_id_annual": os.environ.get("STRIPE_TEAM_ANNUAL_PRICE_ID"),
        "annual_price_usd": 199,  # ≈ 17% off vs $19.99×12
        "description": "Per-seat. For teams running on AI.",
        "perks": [
            "Everything in Pro",
            "9,000 AI credits / seat / month",
            "AI Employee Builder access (Beta) — build & sell custom AI employees",
            "Live transcription during calls (FREE)",
            "Unlimited recorded audio + video transcription",
            "Screen sharing",
            "AI meeting summaries (20 credits/call)",
            "Admin dashboard analytics",
            "Custom integrations",
            "Dedicated success manager",
        ],
    },
}

DEFAULT_PLAN_ID = "free"

# Free-tier "grace" credits — once monthly_credits are exhausted, free users can
# keep using cheap models up to this much extra to avoid feeling cliffed off
# (the UI will keep nudging them to upgrade).
FREE_GRACE_CREDITS = 50

# ---------------------------------------------------------------------------
# Unlimited-credit allowlist (by workspace-owner email)
# ---------------------------------------------------------------------------
# Workspaces OWNED by any of these emails get effectively-unlimited AI credits:
# metering never blocks them and consumption is not decremented. Configurable
# via the UNLIMITED_CREDIT_EMAILS env var (comma-separated); the code default
# below guarantees the allowlist survives a production deploy without extra env
# wiring.
import time as _time  # noqa: E402

UNLIMITED_CREDIT_EMAILS = {
    e.strip().lower()
    for e in (
        "sam@funasia.net," + (os.environ.get("UNLIMITED_CREDIT_EMAILS", "") or "")
    ).split(",")
    if e.strip()
}

_UNLIMITED_WS_CACHE = {"ids": None, "at": 0.0}
_UNLIMITED_TTL = 60.0


async def _unlimited_workspace_ids() -> set:
    """Workspace ids owned by an allowlisted email. Cached for 60s."""
    now = _time.time()
    if _UNLIMITED_WS_CACHE["ids"] is not None and now - _UNLIMITED_WS_CACHE["at"] < _UNLIMITED_TTL:
        return _UNLIMITED_WS_CACHE["ids"]
    ids: set = set()
    if UNLIMITED_CREDIT_EMAILS:
        uids = []
        async for u in db.users.find(
            {"email": {"$in": list(UNLIMITED_CREDIT_EMAILS)}},
            {"_id": 0, "id": 1, "workspace_id": 1},
        ):
            uids.append(u["id"])
            if u.get("workspace_id"):
                ids.add(u["workspace_id"])
        if uids:
            async for m in db.workspace_members.find(
                {"user_id": {"$in": uids}, "role": "owner"},
                {"_id": 0, "workspace_id": 1},
            ):
                if m.get("workspace_id"):
                    ids.add(m["workspace_id"])
    # Super admins get effectively-unlimited credits in EVERY workspace they
    # operate in (not just ones they own) — any workspace with a super-admin
    # member is treated as unlimited.
    sa_uids: list = []
    async for u in db.users.find(
        {"$or": [{"is_super_admin": True},
                 {"email": {"$in": list(SUPER_ADMIN_EMAILS)}}]},
        {"_id": 0, "id": 1, "workspace_id": 1},
    ):
        sa_uids.append(u["id"])
        if u.get("workspace_id"):
            ids.add(u["workspace_id"])
    if sa_uids:
        async for m in db.workspace_members.find(
            {"user_id": {"$in": sa_uids}}, {"_id": 0, "workspace_id": 1},
        ):
            if m.get("workspace_id"):
                ids.add(m["workspace_id"])
    _UNLIMITED_WS_CACHE["ids"] = ids
    _UNLIMITED_WS_CACHE["at"] = now
    return ids


async def is_unlimited_workspace(workspace_id: str) -> bool:
    return workspace_id in await _unlimited_workspace_ids()


# Plans on which multi-model AI comparison is available. Students get it too —
# comparing AI models is a core part of the student value prop.
COMPARISON_PLAN_IDS = {"student", "pro", "team"}


async def is_comparison_allowed(workspace_id: str) -> bool:
    """Multi-model AI comparison is a PAID feature. Available only to paid
    plans (Pro / Team) and unlimited/super-admin workspaces. Free-plan
    workspaces get the single AI answer only and must upgrade to compare."""
    if await is_unlimited_workspace(workspace_id):
        return True
    sub = await get_subscription(workspace_id)
    return sub.get("plan_id") in COMPARISON_PLAN_IDS



# Approximate credit cost per AI response by model key.
# These are blended costs assuming ~500 input tokens + ~1500 output tokens,
# already including the 40% margin.
MODEL_CREDIT_COST = {
    # Premium tier
    "chatgpt": 23,       # GPT-4o
    "gpt-4o": 23,
    "claude": 34,        # Claude Sonnet 4.5
    "claude-sonnet": 34,
    "gemini": 12,        # Gemini 2.5 Pro
    "gemini-pro": 12,
    "perplexity": 18,    # Perplexity
    "grok": 20,          # Grok
    "deepseek": 5,       # DeepSeek
    # Fast / cheap tier
    "gpt-4o-mini": 2,
    "claude-haiku": 9,
    "gemini-flash": 1,
    "haiku": 9,
    "flash": 1,
}
DEFAULT_MODEL_CREDIT_COST = 15  # Unknown model → middle ground

# Models available on the free tier when out of credits.
FREE_FALLBACK_MODELS = {"gpt-4o-mini", "claude-haiku", "gemini-flash", "haiku", "flash"}

# Whisper transcription cost per minute (already with 40% margin).
WHISPER_CREDIT_PER_MIN = 10


def credit_cost_for_model(model_key: str) -> int:
    return MODEL_CREDIT_COST.get(model_key, DEFAULT_MODEL_CREDIT_COST)


def credit_cost_for_audio_seconds(seconds: float) -> int:
    minutes = max(0.05, seconds / 60.0)  # round small chunks up to 3s
    return max(1, math.ceil(minutes * WHISPER_CREDIT_PER_MIN))


# ---------------------------------------------------------------------------
# Subscription state
# ---------------------------------------------------------------------------
def _period_start(now: datetime | None = None) -> datetime:
    """Anchor monthly periods to the 1st of the month UTC for simplicity. For
    paid plans, we replace this with the Stripe subscription's current_period
    once webhooks land."""
    n = now or datetime.now(timezone.utc)
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _period_end(start: datetime) -> datetime:
    # First day of next month
    if start.month == 12:
        return start.replace(year=start.year + 1, month=1)
    return start.replace(month=start.month + 1)


async def get_subscription(workspace_id: str) -> dict:
    """Return the workspace's billing record, creating a default free one if
    none exists. Idempotent."""
    sub = await db.workspace_billing.find_one({"workspace_id": workspace_id}, {"_id": 0})
    if sub:
        # Auto-reset monthly counters if we've rolled into a new period.
        ps = sub.get("period_start")
        if ps:
            ps_dt = datetime.fromisoformat(ps.replace("Z", "+00:00")) if isinstance(ps, str) else ps
            now = datetime.now(timezone.utc)
            if now >= _period_end(_period_start(ps_dt)):
                ps_new = _period_start(now)
                pe_new = _period_end(ps_new)
                await db.workspace_billing.update_one(
                    {"workspace_id": workspace_id},
                    {"$set": {
                        "period_start": ps_new.isoformat(),
                        "period_end": pe_new.isoformat(),
                        "credits_used_this_period": 0,
                    }},
                )
                sub["period_start"] = ps_new.isoformat()
                sub["period_end"] = pe_new.isoformat()
                sub["credits_used_this_period"] = 0
        return sub
    # First-time setup → free plan
    ps = _period_start()
    sub = {
        "workspace_id": workspace_id,
        "plan_id": DEFAULT_PLAN_ID,
        "status": "active",
        "stripe_customer_id": None,
        "stripe_subscription_id": None,
        "current_session_id": None,
        "period_start": ps.isoformat(),
        "period_end": _period_end(ps).isoformat(),
        "credits_used_this_period": 0,
        "credits_purchased_extra": 0,
        "cancel_at_period_end": False,
        "created_at": now_iso(),
    }
    await db.workspace_billing.insert_one(sub.copy())
    return sub


# ---------------------------------------------------------------------------
# Demo / onboarding credit floor
# ---------------------------------------------------------------------------
# How many AI credits the demo workspace should always have available so any
# evaluator can exercise every premium AI flow without hitting the paywall.
DEMO_LOGIN_CREDIT_FLOOR = 100


async def plan_monthly_credits(plan: dict) -> int:
    """Effective monthly credit grant for a plan. The FREE plan's allowance is
    a super-admin-configurable app-level setting (defaults to 100); other plans
    use their static definition."""
    if plan.get("id") == "free":
        from services.platform_settings import free_monthly_credits
        return await free_monthly_credits()
    return int(plan["monthly_credits"])


async def effective_monthly_credits(sub: dict, plan: dict) -> int:
    """Per-workspace monthly allowance. A super-admin can override the plan
    default via `monthly_credits_override` on the workspace billing record."""
    override = sub.get("monthly_credits_override")
    if override is not None and int(override) >= 0:
        return int(override)
    return await plan_monthly_credits(plan)


async def set_monthly_override(workspace_id: str, credits: int | None) -> dict:
    """Super-admin: set (or clear with None) a workspace's recurring monthly
    credit allowance, overriding its plan default."""
    await get_subscription(workspace_id)  # ensure record exists
    if credits is None:
        await db.workspace_billing.update_one(
            {"workspace_id": workspace_id},
            {"$unset": {"monthly_credits_override": ""}, "$set": {"updated_at": now_iso()}},
        )
    else:
        await db.workspace_billing.update_one(
            {"workspace_id": workspace_id},
            {"$set": {"monthly_credits_override": max(0, int(credits)), "updated_at": now_iso()}},
        )
    return await get_usage(workspace_id)


async def add_extra_credits(workspace_id: str, amount: int) -> dict:
    """Super-admin: one-time credit top-up added to the current balance
    (via `credits_purchased_extra`). Positive adds, negative deducts (floored
    so the field never goes below 0)."""
    sub = await get_subscription(workspace_id)
    extra = int(sub.get("credits_purchased_extra") or 0)
    new_extra = max(0, extra + int(amount))
    await db.workspace_billing.update_one(
        {"workspace_id": workspace_id},
        {"$set": {"credits_purchased_extra": new_extra, "updated_at": now_iso()}},
    )
    return await get_usage(workspace_id)


async def ensure_credit_floor(workspace_id: str, floor: int) -> dict:
    """Bump `credits_purchased_extra` so total credits (plan + extra − used) is
    at least `floor`. Idempotent and one-directional: never decrements a
    workspace that has already purchased / accumulated more than `floor`.

    Returns the updated subscription record. Safe to call from demo-login
    every session — the math will no-op once the floor is satisfied.
    """
    if floor <= 0:
        return await get_subscription(workspace_id)
    sub = await get_subscription(workspace_id)
    plan = PLANS.get(sub["plan_id"]) or PLANS[DEFAULT_PLAN_ID]
    per_seat = bool(plan.get("per_seat"))
    seats = await _active_seat_count(workspace_id) if per_seat else 1
    base = await effective_monthly_credits(sub, plan) * (seats if per_seat else 1)
    extra = int(sub.get("credits_purchased_extra") or 0)
    used = int(sub.get("credits_used_this_period") or 0)
    remaining = max(0, base + extra - used)
    if remaining >= floor:
        return sub
    # Top up the gap on top of the existing `extra` so future month resets
    # (which only zero out `credits_used_this_period`) keep the floor intact.
    bump = floor - remaining
    new_extra = extra + bump
    await db.workspace_billing.update_one(
        {"workspace_id": workspace_id},
        {"$set": {"credits_purchased_extra": new_extra, "updated_at": now_iso()}},
    )
    sub["credits_purchased_extra"] = new_extra
    logger.info(
        "[billing] credit-floor top-up: workspace=%s bumped extra %d→%d (floor=%d, prev_remaining=%d)",
        workspace_id, extra, new_extra, floor, remaining,
    )
    return sub


async def _active_seat_count(workspace_id: str) -> int:
    """Count active workspace members for per-seat plan billing. Always at
    least 1 (the owner). This is recomputed on every credit check / Stripe
    sync so add/remove member events true-up the quantity automatically."""
    count = await db.users.count_documents({
        "workspace_id": workspace_id,
        "status": {"$ne": "removed"},
    })
    return max(1, int(count or 1))


async def get_usage(workspace_id: str) -> dict:
    sub = await get_subscription(workspace_id)
    plan = PLANS.get(sub["plan_id"]) or PLANS[DEFAULT_PLAN_ID]
    per_seat = bool(plan.get("per_seat"))
    seats = await _active_seat_count(workspace_id) if per_seat else 1
    monthly = await effective_monthly_credits(sub, plan)
    base_credits = monthly * (seats if per_seat else 1)
    total_credits = base_credits + int(sub.get("credits_purchased_extra") or 0)
    used = int(sub.get("credits_used_this_period") or 0)
    extra = int(sub.get("credits_purchased_extra") or 0)
    remaining = max(0, total_credits - used)
    # Free-tier balance cap. For the free plan the cap tracks the (configurable)
    # monthly allowance so the recurring grant never exceeds one month — BUT
    # purchased / admin-added top-ups (credits_purchased_extra) always sit ON
    # TOP of the cap so a manual top-up actually increases available credits.
    cap = monthly if plan.get("id") == "free" else plan.get("credit_cap")
    capped_total = total_credits
    if cap:
        capped_total = min(base_credits, int(cap)) + extra
        remaining = min(remaining, capped_total)
    unlimited = await is_unlimited_workspace(workspace_id)
    if unlimited:
        remaining = 1_000_000_000
    comparison_allowed = unlimited or plan.get("id") in COMPARISON_PLAN_IDS
    return {
        "plan_id": sub["plan_id"],
        "plan_name": plan["name"],
        "status": sub["status"],
        "per_seat": per_seat,
        "seats": seats,
        "monthly_credits": monthly,
        "monthly_credits_total": base_credits,
        "extra_credits": extra,
        "credits_total": 1_000_000_000 if unlimited else capped_total,
        "credits_used": used,
        "credits_remaining": remaining,
        "unlimited": unlimited,
        "comparison_allowed": comparison_allowed,
        "hosting_tier": sub.get("hosting_tier") or "shared",
        "low": False if unlimited else remaining < max(base_credits * 0.2, 25),
        "exhausted": False if unlimited else remaining <= 0,
        "period_start": sub["period_start"],
        "period_end": sub["period_end"],
        "cancel_at_period_end": bool(sub.get("cancel_at_period_end")),
        "features": {
            "live_transcription": bool(plan.get("live_transcription")),
            "unlimited_transcription": bool(plan.get("unlimited_transcription")),
            "screen_sharing": bool(plan.get("screen_sharing", True)),
        },
    }


async def can_use_model(workspace_id: str, model_key: str) -> Tuple[bool, str | None]:
    """Return (allowed, blocker_reason). Cheap/standard models always allowed
    on free tier (with grace); premium models gated when out of credits."""
    usage = await get_usage(workspace_id)
    cost = credit_cost_for_model(model_key)
    if usage.get("unlimited"):
        return True, None
    if usage["credits_remaining"] >= cost:
        return True, None
    # Out of credits — allow free-fallback models up to grace, block others.
    if model_key in FREE_FALLBACK_MODELS:
        # Grace: allow until usage > total + grace
        grace_used = usage["credits_used"] - usage["credits_total"]
        if grace_used < FREE_GRACE_CREDITS:
            return True, None
        return False, "exhausted"
    return False, "upgrade_required"


async def consume_credits(
    workspace_id: str,
    amount: int,
    *,
    source: str,
    model_key: str | None = None,
    user_id: str | None = None,
    chat_id: str | None = None,
    meta: dict | None = None,
) -> dict:
    """Idempotency NOT guaranteed — callers must call this once per chargeable
    event. Increments the workspace's used-this-period counter and writes a
    ledger entry for audit. `chat_id` is recorded so credit-governance caps can
    be enforced/attributed at chat scope."""
    if amount <= 0:
        return await get_usage(workspace_id)
    _meta = dict(meta or {})
    if chat_id:
        _meta["chat_id"] = chat_id
    # Unlimited-credit workspaces: never decrement (but still log for audit).
    if await is_unlimited_workspace(workspace_id):
        try:
            await db.ai_credit_ledger.insert_one({
                "id": new_id(),
                "workspace_id": workspace_id,
                "user_id": user_id,
                "chat_id": chat_id,
                "amount": 0,
                "billed_amount": amount,
                "source": source,
                "model_key": model_key,
                "meta": {**_meta, "unlimited": True},
                "at": now_iso(),
            })
        except Exception as e:
            logger.warning("[billing] unlimited ledger write failed: %s", e)
        return await get_usage(workspace_id)
    await db.workspace_billing.update_one(
        {"workspace_id": workspace_id},
        {"$inc": {"credits_used_this_period": amount}},
        upsert=False,
    )
    try:
        await db.ai_credit_ledger.insert_one({
            "id": new_id(),
            "workspace_id": workspace_id,
            "user_id": user_id,
            "chat_id": chat_id,
            "amount": amount,
            "source": source,
            "model_key": model_key,
            "meta": _meta,
            "at": now_iso(),
        })
    except Exception as e:
        logger.warning("[billing] ledger write failed: %s", e)
    return await get_usage(workspace_id)


async def apply_plan_change(
    workspace_id: str,
    *,
    plan_id: str,
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
    status: str = "active",
    cancel_at_period_end: bool = False,
):
    """Switch a workspace to a new plan. Resets period counters so the user
    gets a fresh allowance on upgrade."""
    if plan_id not in PLANS:
        raise ValueError(f"Unknown plan: {plan_id}")
    ps = _period_start()
    update = {
        "plan_id": plan_id,
        "status": status,
        "period_start": ps.isoformat(),
        "period_end": _period_end(ps).isoformat(),
        "credits_used_this_period": 0,
        "cancel_at_period_end": cancel_at_period_end,
        "updated_at": now_iso(),
    }
    if stripe_customer_id is not None:
        update["stripe_customer_id"] = stripe_customer_id
    if stripe_subscription_id is not None:
        update["stripe_subscription_id"] = stripe_subscription_id
    await db.workspace_billing.update_one(
        {"workspace_id": workspace_id},
        {"$set": update},
        upsert=True,
    )
    logger.info("[billing] workspace %s → plan=%s status=%s", workspace_id, plan_id, status)


def public_plan(plan_id: str) -> dict:
    """Strip internal fields when sending plan info to the frontend."""
    p = PLANS.get(plan_id) or PLANS[DEFAULT_PLAN_ID]
    return {
        "id": p["id"],
        "name": p["name"],
        "price_usd": p["price_usd"],
        "annual_price_usd": p.get("annual_price_usd"),
        "monthly_credits": p["monthly_credits"],
        "description": p["description"],
        "perks": p["perks"],
        "max_members": p["max_members"],
        "per_seat": bool(p.get("per_seat")),
        "solo_ai_seat": bool(p.get("solo_ai_seat")),
        "requires_edu": bool(p.get("requires_edu")),
        "live_transcription": bool(p.get("live_transcription")),
        "unlimited_transcription": bool(p.get("unlimited_transcription")),
        "screen_sharing": bool(p.get("screen_sharing", True)),
        "checkout_available": bool(p.get("stripe_price_id")) or p["id"] != "free",
        "annual_available": bool(p.get("stripe_price_id_annual")),
    }


def all_public_plans() -> list:
    return [public_plan(pid) for pid in ("free", "student", "pro", "team")]
