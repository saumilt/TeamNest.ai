"""TeamNest invite-only launch system — core service.

Collections: launch_settings, waitlist_users, invite_codes, invite_campaigns,
invite_redemptions, referrals, user_invites, access_levels, code_drops,
launch_badges, waitlist_events, invite_notifications, launch_counters.
"""
import asyncio
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from deps import db, logger, new_id, now_iso

# ─── Access levels ───────────────────────────────────────────────────────────
ACCESS_LEVELS: Dict[str, Dict[str, Any]] = {
    "waitlist_only": {"name": "Waitlist Only", "description": "View waitlist dashboard only", "features": ["waitlist_dashboard"], "credit_limit": 0, "invite_count": 0, "badge": None, "plans": []},
    "demo": {"name": "Demo Access", "description": "Limited demo workspace", "features": ["chat", "tasks"], "credit_limit": 100, "invite_count": 4, "badge": "teamnest_insider", "plans": ["starter", "pro"]},
    "dev_os_demo": {"name": "Dev OS Demo", "description": "@devmanager in demo build room with credit limits", "features": ["chat", "dev_os"], "credit_limit": 150, "invite_count": 4, "badge": "devos_beta_tester", "plans": ["starter", "pro"]},
    "ai_employees_demo": {"name": "AI Employees Demo", "description": "AI employee directory + limited workflows", "features": ["chat", "ai_employees"], "credit_limit": 100, "invite_count": 4, "badge": "ai_employee_pioneer", "plans": ["starter", "pro"]},
    "team_collab_demo": {"name": "Team Collaboration Demo", "description": "Chat, tasks and approvals", "features": ["chat", "tasks", "approvals"], "credit_limit": 100, "invite_count": 4, "badge": "teamnest_insider", "plans": ["starter", "pro"]},
    "founder_beta": {"name": "Founder Beta", "description": "More credits, more invites, founder badge", "features": ["all"], "credit_limit": 500, "invite_count": 10, "badge": "founding_member", "plans": ["starter", "pro", "business", "founder_lifetime"]},
    "agency_beta": {"name": "Agency Beta", "description": "Agency & client collaboration beta", "features": ["all"], "credit_limit": 300, "invite_count": 6, "badge": "agency_partner", "plans": ["business", "enterprise", "agency"]},
    "restaurant_ops_beta": {"name": "Restaurant Operations Beta", "description": "Restaurant ops workflows beta", "features": ["chat", "tasks", "dev_os"], "credit_limit": 200, "invite_count": 4, "badge": "restaurant_ops_beta", "plans": ["restaurant_ops"]},
    "full_beta": {"name": "Full Private Beta", "description": "Access to the full product prototype", "features": ["all"], "credit_limit": 300, "invite_count": 4, "badge": "early_builder", "plans": ["starter", "pro", "business", "enterprise"]},
}

BADGES: Dict[str, Dict[str, str]] = {
    "founding_member": {"name": "Founding Member", "icon": "crown"},
    "early_builder": {"name": "Early Builder", "icon": "hammer"},
    "devos_beta_tester": {"name": "Dev OS Beta Tester", "icon": "code"},
    "ai_employee_pioneer": {"name": "AI Employee Pioneer", "icon": "bot"},
    "invite_champion": {"name": "Invite Champion", "icon": "trophy"},
    "teamnest_insider": {"name": "TeamNest Insider", "icon": "key"},
    "agency_partner": {"name": "Agency Partner", "icon": "briefcase"},
    "restaurant_ops_beta": {"name": "Restaurant Ops Beta", "icon": "utensils"},
}

MILESTONES = [
    {"referrals": 1, "reward": "Move up 50 spots"},
    {"referrals": 3, "reward": "Priority review"},
    {"referrals": 5, "reward": "Private demo access unlocked"},
    {"referrals": 10, "reward": "Founding Member badge"},
    {"referrals": 25, "reward": "Bonus AI credits"},
    {"referrals": 50, "reward": "Private onboarding call"},
]

TEAM_MULTIPLIER = [
    {"joins": 2, "unlock": "team_chat_demo", "label": "Team Chat demo"},
    {"joins": 4, "unlock": "dev_os_demo", "label": "Dev OS demo"},
    {"joins": 6, "unlock": "ai_employees_demo", "label": "AI Employees demo"},
    {"joins": 10, "unlock": "beta_workspace_30d", "label": "Beta workspace for 30 days"},
]

CHECKOUT_ELIGIBLE = {"invited", "approved", "demo", "founder_beta", "full_beta", "paid_member"}

DEFAULT_SETTINGS = {
    "id": "global",
    "mode": "invite_only",  # invite_only | waitlist | approved_only | open
    "allow_open_signup": False,
    "allow_public_pricing": False,
    "allow_public_checkout": False,
    "allow_invited_upgrade": True,
    "allow_waitlist_pricing_preview": False,
    "require_invite_before_checkout": True,
    "require_admin_approval_before_checkout": False,
}


# ─── Settings ────────────────────────────────────────────────────────────────
async def get_settings() -> Dict[str, Any]:
    s = await db.launch_settings.find_one({"id": "global"}, {"_id": 0})
    if not s:
        await db.launch_settings.update_one(
            {"id": "global"}, {"$setOnInsert": DEFAULT_SETTINGS}, upsert=True)
        s = dict(DEFAULT_SETTINGS)
    return s


# ─── Helpers ─────────────────────────────────────────────────────────────────
_ALPHABET = string.ascii_uppercase + string.digits


def gen_code(prefix: str = "", length: int = 8) -> str:
    body_len = max(4, length - len(prefix))
    return (prefix + "".join(secrets.choice(_ALPHABET) for _ in range(body_len))).upper()


def gen_referral_code(name: str) -> str:
    stem = "".join(c for c in (name or "TN").upper() if c.isalpha())[:3] or "TN"
    return f"{stem}{secrets.randbelow(900) + 100}"


def computed_rank(wu: Dict[str, Any]) -> int:
    boost = int(wu.get("referral_count", 0)) * 50 + int(wu.get("manual_boost", 0))
    return max(1, int(wu.get("base_position", 1)) - boost)


def code_state(code_doc: Optional[Dict[str, Any]]) -> str:
    """valid | invalid | expired | used | inactive"""
    if not code_doc:
        return "invalid"
    if code_doc.get("status") == "inactive":
        return "inactive"
    exp = code_doc.get("expires_at")
    if exp:
        try:
            if datetime.now(timezone.utc) > datetime.fromisoformat(str(exp).replace("Z", "+00:00")):
                return "expired"
        except (ValueError, TypeError):
            pass
    if int(code_doc.get("used_count", 0)) >= int(code_doc.get("max_uses", 1)):
        return "used"
    return "valid"


async def track_event(event: str, meta: Optional[Dict[str, Any]] = None) -> None:
    await db.waitlist_events.insert_one({
        "id": new_id(), "event": event, "meta": meta or {}, "created_at": now_iso()})


# ─── Email (Mailgun with simulated fallback; always stored for admin preview) ─
def _email_html(title: str, body: str, cta_text: str = "", cta_url: str = "") -> str:
    btn = (
        f'<a href="{cta_url}" style="display:inline-block;background:#fbbf24;color:#09090b;'
        f'font-weight:700;padding:12px 28px;border-radius:999px;text-decoration:none;'
        f'font-size:14px">{cta_text}</a>' if cta_text else "")
    return f"""<table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:32px 0">
<tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#18181b;border:1px solid #27272a;border-radius:16px;padding:36px;font-family:Arial,sans-serif">
<tr><td style="color:#fbbf24;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding-bottom:14px">TeamNest.ai — Private Beta</td></tr>
<tr><td style="color:#fafafa;font-size:22px;font-weight:700;padding-bottom:12px">{title}</td></tr>
<tr><td style="color:#a1a1aa;font-size:14px;line-height:22px;padding-bottom:22px">{body}</td></tr>
<tr><td>{btn}</td></tr>
<tr><td style="color:#52525b;font-size:11px;padding-top:26px">TeamNest.ai — the AI workspace where teams chat, hire AI employees, and build software with @devmanager.</td></tr>
</table></td></tr></table>"""


async def send_launch_email(kind: str, to: str, subject: str, title: str, body: str,
                            cta_text: str = "", cta_url: str = "") -> None:
    """Store a preview record, then attempt Mailgun. Never raises."""
    html = _email_html(title, body, cta_text, cta_url)
    doc = {
        "id": new_id(), "kind": kind, "to": to, "subject": subject,
        "html": html, "status": "queued", "created_at": now_iso(),
    }
    await db.invite_notifications.insert_one(doc.copy())
    try:
        from services.mailgun_service import send_email
        res = await send_email(to=[to], subject=subject, html=html, tags={"kind": kind})
        status = "sent" if res.get("ok") else "simulated"
    except Exception as e:  # noqa: BLE001
        logger.warning("[launch] email send failed: %s", e)
        status = "simulated"
    await db.invite_notifications.update_one({"id": doc["id"]}, {"$set": {"status": status}})


def send_launch_email_bg(*args, **kwargs) -> None:
    asyncio.create_task(send_launch_email(*args, **kwargs))


# ─── Personal invites for approved users ─────────────────────────────────────
async def grant_personal_invites(user_id: str, user_email: str, count: int,
                                 access_level: str = "demo") -> List[Dict[str, Any]]:
    invites = []
    expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    for _ in range(count):
        code = gen_code("TN", 8)
        await db.invite_codes.insert_one({
            "id": new_id(), "code": code, "campaign_id": None, "code_type": "personal",
            "access_level": access_level, "max_uses": 1, "used_count": 0,
            "invites_granted": 4, "expires_at": expires, "allowed_domains": [],
            "source_channel": "personal_invite", "status": "active",
            "created_by": user_id, "created_at": now_iso(), "updated_at": now_iso(),
        })
        inv = {
            "id": new_id(), "inviter_user_id": user_id, "inviter_email": user_email,
            "invite_code": code, "invite_link": f"/invite?code={code}",
            "recipient_email": None, "status": "unused", "access_level": access_level,
            "expires_at": expires, "accepted_by_user_id": None,
            "created_at": now_iso(), "accepted_at": None,
        }
        await db.user_invites.insert_one(inv.copy())
        invites.append(inv)
    return invites


# ─── Checkout gate ───────────────────────────────────────────────────────────
async def ensure_checkout_allowed(current: Dict[str, Any]) -> None:
    """403 when the launch access mode blocks paid checkout for this user."""
    s = await get_settings()
    if s["mode"] == "open" or s.get("allow_public_checkout"):
        return
    la = current.get("launch_access")
    if la is None:
        u = await db.users.find_one({"id": current["id"]}, {"_id": 0, "launch_access": 1})
        la = (u or {}).get("launch_access")
    if la is None:
        return  # grandfathered pre-launch account
    if not s.get("allow_invited_upgrade"):
        await track_event("checkout_blocked", {"user_id": current["id"], "reason": "upgrades_disabled"})
        raise HTTPException(403, "launch_gated:Paid access is currently limited to invited members.")
    status = la.get("status")
    if s.get("require_admin_approval_before_checkout") and status != "approved":
        await track_event("checkout_blocked", {"user_id": current["id"], "reason": "approval_required"})
        raise HTTPException(403, "launch_gated:Paid plans unlock after admin approval.")
    if status not in CHECKOUT_ELIGIBLE:
        await track_event("checkout_blocked", {"user_id": current["id"], "reason": f"status_{status}"})
        raise HTTPException(403, "launch_gated:TeamNest paid plans are currently available only to invited members.")


# ─── Referral milestone processing ───────────────────────────────────────────
async def process_referral(referrer: Dict[str, Any], new_wu_id: str, new_email: str) -> None:
    await db.referrals.insert_one({
        "id": new_id(), "referrer_waitlist_id": referrer["id"],
        "referred_waitlist_id": new_wu_id, "referred_email": new_email,
        "validation_status": "valid", "created_at": now_iso(),
    })
    count = int(referrer.get("referral_count", 0)) + 1
    update: Dict[str, Any] = {"referral_count": count, "updated_at": now_iso()}
    push_badges: List[str] = []
    if count >= 3 and referrer.get("status") == "waiting":
        update["status"] = "priority_review"
    if count >= 10 and "founding_member" not in (referrer.get("badges") or []):
        push_badges.append("founding_member")
    if count >= 25 and "invite_champion" not in (referrer.get("badges") or []):
        push_badges.append("invite_champion")
    ops: Dict[str, Any] = {"$set": update}
    if push_badges:
        ops["$addToSet"] = {"badges": {"$each": push_badges}}
    await db.waitlist_users.update_one({"id": referrer["id"]}, ops)
    if count == 5:
        # Unlock private demo access — send a single-use personal code.
        code = gen_code("TN", 8)
        await db.invite_codes.insert_one({
            "id": new_id(), "code": code, "campaign_id": None, "code_type": "referral_reward",
            "access_level": "demo", "max_uses": 1, "used_count": 0, "invites_granted": 4,
            "expires_at": None, "allowed_domains": [], "source_channel": "referral_milestone",
            "status": "active", "created_by": "system", "created_at": now_iso(), "updated_at": now_iso(),
        })
        await db.waitlist_users.update_one(
            {"id": referrer["id"]}, {"$set": {"status": "invited", "reward_code": code}})
        send_launch_email_bg(
            "demo_unlocked", referrer["email"], "You unlocked TeamNest demo access 🎉",
            "5 referrals — demo access unlocked",
            f"Amazing — 5 friends joined from your link. Use invite code <b style='color:#fbbf24;font-family:monospace'>{code}</b> to claim your private demo access.",
            "Claim access", f"https://teamnest.ai/invite?code={code}")
    else:
        send_launch_email_bg(
            "moved_up", referrer["email"], "You moved up the TeamNest waitlist 🚀",
            "A friend joined from your invite",
            f"{new_email} just joined the waitlist with your link. You've moved up 50 spots — you now have {count} referral(s).",
            "See your rank", f"https://teamnest.ai/waitlist?check={referrer['email']}")


# ─── Idempotent seed (settings, levels, badges, campaigns, mock data) ────────
_seeded = False


async def ensure_seed() -> None:
    global _seeded
    if _seeded:
        return
    _seeded = True
    await get_settings()
    for key, lv in ACCESS_LEVELS.items():
        await db.access_levels.update_one(
            {"key": key}, {"$setOnInsert": {"id": new_id(), "key": key, **lv, "created_at": now_iso()}}, upsert=True)
    for key, b in BADGES.items():
        await db.launch_badges.update_one(
            {"key": key}, {"$setOnInsert": {"id": new_id(), "key": key, **b, "created_at": now_iso()}}, upsert=True)
    await db.launch_counters.update_one(
        {"id": "waitlist"}, {"$setOnInsert": {"id": "waitlist", "next_position": 1247}}, upsert=True)
    if await db.invite_campaigns.count_documents({}) == 0:
        drop_exp = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
        camp_id = new_id()
        await db.invite_campaigns.insert_one({
            "id": camp_id, "campaign_name": "Dev OS Friday Drop", "campaign_type": "social_media_drop",
            "code_prefix": "", "code_length": 8, "total_codes": 1, "max_uses_per_code": 100,
            "access_level": "dev_os_demo", "invites_granted": 4, "source_channel": "linkedin",
            "expires_at": drop_exp, "status": "active", "notes": "Weekly social drop",
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        await db.invite_codes.insert_one({
            "id": new_id(), "code": "DEVOS100", "campaign_id": camp_id, "code_type": "social_media_drop",
            "access_level": "dev_os_demo", "max_uses": 100, "used_count": 17, "invites_granted": 4,
            "expires_at": drop_exp, "allowed_domains": [], "source_channel": "linkedin",
            "status": "active", "created_by": "admin", "created_at": now_iso(), "updated_at": now_iso(),
        })
        await db.code_drops.insert_one({
            "id": new_id(), "campaign_id": camp_id, "code": "DEVOS100",
            "title": "Dev OS Friday Drop", "description": "Use code DEVOS100 to unlock TeamNest Dev OS demo access. Limited to first 100 users.",
            "max_uses": 100, "access_level": "dev_os_demo", "invites_granted": 4,
            "source": "linkedin", "expires_at": drop_exp, "status": "active", "created_at": now_iso(),
        })
        founder_camp = new_id()
        await db.invite_campaigns.insert_one({
            "id": founder_camp, "campaign_name": "Founder Invites", "campaign_type": "founder_invite",
            "code_prefix": "FOUNDR", "code_length": 8, "total_codes": 2, "max_uses_per_code": 25,
            "access_level": "founder_beta", "invites_granted": 10, "source_channel": "direct",
            "expires_at": None, "status": "active", "notes": "Hand-picked founders",
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        for code, mx in (("FOUNDR25", 25), ("BUILD247", 50)):
            await db.invite_codes.insert_one({
                "id": new_id(), "code": code, "campaign_id": founder_camp, "code_type": "founder_invite",
                "access_level": "founder_beta" if code == "FOUNDR25" else "full_beta",
                "max_uses": mx, "used_count": secrets.randbelow(8), "invites_granted": 10 if code == "FOUNDR25" else 4,
                "expires_at": None, "allowed_domains": [], "source_channel": "direct",
                "status": "active", "created_by": "admin", "created_at": now_iso(), "updated_at": now_iso(),
            })
    if await db.waitlist_users.count_documents({}) == 0:
        mocks = [
            ("Sam Torres", "sam.t@buildstack.io", "BuildStack", "Founder", 42, ["invite_champion", "founding_member"]),
            ("Priya Shah", "priya.s@agencylab.co", "AgencyLab", "Agency Owner", 28, ["founding_member"]),
            ("Raj Mehta", "raj.m@fooddash.app", "FoodDash", "Ops Lead", 16, ["founding_member"]),
            ("Elena Costa", "elena@costadev.com", "Costa Dev", "CTO", 9, []),
            ("Marcus Webb", "marcus@webbmedia.tv", "Webb Media", "Producer", 7, []),
            ("Aisha Khan", "aisha@medflow.health", "MedFlow", "Admin Director", 5, []),
            ("Tom Riley", "tom@rileyrealty.com", "Riley Realty", "Broker", 3, []),
            ("Nina Park", "nina@parkanalytics.ai", "Park Analytics", "Data Lead", 2, []),
            ("Dev Patel", "dev@franchiseone.com", "FranchiseOne", "COO", 1, []),
            ("Lucy Chen", "lucy@chenventures.vc", "Chen Ventures", "Partner", 0, []),
        ]
        for i, (name, email, company, role, refs, badges) in enumerate(mocks):
            await db.waitlist_users.insert_one({
                "id": new_id(), "name": name, "email": email, "company": company, "role": role,
                "company_size": "11-50", "use_case": "Build software with @devmanager",
                "interest_area": "devos", "build_answer": "Internal ops dashboard",
                "base_position": 100 + i * 90, "referral_code": gen_referral_code(name),
                "referred_by": None, "referral_count": refs, "manual_boost": 0,
                "access_level": "waitlist_only", "status": "waiting", "badges": badges,
                "source": "mock_seed", "ip_hash": None,
                "created_at": now_iso(), "updated_at": now_iso(),
            })
    logger.info("[launch] seed ensured")
