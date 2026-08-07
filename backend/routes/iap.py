"""In-app purchase (RevenueCat) routes — mobile subscription + credit-pack path.

- POST /api/webhooks/revenuecat  : RevenueCat -> us (authoritative lifecycle)
- POST /api/billing/iap/register : app links its app_user_id + target workspace
- POST /api/billing/iap/sync     : immediate post-purchase reconcile (needs secret key)
- GET  /api/billing/iap/config   : capability + catalog for the client
"""
import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from deps import db, now_iso, require_user
from services import iap_revenuecat as iap
from services.billing import get_usage

router = APIRouter()


@router.get("/billing/iap/config")
async def iap_config(current=Depends(require_user)):
    return {
        "configured": iap.is_configured(),
        "credit_packs": iap.IAP_CREDIT_PACKS,
        "entitlements": list(iap.ENTITLEMENT_TO_PLAN.keys()),
    }


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
