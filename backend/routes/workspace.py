"""Workspace info, members, invites, multi-workspace switch."""
import asyncio
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth_utils import hash_password
from deps import (
    PROJ,
    _post_reminder,
    db,
    ensure_personal_ai_chat,
    new_id,
    normalize_phone,
    now_iso,
    public_user,
    require_user,
    resolve_app_base,
)
from models import AddExistingMember, InviteMember, WorkspaceCreate, WorkspaceSwitch, WorkspaceTransferOwnership
from services.invite_email import mint_invite_link, send_added_email, send_invite_email
from services.workspace_membership import (
    ensure_membership,
    list_user_workspaces,
    list_workspace_members,
)

router = APIRouter()


async def _issue_invite_link(user_id: str, base: str | None = None) -> str:
    return await mint_invite_link(user_id, base)


@router.get("/workspace")
async def get_workspace(current=Depends(require_user)):
    ws = await db.workspaces.find_one({"id": current["workspace_id"]}, {"_id": 0})
    if not ws:
        raise HTTPException(404, "Workspace not found")
    return ws


@router.patch("/workspace")
async def update_workspace(payload: WorkspaceCreate, current=Depends(require_user)):
    ws = await db.workspaces.find_one({"id": current["workspace_id"]}, {"_id": 0, "owner_id": 1})
    if not ws:
        raise HTTPException(404, "Workspace not found")
    # Only the creator (owner) can rename — invited admins/members cannot.
    if ws.get("owner_id") != current["id"]:
        raise HTTPException(403, "Only the workspace creator can rename this workspace")
    await db.workspaces.update_one(
        {"id": current["workspace_id"]}, {"$set": {"name": payload.name}}
    )
    return await db.workspaces.find_one({"id": current["workspace_id"]}, {"_id": 0})


@router.get("/workspace/members")
async def workspace_members(current=Depends(require_user)):
    members = await list_workspace_members(current["workspace_id"])
    return [public_user(u) for u in members]


@router.get("/workspace/contacts/frequent")
async def frequent_contacts(current=Depends(require_user)):
    """Rank workspace members by how often they share chats with the current
    user (recent chats weigh more). Used to surface top contacts in pickers."""
    from collections import defaultdict

    ws, uid = current["workspace_id"], current["id"]
    chats = await db.chats.find(
        {"workspace_id": ws, "member_ids": uid},
        {"_id": 0, "member_ids": 1, "updated_at": 1, "created_at": 1},
    ).to_list(length=1000)
    chats.sort(key=lambda c: c.get("updated_at") or c.get("created_at") or "", reverse=True)
    scores = defaultdict(float)
    for rank, c in enumerate(chats):
        weight = 1.0 / (1 + rank * 0.1)  # decays for staler chats
        for m in (c.get("member_ids") or []):
            if m != uid:
                scores[m] += weight
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    return {"contact_ids": [m for m, _ in ranked]}


@router.post("/workspace/invite")
async def invite_member(payload: InviteMember, request: Request, current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owner/admin can invite")
    app_base = resolve_app_base(request)
    email_lower = payload.email.lower()
    ws = await db.workspaces.find_one({"id": current["workspace_id"]}, {"_id": 0, "name": 1})
    ws_name = (ws or {}).get("name", "the workspace")
    inviter_name = current.get("name") or current.get("email") or "A teammate"
    existing = await db.users.find_one({"email": email_lower})
    if existing:
        # User already exists — add them to this workspace as an additional
        # membership instead of erroring. Their previous workspace stays intact.
        already = await db.workspace_members.find_one(
            {"user_id": existing["id"], "workspace_id": current["workspace_id"]},
            {"_id": 0},
        )
        if already and already.get("status") != "removed":
            raise HTTPException(400, "User is already a member of this workspace")
        await ensure_membership(existing["id"], current["workspace_id"], role=payload.role)
        # Drop a reminder in their currently-active workspace's personal AI
        # chat so they actually see it, AND email them a heads-up.
        await _post_reminder(
            existing["id"],
            f'{current["name"]} added you to "{ws_name}". '
            "Switch workspaces from your sidebar to view it.",
            {"id": current["workspace_id"]},
        )
        asyncio.create_task(send_added_email(
            name=existing.get("name"), email=email_lower, workspace=ws_name,
            inviter=inviter_name, link=f"{app_base}/login",
        ))
        await db.users.update_one(
            {"id": existing["id"]}, {"$set": {"last_invite_sent_at": now_iso()}}
        )
        return {
            **public_user(existing),
            "role": payload.role,
            "added_to_existing_user": True,
            "email_sent": True,
        }
    # Brand-new email — create user with a secure random password (never a
    # shared/guessable one) and force a password change on first login. They
    # set their real password via the emailed invite link.
    user = {
        "id": new_id(),
        "name": payload.name,
        "email": email_lower,
        "password_hash": hash_password(secrets.token_urlsafe(24)),
        "avatar": None,
        "role": payload.role,
        "workspace_id": current["workspace_id"],
        "status": "invited",
        "must_change_password": True,
        "temp_password_issued_at": now_iso(),
        "invited_by": current["id"],
        "created_at": now_iso(),
        "last_invite_sent_at": now_iso(),
    }
    await db.users.insert_one(user.copy())
    await ensure_membership(user["id"], current["workspace_id"], role=payload.role, status="invited")
    await ensure_personal_ai_chat(user["id"], current["workspace_id"])

    link = await _issue_invite_link(user["id"], app_base)
    asyncio.create_task(send_invite_email(
        name=payload.name, email=email_lower, workspace=ws_name,
        inviter=inviter_name, link=link,
    ))
    return {**public_user(user), "email_sent": True}


@router.post("/workspace/invite/{user_id}/resend")
async def resend_invite(user_id: str, request: Request, current=Depends(require_user)):
    """Re-send the invitation email to a member who hasn't accepted yet."""
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owner/admin can resend invites")
    app_base = resolve_app_base(request)
    member = await db.workspace_members.find_one(
        {"user_id": user_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not member or member.get("status") == "removed":
        raise HTTPException(404, "Member not found in this workspace")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not found")
    ws = await db.workspaces.find_one({"id": current["workspace_id"]}, {"_id": 0, "name": 1})
    ws_name = (ws or {}).get("name", "the workspace")
    inviter_name = current.get("name") or current.get("email") or "A teammate"

    # Only pending/provisioned accounts get a fresh set-password link; users who
    # already own a password just get the "you've been added" nudge.
    if user.get("must_change_password") or user.get("status") == "invited":
        link = await _issue_invite_link(user_id, app_base)
        res = await send_invite_email(
            name=user.get("name"), email=user["email"], workspace=ws_name,
            inviter=inviter_name, link=link,
        )
    else:
        res = await send_added_email(
            name=user.get("name"), email=user["email"], workspace=ws_name,
            inviter=inviter_name, link=f"{app_base}/login",
        )
    if not res.get("ok") and res.get("reason") == "not_configured":
        raise HTTPException(503, "Email is not configured — set MAILGUN_* env vars to send invites.")
    return {"ok": bool(res.get("ok")), "email": user["email"], "reason": res.get("reason")}


# ---- Multi-workspace switcher ----
@router.get("/me/workspaces")
async def my_workspaces(current=Depends(require_user)):
    """All workspaces the current user belongs to."""
    return await list_user_workspaces(current["id"])


class CreateWorkspaceReq(BaseModel):
    name: str
    plan_id: str = "free"


@router.post("/workspace/create")
async def create_workspace(payload: CreateWorkspaceReq, current=Depends(require_user)):
    """Let any user spin up their own additional workspace for FREE (they become
    owner). The workspace always starts on the Free plan at no cost; if the user
    chose a paid plan, the frontend routes them to checkout for the new
    workspace afterwards. Capped per user to prevent abuse."""
    name = (payload.name or "").strip()
    if len(name) < 2:
        raise HTTPException(400, "Workspace name must be at least 2 characters")

    from services.billing import PLANS
    plan_id = payload.plan_id if payload.plan_id in PLANS else "free"

    MAX_OWNED = 10
    owned = await db.workspaces.count_documents({"owner_id": current["id"]})
    if owned >= MAX_OWNED:
        raise HTTPException(400, f"You've reached the limit of {MAX_OWNED} workspaces you can own.")

    workspace_id = new_id()
    await db.workspaces.insert_one({
        "id": workspace_id, "name": name, "owner_id": current["id"],
        "created_at": now_iso(),
    })
    await ensure_membership(current["id"], workspace_id, role="owner")
    await ensure_personal_ai_chat(current["id"], workspace_id)
    # Switch the user into the freshly created workspace (starts on Free).
    await db.users.update_one(
        {"id": current["id"]},
        {"$set": {"workspace_id": workspace_id, "role": "owner"}},
    )
    user = await db.users.find_one({"id": current["id"]}, PROJ)
    user["role"] = "owner"
    return {
        "ok": True,
        "workspace_id": workspace_id,
        "chosen_plan_id": plan_id,
        "needs_checkout": plan_id != "free",
        "user": public_user(user),
        "workspaces": await list_user_workspaces(current["id"]),
    }


@router.post("/workspace/switch")
async def switch_workspace(payload: WorkspaceSwitch, current=Depends(require_user)):
    """Switch the user's active workspace."""
    membership = await db.workspace_members.find_one(
        {"user_id": current["id"], "workspace_id": payload.workspace_id},
        {"_id": 0},
    )
    if not membership or membership.get("status") == "removed":
        raise HTTPException(403, "You are not a member of that workspace")
    await db.users.update_one(
        {"id": current["id"]},
        {"$set": {"workspace_id": payload.workspace_id, "role": membership.get("role", "member")}},
    )
    # Make sure the user has a personal AI chat in the new active workspace.
    await ensure_personal_ai_chat(current["id"], payload.workspace_id)
    user = await db.users.find_one({"id": current["id"]}, PROJ)
    user["role"] = membership.get("role", "member")
    user["status"] = membership.get("status", "active")
    return {
        "user": public_user(user),
        "workspaces": await list_user_workspaces(current["id"]),
    }


# ---- Find existing TeamNest users + add to my workspace ----
def _mask_email(email: str) -> str:
    """Return a privacy-friendly masked email: a***@domain.com."""
    if not email or "@" not in email:
        return email or ""
    local, _, domain = email.partition("@")
    if len(local) <= 1:
        return f"{local}***@{domain}"
    return f"{local[0]}{'*' * max(2, len(local) - 1)}@{domain}"


def _mask_phone(phone: str) -> str:
    if not phone:
        return ""
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) < 4:
        return "•" * len(digits)
    return ("•" * (len(digits) - 4)) + digits[-4:]


@router.get("/users/search")
async def search_users(q: str = "", current=Depends(require_user)):
    """Find a registered TeamNest user by EXACT email OR phone number to add to
    the current workspace. Any workspace member can call this.

    Returns minimal information (id, first name, masked email/phone) so users
    can confirm the right person before adding without leaking PII.
    """
    if current.get("role") not in ("owner", "admin", "member"):
        raise HTTPException(403, "Viewers and guests cannot search users")

    query = (q or "").strip()
    if len(query) < 3:
        return {"results": [], "reason": "query too short"}

    candidates: list[dict] = []
    # Email path — exact match (case-insensitive)
    if "@" in query:
        u = await db.users.find_one({"email": query.lower()}, PROJ)
        if u:
            candidates.append(u)
    else:
        # Phone path — normalize and look up
        phone_norm = normalize_phone(query)
        if phone_norm and len(phone_norm) >= 7:
            u = await db.users.find_one({"phone_normalized": phone_norm}, PROJ)
            if u:
                candidates.append(u)
            # Also try a "ends-with" match so users who omit their country code
            # still find people in the system (e.g., search "5559876" finds
            # "+12125559876"). 7-digit minimum keeps this safe from runaway
            # matches.
            tail = phone_norm[-10:] if len(phone_norm) >= 10 else phone_norm
            async for u2 in db.users.find(
                {"phone_normalized": {"$regex": f"{tail}$"}}, PROJ
            ).limit(5):
                if not any(c["id"] == u2["id"] for c in candidates):
                    candidates.append(u2)

    if not candidates:
        return {"results": []}

    # Pre-compute the user_ids that are already in current workspace so we can
    # flag them rather than hide them — owner/admin may want to re-invite a
    # removed member.
    current_member_ids = {
        m["user_id"]
        async for m in db.workspace_members.find(
            {"workspace_id": current["workspace_id"], "status": {"$ne": "removed"}},
            {"user_id": 1, "_id": 0},
        )
    }
    results = []
    for c in candidates:
        if c["id"] == current["id"]:
            continue  # don't surface myself
        ws = await db.workspaces.find_one(
            {"id": c.get("workspace_id")}, {"_id": 0, "name": 1}
        )
        results.append({
            "id": c["id"],
            "name": c.get("name"),
            "avatar": c.get("avatar"),
            "masked_email": _mask_email(c["email"]),
            "masked_phone": _mask_phone(c.get("phone") or ""),
            "workspace_name": (ws or {}).get("name"),
            "already_in_workspace": c["id"] in current_member_ids,
        })
    return {"results": results}


@router.post("/workspace/add-existing-member")
async def add_existing_member(payload: AddExistingMember, current=Depends(require_user)):
    """Add an existing TeamNest user to the current workspace.

    Any workspace member can call this; only owner/admin may pick a role above
    `member`. The target user keeps their original workspace and gets a
    workspace_members row in the inviter's workspace.
    """
    if current.get("role") not in ("owner", "admin", "member"):
        raise HTTPException(403, "Viewers and guests cannot add members")
    target = await db.users.find_one({"id": payload.user_id}, PROJ)
    if not target:
        raise HTTPException(404, "User not found")
    if target["id"] == current["id"]:
        raise HTTPException(400, "You're already in this workspace")
    role = payload.role
    if current.get("role") not in ("owner", "admin") and role != "member":
        role = "member"  # members can only add as 'member'

    already = await db.workspace_members.find_one(
        {"user_id": target["id"], "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if already and already.get("status") != "removed":
        raise HTTPException(400, "User is already a member of this workspace")

    await ensure_membership(target["id"], current["workspace_id"], role=role)

    ws = await db.workspaces.find_one(
        {"id": current["workspace_id"]}, {"_id": 0, "name": 1}
    )
    ws_name = (ws or {}).get("name", "the workspace")
    await _post_reminder(
        target["id"],
        f'{current["name"]} added you to "{ws_name}". '
        "Switch workspaces from your sidebar to view it.",
        {"id": current["workspace_id"]},
    )
    return {
        **public_user(target),
        "role": role,
        "added_to_existing_user": True,
    }



@router.post("/workspace/transfer-ownership")
async def transfer_ownership(payload: WorkspaceTransferOwnership, current=Depends(require_user)):
    """Transfer workspace ownership to another active member. Caller must be
    the current owner. After transfer the caller becomes 'admin'."""
    if current.get("role") != "owner":
        raise HTTPException(403, "Only the workspace owner can transfer ownership")
    if payload.new_owner_id == current["id"]:
        raise HTTPException(400, "You are already the owner")

    target = await db.users.find_one({"id": payload.new_owner_id}, PROJ)
    if not target:
        raise HTTPException(404, "User not found")

    target_member = await db.workspace_members.find_one(
        {"user_id": payload.new_owner_id, "workspace_id": current["workspace_id"]},
        {"_id": 0},
    )
    if not target_member or target_member.get("status") != "active":
        raise HTTPException(400, "New owner must be an active member of this workspace")

    now = now_iso()
    ws_id = current["workspace_id"]

    # Update workspace
    await db.workspaces.update_one({"id": ws_id}, {"$set": {"owner_id": payload.new_owner_id}})

    # Promote target → owner
    await db.workspace_members.update_one(
        {"user_id": payload.new_owner_id, "workspace_id": ws_id},
        {"$set": {"role": "owner", "updated_at": now}},
    )
    # Demote current owner → admin
    await db.workspace_members.update_one(
        {"user_id": current["id"], "workspace_id": ws_id},
        {"$set": {"role": "admin", "updated_at": now}},
    )
    # Mirror on the users.role field if either user is on this workspace
    if target.get("workspace_id") == ws_id:
        await db.users.update_one({"id": payload.new_owner_id}, {"$set": {"role": "owner"}})
    if current.get("workspace_id") == ws_id:
        await db.users.update_one({"id": current["id"]}, {"$set": {"role": "admin"}})

    return {"ok": True, "new_owner_id": payload.new_owner_id, "previous_owner_id": current["id"]}


@router.post("/workspace/leave")
async def leave_workspace(current=Depends(require_user)):
    """Leave the current workspace. Owners must transfer ownership first
    (unless they are the only active member, in which case the workspace is
    closed)."""
    ws_id = current["workspace_id"]
    ws = await db.workspaces.find_one({"id": ws_id}, {"_id": 0})
    if not ws:
        raise HTTPException(404, "Workspace not found")

    active_members = await db.workspace_members.count_documents(
        {"workspace_id": ws_id, "status": "active"}
    )

    if current.get("role") == "owner" and active_members > 1:
        raise HTTPException(
            400,
            "You're the workspace owner. Transfer ownership to another member first, then try again.",
        )

    # Platform flag: block closing (deleting) a workspace when the solo owner
    # leaves, if the super admin has disabled workspace deletion. Leaving a
    # workspace that has other members is still allowed (it isn't a deletion).
    will_close = active_members <= 1
    if will_close:
        from services.platform_settings import flag
        if not await flag("allow_workspace_deletion"):
            raise HTTPException(
                403,
                "Workspace deletion is currently disabled by the platform administrator.",
            )

    # Remove user from all chats in this workspace.
    await db.chats.update_many(
        {"workspace_id": ws_id, "member_ids": current["id"]},
        {"$pull": {"member_ids": current["id"]}},
    )

    # Remove the workspace_members row.
    await db.workspace_members.delete_one(
        {"user_id": current["id"], "workspace_id": ws_id}
    )

    # If the owner was the last active member, close the workspace.
    closed = False
    if active_members <= 1:
        await db.workspaces.delete_one({"id": ws_id})
        closed = True

    # If the user's "primary" workspace was this one, repoint to any other
    # active membership so they don't end up homeless.
    if current.get("workspace_id") == ws_id:
        other = await db.workspace_members.find_one(
            {"user_id": current["id"], "status": "active"}, {"_id": 0, "workspace_id": 1, "role": 1},
        )
        if other:
            await db.users.update_one(
                {"id": current["id"]},
                {"$set": {"workspace_id": other["workspace_id"], "role": other.get("role", "member")}},
            )
        else:
            await db.users.update_one(
                {"id": current["id"]}, {"$set": {"workspace_id": None, "role": "member"}},
            )

    return {"ok": True, "workspace_closed": closed, "remaining_workspace_count": await db.workspace_members.count_documents({"user_id": current["id"], "status": "active"})}
