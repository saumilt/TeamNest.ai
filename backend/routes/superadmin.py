"""Super-admin, app-level (global) platform settings.

Only platform super admins (deps.is_super_admin) can read/update these. It
exposes the per-plan monthly credit allowances plus a set of boolean feature
flags that gate core platform capabilities app-wide:
  - public_signup             (invite-only vs open to public — backed by launch_settings)
  - allow_workspace_deletion  (owners may close/delete their workspace)
  - allow_subuser_deletion    (admins may remove members from group chats)
  - require_template_approval (marketplace submissions need admin approval)
"""
from typing import Optional

import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import db, is_super_admin, new_id, now_iso, require_super_admin
from services import mailgun_service
from services.platform_settings import (
    BOOL_DEFAULTS,
    DEFAULTS,
    get_platform_settings,
    set_platform_settings,
)

router = APIRouter()


class PlatformSettingsPatch(BaseModel):
    free_monthly_credits: Optional[int] = None
    pro_monthly_credits: Optional[int] = None
    team_monthly_credits: Optional[int] = None
    allow_workspace_deletion: Optional[bool] = None
    allow_subuser_deletion: Optional[bool] = None
    require_template_approval: Optional[bool] = None
    # Backed by launch_settings (single source of truth for the signup gate).
    public_signup: Optional[bool] = None


DEFAULTS_OUT = {**DEFAULTS, **BOOL_DEFAULTS, "public_signup": False}


async def _public_signup_enabled() -> bool:
    """Invite-only launch is 'off' when the launch mode is open (or open signup
    is explicitly allowed)."""
    from services.launch_core import get_settings
    ls = await get_settings()
    return ls.get("mode") == "open" or bool(ls.get("allow_open_signup"))


async def _set_public_signup(enabled: bool) -> None:
    """Flip the launch gate so it takes effect immediately for /auth/signup."""
    from services.launch_core import get_settings
    await get_settings()  # ensure the doc exists
    patch = (
        {"mode": "open", "allow_open_signup": True}
        if enabled
        else {"mode": "invite_only", "allow_open_signup": False}
    )
    await db.launch_settings.update_one({"id": "global"}, {"$set": patch}, upsert=True)


async def _settings_payload() -> dict:
    data = await get_platform_settings(force=True)
    data["public_signup"] = await _public_signup_enabled()
    return data


@router.get("/superadmin/settings")
async def read_settings(current=Depends(require_super_admin)):
    return {"settings": await _settings_payload(), "defaults": DEFAULTS_OUT}


@router.put("/superadmin/settings")
async def update_settings(
    payload: PlatformSettingsPatch, current=Depends(require_super_admin)
):
    body = payload.dict()
    public_signup = body.pop("public_signup", None)
    patch = {k: v for k, v in body.items() if v is not None}
    try:
        if patch:
            await set_platform_settings(patch)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if public_signup is not None:
        await _set_public_signup(bool(public_signup))
    return {"settings": await _settings_payload(), "defaults": DEFAULTS_OUT}



# ════════════════════════════════════════════════════════════════════════
# Workspace management
# ════════════════════════════════════════════════════════════════════════
async def _ws_row(ws: dict) -> dict:
    from services.billing import get_usage
    ws_id = ws["id"]
    owner = None
    if ws.get("owner_id"):
        owner = await db.users.find_one({"id": ws["owner_id"]}, {"_id": 0, "name": 1, "email": 1})
    members = await db.users.count_documents(
        {"workspace_id": ws_id, "status": {"$ne": "removed"}}
    )
    usage = await get_usage(ws_id)
    return {
        "id": ws_id,
        "name": ws.get("name"),
        "status": ws.get("status", "active"),
        "owner_name": (owner or {}).get("name"),
        "owner_email": (owner or {}).get("email"),
        "members": members,
        "plan_id": usage["plan_id"],
        "plan_name": usage["plan_name"],
        "credits_remaining": usage["credits_remaining"],
        "credits_total": usage["credits_total"],
        "monthly_credits": usage["monthly_credits"],
        "unlimited": usage["unlimited"],
        "created_at": ws.get("created_at"),
    }


@router.get("/superadmin/workspaces")
async def list_workspaces(search: str = "", limit: int = 100, current=Depends(require_super_admin)):
    q: dict = {}
    if search.strip():
        q = {"name": {"$regex": search.strip(), "$options": "i"}}
    rows = await db.workspaces.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 200))
    return {"workspaces": [await _ws_row(w) for w in rows]}


@router.get("/superadmin/workspaces/{ws_id}")
async def workspace_detail(ws_id: str, current=Depends(require_super_admin)):
    ws = await db.workspaces.find_one({"id": ws_id}, {"_id": 0})
    if not ws:
        raise HTTPException(404, "Workspace not found")
    row = await _ws_row(ws)
    members = await db.users.find(
        {"workspace_id": ws_id}, {"_id": 0, "password_hash": 0}
    ).to_list(200)
    row["member_list"] = [
        {"id": m["id"], "name": m.get("name"), "email": m.get("email"),
         "role": m.get("role", "member"), "status": m.get("status", "active")}
        for m in members
    ]
    return row


class WorkspacePatch(BaseModel):
    plan_id: Optional[str] = None          # free | pro | team
    monthly_credits: Optional[int] = None  # recurring override; -1 clears it
    suspended: Optional[bool] = None


@router.patch("/superadmin/workspaces/{ws_id}")
async def update_workspace(ws_id: str, payload: WorkspacePatch, current=Depends(require_super_admin)):
    from services.billing import PLANS, apply_plan_change, set_monthly_override
    ws = await db.workspaces.find_one({"id": ws_id}, {"_id": 0})
    if not ws:
        raise HTTPException(404, "Workspace not found")

    if payload.plan_id is not None:
        if payload.plan_id not in PLANS:
            raise HTTPException(400, f"Unknown plan: {payload.plan_id}")
        await apply_plan_change(ws_id, plan_id=payload.plan_id)

    if payload.monthly_credits is not None:
        await set_monthly_override(
            ws_id, None if payload.monthly_credits < 0 else payload.monthly_credits
        )

    if payload.suspended is not None:
        new_status = "suspended" if payload.suspended else "active"
        await db.workspaces.update_one(
            {"id": ws_id}, {"$set": {"status": new_status, "updated_at": now_iso()}}
        )
        # Suspension cascades to the workspace's members so it actually blocks
        # access. deps.get_user() overlays the per-workspace membership status
        # onto the user, so we MUST update workspace_members (updating
        # users.status alone is overridden by that overlay). Owners of OTHER
        # active workspaces are unaffected — only this membership is flipped.
        await db.workspace_members.update_many(
            {"workspace_id": ws_id, "status": {"$ne": "removed"}},
            {"$set": {"status": new_status}},
        )
        await db.users.update_many(
            {"workspace_id": ws_id, "status": {"$ne": "removed"}},
            {"$set": {"status": new_status}},
        )

    ws = await db.workspaces.find_one({"id": ws_id}, {"_id": 0})
    return await _ws_row(ws)


class CreditTopUp(BaseModel):
    amount: int  # positive adds a one-time top-up; negative deducts


@router.post("/superadmin/workspaces/{ws_id}/credits")
async def topup_workspace_credits(ws_id: str, payload: CreditTopUp, current=Depends(require_super_admin)):
    from services.billing import add_extra_credits
    if not await db.workspaces.find_one({"id": ws_id}, {"_id": 1}):
        raise HTTPException(404, "Workspace not found")
    usage = await add_extra_credits(ws_id, payload.amount)
    return {"ok": True, "usage": usage}


@router.delete("/superadmin/workspaces/{ws_id}")
async def delete_workspace(ws_id: str, current=Depends(require_super_admin)):
    from services.account_deletion import _delete_workspace_data
    ws = await db.workspaces.find_one({"id": ws_id}, {"_id": 0})
    if not ws:
        raise HTTPException(404, "Workspace not found")
    await _delete_workspace_data(ws_id)
    # Remove users whose home workspace was this one.
    await db.users.delete_many({"workspace_id": ws_id})
    return {"ok": True, "deleted_workspace": ws_id}


# ════════════════════════════════════════════════════════════════════════
# User management
# ════════════════════════════════════════════════════════════════════════
@router.get("/superadmin/users")
async def list_users(search: str = "", limit: int = 100, current=Depends(require_super_admin)):
    q: dict = {}
    if search.strip():
        s = search.strip()
        q = {"$or": [
            {"email": {"$regex": s, "$options": "i"}},
            {"name": {"$regex": s, "$options": "i"}},
        ]}
    rows = await db.users.find(q, {"_id": 0, "password_hash": 0}) \
        .sort("created_at", -1).to_list(min(limit, 300))
    ws_ids = list({u.get("workspace_id") for u in rows if u.get("workspace_id")})
    ws_map = {}
    if ws_ids:
        async for w in db.workspaces.find({"id": {"$in": ws_ids}}, {"_id": 0, "id": 1, "name": 1}):
            ws_map[w["id"]] = w.get("name")
    out = []
    for u in rows:
        out.append({
            "id": u["id"], "name": u.get("name"), "email": u.get("email"),
            "role": u.get("role", "member"), "status": u.get("status", "active"),
            "workspace_id": u.get("workspace_id"),
            "workspace_name": ws_map.get(u.get("workspace_id")),
            "is_super_admin": is_super_admin(u),
            "created_at": u.get("created_at"),
        })
    return {"users": out}


class NewUser(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str
    password: str = Field(min_length=1, max_length=200)
    workspace_id: Optional[str] = None  # existing ws to join, else a new one
    role: str = "member"
    credits: int = 0                    # optional one-time credit top-up
    send_credentials: bool = False      # email login + a reset link to the user
    cc: Optional[list] = None           # extra recipients to CC on that email
    must_change_password: bool = True


async def _send_credentials_email(name: str, email: str, password: str,
                                  user_id: str, cc: Optional[list]) -> None:
    """Email a newly-provisioned user their login + a single-use reset link."""
    import hashlib
    import secrets
    from datetime import datetime, timedelta, timezone

    raw = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.password_reset_tokens.insert_one({
        "id": new_id(), "user_id": user_id,
        "token_hash": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
        "used": False, "created_at": now,
        "expires_at": now + timedelta(minutes=60),
    })
    base = (os.environ.get("PUBLIC_BACKEND_URL") or "").rstrip("/")
    link = f"{base}/reset-password?token={raw}"
    html = f"""
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#18181b">
        <h2 style="margin:0 0 12px">Welcome to TeamNest</h2>
        <p>Hi {name or 'there'}, an account has been created for you on TeamNest.</p>
        <p style="background:#f4f4f5;border-radius:10px;padding:14px 16px;line-height:1.7">
          <strong>Sign in:</strong> <a href="{base}/login">{base}/login</a><br/>
          <strong>User ID (email):</strong> {email}<br/>
          <strong>Temporary password:</strong> {password}
        </p>
        <p>For security, please set your own password using this single-use link (valid 1 hour):</p>
        <p><a href="{link}" style="display:inline-block;background:#f5b301;color:#000;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:999px">Set your password</a></p>
        <p style="font-size:12px;color:#71717a">If the button doesn't work, paste this into your browser:<br/>{link}</p>
      </div>"""
    text = (f"Welcome to TeamNest.\nSign in: {base}/login\nUser ID: {email}\n"
            f"Temporary password: {password}\nSet your own password (valid 1h): {link}")
    await mailgun_service.send_email(
        to=[email], cc=[c for c in (cc or []) if c], subject="Your TeamNest account",
        html=html, text=text, tags={"type": "credentials"})


@router.post("/superadmin/users")
async def create_user(payload: NewUser, current=Depends(require_super_admin)):
    from auth_utils import hash_password, password_complexity_error
    from deps import ensure_personal_ai_chat
    from services.workspace_membership import ensure_membership

    email = payload.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "A valid email is required")
    pw_err = password_complexity_error(payload.password)
    if pw_err:
        raise HTTPException(400, pw_err)
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")

    if payload.workspace_id:
        ws = await db.workspaces.find_one({"id": payload.workspace_id}, {"_id": 0})
        if not ws:
            raise HTTPException(404, "Workspace not found")
        workspace_id = ws["id"]
        role = payload.role if payload.role in ("owner", "admin", "member") else "member"
        is_owner = False
    else:
        workspace_id = new_id()
        role = "owner"
        is_owner = True

    uid = new_id()
    user = {
        "id": uid, "name": payload.name.strip(), "email": email,
        "phone": None, "phone_normalized": None, "phone_hash": None,
        "password_hash": hash_password(payload.password), "avatar": None,
        "role": role, "workspace_id": workspace_id, "status": "active",
        "must_change_password": bool(payload.must_change_password), "created_at": now_iso(),
        "temp_password_issued_at": now_iso() if payload.must_change_password else None,
    }
    await db.users.insert_one(user.copy())
    if is_owner:
        await db.workspaces.insert_one({
            "id": workspace_id, "name": f"{payload.name.strip()}'s Workspace",
            "owner_id": uid, "created_at": now_iso(),
        })
    await ensure_membership(uid, workspace_id, role=role)
    await ensure_personal_ai_chat(uid, workspace_id)

    credited = 0
    if payload.credits and payload.credits > 0:
        from services.billing import add_extra_credits
        await add_extra_credits(workspace_id, int(payload.credits))
        credited = int(payload.credits)
    emailed = False
    if payload.send_credentials:
        try:
            await _send_credentials_email(payload.name.strip(), email, payload.password, uid, payload.cc)
            emailed = True
        except Exception:
            emailed = False
    return {"ok": True, "id": uid, "email": email, "workspace_id": workspace_id,
            "credits_added": credited, "credentials_emailed": emailed}


class UserPatch(BaseModel):
    status: Optional[str] = None          # active | suspended
    is_super_admin: Optional[bool] = None
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None            # owner | admin | member


@router.get("/superadmin/users/{uid}")
async def user_detail(uid: str, current=Depends(require_super_admin)):
    user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(404, "User not found")
    ws_name = None
    if user.get("workspace_id"):
        ws = await db.workspaces.find_one({"id": user["workspace_id"]}, {"_id": 0, "name": 1})
        ws_name = (ws or {}).get("name")
    plan = None
    if user.get("workspace_id"):
        try:
            from services.billing import get_usage
            usage = await get_usage(user["workspace_id"])
            plan = {"plan_id": usage["plan_id"], "plan_name": usage["plan_name"],
                    "credits_remaining": usage["credits_remaining"],
                    "credits_total": usage["credits_total"], "unlimited": usage["unlimited"]}
        except Exception:
            plan = None
    return {
        "id": user["id"], "name": user.get("name"), "email": user.get("email"),
        "role": user.get("role", "member"), "status": user.get("status", "active"),
        "is_super_admin": is_super_admin(user),
        "workspace_id": user.get("workspace_id"), "workspace_name": ws_name,
        "phone": user.get("phone"), "avatar": user.get("avatar"),
        "must_change_password": bool(user.get("must_change_password")),
        "edu_verified": bool(user.get("edu_verified")), "edu_email": user.get("edu_email"),
        "created_at": user.get("created_at"), "updated_at": user.get("updated_at"),
        "last_login_at": user.get("last_login_at"),
        "plan": plan,
    }


@router.patch("/superadmin/users/{uid}")
async def update_user(uid: str, payload: UserPatch, current=Depends(require_super_admin)):
    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not found")
    update: dict = {}
    if payload.status is not None:
        if payload.status not in ("active", "suspended"):
            raise HTTPException(400, "status must be 'active' or 'suspended'")
        if uid == current["id"] and payload.status == "suspended":
            raise HTTPException(400, "You can't suspend your own account")
        update["status"] = payload.status
        # Mirror onto membership so the effective status resolves consistently.
        await db.workspace_members.update_many(
            {"user_id": uid}, {"$set": {"status": payload.status}}
        )
    if payload.is_super_admin is not None:
        if uid == current["id"] and payload.is_super_admin is False:
            raise HTTPException(400, "You can't revoke your own super-admin access")
        update["is_super_admin"] = bool(payload.is_super_admin)
    if payload.name is not None:
        nm = payload.name.strip()
        if not nm:
            raise HTTPException(400, "Name can't be empty")
        update["name"] = nm
    if payload.email is not None:
        new_email = payload.email.strip().lower()
        if "@" not in new_email:
            raise HTTPException(400, "A valid email is required")
        if new_email != user.get("email"):
            clash = await db.users.find_one({"email": new_email, "id": {"$ne": uid}}, {"_id": 1})
            if clash:
                raise HTTPException(400, "That email is already registered to another user")
            update["email"] = new_email
    if payload.role is not None:
        if payload.role not in ("owner", "admin", "member"):
            raise HTTPException(400, "role must be owner, admin or member")
        update["role"] = payload.role
        await db.workspace_members.update_many(
            {"user_id": uid, "workspace_id": user.get("workspace_id")},
            {"$set": {"role": payload.role}},
        )
    if update:
        update["updated_at"] = now_iso()
        await db.users.update_one({"id": uid}, {"$set": update})
    return {"ok": True, **update}


class ResetPassword(BaseModel):
    new_password: Optional[str] = None    # omit to auto-generate a strong one
    send_email: bool = True               # email the new password to the user


def _generate_temp_password() -> str:
    """A strong temp password that satisfies the complexity policy."""
    import secrets
    import string
    while True:
        pool = string.ascii_letters + string.digits + "!@#$%^&*"
        pw = "".join(secrets.choice(pool) for _ in range(14))
        from auth_utils import password_complexity_error
        if not password_complexity_error(pw):
            return pw


async def _send_new_password_email(name: str, email: str, password: str) -> dict:
    base = (os.environ.get("PUBLIC_BACKEND_URL") or "").rstrip("/")
    html = f"""
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#18181b">
        <h2 style="margin:0 0 12px">Your TeamNest password was reset</h2>
        <p>Hi {name or 'there'}, an administrator has reset your TeamNest password.</p>
        <p style="background:#f4f4f5;border-radius:10px;padding:14px 16px;line-height:1.7">
          <strong>Sign in:</strong> <a href="{base}/login">{base}/login</a><br/>
          <strong>User ID (email):</strong> {email}<br/>
          <strong>New temporary password:</strong> {password}
        </p>
        <p style="font-size:13px;color:#52525b">For your security, you'll be asked to choose a new password the next time you sign in.</p>
      </div>"""
    text = (f"Your TeamNest password was reset.\nSign in: {base}/login\n"
            f"User ID: {email}\nNew temporary password: {password}\n"
            "You'll be asked to set a new password on next login.")
    return await mailgun_service.send_email(
        to=[email], subject="Your TeamNest password was reset",
        html=html, text=text, tags={"type": "password_reset"})


@router.post("/superadmin/users/{uid}/reset-password")
async def reset_user_password(uid: str, payload: ResetPassword, current=Depends(require_super_admin)):
    """Set (or auto-generate) a temporary password for a user, flag it for a
    forced change on next login, and — by default — EMAIL the new password to
    the user. Returns the password so an admin can share it manually if the
    email doesn't arrive."""
    from auth_utils import hash_password, password_complexity_error
    user = await db.users.find_one({"id": uid}, {"_id": 0, "email": 1, "name": 1})
    if not user:
        raise HTTPException(404, "User not found")

    new_password = payload.new_password
    if new_password:
        pw_err = password_complexity_error(new_password)
        if pw_err:
            raise HTTPException(400, pw_err)
    else:
        new_password = _generate_temp_password()

    await db.users.update_one(
        {"id": uid},
        {"$set": {"password_hash": hash_password(new_password),
                  "must_change_password": True, "temp_password_issued_at": now_iso(),
                  "updated_at": now_iso()}},
    )
    email_result = {"ok": False, "reason": "skipped"}
    if payload.send_email:
        email_result = await _send_new_password_email(user.get("name"), user["email"], new_password)
    return {
        "ok": True, "email": user["email"], "password": new_password,
        "email_sent": bool(email_result.get("ok")),
        "email_reason": email_result.get("reason"),
    }

class ResetLinkRequest(BaseModel):
    email: Optional[str] = None
    uid: Optional[str] = None
    send_email: bool = True


@router.post("/superadmin/users/reset-link")
async def generate_reset_link(payload: ResetLinkRequest, current=Depends(require_super_admin)):
    """Mint a single-use, 1-hour password-reset link for a user, optionally
    email it, and ALWAYS return the link so an admin can copy/share it directly
    when email delivery is unreliable (e.g. corporate spam filters)."""
    import hashlib
    import secrets
    from datetime import datetime, timedelta, timezone

    if payload.uid:
        q = {"id": payload.uid}
    elif payload.email:
        q = {"email": payload.email.strip().lower()}
    else:
        raise HTTPException(400, "Provide an email or uid")
    user = await db.users.find_one(q, {"_id": 0, "id": 1, "email": 1, "name": 1})
    if not user:
        raise HTTPException(404, "No user found with that email/ID")

    raw = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.password_reset_tokens.insert_one({
        "id": new_id(), "user_id": user["id"],
        "token_hash": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
        "used": False, "created_at": now,
        "expires_at": now + timedelta(minutes=60),
    })
    base = (os.environ.get("PUBLIC_BACKEND_URL") or "").rstrip("/")
    link = f"{base}/reset-password?token={raw}"

    email_result = {"ok": False, "reason": "skipped"}
    if payload.send_email:
        from services.password_reset_email import send_reset_email
        email_result = await send_reset_email(user.get("name"), user["email"], link)
    return {
        "ok": True,
        "email": user["email"],
        "reset_link": link,
        "expires_in_minutes": 60,
        "email_sent": bool(email_result.get("ok")),
        "email_reason": email_result.get("reason"),
    }




@router.delete("/superadmin/users/{uid}")
async def delete_user(uid: str, current=Depends(require_super_admin)):
    if uid == current["id"]:
        raise HTTPException(400, "You can't delete your own account here")
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(404, "User not found")
    from services.account_deletion import delete_user_account
    result = await delete_user_account(user)
    return {"ok": True, **result}


# ════════════════════════════════════════════════════════════════════════
# Invites — invite potential customers
# ════════════════════════════════════════════════════════════════════════
class InviteRequest(BaseModel):
    email: Optional[str] = None
    access_level: str = "dev_os_demo"
    count: int = 1
    send_email: bool = False


@router.post("/superadmin/invites")
async def create_invites(payload: InviteRequest, current=Depends(require_super_admin)):
    from services.launch_core import grant_personal_invites, send_launch_email_bg
    count = max(1, min(int(payload.count), 25))
    invites = await grant_personal_invites(
        current["id"], current["email"], count, access_level=payload.access_level,
    )
    codes = [i["invite_code"] for i in invites]
    email = (payload.email or "").strip().lower()
    if email and payload.send_email and codes:
        link = f"https://teamnest.ai/invite?code={codes[0]}"
        await db.user_invites.update_one(
            {"invite_code": codes[0]}, {"$set": {"recipient_email": email}}
        )
        send_launch_email_bg(
            kind="invite", to=email,
            subject="You're invited to TeamNest.ai",
            title="Your invite to TeamNest.ai",
            body=f"You've been personally invited to TeamNest.ai. Use code <b>{codes[0]}</b> to claim your access.",
            cta_text="Claim your invite", cta_url=link,
        )
    return {"ok": True, "codes": codes, "emailed": bool(email and payload.send_email)}


@router.get("/superadmin/invites")
async def list_invites(limit: int = 50, current=Depends(require_super_admin)):
    rows = await db.user_invites.find(
        {"inviter_user_id": current["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(min(limit, 200))
    return {"invites": [
        {"code": r.get("invite_code"), "recipient_email": r.get("recipient_email"),
         "status": r.get("status"), "access_level": r.get("access_level"),
         "expires_at": r.get("expires_at"), "created_at": r.get("created_at")}
        for r in rows
    ]}
