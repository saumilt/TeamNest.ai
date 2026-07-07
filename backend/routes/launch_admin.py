"""Invite-only launch — admin endpoints (owner/admin only)."""
import io
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from deps import db, new_id, now_iso, require_user
from services.launch_core import (
    ACCESS_LEVELS, computed_rank, ensure_seed, gen_code, get_settings,
    grant_personal_invites, send_launch_email_bg, track_event,
)

router = APIRouter()


async def _require_admin(current) -> None:
    if current["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin only")


# ─── Settings ────────────────────────────────────────────────────────────────
class SettingsPatch(BaseModel):
    mode: Optional[str] = None
    allow_open_signup: Optional[bool] = None
    allow_public_pricing: Optional[bool] = None
    allow_public_checkout: Optional[bool] = None
    allow_invited_upgrade: Optional[bool] = None
    allow_waitlist_pricing_preview: Optional[bool] = None
    require_invite_before_checkout: Optional[bool] = None
    require_admin_approval_before_checkout: Optional[bool] = None


@router.get("/launch/admin/settings")
async def admin_settings(current=Depends(require_user)):
    await _require_admin(current)
    await ensure_seed()
    return await get_settings()


@router.put("/launch/admin/settings")
async def update_settings(payload: SettingsPatch, current=Depends(require_user)):
    await _require_admin(current)
    patch = {k: v for k, v in payload.dict().items() if v is not None}
    if "mode" in patch and patch["mode"] not in ("invite_only", "waitlist", "approved_only", "open"):
        raise HTTPException(400, "Invalid mode")
    if patch:
        await db.launch_settings.update_one({"id": "global"}, {"$set": patch}, upsert=True)
        await track_event("settings_changed", {"by": current["id"], "patch": patch})
    return await get_settings()


# ─── Waitlist management ─────────────────────────────────────────────────────
def _wu_row(wu, total):
    return {
        **{k: wu.get(k) for k in (
            "id", "name", "email", "company", "role", "company_size", "use_case",
            "interest_area", "build_answer", "referral_count", "access_level",
            "status", "badges", "source", "created_at", "reward_code")},
        "rank": computed_rank(wu), "total": total,
    }


@router.get("/launch/admin/waitlist")
async def admin_waitlist(q: str = "", status: str = "", interest: str = "",
                          min_referrals: int = 0, limit: int = 100,
                          current=Depends(require_user)):
    await _require_admin(current)
    await ensure_seed()
    filt: dict = {}
    if q:
        filt["$or"] = [{"name": {"$regex": q, "$options": "i"}},
                       {"email": {"$regex": q, "$options": "i"}},
                       {"company": {"$regex": q, "$options": "i"}}]
    if status:
        filt["status"] = status
    if interest:
        filt["interest_area"] = interest
    if min_referrals:
        filt["referral_count"] = {"$gte": min_referrals}
    total = (await db.launch_counters.find_one({"id": "waitlist"}))["next_position"] - 1
    rows = await db.waitlist_users.find(filt, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))
    return {"users": [_wu_row(w, total) for w in rows], "total_waitlist": total}


@router.get("/launch/admin/waitlist/export")
async def export_waitlist(current=Depends(require_user)):
    await _require_admin(current)
    import csv
    rows = await db.waitlist_users.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    buf = io.StringIO()
    cols = ["name", "email", "company", "role", "company_size", "use_case", "interest_area",
            "build_answer", "referral_count", "access_level", "status", "source", "created_at"]
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow(r)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=waitlist.csv"})


class ApprovePayload(BaseModel):
    access_level: str = "demo"
    invites: int = 4


@router.post("/launch/admin/waitlist/{wu_id}/approve")
async def approve_waitlist_user(wu_id: str, payload: ApprovePayload, current=Depends(require_user)):
    await _require_admin(current)
    if payload.access_level not in ACCESS_LEVELS:
        raise HTTPException(400, "Unknown access level")
    wu = await db.waitlist_users.find_one({"id": wu_id}, {"_id": 0})
    if not wu:
        raise HTTPException(404, "Not found")
    code = gen_code("TN", 8)
    await db.invite_codes.insert_one({
        "id": new_id(), "code": code, "campaign_id": None, "code_type": "admin_approval",
        "access_level": payload.access_level, "max_uses": 1, "used_count": 0,
        "invites_granted": payload.invites, "expires_at": None, "allowed_domains": [],
        "source_channel": "admin_approval", "status": "active",
        "created_by": current["id"], "created_at": now_iso(), "updated_at": now_iso(),
    })
    await db.waitlist_users.update_one(
        {"id": wu_id},
        {"$set": {"status": "approved", "access_level": payload.access_level,
                  "reward_code": code, "updated_at": now_iso()}})
    send_launch_email_bg(
        "access_approved", wu["email"], "Your TeamNest.ai access is approved 🎉",
        "You're approved for the private beta",
        f"Welcome in, {wu['name']}. Use your personal invite code <b style='color:#fbbf24;font-family:monospace'>{code}</b> to create your account — it unlocks {ACCESS_LEVELS[payload.access_level]['name']} plus {payload.invites} invites for your team.",
        "Claim access", f"https://teamnest.ai/invite?code={code}")
    await track_event("waitlist_approved", {"wu_id": wu_id, "by": current["id"]})
    return {"ok": True, "code": code}


@router.post("/launch/admin/waitlist/{wu_id}/reject")
async def reject_waitlist_user(wu_id: str, current=Depends(require_user)):
    await _require_admin(current)
    r = await db.waitlist_users.update_one(
        {"id": wu_id}, {"$set": {"status": "rejected", "updated_at": now_iso()}})
    if not r.matched_count:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ─── Code / campaign generator ───────────────────────────────────────────────
class GenerateCodes(BaseModel):
    campaign_name: str
    campaign_type: str = "social_media_drop"
    code_prefix: str = ""
    code_length: int = 8
    count: int = 1
    max_uses_per_code: int = 1
    invites_granted: int = 4
    access_level: str = "demo"
    expires_hours: Optional[int] = None
    allowed_domains: List[str] = []
    source_channel: str = "direct"
    notes: str = ""
    custom_code: Optional[str] = None


@router.post("/launch/admin/codes/generate")
async def generate_codes(payload: GenerateCodes, current=Depends(require_user)):
    await _require_admin(current)
    if payload.access_level not in ACCESS_LEVELS:
        raise HTTPException(400, "Unknown access level")
    if payload.count < 1 or payload.count > 500:
        raise HTTPException(400, "count must be 1-500")
    expires = (datetime.now(timezone.utc) + timedelta(hours=payload.expires_hours)).isoformat() \
        if payload.expires_hours else None
    camp_id = new_id()
    await db.invite_campaigns.insert_one({
        "id": camp_id, "campaign_name": payload.campaign_name,
        "campaign_type": payload.campaign_type, "code_prefix": payload.code_prefix.upper(),
        "code_length": payload.code_length, "total_codes": payload.count,
        "max_uses_per_code": payload.max_uses_per_code, "access_level": payload.access_level,
        "invites_granted": payload.invites_granted, "source_channel": payload.source_channel,
        "expires_at": expires, "status": "active", "notes": payload.notes,
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    codes = []
    for i in range(payload.count):
        code = (payload.custom_code.strip().upper() if payload.custom_code and i == 0
                else gen_code(payload.code_prefix.upper(), payload.code_length))
        if await db.invite_codes.find_one({"code": code}):
            code = gen_code(payload.code_prefix.upper(), payload.code_length)
        await db.invite_codes.insert_one({
            "id": new_id(), "code": code, "campaign_id": camp_id,
            "code_type": payload.campaign_type, "access_level": payload.access_level,
            "max_uses": payload.max_uses_per_code, "used_count": 0,
            "invites_granted": payload.invites_granted, "expires_at": expires,
            "allowed_domains": payload.allowed_domains, "source_channel": payload.source_channel,
            "status": "active", "created_by": current["id"],
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        codes.append(code)
    return {"campaign_id": camp_id, "codes": codes}


@router.get("/launch/admin/campaigns")
async def list_campaigns(current=Depends(require_user)):
    await _require_admin(current)
    await ensure_seed()
    camps = await db.invite_campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for c in camps:
        codes = await db.invite_codes.find({"campaign_id": c["id"]}, {"_id": 0, "code": 1, "used_count": 1, "max_uses": 1, "status": 1}).to_list(500)
        c["codes"] = codes
        c["total_redemptions"] = sum(x.get("used_count", 0) for x in codes)
    return {"campaigns": camps}


@router.post("/launch/admin/campaigns/{camp_id}/toggle")
async def toggle_campaign(camp_id: str, current=Depends(require_user)):
    await _require_admin(current)
    camp = await db.invite_campaigns.find_one({"id": camp_id}, {"_id": 0})
    if not camp:
        raise HTTPException(404, "Not found")
    new_status = "paused" if camp["status"] == "active" else "active"
    await db.invite_campaigns.update_one({"id": camp_id}, {"$set": {"status": new_status}})
    await db.invite_codes.update_many(
        {"campaign_id": camp_id},
        {"$set": {"status": "inactive" if new_status == "paused" else "active"}})
    return {"ok": True, "status": new_status}


# ─── Code drops ──────────────────────────────────────────────────────────────
class CreateDrop(BaseModel):
    code: str
    title: str
    description: str = ""
    max_uses: int = 100
    expires_hours: int = 24
    access_level: str = "dev_os_demo"
    invites_granted: int = 4
    source: str = "linkedin"


@router.post("/launch/admin/drops")
async def create_drop(payload: CreateDrop, current=Depends(require_user)):
    await _require_admin(current)
    code = payload.code.strip().upper()
    if await db.invite_codes.find_one({"code": code}):
        raise HTTPException(400, "Code already exists")
    if payload.access_level not in ACCESS_LEVELS:
        raise HTTPException(400, "Unknown access level")
    expires = (datetime.now(timezone.utc) + timedelta(hours=payload.expires_hours)).isoformat()
    camp_id = new_id()
    await db.invite_campaigns.insert_one({
        "id": camp_id, "campaign_name": payload.title, "campaign_type": "social_media_drop",
        "code_prefix": "", "code_length": len(code), "total_codes": 1,
        "max_uses_per_code": payload.max_uses, "access_level": payload.access_level,
        "invites_granted": payload.invites_granted, "source_channel": payload.source,
        "expires_at": expires, "status": "active", "notes": "code drop",
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    await db.invite_codes.insert_one({
        "id": new_id(), "code": code, "campaign_id": camp_id, "code_type": "social_media_drop",
        "access_level": payload.access_level, "max_uses": payload.max_uses, "used_count": 0,
        "invites_granted": payload.invites_granted, "expires_at": expires,
        "allowed_domains": [], "source_channel": payload.source, "status": "active",
        "created_by": current["id"], "created_at": now_iso(), "updated_at": now_iso(),
    })
    await db.code_drops.insert_one({
        "id": new_id(), "campaign_id": camp_id, "code": code, "title": payload.title,
        "description": payload.description or f"Use code {code} to unlock TeamNest {ACCESS_LEVELS[payload.access_level]['name']}. Limited to first {payload.max_uses} users.",
        "max_uses": payload.max_uses, "access_level": payload.access_level,
        "invites_granted": payload.invites_granted, "source": payload.source,
        "expires_at": expires, "status": "active", "created_at": now_iso(),
    })
    return {"ok": True, "drop_url": f"/drop/{code}"}


@router.get("/launch/admin/drops")
async def list_drops(current=Depends(require_user)):
    await _require_admin(current)
    await ensure_seed()
    drops = await db.code_drops.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for d in drops:
        cd = await db.invite_codes.find_one({"code": d["code"]}, {"_id": 0, "used_count": 1})
        d["used"] = int((cd or {}).get("used_count", 0))
    return {"drops": drops}


# ─── Grant extra invites to a user ──────────────────────────────────────────
class GrantInvites(BaseModel):
    email: str
    count: int = 4
    message: str = ""


@router.post("/launch/admin/users/grant-invites")
async def grant_invites(payload: GrantInvites, current=Depends(require_user)):
    await _require_admin(current)
    user = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0, "id": 1, "email": 1, "name": 1})
    if not user:
        raise HTTPException(404, "No user with that email")
    if payload.count < 1 or payload.count > 100:
        raise HTTPException(400, "count must be 1-100")
    await grant_personal_invites(user["id"], user["email"], payload.count, "demo")
    msg = payload.message or f"You've received {payload.count} more TeamNest invites. Share them with builders, founders, and teams."
    send_launch_email_bg(
        "invites_granted", user["email"], "You received more TeamNest invites",
        f"{payload.count} more invites added", msg,
        "View your invites", "https://teamnest.ai/invites")
    await db.notifications.insert_one({
        "id": new_id(), "user_id": user["id"], "type": "launch_invites",
        "title": f"{payload.count} more invites added", "body": msg,
        "read": False, "created_at": now_iso(),
    })
    return {"ok": True}


# ─── Leaderboard / analytics / email previews ────────────────────────────────
@router.get("/launch/admin/leaderboard")
async def admin_leaderboard(current=Depends(require_user)):
    await _require_admin(current)
    rows = await db.waitlist_users.find(
        {"referral_count": {"$gt": 0}},
        {"_id": 0, "name": 1, "email": 1, "referral_count": 1, "badges": 1, "status": 1},
    ).sort("referral_count", -1).limit(50).to_list(50)
    return {"leaders": rows}


@router.get("/launch/admin/analytics")
async def launch_analytics(current=Depends(require_user)):
    await _require_admin(current)
    await ensure_seed()
    async def _ev(name):
        return await db.waitlist_events.count_documents({"event": name})
    waitlist_total = await db.waitlist_users.count_documents({})
    return {
        "waitlist_users": waitlist_total,
        "invited": await db.waitlist_users.count_documents({"status": "invited"}),
        "approved": await db.waitlist_users.count_documents({"status": "approved"}),
        "converted": await db.waitlist_users.count_documents({"status": "converted"}),
        "code_redemptions": await db.invite_redemptions.count_documents({}),
        "referrals": await db.referrals.count_documents({}),
        "active_codes": await db.invite_codes.count_documents({"status": "active"}),
        "pricing_views": await _ev("pricing_view"),
        "checkout_starts": await _ev("checkout_start"),
        "checkout_blocked": await _ev("checkout_blocked"),
        "drop_views": await _ev("drop_viewed"),
        "revenue_usd": 0,
    }


@router.get("/launch/admin/emails")
async def email_previews(limit: int = 50, current=Depends(require_user)):
    await _require_admin(current)
    rows = await db.invite_notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 200))
    return {"emails": rows}
