"""In-app purchase (RevenueCat) routes — mobile subscription + credit-pack path.

- POST /api/webhooks/revenuecat  : RevenueCat -> us (authoritative lifecycle)
- POST /api/billing/iap/register : app links its app_user_id + target workspace
- POST /api/billing/iap/sync     : immediate post-purchase reconcile (needs secret key)
- GET  /api/billing/iap/config   : capability + catalog for the client
"""
import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from deps import db, new_id, now_iso, require_user
from services import iap_revenuecat as iap
from services.billing import get_usage

router = APIRouter()


@router.get("/billing/iap/config")
async def iap_config(current=Depends(require_user)):
    return {
        "configured": iap.is_configured(),
        "credit_packs": iap.IAP_CREDIT_PACKS,
        "storage_products": iap.IAP_STORAGE_PRODUCTS,
        "marketplace_tiers": iap.IAP_MARKETPLACE_TIERS,
        "entitlements": list(iap.ENTITLEMENT_TO_PLAN.keys()),
    }


@router.post("/billing/iap/order")
async def iap_create_order(payload: dict, current=Depends(require_user)):
    """Create a pending consumable order (storage pack or marketplace install)
    BEFORE the client buys the matching store product. The signed RevenueCat
    webhook later matches (product_id + user) to this order and fulfills it."""
    kind = (payload or {}).get("kind")
    ref_id = (payload or {}).get("ref_id")
    ws = current.get("workspace_id")
    if not ref_id:
        raise HTTPException(400, "ref_id is required")

    if kind == "storage_pack":
        from routes.enterprise import STORAGE_PACKS
        pack = next((p for p in STORAGE_PACKS if p["id"] == ref_id), None)
        if not pack:
            raise HTTPException(404, "Unknown storage pack")
        product_id = iap.storage_product_for_pack(ref_id)
        meta = {"name": pack["name"], "gb": pack["gb"], "price_usd": pack["price_usd"]}
    elif kind == "marketplace_install":
        lst = await db.ai_employee_marketplace_listings.find_one(
            {"id": ref_id, "status": "Published"}, {"_id": 0, "title": 1, "price_usd": 1})
        if not lst:
            raise HTTPException(404, "Listing not found")
        if await db.ai_employee_marketplace_licenses.find_one(
                {"listing_id": ref_id, "installer_workspace_id": ws}, {"_id": 1}):
            raise HTTPException(400, "Already installed in this workspace")
        price = float(lst.get("price_usd", 0) or 0)
        if price <= 0:
            raise HTTPException(400, "Free listing — install directly, no purchase needed")
        product_id = iap.marketplace_product_for_price(price)
        meta = {"title": lst.get("title"), "price_usd": price}
    else:
        raise HTTPException(400, "Unknown order kind")

    order = {
        "id": new_id(), "user_id": current["id"], "workspace_id": ws,
        "kind": kind, "ref_id": ref_id, "product_id": product_id,
        "status": "pending", "meta": meta, "created_at": now_iso(),
    }
    await db.iap_pending_orders.insert_one(order.copy())
    return {"order_id": order["id"], "product_id": product_id, "status": "pending", "meta": meta}


@router.get("/billing/iap/order/{order_id}")
async def iap_get_order(order_id: str, current=Depends(require_user)):
    o = await db.iap_pending_orders.find_one(
        {"id": order_id, "user_id": current["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    return o


@router.post("/billing/iap/register")
async def iap_register(payload: dict | None = None, current=Depends(require_user)):
    """Called by the mobile app on login / paywall-open: links the RevenueCat
    app_user_id (= our user id) and records which workspace a purchase applies to."""
    app_user_id = (payload or {}).get("app_user_id") or current["id"]
    await iap.link_user(current, app_user_id, current.get("workspace_id"))
    return {"ok": True, "app_user_id": app_user_id, "workspace_id": current.get("workspace_id")}


@router.post("/billing/iap/sync")
async def iap_sync(current=Depends(require_user)):
    """Return the user's current billing state so the paywall can refresh right
    after a purchase. Entitlement grants come ONLY from the signed RevenueCat
    webhook — never trusted from the client, and no secret key is held here."""
    return await get_usage(current["workspace_id"])


@router.post("/webhooks/revenuecat")
async def revenuecat_webhook(request: Request, authorization: str | None = Header(None)):
    if not iap.is_configured():
        raise HTTPException(503, "IAP not configured")
    if not authorization or not hmac.compare_digest(authorization, iap.RC_WEBHOOK_AUTH):
        raise HTTPException(401, "invalid webhook authorization")

    await iap.ensure_indexes()
    body = await request.json()
    e = (body or {}).get("event") or {}
    event_id, kind = e.get("id"), e.get("type")
    if not event_id or not kind:
        raise HTTPException(400, "invalid RevenueCat event")

    # RevenueCat retries + may duplicate — dedupe on event id.
    inserted = await db.rc_events.update_one(
        {"event_id": event_id},
        {"$setOnInsert": {"event_id": event_id, "type": kind, "received_at": now_iso(), "event": e}},
        upsert=True,
    )
    if not inserted.upserted_id:
        return {"ok": True, "duplicate": True}

    user = await iap._find_user(
        e.get("app_user_id"),
        [e.get("original_app_user_id"), *(e.get("aliases") or [])],
    )
    if not user:
        # Never create/grant on an untrusted arbitrary id — quarantine for review.
        await db.rc_events.update_one({"event_id": event_id}, {"$set": {"unmatched": True}})
        return {"ok": True, "unmatched": True}

    # Sandbox events hit the same endpoint. Grant on SANDBOX only while testing.
    env = (e.get("environment") or "PRODUCTION").upper()
    if env == "SANDBOX" and not iap.RC_ACCEPT_SANDBOX:
        await db.rc_events.update_one({"event_id": event_id}, {"$set": {"skipped_sandbox": True}})
        return {"ok": True, "skipped": "sandbox"}

    await iap.handle_event(user, e)
    return {"ok": True}
