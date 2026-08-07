"""RevenueCat in-app purchase sync — the MOBILE purchase path.

Web checkout stays on Stripe; the iOS + Android apps buy through native
App Store / Google Play products (via RevenueCat), because Apple/Google do
NOT allow digital goods to be sold through an external processor.

Pricing model: the store products are configured ~20% ABOVE the web price by
the owner, so the website remains the cheaper (discounted) place to subscribe.
This module only maps entitlements/products to our plan + credit ledger — the
actual prices live in App Store Connect / Play Console.
"""
import os
from datetime import datetime, timezone

from pymongo.errors import DuplicateKeyError

from deps import db, now_iso
from services.billing import apply_plan_change

RC_WEBHOOK_AUTH = os.environ.get("RC_WEBHOOK_AUTH") or ""
# Sandbox purchases hit the SAME webhook. Grant on SANDBOX only while testing;
# set RC_ACCEPT_SANDBOX="false" in production so sandbox accounts can't grant
# real entitlements. All grants come from the signed webhook — no secret key,
# no client-trusted grants (purchasePackage() already returns CustomerInfo).
RC_ACCEPT_SANDBOX = (os.environ.get("RC_ACCEPT_SANDBOX", "true").lower() == "true")

# RevenueCat entitlement id -> our plan id.
ENTITLEMENT_TO_PLAN = {"student": "student", "pro": "pro", "team": "team"}
# If several entitlements are active at once, pick the richest.
PLAN_PRIORITY = ["team", "pro", "student"]

# Consumable credit-pack product ids -> credits granted (AUTHORITATIVE here,
# never trusted from the client). The owner sets each product's store price at
# ~1.2x the web credit-pack price.
IAP_CREDIT_PACKS = {
    "credits_1000": 1000,
    "credits_5000": 5000,
    "credits_15000": 15000,
}

_indexes_ready = False


def is_configured() -> bool:
    """Webhook auth secret present = RevenueCat wired on the backend."""
    return bool(RC_WEBHOOK_AUTH)


async def ensure_indexes() -> None:
    global _indexes_ready
    if _indexes_ready:
        return
    await db.rc_events.create_index("event_id", unique=True)
    await db.iap_credit_grants.create_index("txn_key", unique=True)
    _indexes_ready = True


def _ms_to_iso(ms) -> str | None:
    if not ms:
        return None
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc).isoformat()
    except Exception:
        return None


def _norm_product(pid: str | None) -> str:
    # Google Play sends the purchased SKU as "subId:basePlanId" (subs) or with an
    # offer suffix; App Store sends the bare id. Strip any suffix so our product
    # maps (credits/storage/marketplace) match on BOTH stores. Subscription->plan
    # mapping never uses this — it uses entitlement_ids, which are store-agnostic.
    return (pid or "").split(":")[0]


def plan_from_entitlements(entitlement_ids) -> str | None:
    active = {e for e in (entitlement_ids or []) if e in ENTITLEMENT_TO_PLAN}
    for p in PLAN_PRIORITY:
        if p in active:
            return ENTITLEMENT_TO_PLAN[p]
    return None


async def _find_user(app_user_id: str | None, aliases=None) -> dict | None:
    ids = [i for i in [app_user_id, *(aliases or [])] if i]
    if not ids:
        return None
    return await db.users.find_one(
        {"$or": [{"id": {"$in": ids}}, {"revenuecat_ids": {"$in": ids}}]},
        {"_id": 0},
    )


def _target_workspace(user: dict) -> str | None:
    """Which workspace a mobile purchase upgrades — the one active when the
    user opened the paywall (recorded via /iap/register), else their active
    workspace."""
    return user.get("iap_workspace_id") or user.get("workspace_id")


async def link_user(user: dict, app_user_id: str, workspace_id: str | None = None) -> None:
    updates: dict = {"$addToSet": {"revenuecat_ids": app_user_id}, "$set": {"updated_at": now_iso()}}
    if workspace_id:
        updates["$set"]["iap_workspace_id"] = workspace_id
    await db.users.update_one({"id": user["id"]}, updates)


async def apply_subscription(
    user: dict, plan_id: str, *, status: str = "active",
    expires_at: str | None = None, cancel_at_period_end: bool = False,
    force_reset: bool = False,
) -> None:
    """Set the target workspace to `plan_id`.

    `apply_plan_change` resets the monthly credit counter, so we only call it on
    a real plan change or an explicit renewal (`force_reset`). Otherwise (e.g. a
    user tapping Restore repeatedly) we just refresh status/expiry WITHOUT
    handing out a fresh allowance.
    """
    ws = _target_workspace(user)
    if not ws:
        return
    current = await db.workspace_billing.find_one({"workspace_id": ws}, {"_id": 0, "plan_id": 1}) or {}
    changed = current.get("plan_id") != plan_id
    if force_reset or changed:
        await apply_plan_change(ws, plan_id=plan_id, status=status, cancel_at_period_end=cancel_at_period_end)
    else:
        await db.workspace_billing.update_one(
            {"workspace_id": ws},
            {"$set": {"status": status, "cancel_at_period_end": cancel_at_period_end, "updated_at": now_iso()}},
        )
    await db.workspace_billing.update_one(
        {"workspace_id": ws},
        {"$set": {"iap_provider": "revenuecat", "iap_expires_at": expires_at, "updated_at": now_iso()}},
    )


async def expire_subscription(user: dict) -> None:
    ws = _target_workspace(user)
    if not ws:
        return
    await apply_plan_change(ws, plan_id="free", status="expired")


async def grant_credit_pack(user: dict, product_id: str | None, txn_key: str) -> int:
    """Idempotently grant a consumable credit pack. Returns credits granted."""
    credits = IAP_CREDIT_PACKS.get(product_id or "", 0)
    if credits <= 0:
        return 0
    ws = _target_workspace(user)
    if not ws:
        return 0
    try:
        await db.iap_credit_grants.insert_one({
            "txn_key": txn_key, "user_id": user["id"], "workspace_id": ws,
            "product_id": product_id, "credits": credits, "created_at": now_iso(),
        })
    except DuplicateKeyError:
        return 0  # already granted for this transaction
    await db.workspace_billing.update_one(
        {"workspace_id": ws},
        {"$inc": {"credits_purchased_extra": credits}, "$set": {"updated_at": now_iso()}},
        upsert=True,
    )
    return credits


async def handle_event(user: dict, e: dict) -> None:
    """Dispatch a single RevenueCat webhook event to plan/credit changes."""
    kind = e.get("type")
    plan = plan_from_entitlements(e.get("entitlement_ids"))
    expires_iso = _ms_to_iso(e.get("expiration_at_ms"))

    if kind in ("INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"):
        if plan:
            await apply_subscription(user, plan, status="active", expires_at=expires_iso, force_reset=True)
    elif kind == "CANCELLATION":
        # Auto-renew turned off — keep access until it actually expires.
        if plan:
            await apply_subscription(user, plan, status="active",
                                     expires_at=expires_iso, cancel_at_period_end=True)
    elif kind == "EXPIRATION":
        await expire_subscription(user)
    elif kind == "NON_RENEWING_PURCHASE":
        store = e.get("store") or "store"
        tid = e.get("transaction_id") or e.get("id")
        await grant_credit_pack(user, _norm_product(e.get("product_id")), f"{store}:{tid}")


# NOTE: no RevenueCat REST "sync" — purchasePackage() returns CustomerInfo to the
# client synchronously, and the signed webhook is the single authoritative grant
# path. We deliberately do NOT hold the RevenueCat secret key server-side.
