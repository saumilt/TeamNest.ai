"""Auth + user preferences."""
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from ai_service import MODEL_CONFIG
from auth_utils import (
    clear_session_cookie,
    create_short_lived_token,
    create_token,
    hash_password,
    password_complexity_error,
    set_session_cookie,
    verify_password,
)
from deps import (
    db,
    ensure_personal_ai_chat,
    new_id,
    normalize_phone,
    now_iso,
    public_user,
    require_user,
)
from models import UserLogin, UserPreferences, UserSignup
from services.workspace_membership import ensure_membership, list_user_workspaces

router = APIRouter()


@router.post("/auth/signup")
async def signup(payload: UserSignup, response: Response):
    # Launch gate: during invite-only/waitlist launch, open signup is blocked.
    # New accounts are created via /api/launch/code/redeem instead.
    from services.launch_core import get_settings
    ls = await get_settings()
    if ls["mode"] != "open" and not ls.get("allow_open_signup"):
        raise HTTPException(403, "invite_required")
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    pw_err = password_complexity_error(payload.password)
    if pw_err:
        raise HTTPException(400, pw_err)
    # Phone is optional but, if provided, must not collide with another account.
    phone_norm = normalize_phone(payload.phone)
    if phone_norm:
        phone_clash = await db.users.find_one({"phone_normalized": phone_norm})
        if phone_clash:
            raise HTTPException(400, "Phone number already registered")
    workspace_id = new_id()
    user = {
        "id": new_id(),
        "name": payload.name,
        "email": payload.email.lower(),
        "phone": (payload.phone or "").strip() or None,
        "phone_normalized": phone_norm or None,
        "phone_hash": None,
        "password_hash": hash_password(payload.password),
        "avatar": None,
        "role": "owner",
        "workspace_id": workspace_id,
        "status": "active",
        "created_at": now_iso(),
    }
    if phone_norm:
        from routes.contacts import _hash_phone
        user["phone_hash"] = _hash_phone(phone_norm)
    await db.users.insert_one(user.copy())
    await db.workspaces.insert_one({
        "id": workspace_id,
        "name": f"{payload.name}'s Workspace",
        "owner_id": user["id"],
        "created_at": now_iso(),
    })
    await ensure_membership(user["id"], workspace_id, role="owner")
    await ensure_personal_ai_chat(user["id"], workspace_id)

    # Fire-and-forget welcome email (Mailgun → Resend stub fallback). Wrapping
    # this in a task so signup latency stays unchanged even if Mailgun is slow.
    import asyncio
    from services.welcome_email import send_welcome
    asyncio.create_task(send_welcome(user["name"], user["email"]))

    token = create_token(user["id"])
    set_session_cookie(response, token)
    return {
        "token": token,
        "user": public_user(user),
        "workspaces": await list_user_workspaces(user["id"]),
    }


@router.post("/auth/login")
async def login(payload: UserLogin, response: Response):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid credentials")
    # Provisioned accounts that never completed first login expire their
    # temporary password after the workspace-configured window.
    from services.workspace_settings import temp_password_expired
    if await temp_password_expired(user):
        raise HTTPException(
            403,
            "Your temporary password has expired. Ask your workspace admin to re-invite you.",
        )
    # If user has MFA enabled, gate session issuance behind a passkey/recovery
    # challenge. Return a short-lived mfa_token instead of the session.
    if user.get("mfa_enabled"):
        from routes.mfa import _create_mfa_token
        return {
            "mfa_required": True,
            "mfa_token": _create_mfa_token(user["id"]),
            "email": user["email"],
        }
    token = create_token(user["id"])
    set_session_cookie(response, token)
    return {
        "token": token,
        "user": public_user(user),
        "workspaces": await list_user_workspaces(user["id"]),
    }


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


RESET_TOKEN_TTL_MINUTES = 60


def _hash_reset_token(raw: str) -> str:
    return hashlib.sha256((raw or "").encode("utf-8")).hexdigest()


@router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest):
    """Email a single-use, 1-hour reset link. Always returns a generic success
    so the endpoint can't be used to enumerate registered emails."""
    generic = {
        "ok": True,
        "message": "If an account exists for that email, a reset link has been sent.",
    }
    email = (payload.email or "").strip().lower()
    if not email:
        return generic
    user = await db.users.find_one({"email": email})
    if not user:
        return generic

    raw = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.password_reset_tokens.insert_one({
        "id": new_id(),
        "user_id": user["id"],
        "token_hash": _hash_reset_token(raw),
        "used": False,
        "created_at": now,
        "expires_at": now + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
    })

    base = (os.environ.get("PUBLIC_BACKEND_URL") or "").rstrip("/")
    link = f"{base}/reset-password?token={raw}"
    import asyncio
    from services.password_reset_email import send_reset_email
    asyncio.create_task(send_reset_email(user.get("name"), email, link))
    return generic


@router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    pw_err = password_complexity_error(payload.password)
    if pw_err:
        raise HTTPException(400, pw_err)
    rec = await db.password_reset_tokens.find_one(
        {"token_hash": _hash_reset_token(payload.token), "used": False}
    )
    if not rec:
        raise HTTPException(400, "Invalid or expired reset link")
    exp = rec.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            exp = None
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if not exp or datetime.now(timezone.utc) > exp:
        raise HTTPException(400, "Invalid or expired reset link")

    await db.users.update_one(
        {"id": rec["user_id"]},
        {"$set": {"password_hash": hash_password(payload.password),
                  "must_change_password": False}},
    )
    # Accepting an invite link (kind="invite") also activates the account +
    # membership so the invitee isn't stuck showing as "invited".
    if rec.get("kind") == "invite":
        await db.users.update_one(
            {"id": rec["user_id"], "status": "invited"}, {"$set": {"status": "active"}}
        )
        await db.workspace_members.update_many(
            {"user_id": rec["user_id"], "status": "invited"}, {"$set": {"status": "active"}}
        )
    await db.password_reset_tokens.update_one(
        {"id": rec["id"]}, {"$set": {"used": True, "used_at": now_iso()}}
    )
    return {"ok": True, "message": "Password updated. You can now sign in."}


@router.post("/auth/demo-login")
async def demo_login(response: Response):
    """Quick demo login as Amit Patel (owner).

    On every demo-login we run an inactivity sweep: if the demo workspace has
    been idle for ≥1 hour we wipe the bulk of generated data and reseed a small
    curated sample. This keeps the public demo feeling clean and showcase-y
    instead of slowly degrading as evaluators leave content behind.
    """
    user = await db.users.find_one({"email": "amit@demo.team"})
    if not user:
        # Self-heal: re-seed the demo workspace if it was deleted (e.g. an App
        # Store reviewer exercised account deletion on the demo account).
        try:
            from seed import seed_demo
            await seed_demo(db)
            user = await db.users.find_one({"email": "amit@demo.team"})
        except Exception:
            pass
    if not user:
        raise HTTPException(404, "Demo user not seeded")
    # The public demo owner is also the platform super admin so evaluators can
    # try the app-level settings (e.g. free-plan credit allowance). Idempotent.
    if not user.get("is_super_admin"):
        await db.users.update_one(
            {"id": user["id"]}, {"$set": {"is_super_admin": True}}
        )
        user["is_super_admin"] = True
    # Inactivity cleanup (≥1h idle → wipe + reseed). Wrapped in try/except so
    # a transient mongo issue never blocks a demo login.
    try:
        from services.demo_reset import maybe_run_inactivity_cleanup
        await maybe_run_inactivity_cleanup()
    except Exception as e:
        from deps import logger as _logger
        _logger.warning("[demo-reset] inactivity sweep failed: %s", e)
    # Idempotently seed the showcase Dev OS project so the Build Console /
    # Preview / GitHub flows have something to render — the reset above
    # already seeds it but this guards against any reseed gap.
    try:
        from services.dev_os_sample_seed import seed_franchise_sample
        await seed_franchise_sample(user["workspace_id"], user["id"])
    except Exception:
        pass
    # Idempotently top demo workspace up to 10K AI credits so the AI flows
    # (research, dev agents, image gen, voice) all "just work" for anyone
    # demoing the product without hitting the paywall.
    try:
        from services.billing import ensure_credit_floor
        from services.platform_settings import free_monthly_credits
        await ensure_credit_floor(user["workspace_id"], await free_monthly_credits())
    except Exception:
        pass
    token = create_token(user["id"])
    set_session_cookie(response, token)
    return {
        "token": token,
        "user": public_user(user),
        "workspaces": await list_user_workspaces(user["id"]),
    }


@router.post("/auth/logout")
async def logout(response: Response):
    """Clear the HttpOnly session cookie."""
    clear_session_cookie(response)
    return {"ok": True}


class AccountDeleteRequest(BaseModel):
    password: str
    confirm: str | None = None


@router.delete("/auth/me")
async def delete_account(
    payload: AccountDeleteRequest, response: Response, current=Depends(require_user)
):
    """Permanently delete the signed-in user's account + personal data.

    Requires the current password (destructive, App Store 5.1.1(v) compliant).
    Workspaces solely owned by the user are purged; co-owned ones are transferred.
    """
    if (payload.confirm or "").strip().upper() != "DELETE":
        raise HTTPException(400, "Type DELETE to confirm account deletion")

    # Fetch the FULL user doc (require_user strips password_hash via PROJ).
    full = await db.users.find_one({"id": current["id"]})
    if not full:
        raise HTTPException(404, "Account not found")
    if not verify_password(payload.password, full.get("password_hash") or ""):
        raise HTTPException(403, "Incorrect password")

    from services.account_deletion import delete_user_account
    result = await delete_user_account(full)
    clear_session_cookie(response)
    return {"ok": True, **result}



@router.get("/auth/ws-token")
async def ws_token(current=Depends(require_user)):
    """Return a 5-minute token for the WebSocket upgrade path. Cookies can't be
    sent reliably during a WS handshake, so the frontend exchanges its cookie
    session for a short-lived JWT placed in the WS query string."""
    return {"token": create_short_lived_token(current["id"])}


@router.get("/auth/me")
async def me(current=Depends(require_user)):
    return {
        **public_user(current),
        "workspaces": await list_user_workspaces(current["id"]),
    }


@router.get("/user/preferences")
async def get_preferences(current=Depends(require_user)):
    prefs = current.get("preferences") or {}
    return {
        "favorite_ai_model": prefs.get("favorite_ai_model") or "claude",
        "favorite_models": prefs.get("favorite_models") or [],
    }


@router.patch("/user/preferences")
async def update_preferences(payload: UserPreferences, current=Depends(require_user)):
    fav = payload.favorite_ai_model
    if fav and fav not in MODEL_CONFIG:
        raise HTTPException(400, f"Unknown model key: {fav}")
    favs = [m for m in (payload.favorite_models or []) if m in MODEL_CONFIG]
    update = {"preferences.favorite_ai_model": fav, "preferences.favorite_models": favs}
    await db.users.update_one({"id": current["id"]}, {"$set": update})
    return {"favorite_ai_model": fav, "favorite_models": favs}
