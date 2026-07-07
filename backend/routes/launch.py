"""Invite-only launch — public + user endpoints."""
import hashlib
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr

from auth_utils import create_token, hash_password, set_session_cookie
from deps import db, new_id, now_iso, public_user, require_user
from services.launch_core import (
    ACCESS_LEVELS, BADGES, MILESTONES, TEAM_MULTIPLIER, code_state, computed_rank,
    ensure_seed, gen_referral_code, get_settings, grant_personal_invites,
    process_referral, send_launch_email_bg, track_event,
)
from services.workspace_membership import ensure_membership, list_user_workspaces

router = APIRouter()


@router.get("/launch/config")
async def launch_config():
    """Public launch mode config used to gate signup/pricing UI."""
    await ensure_seed()
    s = await get_settings()
    return {
        "mode": s["mode"],
        "allow_open_signup": s["allow_open_signup"],
        "allow_public_pricing": s["allow_public_pricing"],
        "allow_public_checkout": s["allow_public_checkout"],
        "allow_waitlist_pricing_preview": s["allow_waitlist_pricing_preview"],
    }


# ─── Waitlist ────────────────────────────────────────────────────────────────
class WaitlistJoin(BaseModel):
    name: str
    email: EmailStr
    company: Optional[str] = None
    role: Optional[str] = None
    company_size: Optional[str] = None
    use_case: Optional[str] = None
    interest_area: Optional[str] = None
    build_answer: Optional[str] = None
    ref: Optional[str] = None


def _waitlist_public(wu: dict, total: int) -> dict:
    rank = computed_rank(wu)
    nxt = next((m for m in MILESTONES if m["referrals"] > int(wu.get("referral_count", 0))), None)
    return {
        "id": wu["id"], "name": wu["name"], "email": wu["email"],
        "rank": rank, "total": total, "referral_code": wu["referral_code"],
        "referral_link": f"/waitlist?ref={wu['referral_code']}",
        "referral_count": wu.get("referral_count", 0),
        "status": wu.get("status"), "badges": wu.get("badges", []),
        "reward_code": wu.get("reward_code"),
        "milestones": MILESTONES, "next_milestone": nxt,
    }


@router.post("/launch/waitlist")
async def join_waitlist(payload: WaitlistJoin, request: Request):
    await ensure_seed()
    email = payload.email.lower()
    existing = await db.waitlist_users.find_one({"email": email}, {"_id": 0})
    total = (await db.launch_counters.find_one({"id": "waitlist"}))["next_position"] - 1
    if existing:
        return {"already_joined": True, **_waitlist_public(existing, total)}
    ctr = await db.launch_counters.find_one_and_update(
        {"id": "waitlist"}, {"$inc": {"next_position": 1}})
    position = ctr["next_position"]
    ip = (request.client.host if request.client else "") or ""
    wu = {
        "id": new_id(), "name": payload.name.strip(), "email": email,
        "company": payload.company, "role": payload.role, "company_size": payload.company_size,
        "use_case": payload.use_case, "interest_area": payload.interest_area,
        "build_answer": payload.build_answer, "base_position": position,
        "referral_code": gen_referral_code(payload.name), "referred_by": payload.ref,
        "referral_count": 0, "manual_boost": 0, "access_level": "waitlist_only",
        "status": "waiting", "badges": [],
        "source": "waitlist_form", "ip_hash": hashlib.sha256(ip.encode()).hexdigest()[:16],
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.waitlist_users.insert_one(wu.copy())
    await track_event("waitlist_joined", {"email": email, "ref": payload.ref})
    if payload.ref:
        referrer = await db.waitlist_users.find_one(
            {"referral_code": payload.ref.upper(), "email": {"$ne": email}}, {"_id": 0})
        if referrer:
            await process_referral(referrer, wu["id"], email)
    send_launch_email_bg(
        "waitlist_joined", email, "You're on the TeamNest.ai waitlist",
        f"You're #{position} on the waitlist",
        "Welcome to the TeamNest private beta waitlist. Invite friends with your personal link to move up 50 spots per referral — 5 referrals unlocks private demo access.",
        "Invite friends", f"https://teamnest.ai/waitlist?check={email}")
    return {"already_joined": False, **_waitlist_public(wu, position)}


@router.get("/launch/waitlist/status")
async def waitlist_status(email: str):
    await ensure_seed()
    wu = await db.waitlist_users.find_one({"email": email.lower()}, {"_id": 0})
    if not wu:
        raise HTTPException(404, "Not on the waitlist")
    total = (await db.launch_counters.find_one({"id": "waitlist"}))["next_position"] - 1
    return _waitlist_public(wu, total)


@router.get("/launch/leaderboard")
async def leaderboard():
    await ensure_seed()
    rows = await db.waitlist_users.find(
        {"referral_count": {"$gt": 0}}, {"_id": 0, "name": 1, "referral_count": 1, "badges": 1},
    ).sort("referral_count", -1).limit(10).to_list(10)
    out = []
    for i, r in enumerate(rows):
        parts = (r["name"] or "?").split()
        masked = parts[0] + (f" {parts[1][0]}." if len(parts) > 1 else "")
        badge = next((b for b in r.get("badges", []) if b in BADGES), None)
        out.append({"rank": i + 1, "name": masked, "referrals": r["referral_count"],
                    "badge": BADGES[badge]["name"] if badge else None})
    return {"leaders": out}


# ─── Invite codes ────────────────────────────────────────────────────────────
@router.get("/launch/code/{code}")
async def validate_code(code: str):
    await ensure_seed()
    doc = await db.invite_codes.find_one({"code": code.strip().upper()}, {"_id": 0})
    state = code_state(doc)
    if state != "valid":
        return {"state": state}
    lv = ACCESS_LEVELS.get(doc["access_level"], {})
    return {
        "state": "valid", "code": doc["code"], "access_level": doc["access_level"],
        "access_name": lv.get("name"), "access_description": lv.get("description"),
        "invites_granted": doc.get("invites_granted", 4),
        "remaining": max(0, int(doc.get("max_uses", 1)) - int(doc.get("used_count", 0))),
        "expires_at": doc.get("expires_at"),
    }


class RedeemPayload(BaseModel):
    code: str
    name: str
    email: EmailStr
    password: str
    company: Optional[str] = None
    role_title: Optional[str] = None
    use_case: Optional[str] = None


@router.post("/launch/code/redeem")
async def redeem_code(payload: RedeemPayload, response: Response):
    await ensure_seed()
    code = payload.code.strip().upper()
    doc = await db.invite_codes.find_one({"code": code}, {"_id": 0})
    state = code_state(doc)
    if state != "valid":
        raise HTTPException(400, f"code_{state}")
    email = payload.email.lower()
    if doc.get("allowed_domains"):
        domain = email.split("@")[-1]
        if domain not in doc["allowed_domains"]:
            raise HTTPException(400, "code_domain_not_allowed")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered — log in instead")
    if len(payload.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    level = doc["access_level"]
    lv = ACCESS_LEVELS.get(level, ACCESS_LEVELS["demo"])
    invites_granted = int(doc.get("invites_granted") or lv["invite_count"] or 4)
    badges = [lv["badge"]] if lv.get("badge") else []
    workspace_id = new_id()
    user = {
        "id": new_id(), "name": payload.name.strip(), "email": email,
        "phone": None, "phone_normalized": None, "phone_hash": None,
        "password_hash": hash_password(payload.password), "avatar": None,
        "role": "owner", "workspace_id": workspace_id, "status": "active",
        "launch_access": {
            "status": "invited", "level": level, "badges": badges,
            "via_code": code, "campaign_id": doc.get("campaign_id"),
            "credit_limit": lv.get("credit_limit"), "company": payload.company,
            "role_title": payload.role_title, "use_case": payload.use_case,
            "team_unlocks": [], "granted_at": now_iso(),
        },
        "created_at": now_iso(),
    }
    await db.users.insert_one(user.copy())
    await db.workspaces.insert_one({
        "id": workspace_id, "name": f"{user['name']}'s Workspace",
        "owner_id": user["id"], "created_at": now_iso(),
    })
    await ensure_membership(user["id"], workspace_id, role="owner")
    from deps import ensure_personal_ai_chat
    await ensure_personal_ai_chat(user["id"], workspace_id)

    await db.invite_codes.update_one(
        {"code": code}, {"$inc": {"used_count": 1}, "$set": {"updated_at": now_iso()}})
    await db.invite_redemptions.insert_one({
        "id": new_id(), "code": code, "campaign_id": doc.get("campaign_id"),
        "user_id": user["id"], "email": email, "access_level": level, "created_at": now_iso(),
    })
    # Personal invite? mark accepted + notify inviter (team multiplier counts these).
    inv = await db.user_invites.find_one({"invite_code": code}, {"_id": 0})
    if inv:
        await db.user_invites.update_one(
            {"id": inv["id"]},
            {"$set": {"status": "accepted", "accepted_by_user_id": user["id"],
                      "recipient_email": email, "accepted_at": now_iso()}})
        await _apply_team_unlocks(inv["inviter_user_id"])
        send_launch_email_bg(
            "friend_joined", inv["inviter_email"], "Your TeamNest invite was accepted 🎉",
            f"{payload.name} joined from your invite",
            f"{payload.name} ({email}) just claimed one of your invites and joined the private beta.",
            "View your invites", "https://teamnest.ai/invites")
    # Waitlist conversion
    await db.waitlist_users.update_one(
        {"email": email}, {"$set": {"status": "converted", "updated_at": now_iso()}})
    await grant_personal_invites(user["id"], email, invites_granted, "demo")
    await track_event("code_redeemed", {"code": code, "email": email, "level": level})
    send_launch_email_bg(
        "code_claimed", email, "Welcome to the TeamNest.ai private beta",
        f"You're in — {lv['name']} unlocked",
        f"Your invite code {code} was accepted. You now have {lv['name']} plus {invites_granted} invites to share with your team.",
        "Open TeamNest", "https://teamnest.ai/dashboard")

    token = create_token(user["id"])
    set_session_cookie(response, token)
    return {
        "token": token, "user": public_user(user),
        "workspaces": await list_user_workspaces(user["id"]),
        "access_level": level, "access_name": lv["name"],
        "invites_granted": invites_granted, "badges": badges,
    }


async def _apply_team_unlocks(inviter_user_id: str) -> None:
    joined = await db.user_invites.count_documents(
        {"inviter_user_id": inviter_user_id, "status": "accepted"})
    unlocks = [t["unlock"] for t in TEAM_MULTIPLIER if joined >= t["joins"]]
    if unlocks:
        await db.users.update_one(
            {"id": inviter_user_id},
            {"$set": {"launch_access.team_unlocks": unlocks}})


# ─── Code drops ──────────────────────────────────────────────────────────────
@router.get("/launch/drop/{code}")
async def get_drop(code: str):
    await ensure_seed()
    drop = await db.code_drops.find_one({"code": code.strip().upper()}, {"_id": 0})
    if not drop:
        raise HTTPException(404, "Drop not found")
    cd = await db.invite_codes.find_one({"code": drop["code"]}, {"_id": 0})
    state = code_state(cd)
    lv = ACCESS_LEVELS.get(drop["access_level"], {})
    await track_event("drop_viewed", {"code": drop["code"]})
    return {
        "code": drop["code"], "title": drop["title"], "description": drop.get("description"),
        "state": state, "max_uses": drop["max_uses"],
        "used": int((cd or {}).get("used_count", 0)),
        "remaining": max(0, drop["max_uses"] - int((cd or {}).get("used_count", 0))),
        "expires_at": drop.get("expires_at"), "access_name": lv.get("name"),
        "invites_granted": drop.get("invites_granted", 4), "source": drop.get("source"),
    }


# ─── Authed: my access + my invites ─────────────────────────────────────────
@router.get("/launch/my-access")
async def my_access(current=Depends(require_user)):
    await ensure_seed()
    s = await get_settings()
    u = await db.users.find_one({"id": current["id"]}, {"_id": 0, "launch_access": 1})
    la = (u or {}).get("launch_access")
    from services.launch_core import CHECKOUT_ELIGIBLE
    can_checkout = (
        s["mode"] == "open" or s.get("allow_public_checkout")
        or la is None
        or (s.get("allow_invited_upgrade") and la.get("status") in CHECKOUT_ELIGIBLE))
    lv = ACCESS_LEVELS.get((la or {}).get("level") or "", {})
    return {
        "launch_access": la, "can_checkout": bool(can_checkout),
        "plan_eligibility": lv.get("plans") if la else None,
        "badges": [{"key": b, **BADGES[b]} for b in (la or {}).get("badges", []) if b in BADGES],
        "mode": s["mode"],
    }


@router.get("/launch/my-invites")
async def my_invites(current=Depends(require_user)):
    invites = await db.user_invites.find(
        {"inviter_user_id": current["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    remaining = sum(1 for i in invites if i["status"] == "unused")
    joined = sum(1 for i in invites if i["status"] == "accepted")
    u = await db.users.find_one({"id": current["id"]}, {"_id": 0, "launch_access": 1})
    la = (u or {}).get("launch_access") or {}
    nxt = next((t for t in TEAM_MULTIPLIER if joined < t["joins"]), None)
    return {
        "invites": invites, "remaining": remaining, "accepted": joined,
        "team_multiplier": TEAM_MULTIPLIER, "team_unlocks": la.get("team_unlocks", []),
        "next_unlock": nxt,
        "badges": [{"key": b, **BADGES[b]} for b in la.get("badges", []) if b in BADGES],
    }


class SendInvite(BaseModel):
    email: EmailStr


@router.post("/launch/my-invites/{invite_id}/send")
async def send_invite(invite_id: str, payload: SendInvite, current=Depends(require_user)):
    inv = await db.user_invites.find_one(
        {"id": invite_id, "inviter_user_id": current["id"]}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invite not found")
    if inv["status"] != "unused":
        raise HTTPException(400, "Invite already used or pending")
    await db.user_invites.update_one(
        {"id": invite_id},
        {"$set": {"status": "pending", "recipient_email": payload.email.lower()}})
    send_launch_email_bg(
        "invite_received", payload.email.lower(), "Invite to TeamNest.ai Private Beta",
        f"{current['name']} invited you to TeamNest.ai",
        f"I wanted to invite you to TeamNest.ai private beta. It is an AI workspace where teams can collaborate, use AI employees, and build software directly inside chat. Use invite code <b style='color:#fbbf24;font-family:monospace'>{inv['invite_code']}</b>.",
        "Claim your invite", f"https://teamnest.ai/invite?code={inv['invite_code']}")
    await track_event("invite_emailed", {"by": current["id"], "to": payload.email.lower()})
    return {"ok": True}


class TrackPayload(BaseModel):
    event: str
    meta: Optional[dict] = None


@router.post("/launch/track")
async def track(payload: TrackPayload):
    if payload.event not in ("pricing_view", "checkout_start", "checkout_blocked_view", "drop_claim_click"):
        raise HTTPException(400, "Unknown event")
    await track_event(payload.event, payload.meta or {})
    return {"ok": True}
