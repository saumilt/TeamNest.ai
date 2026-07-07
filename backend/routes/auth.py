"""Auth + user preferences."""
from fastapi import APIRouter, Depends, HTTPException, Response

from ai_service import MODEL_CONFIG
from auth_utils import (
    clear_session_cookie,
    create_short_lived_token,
    create_token,
    hash_password,
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
        raise HTTPException(404, "Demo user not seeded")
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
        from services.billing import DEMO_LOGIN_CREDIT_FLOOR, ensure_credit_floor
        await ensure_credit_floor(user["workspace_id"], DEMO_LOGIN_CREDIT_FLOOR)
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
