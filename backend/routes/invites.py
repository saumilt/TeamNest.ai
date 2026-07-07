"""Invite links, bulk invites, friend suggestions, referrals + leaderboard."""
import os
import secrets as _secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote as _quote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import create_token, hash_password, verify_password
from deps import (
    PROJ,
    _post_reminder,
    _referral_badge,
    _next_badge,
    db,
    ensure_personal_ai_chat,
    new_id,
    normalize_phone,
    now_iso,
    public_user,
    require_user,
)
from models import InviteBulkRequest, InviteLinkRotate, InviteRedeem
from services.workspace_membership import ensure_membership, list_user_workspaces

router = APIRouter()


def _public_invite(link: dict) -> dict:
    """Strip internals; expose share-friendly fields. Full share_url is built on
    the frontend using window.location.origin so it works in both preview &
    production environments."""
    if not link:
        return link
    return {
        "id": link["id"],
        "token": link["token"],
        "role": link.get("role", "member"),
        "max_uses": link.get("max_uses"),
        "use_count": link.get("use_count", 0),
        "expires_at": link.get("expires_at"),
        "created_at": link.get("created_at"),
        "created_by": link.get("created_by"),
        "join_path": f"/join/{link['token']}",
        "revoked": bool(link.get("revoked")),
    }


async def _get_active_link(workspace_id: str) -> Optional[dict]:
    link = await db.invite_links.find_one(
        {"workspace_id": workspace_id, "revoked": {"$ne": True}},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not link:
        return None
    if link.get("expires_at") and link["expires_at"] < now_iso():
        await db.invite_links.update_one(
            {"id": link["id"]}, {"$set": {"revoked": True}}
        )
        return None
    if link.get("max_uses") and link.get("use_count", 0) >= link["max_uses"]:
        return None
    return link


# ---------- Invite link CRUD ----------
@router.get("/invites/link")
async def get_invite_link(current=Depends(require_user)):
    link = await _get_active_link(current["workspace_id"])
    return {"link": _public_invite(link) if link else None}


@router.post("/invites/link/rotate")
async def rotate_invite_link(payload: InviteLinkRotate, current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owner/admin can rotate invite link")
    await db.invite_links.update_many(
        {"workspace_id": current["workspace_id"], "revoked": {"$ne": True}},
        {"$set": {"revoked": True}},
    )
    expires_at = None
    if payload.expires_in_days:
        expires_at = (
            datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days)
        ).isoformat()
    token = _secrets.token_urlsafe(18)
    link = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "token": token,
        "role": payload.role,
        "max_uses": payload.max_uses,
        "use_count": 0,
        "created_by": current["id"],
        "created_at": now_iso(),
        "expires_at": expires_at,
        "revoked": False,
    }
    await db.invite_links.insert_one(link.copy())
    return {"link": _public_invite(link)}


@router.delete("/invites/link/{token}")
async def revoke_invite_link(token: str, current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owner/admin can revoke invite link")
    res = await db.invite_links.update_one(
        {"workspace_id": current["workspace_id"], "token": token},
        {"$set": {"revoked": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Invite link not found")
    return {"ok": True}


# ---------- Per-chat invite links ----------
@router.get("/chats/{chat_id}/invite-link")
async def get_or_create_chat_invite(chat_id: str, current=Depends(require_user)):
    """Return the active invite link for THIS chat. Creates one lazily on the
    first call so the UI never has to think about state."""
    chat = await db.chats.find_one(
        {"id": chat_id, "workspace_id": current["workspace_id"], "member_ids": current["id"]},
        {"_id": 0, "id": 1, "name": 1, "workspace_id": 1},
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    link = await db.invite_links.find_one(
        {"chat_id": chat_id, "revoked": {"$ne": True}},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if link and link.get("expires_at") and link["expires_at"] < now_iso():
        await db.invite_links.update_one({"id": link["id"]}, {"$set": {"revoked": True}})
        link = None
    if not link:
        token = _secrets.token_urlsafe(18)
        link = {
            "id": new_id(),
            "workspace_id": current["workspace_id"],
            "chat_id": chat_id,
            "chat_name": chat.get("name"),
            "token": token,
            "role": "guest",
            "max_uses": None,
            "use_count": 0,
            "created_by": current["id"],
            "created_at": now_iso(),
            "expires_at": None,
            "revoked": False,
        }
        await db.invite_links.insert_one(link.copy())
    return {"link": _public_chat_invite(link)}


@router.post("/chats/{chat_id}/invite-link/rotate")
async def rotate_chat_invite(chat_id: str, current=Depends(require_user)):
    """Invalidate the existing chat-invite link and mint a fresh one. Anyone
    holding the old URL will get a 404. Owner/admin of the chat only."""
    chat = await db.chats.find_one(
        {"id": chat_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    role = "admin" if current["id"] in (chat.get("admin_ids") or []) else ""
    if chat.get("created_by") != current["id"] and role != "admin":
        raise HTTPException(403, "Only chat owner/admin can rotate the invite link")
    await db.invite_links.update_many(
        {"chat_id": chat_id, "revoked": {"$ne": True}},
        {"$set": {"revoked": True}},
    )
    token = _secrets.token_urlsafe(18)
    link = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "chat_id": chat_id,
        "chat_name": chat.get("name"),
        "token": token,
        "role": "guest",
        "max_uses": None,
        "use_count": 0,
        "created_by": current["id"],
        "created_at": now_iso(),
        "expires_at": None,
        "revoked": False,
    }
    await db.invite_links.insert_one(link.copy())
    return {"link": _public_chat_invite(link)}


def _public_chat_invite(link: dict) -> dict:
    """Same shape as _public_invite but with chat-aware fields."""
    if not link:
        return link
    return {
        "id": link["id"],
        "token": link["token"],
        "chat_id": link.get("chat_id"),
        "chat_name": link.get("chat_name"),
        "role": link.get("role", "guest"),
        "use_count": link.get("use_count", 0),
        "expires_at": link.get("expires_at"),
        "created_at": link.get("created_at"),
        "join_path": f"/join/{link['token']}",
        "revoked": bool(link.get("revoked")),
    }


# ---------- Public invite preview + redemption ----------
@router.get("/public/invite/{token}")
async def preview_invite(token: str):
    """No-auth preview for the join landing page."""
    link = await db.invite_links.find_one(
        {"token": token, "revoked": {"$ne": True}}, {"_id": 0}
    )
    if not link:
        raise HTTPException(404, "Invite is invalid or has been revoked")
    if link.get("expires_at") and link["expires_at"] < now_iso():
        raise HTTPException(410, "Invite has expired")
    if link.get("max_uses") and link.get("use_count", 0) >= link["max_uses"]:
        raise HTTPException(410, "Invite has reached its usage limit")
    workspace = await db.workspaces.find_one({"id": link["workspace_id"]}, {"_id": 0})
    inviter = await db.users.find_one({"id": link["created_by"]}, PROJ)
    member_count = await db.users.count_documents({"workspace_id": link["workspace_id"]})
    return {
        "workspace_name": (workspace or {}).get("name", "TeamNest Workspace"),
        "inviter_name": (inviter or {}).get("name"),
        "role": link.get("role", "member"),
        "member_count": member_count,
        "expires_at": link.get("expires_at"),
        "chat_id": link.get("chat_id"),
        "chat_name": link.get("chat_name"),
    }


@router.post("/public/invite/redeem")
async def redeem_invite(payload: InviteRedeem):
    """Public endpoint — accept an invite. Two paths:

    * Brand-new email → create the user account in the inviter's workspace.
    * Existing email → verify their TeamNest password, then add their existing
      user to the new workspace (multi-workspace membership). Their new active
      workspace becomes the workspace they just accepted into.
    """
    link = await db.invite_links.find_one(
        {"token": payload.token, "revoked": {"$ne": True}}, {"_id": 0}
    )
    if not link:
        raise HTTPException(404, "Invite is invalid or has been revoked")
    if link.get("expires_at") and link["expires_at"] < now_iso():
        raise HTTPException(410, "Invite has expired")
    if link.get("max_uses") and link.get("use_count", 0) >= link["max_uses"]:
        raise HTTPException(410, "Invite has reached its usage limit")

    email_lower = payload.email.lower()
    existing = await db.users.find_one({"email": email_lower})
    target_role = link.get("role", "member")
    target_ws_id = link["workspace_id"]

    if existing:
        # Existing TeamNest user — verify password, add membership, switch active.
        if not verify_password(payload.password, existing.get("password_hash", "")):
            raise HTTPException(
                401,
                "This email already has a TeamNest account. Enter your existing TeamNest password to accept this invite.",
            )
        already_member = await db.workspace_members.find_one(
            {"user_id": existing["id"], "workspace_id": target_ws_id}, {"_id": 0}
        )
        if not already_member or already_member.get("status") == "removed":
            await ensure_membership(existing["id"], target_ws_id, role=target_role)
            await db.invite_links.update_one(
                {"id": link["id"]}, {"$inc": {"use_count": 1}}
            )
            if link.get("created_by"):
                await db.users.update_one(
                    {"id": link["created_by"]}, {"$inc": {"referral_count": 1}}
                )
        # Switch their active workspace to the newly-joined one so the UI lands them there.
        await db.users.update_one(
            {"id": existing["id"]},
            {"$set": {"workspace_id": target_ws_id, "role": target_role}},
        )
        await db.invites.update_many(
            {"workspace_id": target_ws_id, "email": email_lower, "status": "pending"},
            {"$set": {"status": "accepted", "accepted_at": now_iso()}},
        )
        user = await db.users.find_one({"id": existing["id"]}, PROJ)
        user["role"] = target_role
        token = create_token(user["id"])
        if link.get("chat_id"):
            await _add_user_to_chat_via_link(existing["id"], link["chat_id"], target_role)
        return {
            "token": token,
            "user": public_user(user),
            "workspaces": await list_user_workspaces(user["id"]),
            "joined_existing_account": True,
            "chat_id": link.get("chat_id"),
        }

    # Brand-new email — create the user.
    if not (payload.name or "").strip():
        raise HTTPException(400, "Name is required for new accounts")
    phone_norm = normalize_phone(payload.phone)
    if phone_norm:
        # Ensure no phone collision
        phone_clash = await db.users.find_one({"phone_normalized": phone_norm})
        if phone_clash:
            raise HTTPException(400, "Phone number is already registered to another account")
    user = {
        "id": new_id(),
        "name": payload.name.strip(),
        "email": email_lower,
        "phone": (payload.phone or "").strip() or None,
        "phone_normalized": phone_norm or None,
        "password_hash": hash_password(payload.password),
        "avatar": None,
        "role": target_role,
        "workspace_id": target_ws_id,
        "status": "active",
        "created_at": now_iso(),
        "invited_via": link["token"],
        "invited_by": link.get("created_by"),
        "preferences": {"favorite_ai_model": "claude", "favorite_models": []},
        "referral_count": 0,
        "referred_by": link.get("created_by"),
        "pro_boost_until": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),
        "pro_boost_source": "referral",
    }
    await db.users.insert_one(user.copy())
    await ensure_membership(user["id"], target_ws_id, role=target_role)
    await db.invite_links.update_one({"id": link["id"]}, {"$inc": {"use_count": 1}})
    await ensure_personal_ai_chat(user["id"], target_ws_id)

    if link.get("created_by"):
        await db.users.update_one(
            {"id": link["created_by"]}, {"$inc": {"referral_count": 1}}
        )

    await db.invites.update_many(
        {"workspace_id": target_ws_id, "email": email_lower, "status": "pending"},
        {"$set": {"status": "accepted", "accepted_at": now_iso()}},
    )

    if link.get("created_by"):
        inviter = await db.users.find_one({"id": link["created_by"]}, PROJ)
        new_count = int((inviter or {}).get("referral_count") or 0)
        badge = _referral_badge(new_count)
        badge_line = f" You're now at {new_count} referral{'s' if new_count != 1 else ''}"
        if badge:
            badge_line += f" — {badge.upper()} tier!"
        await _post_reminder(
            link["created_by"],
            f'{user["name"]} ({user["email"]}) just joined your workspace via your invite link.{badge_line}',
            {"id": link["id"]},
        )

    token = create_token(user["id"])
    # Chat-specific invite link → auto-add the new user to that chat too.
    if link.get("chat_id"):
        await _add_user_to_chat_via_link(user["id"], link["chat_id"], "member")
    return {
        "token": token,
        "user": public_user(user),
        "workspaces": await list_user_workspaces(user["id"]),
        "joined_existing_account": False,
        "chat_id": link.get("chat_id"),
    }


async def _add_user_to_chat_via_link(user_id: str, chat_id: str, role: str = "member"):
    """Idempotently add a user to a chat's member list (from invite-link redeem)."""
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0, "member_ids": 1})
    if not chat:
        return
    if user_id in (chat.get("member_ids") or []):
        return
    await db.chats.update_one(
        {"id": chat_id},
        {"$addToSet": {"member_ids": user_id},
         "$set": {f"member_roles.{user_id}": role}},
    )


@router.post("/public/invite/check-email")
async def check_invite_email(payload: dict):
    """Lightweight check used by the join page: given a token + email, tell the
    client whether the email belongs to an existing TeamNest account so the UI
    can render a 'sign in with your existing password' affordance instead of a
    'choose a password' form."""
    token = (payload or {}).get("token")
    email = ((payload or {}).get("email") or "").lower().strip()
    if not token or not email:
        raise HTTPException(400, "token and email are required")
    link = await db.invite_links.find_one(
        {"token": token, "revoked": {"$ne": True}}, {"_id": 0, "workspace_id": 1}
    )
    if not link:
        raise HTTPException(404, "Invite is invalid or has been revoked")
    user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1})
    if not user:
        return {"existing_user": False}
    already = await db.workspace_members.find_one(
        {"user_id": user["id"], "workspace_id": link["workspace_id"]},
        {"_id": 0, "status": 1},
    )
    return {
        "existing_user": True,
        "name": user.get("name"),
        "already_member": bool(already and already.get("status") != "removed"),
    }


# ---------- Bulk invite (mailto) ----------
@router.post("/invites/bulk")
async def bulk_invite(payload: InviteBulkRequest, current=Depends(require_user)):
    """Record bulk invites and return a prefilled mailto: URL. The user opens
    their own email client (no backend sending). We track who's been invited so
    pending state is visible."""
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owner/admin can send invites")
    if not payload.emails:
        raise HTTPException(400, "No emails provided")
    if len(payload.emails) > 200:
        raise HTTPException(400, "Maximum 200 emails per batch")

    link = await _get_active_link(current["workspace_id"])
    if not link:
        token = _secrets.token_urlsafe(18)
        link = {
            "id": new_id(),
            "workspace_id": current["workspace_id"],
            "token": token,
            "role": "member",
            "max_uses": None,
            "use_count": 0,
            "created_by": current["id"],
            "created_at": now_iso(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            "revoked": False,
        }
        await db.invite_links.insert_one(link.copy())

    base_url = (payload.share_url_base or os.environ.get("PUBLIC_APP_URL", "")).rstrip("/")
    share_url = f"{base_url}/join/{link['token']}" if base_url else f"/join/{link['token']}"

    workspace = await db.workspaces.find_one({"id": current["workspace_id"]}, {"_id": 0})
    workspace_name = (workspace or {}).get("name", "our team")

    recorded = []
    for email in payload.emails:
        e_lower = email.lower().strip()
        already = await db.invites.find_one(
            {"workspace_id": current["workspace_id"], "email": e_lower}, {"_id": 0}
        )
        if already:
            recorded.append(
                {"email": e_lower, "status": already.get("status", "pending"), "duplicate": True}
            )
            continue
        rec = {
            "id": new_id(),
            "workspace_id": current["workspace_id"],
            "email": e_lower,
            "invited_by": current["id"],
            "invite_token": link["token"],
            "status": "pending",
            "note": (payload.note or "")[:280],
            "created_at": now_iso(),
        }
        await db.invites.insert_one(rec.copy())
        recorded.append({"email": e_lower, "status": "pending", "duplicate": False})

    note_part = f"\n\n{payload.note}" if (payload.note or "").strip() else ""
    body = (
        f"Hi — {current['name']} invited you to join {workspace_name} on TeamNest.ai, "
        f"an AI-native team chat & research workspace.{note_part}\n\n"
        f"Click here to accept: {share_url}\n\n"
        "— Sent via TeamNest.ai"
    )
    subject = f"{current['name']} invited you to {workspace_name} on TeamNest.ai"
    bcc = ",".join([e.lower().strip() for e in payload.emails])
    mailto = f"mailto:?bcc={_quote(bcc)}&subject={_quote(subject)}&body={_quote(body)}"

    return {
        "recorded": recorded,
        "share_url": share_url,
        "mailto_url": mailto,
        "subject": subject,
        "body": body,
    }


@router.get("/invites")
async def list_pending_invites(current=Depends(require_user)):
    items = await db.invites.find(
        {"workspace_id": current["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    for it in items:
        if it["status"] == "pending":
            u = await db.users.find_one({"email": it["email"]}, PROJ)
            if u:
                m = await db.workspace_members.find_one(
                    {"user_id": u["id"], "workspace_id": current["workspace_id"]},
                    {"_id": 0},
                )
                if m and m.get("status") != "removed":
                    it["status"] = "accepted"
                    it["accepted_at"] = m.get("joined_at") or u.get("created_at")
                    await db.invites.update_one(
                        {"id": it["id"]},
                        {"$set": {"status": "accepted", "accepted_at": it["accepted_at"]}},
                    )
    return items


@router.delete("/invites/{invite_id}")
async def cancel_invite(invite_id: str, current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owner/admin can cancel invites")
    await db.invites.delete_one(
        {"id": invite_id, "workspace_id": current["workspace_id"]}
    )
    return {"ok": True}


@router.get("/invites/suggestions")
async def invite_suggestions(current=Depends(require_user)):
    """People you may know — by email domain. Returns first name + masked email +
    workspace name. Skips generic consumer domains."""
    email = current.get("email", "")
    if "@" not in email:
        return {"domain": None, "suggestions": []}
    domain = email.split("@", 1)[1].lower()
    GENERIC = {
        "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
        "proton.me", "protonmail.com", "live.com", "msn.com", "aol.com",
        "demo.team",
    }
    if domain in GENERIC:
        return {"domain": domain, "suggestions": [], "skipped_reason": "generic_domain"}

    already_invited = {
        i["email"]
        for i in await db.invites.find(
            {"workspace_id": current["workspace_id"]}, {"email": 1, "_id": 0}
        ).to_list(1000)
    }
    # Existing members of the active workspace (via workspace_members so multi-
    # workspace users are correctly included).
    existing_member_ids = {
        m["user_id"]
        async for m in db.workspace_members.find(
            {"workspace_id": current["workspace_id"], "status": {"$ne": "removed"}},
            {"user_id": 1, "_id": 0},
        )
    }
    existing_member_emails = set()
    if existing_member_ids:
        existing_member_emails = {
            u["email"]
            for u in await db.users.find(
                {"id": {"$in": list(existing_member_ids)}}, {"email": 1, "_id": 0}
            ).to_list(1000)
        }

    candidates = await db.users.find(
        {"email": {"$regex": f"@{domain}$", "$options": "i"}},
        PROJ,
    ).to_list(200)

    suggestions = []
    for c in candidates:
        if c["email"] in existing_member_emails or c["email"] in already_invited:
            continue
        # Don't suggest the user themselves
        if c["id"] == current["id"]:
            continue
        masked = c["email"][0] + "***@" + domain
        ws = await db.workspaces.find_one(
            {"id": c.get("workspace_id")}, {"_id": 0, "name": 1}
        )
        suggestions.append({
            "first_name": (c.get("name") or "").split(" ")[0],
            "masked_email": masked,
            "workspace_name": (ws or {}).get("name", "another workspace"),
            "real_email": c["email"],
        })
        if len(suggestions) >= 12:
            break
    return {"domain": domain, "suggestions": suggestions}


# ---------- Referrals ----------
@router.get("/me/referrals")
async def my_referrals(current=Depends(require_user)):
    """Return the current user's referral stats + the list of people they invited."""
    refs = await db.users.find(
        {"referred_by": current["id"]}, PROJ
    ).sort("created_at", -1).to_list(200)
    count = int(current.get("referral_count") or 0)
    boost_until = current.get("pro_boost_until")
    return {
        "referral_count": count,
        "badge": _referral_badge(count),
        "progress": _next_badge(count),
        "pro_boost_until": boost_until,
        "pro_boost_active": bool(boost_until and boost_until > now_iso()),
        "pro_boost_source": current.get("pro_boost_source"),
        "referrals": [
            {
                "id": r["id"],
                "name": r["name"],
                "email": r["email"],
                "joined_at": r.get("created_at"),
            }
            for r in refs
        ],
    }


@router.get("/leaderboard/referrals")
async def leaderboard_referrals(
    scope: str = "workspace", limit: int = 10, current=Depends(require_user)
):
    """Top referrers. scope=workspace (default) or global."""
    q: dict = {"referral_count": {"$gt": 0}}
    if scope == "workspace":
        q["workspace_id"] = current["workspace_id"]
    cursor = db.users.find(q, PROJ).sort("referral_count", -1).limit(max(1, min(limit, 50)))
    leaders = []
    async for u in cursor:
        c = int(u.get("referral_count") or 0)
        leaders.append({
            "id": u["id"],
            "name": u["name"],
            "avatar": u.get("avatar"),
            "referral_count": c,
            "badge": _referral_badge(c),
            "is_me": u["id"] == current["id"],
        })
    return {"scope": scope, "leaders": leaders}



# ---------- WhatsApp-style phone invite ----------
class PhoneInvitePayload(BaseModel):
    phone: str
    name: Optional[str] = None
    method: str = "sms"  # "sms" | "whatsapp"
    share_url_base: Optional[str] = None


async def _ensure_workspace_link(workspace_id: str, created_by: str) -> dict:
    link = await _get_active_link(workspace_id)
    if link:
        return link
    token = _secrets.token_urlsafe(18)
    link = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "token": token,
        "role": "member",
        "max_uses": None,
        "use_count": 0,
        "created_by": created_by,
        "created_at": now_iso(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "revoked": False,
    }
    await db.invite_links.insert_one(link.copy())
    return link


@router.post("/invites/phone")
async def invite_by_phone(payload: PhoneInvitePayload, current=Depends(require_user)):
    """WhatsApp-style invite. Two methods:

      method="whatsapp": returns a wa.me deep-link the frontend opens. The
        user's WhatsApp app composes the message with the invite link
        pre-filled — recipient never installs anything new. Free.

      method="sms": uses Twilio to text the recipient directly. Costs ~$0.01
        per SMS (US/CA). Falls back to a `tel:` link if Twilio is in test
        mode AND no real number is configured.
    """
    if current.get("role") not in ("owner", "admin", "member"):
        raise HTTPException(403, "Sign in to send invites")
    phone = normalize_phone(payload.phone)
    if not phone or len(phone) < 8:
        raise HTTPException(400, "Enter a valid phone number with country code")

    link = await _ensure_workspace_link(current["workspace_id"], current["id"])
    base_url = (payload.share_url_base or os.environ.get("PUBLIC_APP_URL", "")).rstrip("/")
    share_url = f"{base_url}/join/{link['token']}" if base_url else f"/join/{link['token']}"

    workspace = await db.workspaces.find_one({"id": current["workspace_id"]}, {"_id": 0}) or {}
    workspace_name = workspace.get("name", "our team")
    inviter_name = current.get("name") or current.get("email", "A teammate")

    greeting = (payload.name.strip().split(" ")[0] + ", ") if payload.name else ""
    body = (
        f"{greeting}{inviter_name} invited you to join "
        f"\"{workspace_name}\" on TeamNest. Tap to join: {share_url}"
    )

    # Persist the invite as a pending record so we can show "Invite sent".
    invite_doc = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "phone": phone,
        "name": payload.name,
        "invited_by": current["id"],
        "method": payload.method,
        "link_token": link["token"],
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.phone_invites.insert_one(invite_doc.copy())

    if payload.method == "whatsapp":
        wa_link = f"https://wa.me/{phone.lstrip('+')}?text={_quote(body)}"
        return {
            "ok": True,
            "method": "whatsapp",
            "open_url": wa_link,
            "share_url": share_url,
            "body": body,
            "invite_id": invite_doc["id"],
        }

    # SMS path via Twilio.
    try:
        from routes.sms import _twilio_client, TWILIO_MODE
        client, from_number = _twilio_client()
        msg = client.messages.create(to=phone, from_=from_number, body=body[:1600])
        await db.phone_invites.update_one(
            {"id": invite_doc["id"]},
            {"$set": {
                "twilio_sid": msg.sid,
                "twilio_status": msg.status,
                "twilio_mode": TWILIO_MODE,
                "sent_at": now_iso(),
            }},
        )
        return {
            "ok": True,
            "method": "sms",
            "share_url": share_url,
            "twilio_status": msg.status,
            "twilio_mode": TWILIO_MODE,
            "invite_id": invite_doc["id"],
        }
    except Exception as exc:
        # Twilio not configured? Fall back to a clickable SMS URL the user
        # can tap on mobile to compose the message in their default SMS app.
        fallback = f"sms:{phone}?body={_quote(body)}"
        await db.phone_invites.update_one(
            {"id": invite_doc["id"]}, {"$set": {"status": "fallback_local_sms", "error": str(exc)[:200]}}
        )
        return {
            "ok": True,
            "method": "local_sms",
            "open_url": fallback,
            "share_url": share_url,
            "body": body,
            "invite_id": invite_doc["id"],
            "note": "Twilio not configured; opens your phone's SMS app instead.",
        }


@router.get("/invites/phone")
async def list_phone_invites(current=Depends(require_user)):
    rows = await db.phone_invites.find(
        {"workspace_id": current["workspace_id"]}, {"_id": 0},
    ).sort("created_at", -1).limit(100).to_list(100)
    return {"invites": rows}


class BulkPhoneInviteRow(BaseModel):
    phone: str
    name: Optional[str] = None


class BulkPhoneInvitePayload(BaseModel):
    rows: List[BulkPhoneInviteRow]
    method: str = "sms"  # "sms" | "whatsapp"
    share_url_base: Optional[str] = None


@router.post("/invites/phone/bulk")
async def bulk_invite_by_phone(payload: BulkPhoneInvitePayload, current=Depends(require_user)):
    """Send up to 50 invites in one call. Each row is processed independently;
    failures don't abort the batch. For WhatsApp method we return a list of
    `wa.me` URLs the frontend opens one-by-one (one per tap; browsers block
    bulk popup spam)."""
    if current.get("role") not in ("owner", "admin", "member"):
        raise HTTPException(403, "Sign in to send invites")
    if not payload.rows:
        raise HTTPException(400, "rows is empty")
    if len(payload.rows) > 50:
        raise HTTPException(400, "Bulk invite limit is 50 per request")

    link = await _ensure_workspace_link(current["workspace_id"], current["id"])
    base_url = (payload.share_url_base or os.environ.get("PUBLIC_APP_URL", "")).rstrip("/")
    share_url = f"{base_url}/join/{link['token']}" if base_url else f"/join/{link['token']}"

    workspace = await db.workspaces.find_one({"id": current["workspace_id"]}, {"_id": 0}) or {}
    workspace_name = workspace.get("name", "our team")
    inviter_name = current.get("name") or current.get("email", "A teammate")

    results: List[Dict[str, Any]] = []
    sent = 0
    failed = 0
    twilio_client = None
    twilio_from = None
    twilio_mode = None
    if payload.method == "sms":
        try:
            from routes.sms import _twilio_client as _tc, TWILIO_MODE
            twilio_client, twilio_from = _tc()
            twilio_mode = TWILIO_MODE
        except Exception as exc:
            twilio_client = None
            twilio_mode = f"unavailable: {str(exc)[:80]}"

    for row in payload.rows:
        phone = normalize_phone(row.phone)
        if not phone or len(phone) < 8:
            results.append({"phone": row.phone, "ok": False, "error": "Invalid phone"})
            failed += 1
            continue
        greeting = (row.name.strip().split(" ")[0] + ", ") if row.name else ""
        body = (
            f"{greeting}{inviter_name} invited you to join "
            f"\"{workspace_name}\" on TeamNest. Tap to join: {share_url}"
        )
        invite_doc = {
            "id": new_id(),
            "workspace_id": current["workspace_id"],
            "phone": phone,
            "name": row.name,
            "invited_by": current["id"],
            "method": payload.method,
            "link_token": link["token"],
            "status": "pending",
            "created_at": now_iso(),
        }
        await db.phone_invites.insert_one(invite_doc.copy())

        if payload.method == "whatsapp":
            wa_link = f"https://wa.me/{phone.lstrip('+')}?text={_quote(body)}"
            results.append({
                "phone": phone, "name": row.name, "ok": True,
                "method": "whatsapp", "open_url": wa_link, "invite_id": invite_doc["id"],
            })
            sent += 1
        else:
            if twilio_client:
                try:
                    msg = twilio_client.messages.create(to=phone, from_=twilio_from, body=body[:1600])
                    await db.phone_invites.update_one(
                        {"id": invite_doc["id"]},
                        {"$set": {"twilio_sid": msg.sid, "twilio_status": msg.status, "sent_at": now_iso()}},
                    )
                    results.append({
                        "phone": phone, "name": row.name, "ok": True,
                        "method": "sms", "twilio_status": msg.status, "invite_id": invite_doc["id"],
                    })
                    sent += 1
                except Exception as exc:
                    await db.phone_invites.update_one(
                        {"id": invite_doc["id"]}, {"$set": {"status": "failed", "error": str(exc)[:200]}}
                    )
                    results.append({"phone": phone, "ok": False, "error": str(exc)[:140]})
                    failed += 1
            else:
                fallback = f"sms:{phone}?body={_quote(body)}"
                results.append({
                    "phone": phone, "name": row.name, "ok": True,
                    "method": "local_sms", "open_url": fallback, "invite_id": invite_doc["id"],
                })
                sent += 1
    return {
        "sent": sent,
        "failed": failed,
        "method": payload.method,
        "twilio_mode": twilio_mode,
        "share_url": share_url,
        "results": results,
    }

