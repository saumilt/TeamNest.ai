"""Stripe Checkout + AI credit usage endpoints."""
import os
import random
from datetime import datetime, timedelta, timezone
from typing import Optional

import stripe
from emergentintegrations.payments.stripe.checkout import (
    CheckoutSessionRequest,
    StripeCheckout,
)
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from deps import db, logger, now_iso, require_user
from services.billing import (
    PLANS,
    all_public_plans,
    apply_plan_change,
    get_subscription,
    get_usage,
    public_plan,
)

router = APIRouter()

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY") or ""
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET") or ""

# Configure the underlying stripe SDK once at import.
if STRIPE_API_KEY:
    stripe.api_key = STRIPE_API_KEY


def _checkout_client(request: Request) -> StripeCheckout:
    if not STRIPE_API_KEY:
        raise HTTPException(503, "Stripe is not configured on this server")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    return StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)


class CheckoutRequest(BaseModel):
    plan_id: str  # "pro" | "team"
    origin_url: str  # e.g. https://teamnest.ai — frontend supplies its origin
    billing_cycle: str = "monthly"  # "monthly" or "annual"


class PortalRequest(BaseModel):
    return_url: str


@router.get("/billing/plans")
async def list_plans():
    return {
        "plans": all_public_plans(),
        "publishable_key": os.environ.get("STRIPE_PUBLISHABLE_KEY") or None,
    }


@router.get("/billing/me")
async def my_billing(current=Depends(require_user)):
    usage = await get_usage(current["workspace_id"])
    sub = await get_subscription(current["workspace_id"])
    return {
        "usage": usage,
        "plan": public_plan(sub["plan_id"]),
        "is_owner": current.get("role") == "owner",
        "edu_verified": bool(current.get("edu_verified")),
        "edu_email": current.get("edu_email"),
    }


# ─── Student plan: .edu email verification (code by email) ────────────────────
EDU_CODE_TTL_MINUTES = 20


class EduVerifyStart(BaseModel):
    edu_email: str


class EduVerifyConfirm(BaseModel):
    code: str


@router.get("/billing/student/status")
async def student_status(current=Depends(require_user)):
    return {"edu_verified": bool(current.get("edu_verified")), "edu_email": current.get("edu_email")}


@router.post("/billing/student/verify/start")
async def student_verify_start(payload: EduVerifyStart, current=Depends(require_user)):
    """Send a 6-digit verification code to the student's .edu email."""
    email = (payload.edu_email or "").strip().lower()
    if not email or "@" not in email or not email.split("@")[-1].endswith(".edu"):
        raise HTTPException(400, "Enter a valid .edu email address")
    code = f"{random.randint(0, 999999):06d}"
    now = datetime.now(timezone.utc)
    await db.edu_verifications.update_one(
        {"user_id": current["id"]},
        {"$set": {"user_id": current["id"], "edu_email": email, "code": code,
                  "verified": False, "attempts": 0,
                  "expires_at": (now + timedelta(minutes=EDU_CODE_TTL_MINUTES)).isoformat(),
                  "created_at": now_iso()}},
        upsert=True,
    )
    from services.mailgun_service import send_email
    res = await send_email(
        to=[email],
        subject="Your TeamNest student verification code",
        html=(f"<p>Your TeamNest student verification code is:</p>"
              f"<h2 style='letter-spacing:4px'>{code}</h2>"
              f"<p>It expires in {EDU_CODE_TTL_MINUTES} minutes.</p>"),
        text=f"Your TeamNest student verification code is {code} (expires in {EDU_CODE_TTL_MINUTES} min).",
    )
    out = {"ok": True, "sent": bool(res.get("ok")), "edu_email": email}
    # Dev/test fallback: when email isn't configured OR we're running against the
    # Stripe test proxy (i.e. a preview/QA environment), surface the code so the
    # flow is testable end-to-end without a live mailbox. Hidden in production.
    _test_env = "sk_test_emergent" in (os.environ.get("STRIPE_API_KEY") or "")
    if not res.get("ok") or _test_env:
        out["dev_code"] = code
    return out


@router.post("/billing/student/verify/confirm")
async def student_verify_confirm(payload: EduVerifyConfirm, current=Depends(require_user)):
    rec = await db.edu_verifications.find_one({"user_id": current["id"]}, {"_id": 0})
    if not rec:
        raise HTTPException(400, "Start verification first")
    exp = rec.get("expires_at")
    if exp and datetime.fromisoformat(exp) < datetime.now(timezone.utc):
        raise HTTPException(400, "Code expired — request a new one")
    if int(rec.get("attempts") or 0) >= 6:
        raise HTTPException(429, "Too many attempts — request a new code")
    if (payload.code or "").strip() != rec.get("code"):
        await db.edu_verifications.update_one({"user_id": current["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Incorrect code")
    await db.edu_verifications.update_one(
        {"user_id": current["id"]}, {"$set": {"verified": True, "verified_at": now_iso()}})
    await db.users.update_one(
        {"id": current["id"]},
        {"$set": {"edu_verified": True, "edu_email": rec["edu_email"], "edu_verified_at": now_iso()}})
    return {"ok": True, "edu_verified": True, "edu_email": rec["edu_email"]}


def _validate_checkout_request(payload: CheckoutRequest, current: dict) -> dict:
    """Confirm permissions, plan, and origin; return the resolved plan dict."""
    if current.get("role") != "owner":
        raise HTTPException(403, "Only the workspace owner can change the plan")
    plan = PLANS.get(payload.plan_id)
    if not plan:
        raise HTTPException(400, "Unknown plan")
    if plan["price_usd"] <= 0:
        raise HTTPException(400, "Free plan does not require checkout")
    if plan.get("requires_edu") and not current.get("edu_verified"):
        raise HTTPException(403, "edu_verification_required")
    if not payload.origin_url:
        raise HTTPException(400, "origin_url is required")
    if not STRIPE_API_KEY:
        raise HTTPException(503, "Stripe is not configured on this server")
    return plan


def _resolve_price_id(plan: dict, billing_cycle: str) -> str | None:
    """Choose the annual or monthly Stripe price ID for the plan. Returns None
    for fully-legacy plans (no configured Stripe price at all) so checkout
    falls back to the emergentintegrations one-shot charge."""
    use_annual = billing_cycle == "annual"
    price_id = (
        plan.get("stripe_price_id_annual") if use_annual else plan.get("stripe_price_id")
    )
    # Only error when this is a real recurring Stripe plan (has a monthly SKU)
    # that just hasn't had its annual SKU wired up yet.
    if use_annual and not plan.get("stripe_price_id_annual") and plan.get("stripe_price_id"):
        raise HTTPException(
            400,
            "Annual billing for this plan isn't set up yet. "
            "Set STRIPE_PRO_ANNUAL_PRICE_ID / STRIPE_TEAM_ANNUAL_PRICE_ID in env.",
        )
    return price_id


def _create_stripe_subscription_session(
    price_id: str, payload: CheckoutRequest, current: dict, success_url: str,
    cancel_url: str, metadata: dict, quantity: int = 1,
) -> tuple[str, str]:
    """Open a real recurring-subscription session via the Stripe SDK directly."""
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{
                "price": price_id,
                "quantity": quantity,
                # Allow the customer to bump seat count up/down in the Stripe
                # Customer Portal too.
                "adjustable_quantity": {"enabled": True, "minimum": 1, "maximum": 250},
            }],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={**metadata, "billing_cycle": payload.billing_cycle, "seats": quantity},
            subscription_data={
                "metadata": {**metadata, "billing_cycle": payload.billing_cycle, "seats": quantity}
            },
            customer_email=current["email"],
            allow_promotion_codes=True,
        )
    except stripe.error.StripeError as e:
        logger.exception("Stripe subscription checkout failed: %s", e)
        raise HTTPException(
            502, f"Stripe error: {getattr(e, 'user_message', None) or str(e)}"
        )
    return session.url, session.id


async def _create_legacy_one_shot_session(
    request: Request, plan: dict, success_url: str, cancel_url: str, metadata: dict,
    amount: float | None = None,
) -> tuple[str, str]:
    """Fallback: emergentintegrations-managed one-shot monthly charge."""
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    # emergentintegrations' CheckoutSessionRequest requires all metadata values
    # to be strings.
    str_metadata = {k: str(v) for k, v in (metadata or {}).items()}
    req = CheckoutSessionRequest(
        amount=float(amount if amount is not None else plan["price_usd"]),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=str_metadata,
    )
    s = await checkout.create_checkout_session(req)
    return s.url, s.session_id


@router.post("/billing/checkout")
async def create_checkout(
    payload: CheckoutRequest, request: Request, current=Depends(require_user)
):
    from services.launch_core import ensure_checkout_allowed
    await ensure_checkout_allowed(current)
    plan = _validate_checkout_request(payload, current)
    origin = payload.origin_url.rstrip("/")
    success_url = f"{origin}/billing?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/billing?canceled=1"
    # Per-seat plans price by active member count (min 1). Workspace-level
    # plans (Free) ignore seats.
    from services.billing import _active_seat_count
    seats = await _active_seat_count(current["workspace_id"]) if plan.get("per_seat") else 1
    metadata = {
        "workspace_id": current["workspace_id"],
        "owner_user_id": current["id"],
        "owner_email": current["email"],
        "plan_id": plan["id"],
        "seats": seats,
        "source": "teamnest_web",
    }

    price_id = _resolve_price_id(plan, payload.billing_cycle)
    _use_annual = payload.billing_cycle == "annual"
    _unit = plan["annual_price_usd"] if _use_annual and plan.get("annual_price_usd") else plan["price_usd"]
    if price_id:
        session_url, session_id = _create_stripe_subscription_session(
            price_id, payload, current, success_url, cancel_url, metadata, quantity=seats
        )
    else:
        _legacy_amount = float(_unit) * (seats if plan.get("per_seat") else 1)
        session_url, session_id = await _create_legacy_one_shot_session(
            request, plan, success_url, cancel_url, metadata, amount=_legacy_amount
        )

    use_annual = payload.billing_cycle == "annual"
    unit_price = plan["annual_price_usd"] if use_annual and plan.get("annual_price_usd") else plan["price_usd"]
    total_amount = float(unit_price) * (seats if plan.get("per_seat") else 1)
    await db.payment_transactions.insert_one({
        "session_id": session_id,
        "workspace_id": current["workspace_id"],
        "user_id": current["id"],
        "plan_id": plan["id"],
        "amount": total_amount,
        "unit_amount": float(unit_price),
        "seats": seats,
        "currency": "usd",
        "billing_cycle": payload.billing_cycle,
        "status": "pending",
        "payment_status": "unpaid",
        "is_subscription": bool(price_id),
        "metadata": metadata,
        "created_at": now_iso(),
    })

    return {"url": session_url, "session_id": session_id}


def _extract_stripe_id(field):
    """Stripe sometimes returns the bare ID string, sometimes an expanded obj."""
    if isinstance(field, str):
        return field
    return getattr(field, "id", None)


async def _apply_successful_checkout(session_id: str, tx: dict, update: dict,
                                     payment_status: str, customer_id: str | None,
                                     subscription_id: str | None) -> None:
    """Mark a transaction as completed and roll the workspace onto the new plan."""
    update["status"] = "completed"
    update["payment_status"] = payment_status or "paid"
    await db.payment_transactions.update_one({"session_id": session_id}, {"$set": update})
    try:
        await apply_plan_change(
            tx["workspace_id"],
            plan_id=tx["plan_id"],
            stripe_customer_id=customer_id,
            stripe_subscription_id=subscription_id,
            status="active",
        )
    except Exception as e:
        logger.exception("Plan change failed after paid checkout: %s", e)


@router.get("/billing/checkout/status/{session_id}")
async def checkout_status(session_id: str, request: Request, current=Depends(require_user)):
    """Polled by the frontend after Stripe redirects back. Verifies the session,
    updates the payment_transactions record exactly once, and (on success)
    applies the plan change to the workspace."""
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Transaction not found")
    if tx["workspace_id"] != current["workspace_id"]:
        raise HTTPException(403, "Not your transaction")
    if not STRIPE_API_KEY:
        raise HTTPException(503, "Stripe is not configured on this server")

    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except stripe.error.StripeError as e:
        raise HTTPException(502, f"Stripe error: {e}")

    payment_status = session.payment_status
    session_status = session.status
    subscription_id = _extract_stripe_id(session.subscription)
    customer_id = _extract_stripe_id(session.customer)

    if tx["status"] != "completed":
        update = {
            "payment_status": payment_status,
            "status_raw": session_status,
            "stripe_subscription_id": subscription_id,
            "stripe_customer_id": customer_id,
            "updated_at": now_iso(),
        }
        success = (
            payment_status == "paid"
            or (session_status == "complete" and tx.get("is_subscription"))
        )
        if success:
            await _apply_successful_checkout(
                session_id, tx, update, payment_status, customer_id, subscription_id
            )
        elif session_status == "expired":
            update["status"] = "expired"
            await db.payment_transactions.update_one({"session_id": session_id}, {"$set": update})
        else:
            await db.payment_transactions.update_one({"session_id": session_id}, {"$set": update})

    refreshed = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    return {
        "session_id": session_id,
        "payment_status": refreshed["payment_status"],
        "status": refreshed.get("status_raw") or refreshed["status"],
        "plan_id": refreshed["plan_id"],
        "applied": refreshed["status"] == "completed",
    }


@router.get("/billing/usage")
async def billing_usage(current=Depends(require_user)):
    """Compact usage payload — used by the credits widget in the sidebar/UI."""
    return await get_usage(current["workspace_id"])


class DowngradeRequest(BaseModel):
    confirm: bool = False


@router.post("/billing/portal")
async def open_customer_portal(payload: PortalRequest, current=Depends(require_user)):
    """Open a Stripe-hosted Customer Portal session so the workspace owner can
    update card / view invoices / cancel without leaving Stripe's UI."""
    if current.get("role") != "owner":
        raise HTTPException(403, "Only the workspace owner can manage billing")
    if not STRIPE_API_KEY:
        raise HTTPException(503, "Stripe is not configured on this server")
    sub = await get_subscription(current["workspace_id"])
    customer_id = sub.get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(
            400,
            "No Stripe customer record yet for this workspace. Complete a checkout first.",
        )
    try:
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=payload.return_url,
        )
    except stripe.error.StripeError as e:
        logger.exception("Customer portal session failed: %s", e)
        raise HTTPException(502, f"Stripe error: {getattr(e, 'user_message', None) or str(e)}")
    return {"url": session.url}


@router.post("/billing/downgrade")
async def downgrade_to_free(payload: DowngradeRequest, current=Depends(require_user)):
    """Owner-only manual downgrade to free. For paid plans, Stripe subscription
    will continue until the period ends — but our local state flips immediately
    so AI credit limits enforce free-tier rules on the next request."""
    if current.get("role") != "owner":
        raise HTTPException(403, "Only the workspace owner can change the plan")
    if not payload.confirm:
        raise HTTPException(400, "Set confirm=true to downgrade")
    await apply_plan_change(current["workspace_id"], plan_id="free", status="active")
    return await get_usage(current["workspace_id"])


async def _parse_webhook_event(request: Request) -> stripe.Event:
    """Parse + signature-verify a Stripe webhook payload."""
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    if not STRIPE_WEBHOOK_SECRET:
        logger.warning(
            "[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — accepting without signature check"
        )
        try:
            return stripe.Event.construct_from((await request.json()), stripe.api_key)
        except Exception as e:
            logger.warning("[stripe-webhook] could not parse payload: %s", e)
            raise HTTPException(400, "invalid payload")
    try:
        return stripe.Webhook.construct_event(
            payload=body, sig_header=sig, secret=STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError as e:
        # The emergent test proxy forwards webhooks re-signed with its own key,
        # so signature verification can't pass — accept unsigned in that mode.
        if "sk_test_emergent" in (STRIPE_API_KEY or ""):
            logger.warning("[stripe-webhook] emergent proxy mode — accepting unsigned webhook")
            try:
                return stripe.Event.construct_from((await request.json()), stripe.api_key)
            except Exception as pe:
                logger.warning("[stripe-webhook] could not parse payload: %s", pe)
                raise HTTPException(400, "invalid payload")
        logger.warning("[stripe-webhook] invalid signature: %s", e)
        raise HTTPException(400, "invalid signature")
    except Exception as e:
        logger.warning("[stripe-webhook] invalid payload: %s", e)
        raise HTTPException(400, "invalid payload")


async def _handle_checkout_session_completed(obj: dict) -> dict:
    """Mark the txn paid and apply the plan change (or provision the dev team
    for a chat-scoped one-shot purchase)."""
    session_id = obj.get("id")
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        logger.info("[stripe-webhook] unknown session: %s", session_id)
        return {"ok": True, "noop": True}

    # Credit top-up — add credits to the workspace.
    if tx.get("credits_to_add"):
        await _finalize_credit_topup(session_id)
        return {"ok": True, "applied": True, "product": "credit_topup"}

    # Hosting add-on subscription.
    if tx.get("hosting_tier"):
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"stripe_subscription_id": obj.get("subscription")}},
        )
        await _finalize_hosting_upgrade(session_id)
        return {"ok": True, "applied": True, "product": "hosting_addon"}

    # Template Marketplace purchase — handled by the market module.
    if tx.get("template_id"):
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"status": "complete", "payment_status": "paid",
                      "stripe_subscription_id": obj.get("subscription"),
                      "updated_at": now_iso()}},
        )
        from routes.template_market import _finalize_paid_session
        await _finalize_paid_session(session_id)
        return {"ok": True, "applied": True, "product": "market_template"}

    if tx["status"] == "completed":
        return {"ok": True, "applied": True}

    subscription_id = obj.get("subscription")
    customer_id = obj.get("customer")
    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {
            "status": "completed",
            "payment_status": "paid",
            "stripe_subscription_id": subscription_id,
            "stripe_customer_id": customer_id,
            "updated_at": now_iso(),
        }},
    )

    # One-shot AI dev team hire — chat-scoped, no plan change.
    if tx.get("plan_id") == "hire_dev_team" and tx.get("chat_id"):
        try:
            from routes.chats import _provision_dev_team_for_chat
            await _provision_dev_team_for_chat(tx["chat_id"], tx.get("user_id") or "system")
        except Exception as e:
            logger.exception("Hire-dev-team provision failed via webhook: %s", e)
        return {"ok": True, "applied": True, "product": "hire_dev_team"}

    try:
        await apply_plan_change(
            tx["workspace_id"],
            plan_id=tx["plan_id"],
            stripe_customer_id=customer_id,
            stripe_subscription_id=subscription_id,
            status="active",
        )
    except Exception as e:
        logger.exception("Plan change failed via webhook: %s", e)
    return {"ok": True, "applied": True}


async def _handle_subscription_deleted(obj: dict) -> dict:
    """Downgrade the workspace whose subscription was cancelled."""
    subscription_id = obj.get("id")
    sub_record = await db.workspace_billing.find_one(
        {"stripe_subscription_id": subscription_id}, {"_id": 0}
    )
    if sub_record:
        try:
            await apply_plan_change(
                sub_record["workspace_id"], plan_id="free", status="canceled"
            )
        except Exception as e:
            logger.exception("Downgrade on subscription delete failed: %s", e)
    return {"ok": True, "canceled": True}


async def _handle_subscription_updated(obj: dict) -> dict:
    """Mirror Stripe's cancel_at_period_end / status onto our record."""
    subscription_id = obj.get("id")
    await db.workspace_billing.update_one(
        {"stripe_subscription_id": subscription_id},
        {"$set": {
            "cancel_at_period_end": bool(obj.get("cancel_at_period_end")),
            "stripe_status": obj.get("status"),
            "updated_at": now_iso(),
        }},
    )
    return {"ok": True}


def _config_stripe_sdk():
    """Point the stripe SDK at the right backend (emergent proxy in test mode)."""
    stripe.api_key = STRIPE_API_KEY
    if "sk_test_emergent" in (STRIPE_API_KEY or ""):
        stripe.api_base = "https://integrations.emergentagent.com/stripe"


# ─── Credit top-ups (packs + custom amount, admin-configurable specials) ──
class CreditCheckout(BaseModel):
    pack_id: Optional[str] = None
    custom_amount_usd: Optional[float] = None
    origin_url: str


@router.get("/billing/credit-packs")
async def credit_packs(current=Depends(require_user)):
    from services.billing_settings import get_settings
    s = await get_settings()
    packs = []
    for p in s.get("credit_packs") or []:
        bonus = float(p.get("bonus_pct") or 0)
        packs.append({**p, "total_credits": int(round(p["credits"] * (1 + bonus / 100)))})
    return {"packs": packs, "promo": s.get("credit_promo") or {},
            "usd_per_credit": s.get("credit_usd_per_credit")}


@router.post("/billing/credits/checkout")
async def credits_checkout(payload: CreditCheckout, request: Request, current=Depends(require_user)):
    from services.billing_settings import get_settings
    s = await get_settings()
    if payload.pack_id:
        pack = next((p for p in (s.get("credit_packs") or []) if p["id"] == payload.pack_id), None)
        if not pack:
            raise HTTPException(404, "Unknown credit pack")
        amount = float(pack["price_usd"])
        credits = int(round(pack["credits"] * (1 + float(pack.get("bonus_pct") or 0) / 100)))
    else:
        amount = float(payload.custom_amount_usd or 0)
        if not (5 <= amount <= 10000):
            raise HTTPException(400, "Enter an amount between $5 and $10,000")
        credits = int(round(amount * 5))  # $20 → 100 credits
    origin = payload.origin_url.rstrip("/")
    success_url = f"{origin}/chats?credit_session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/chats"
    _config_stripe_sdk()
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "unit_amount": int(round(amount * 100)),
                    "product_data": {"name": f"TeamNest AI credits — {credits} credits"},
                },
                "quantity": 1,
            }],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"workspace_id": current["workspace_id"], "credits_to_add": str(credits),
                      "source": "credit_topup"},
            customer_email=current["email"],
        )
    except stripe.error.StripeError as e:
        logger.exception("Credit top-up checkout failed: %s", e)
        raise HTTPException(502, f"Stripe error: {getattr(e, 'user_message', None) or str(e)}")
    await db.payment_transactions.insert_one({
        "session_id": session.id,
        "workspace_id": current["workspace_id"],
        "user_id": current["id"],
        "email": current.get("email"),
        "amount": amount,
        "currency": "usd",
        "credits_to_add": credits,
        "status": "pending",
        "payment_status": "unpaid",
        "processed": False,
        "metadata": {"source": "credit_topup"},
        "created_at": now_iso(),
    })
    return {"url": session.url, "session_id": session.id, "credits": credits}


async def _finalize_credit_topup(session_id: str) -> None:
    """Idempotent: on first payment confirmation, add credits to the workspace."""
    r = await db.payment_transactions.update_one(
        {"session_id": session_id, "processed": {"$ne": True}},
        {"$set": {"processed": True, "status": "completed", "payment_status": "paid",
                  "updated_at": now_iso()}},
    )
    if r.modified_count == 0:
        return
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    credits = int(tx.get("credits_to_add") or 0)
    if credits <= 0:
        return
    await db.workspace_billing.update_one(
        {"workspace_id": tx["workspace_id"]},
        {"$inc": {"credits_purchased_extra": credits}, "$set": {"updated_at": now_iso()}},
        upsert=True,
    )
    logger.info("[billing] credit top-up applied: +%s credits ws=%s", credits, tx["workspace_id"])


@router.get("/billing/credits/status/{session_id}")
async def credits_topup_status(session_id: str, current=Depends(require_user)):
    tx = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": current["id"], "credits_to_add": {"$exists": True}},
        {"_id": 0},
    )
    if not tx:
        raise HTTPException(404, "Unknown top-up session")
    if tx.get("payment_status") == "paid" or tx.get("processed"):
        await _finalize_credit_topup(session_id)
        return {"payment_status": "paid", "credits": tx.get("credits_to_add")}
    _config_stripe_sdk()
    from routes.template_market import _session_status_with_retry
    status = await _session_status_with_retry(session_id, attempts=3)
    if status and status["payment_status"] == "paid":
        await _finalize_credit_topup(session_id)
        return {"payment_status": "paid", "credits": tx.get("credits_to_add")}
    return {"payment_status": (status or {}).get("payment_status", tx.get("payment_status", "unpaid")),
            "credits": tx.get("credits_to_add")}


# ─── Hosting add-ons (monthly Stripe subscriptions on top of the plan) ───
HOSTING_TIERS = {
    "shared": {"name": "Shared hosting", "price_usd": 0},
    "pro-db": {"name": "Pro Database", "price_usd": 19},
    "dedicated": {"name": "Dedicated", "price_usd": 99},
}


class HostingCheckout(BaseModel):
    tier: str
    origin_url: str


@router.post("/billing/hosting/checkout")
async def hosting_checkout(payload: HostingCheckout, current=Depends(require_user)):
    from services.launch_core import ensure_checkout_allowed
    await ensure_checkout_allowed(current)
    tier = HOSTING_TIERS.get(payload.tier)
    if not tier or tier["price_usd"] <= 0:
        raise HTTPException(400, "Pick a paid hosting tier (pro-db or dedicated)")
    origin = payload.origin_url.rstrip("/")
    _config_stripe_sdk()
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "unit_amount": int(tier["price_usd"] * 100),
                    "recurring": {"interval": "month"},
                    "product_data": {"name": f"TeamNest hosting — {tier['name']}"},
                },
                "quantity": 1,
            }],
            success_url=f"{origin}/billing?hosting_session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{origin}/billing",
            metadata={"workspace_id": current["workspace_id"], "hosting_tier": payload.tier,
                      "source": "hosting_addon"},
            customer_email=current["email"],
        )
    except stripe.error.StripeError as e:
        logger.exception("Hosting checkout failed: %s", e)
        raise HTTPException(502, f"Stripe error: {getattr(e, 'user_message', None) or str(e)}")
    await db.payment_transactions.insert_one({
        "session_id": session.id,
        "workspace_id": current["workspace_id"],
        "user_id": current["id"],
        "email": current.get("email"),
        "amount": float(tier["price_usd"]),
        "currency": "usd",
        "hosting_tier": payload.tier,
        "status": "pending",
        "payment_status": "unpaid",
        "processed": False,
        "metadata": {"source": "hosting_addon"},
        "created_at": now_iso(),
    })
    return {"url": session.url, "session_id": session.id, "tier": payload.tier}


async def _finalize_hosting_upgrade(session_id: str) -> None:
    r = await db.payment_transactions.update_one(
        {"session_id": session_id, "processed": {"$ne": True}},
        {"$set": {"processed": True, "status": "completed", "payment_status": "paid",
                  "updated_at": now_iso()}},
    )
    if r.modified_count == 0:
        return
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    await db.workspace_billing.update_one(
        {"workspace_id": tx["workspace_id"]},
        {"$set": {"hosting_tier": tx["hosting_tier"],
                  "hosting_since": now_iso(),
                  "hosting_stripe_subscription_id": tx.get("stripe_subscription_id"),
                  "updated_at": now_iso()}},
        upsert=True,
    )
    logger.info("[billing] hosting upgraded ws=%s tier=%s", tx["workspace_id"], tx["hosting_tier"])


@router.get("/billing/hosting/status/{session_id}")
async def hosting_status(session_id: str, current=Depends(require_user)):
    tx = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": current["id"], "hosting_tier": {"$exists": True}},
        {"_id": 0},
    )
    if not tx:
        raise HTTPException(404, "Unknown hosting session")
    if tx.get("payment_status") == "paid" or tx.get("processed"):
        await _finalize_hosting_upgrade(session_id)
        return {"payment_status": "paid", "hosting_tier": tx["hosting_tier"]}
    _config_stripe_sdk()
    from routes.template_market import _session_status_with_retry
    status = await _session_status_with_retry(session_id, attempts=3)
    if status and status["payment_status"] == "paid":
        await _finalize_hosting_upgrade(session_id)
        return {"payment_status": "paid", "hosting_tier": tx["hosting_tier"]}
    return {"payment_status": (status or {}).get("payment_status", "unpaid"),
            "hosting_tier": tx["hosting_tier"]}


@router.post("/billing/hosting/downgrade")
async def hosting_downgrade(current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Workspace owner/admin only")
    await db.workspace_billing.update_one(
        {"workspace_id": current["workspace_id"]},
        {"$set": {"hosting_tier": "shared", "updated_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True, "hosting_tier": "shared"}


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Stripe payment webhook. Verifies signature against STRIPE_WEBHOOK_SECRET
    and updates txn + plan state idempotently."""
    event = await _parse_webhook_event(request)
    try:
        event_type = event["type"]
        obj = event["data"]["object"]
        obj = obj.to_dict() if hasattr(obj, "to_dict") else dict(obj)
    except Exception as e:
        logger.warning("[stripe-webhook] malformed event: %s", e)
        raise HTTPException(400, "malformed event")
    logger.info("[stripe-webhook] %s id=%s", event_type, obj.get("id"))

    if event_type == "checkout.session.completed":
        return await _handle_checkout_session_completed(obj)
    if event_type == "customer.subscription.deleted":
        return await _handle_subscription_deleted(obj)
    if event_type == "customer.subscription.updated":
        return await _handle_subscription_updated(obj)

    return {"ok": True, "noop": True, "event_type": event_type}
