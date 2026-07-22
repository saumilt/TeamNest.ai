"""Chats, messages + per-chat integrations.

Auto-triggers AI research and inline task creation when the message body
contains `@AI ...` or `@task ...` shortcuts.
"""
import asyncio
import os

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ai_service import parse_ai_command, parse_task_command
from auth_utils import hash_password
from deps import (
    PROJ,
    _broadcast_message,
    _post_reminder,
    db,
    is_super_admin,
    logger,
    new_id,
    normalize_phone,
    now_iso,
    public_user,
    require_user,
)
from models import (
    ChatAdminToggle,
    ChatViewerToggle,
    ChatCreate,
    ChatMembersAdd,
    ChatPostingPolicy,
    InviteGuestToChat,
    MessageCreate,
    MessageEdit,
    MessageReact,
)
from services.ai_runtime import handle_ai_command, handle_inline_task
from services.workspace_membership import ensure_membership
from ws_manager import manager

router = APIRouter()


@router.get("/chats")
async def list_chats(current=Depends(require_user)):
    # If this user is a chat-scoped guest, only return chats in their scope.
    membership = await db.workspace_members.find_one(
        {"user_id": current["id"], "workspace_id": current["workspace_id"]},
        {"_id": 0, "chat_scope_ids": 1},
    )
    scope = (membership or {}).get("chat_scope_ids") or None
    q = {"workspace_id": current["workspace_id"], "member_ids": current["id"]}
    if scope:
        q["id"] = {"$in": scope}
    chats = await db.chats.find(q, {"_id": 0}).to_list(1000)

    # Build per-user cleared_at map. A chat with cleared_at is hidden until a
    # new message arrives after that timestamp (WhatsApp-style "delete chat").
    cleared_rows = await db.user_chat_states.find(
        {"user_id": current["id"]},
        {"_id": 0, "chat_id": 1, "cleared_at": 1, "last_read_at": 1},
    ).to_list(4000)
    cleared_at_by_chat = {r["chat_id"]: r["cleared_at"] for r in cleared_rows if r.get("cleared_at")}
    read_at_by_chat = {r["chat_id"]: r.get("last_read_at") for r in cleared_rows}

    # ── Bulk last-message + unread counts (avoids the old per-chat N+1). ──
    chat_id_list = [c["id"] for c in chats]

    # Latest non-deleted message per chat in ONE aggregation. Per-user
    # `cleared_at` is applied in Python below: the latest overall message is
    # also the latest *visible* one (a message after cleared_at can only be the
    # newest), so if it predates cleared_at the chat has nothing new → hidden.
    last_by_chat: dict = {}
    if chat_id_list:
        async for row in db.messages.aggregate([
            {"$match": {"chat_id": {"$in": chat_id_list}, "deleted_at": None}},
            {"$sort": {"created_at": -1}},
            {"$group": {"_id": "$chat_id", "last": {"$first": "$$ROOT"}}},
        ]):
            lm = row["last"]
            lm.pop("_id", None)  # ObjectId isn't JSON-serializable
            last_by_chat[row["_id"]] = lm

    # Unread counts per chat in ONE aggregation. Each chat carries its own
    # floor (last_read_at, else cleared_at) via an $or clause, so we count only
    # messages newer than that floor — excluding the user's own + noise events.
    or_clauses = []
    for cid in chat_id_list:
        floor = read_at_by_chat.get(cid) or cleared_at_by_chat.get(cid)
        clause = {"chat_id": cid}
        if floor:
            clause["created_at"] = {"$gt": floor}
        or_clauses.append(clause)
    unread_by_chat: dict = {}
    if or_clauses:
        async for row in db.messages.aggregate([
            {"$match": {
                "$or": or_clauses,
                "deleted_at": None,
                "sender_id": {"$ne": current["id"]},
                "message_type": {"$nin": ["ai_question", "build_progress", "system"]},
            }},
            {"$group": {"_id": "$chat_id", "n": {"$sum": 1}}},
        ]):
            unread_by_chat[row["_id"]] = row["n"]

    out = []
    for c in chats:
        cleared_at = cleared_at_by_chat.get(c["id"])
        last = last_by_chat.get(c["id"])
        # Respect per-user clear: only messages newer than cleared_at are visible.
        if last and cleared_at and (last.get("created_at") or "") <= cleared_at:
            last = None
        # If user cleared this chat AND no newer message, hide it entirely.
        if cleared_at and not last:
            continue
        c["last_message"] = last
        # Unread only matters when the chat has a visible last message.
        c["unread_count"] = unread_by_chat.get(c["id"], 0) if last else 0
        out.append(c)
    out.sort(
        key=lambda x: (x.get("last_message") or {}).get("created_at") or x["created_at"],
        reverse=True,
    )

    # ── Enrich each chat with its currently-active linked Dev OS project
    # so the chat-list UI can show a one-click "Open Studio →" pill. We
    # prefer the chat's explicit `linked_dev_project_id` pointer (set by
    # DevProjectSwitcher / @devmgr) so rotating the active project in one
    # chat flips the chat-list pill correctly. Falls back to a `related
    # _chat_id` lookup for legacy chats that pre-date the pointer.
    chat_ids = [c["id"] for c in out]
    pointer_by_chat = {c["id"]: c.get("linked_dev_project_id") for c in out if c.get("linked_dev_project_id")}
    linked = {}
    # 1) Resolve explicit pointers first.
    if pointer_by_chat:
        ptr_projects = await db.dev_projects.find(
            {
                "workspace_id": current["workspace_id"],
                "id": {"$in": list(pointer_by_chat.values())},
            },
            {"_id": 0, "id": 1, "name": 1, "status": 1, "version": 1, "health": 1},
        ).to_list(5000)
        ptr_by_id = {p["id"]: p for p in ptr_projects}
        for cid, pid in pointer_by_chat.items():
            p = ptr_by_id.get(pid)
            if p:
                linked[cid] = {
                    "id": p["id"], "name": p["name"],
                    "status": p.get("status"), "version": p.get("version"),
                    "health": p.get("health"),
                }
    # 2) Legacy fallback via related_chat_id for chats without a pointer.
    legacy_chat_ids = [cid for cid in chat_ids if cid not in linked]
    if legacy_chat_ids:
        projects = await db.dev_projects.find(
            {
                "workspace_id": current["workspace_id"],
                "related_chat_id": {"$in": legacy_chat_ids},
            },
            {
                "_id": 0, "id": 1, "name": 1, "status": 1, "version": 1,
                "health": 1, "related_chat_id": 1, "created_at": 1,
            },
        ).sort("created_at", -1).to_list(5000)
        # First (newest) project per chat wins — matches what the
        # auto-start flow sets on `chat.linked_dev_project_id`.
        for p in projects:
            cid = p.get("related_chat_id")
            if cid and cid not in linked:
                linked[cid] = {
                    "id": p["id"], "name": p["name"],
                    "status": p.get("status"), "version": p.get("version"),
                    "health": p.get("health"),
                }
    for c in out:
        c["linked_dev_project"] = linked.get(c["id"])
    return out


@router.post("/chats")
async def create_chat(payload: ChatCreate, current=Depends(require_user)):
    member_ids = list(set(payload.member_ids + [current["id"]]))
    # Posting policy is only meaningful for group chats; force "all" for the rest.
    if payload.type == "group":
        policy = payload.posting_policy or "all"
        posting_user_ids = list(set(payload.posting_user_ids or []))
        if policy == "selected":
            # Ensure creator is in the allowed senders set.
            if current["id"] not in posting_user_ids:
                posting_user_ids.append(current["id"])
    else:
        policy = "all"
        posting_user_ids = []

    chat = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "type": payload.type,
        "name": payload.name or "",
        "description": payload.description or "",
        "project_folder_id": payload.project_folder_id,
        "default_models": payload.default_models or ["chatgpt", "claude", "gemini"],
        "member_ids": member_ids,
        # Creator is always the first admin of the group.
        "admin_ids": [current["id"]] if payload.type == "group" else [],
        "posting_policy": policy,
        "posting_user_ids": posting_user_ids,
        "created_by": current["id"],
        "created_at": now_iso(),
        "pinned_message_ids": [],
    }
    await db.chats.insert_one(chat.copy())
    return chat


@router.get("/chats/{chat_id}/employee-recommendation")
async def employee_recommendation(chat_id: str, current=Depends(require_user)):
    """Content-aware AI-employee recommendation for this chat.

    Returns `{recommendation: {...} | null, marketplace_url}`. When null, the
    UI shows a generic "Hire an AI employee" banner linking to the marketplace.
    """
    chat = await db.chats.find_one(
        {"id": chat_id, "member_ids": current["id"]}, {"_id": 0}
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    from services.employee_recommender import recommend_for_chat
    try:
        reco = await recommend_for_chat(chat)
    except Exception:
        reco = None
    return {"recommendation": reco, "marketplace_url": "/ai-builder/marketplace"}


@router.get("/chats/{chat_id}")
async def get_chat(chat_id: str, current=Depends(require_user)):
    chat = await db.chats.find_one(
        {"id": chat_id, "member_ids": current["id"]}, {"_id": 0}
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    # Lazy migration: pre-existing group chats may not have admin_ids set.
    # Seed the creator as the first admin so the group is manageable.
    if (
        chat.get("type") == "group"
        and not chat.get("admin_ids")
        and chat.get("created_by")
    ):
        await db.chats.update_one(
            {"id": chat_id},
            {"$set": {"admin_ids": [chat["created_by"]]}},
        )
        chat["admin_ids"] = [chat["created_by"]]
    members = await db.users.find(
        {"id": {"$in": chat["member_ids"]}}, PROJ
    ).to_list(1000)
    admin_ids = set(chat.get("admin_ids") or [])
    chat["members"] = []
    for m in members:
        pub = public_user(m)
        pub["is_chat_admin"] = m["id"] in admin_ids
        pub["is_creator"] = m["id"] == chat.get("created_by")
        chat["members"].append(pub)
    # Defaults so older chats also work cleanly on the frontend.
    chat.setdefault("admin_ids", [])
    chat.setdefault("posting_policy", "all")
    chat.setdefault("posting_user_ids", [])
    chat.setdefault("category", None)
    chat.setdefault("kind", "group")
    chat.setdefault("bot_role_ids", [])
    chat["is_current_user_admin"] = current["id"] in admin_ids

    # Linked Dev OS project (chat-native Dev OS). The chat carries an
    # explicit `linked_dev_project_id` pointer (set by the DevProjectSwitcher
    # / @devmgr continuation logic) so multiple projects per chat can be
    # rotated through one "active" slot. We prefer that pointer; we only
    # fall back to a `related_chat_id` lookup for legacy chats whose
    # pointer was never set.
    project_id = chat.get("linked_dev_project_id")
    if project_id:
        linked = await db.dev_projects.find_one(
            {"id": project_id, "workspace_id": chat["workspace_id"]},
            {"_id": 0, "id": 1, "name": 1, "status": 1, "health": 1, "version": 1, "open_proposals": 1},
        )
    else:
        linked = await db.dev_projects.find_one(
            {"workspace_id": chat["workspace_id"], "related_chat_id": chat_id},
            {"_id": 0, "id": 1, "name": 1, "status": 1, "health": 1, "version": 1, "open_proposals": 1},
        )
    chat["linked_dev_project"] = linked
    return chat


def _ensure_chat_admin(chat: dict, user_id: str) -> None:
    """Raise 403 unless `user_id` is an admin of `chat` (group-only)."""
    if chat.get("type") != "group":
        raise HTTPException(400, "Members can only be managed in group chats.")
    admin_ids = chat.get("admin_ids") or []
    if user_id not in admin_ids:
        raise HTTPException(403, "Only chat admins can perform this action.")


@router.post("/chats/{chat_id}/members")
async def add_chat_members(
    chat_id: str, payload: ChatMembersAdd, current=Depends(require_user)
):
    """Admin-only: add one or more workspace users to a group chat."""
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    _ensure_chat_admin(chat, current["id"])

    # Only add users that are in the same workspace.
    valid = await db.users.find(
        {"id": {"$in": payload.user_ids}, "workspace_id": current["workspace_id"]},
        PROJ,
    ).to_list(1000)
    valid_ids = [u["id"] for u in valid]
    new_ids = [uid for uid in valid_ids if uid not in (chat.get("member_ids") or [])]
    if not new_ids:
        return {"ok": True, "added": [], "members": chat.get("members") or []}

    await db.chats.update_one(
        {"id": chat_id},
        {"$addToSet": {"member_ids": {"$each": new_ids}}},
    )
    added_names = ", ".join(
        f'**{u["name"]}**' for u in valid if u["id"] in new_ids
    )
    sys_msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "text",
        "body": f"{added_names} {'were' if len(new_ids) > 1 else 'was'} added by **{current['name']}**.",
        "parent_message_id": None,
        "metadata": {"event": "members_added", "user_ids": new_ids, "by": current["id"]},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(sys_msg.copy())
    await _broadcast_message(chat_id, sys_msg)
    return {"ok": True, "added": new_ids}


@router.delete("/chats/{chat_id}/members/{user_id}")
async def remove_chat_member(
    chat_id: str, user_id: str, current=Depends(require_user)
):
    """Admin-only: remove a member from the group chat."""
    from services.platform_settings import flag
    if not await flag("allow_subuser_deletion"):
        raise HTTPException(
            403,
            "Removing members is currently disabled by the platform administrator.",
        )
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    _ensure_chat_admin(chat, current["id"])
    if user_id == chat.get("created_by"):
        raise HTTPException(400, "The chat creator cannot be removed.")
    if user_id == current["id"]:
        raise HTTPException(400, "Use Leave chat to remove yourself.")
    if user_id not in (chat.get("member_ids") or []):
        raise HTTPException(404, "User is not a member of this chat.")

    target = await db.users.find_one({"id": user_id}, PROJ)
    target_name = target.get("name") if target else "Someone"

    await db.chats.update_one(
        {"id": chat_id},
        {
            "$pull": {
                "member_ids": user_id,
                "admin_ids": user_id,
                "posting_user_ids": user_id,
            }
        },
    )
    sys_msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "text",
        "body": f"**{target_name}** was removed by **{current['name']}**.",
        "parent_message_id": None,
        "metadata": {"event": "member_removed", "user_id": user_id, "by": current["id"]},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(sys_msg.copy())
    await _broadcast_message(chat_id, sys_msg)
    return {"ok": True, "removed": user_id}


@router.post("/chats/{chat_id}/viewers")
async def toggle_chat_viewer(
    chat_id: str, payload: ChatViewerToggle, current=Depends(require_user)
):
    """Admin-only: flip a member to viewer (read-only) status or back to
    full member. Cannot demote the chat creator."""
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    _ensure_chat_admin(chat, current["id"])
    if payload.user_id not in (chat.get("member_ids") or []):
        raise HTTPException(404, "User is not a member of this chat.")
    if payload.user_id == chat.get("created_by"):
        raise HTTPException(400, "The chat creator cannot be made a viewer.")

    op = "$addToSet" if payload.make_viewer else "$pull"
    await db.chats.update_one({"id": chat_id}, {op: {"viewer_ids": payload.user_id}})
    return {"ok": True, "user_id": payload.user_id, "is_viewer": payload.make_viewer}


@router.post("/chats/{chat_id}/admins")
async def toggle_chat_admin(
    chat_id: str, payload: ChatAdminToggle, current=Depends(require_user)
):
    """Admin-only: promote a member to chat admin, or demote them back."""
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    _ensure_chat_admin(chat, current["id"])
    if payload.user_id not in (chat.get("member_ids") or []):
        raise HTTPException(404, "User is not a member of this chat.")
    if payload.user_id == chat.get("created_by") and not payload.make_admin:
        raise HTTPException(400, "The chat creator cannot be demoted.")

    op = "$addToSet" if payload.make_admin else "$pull"
    await db.chats.update_one({"id": chat_id}, {op: {"admin_ids": payload.user_id}})
    return {"ok": True, "user_id": payload.user_id, "is_admin": payload.make_admin}


@router.patch("/chats/{chat_id}/posting-policy")
async def update_posting_policy(
    chat_id: str, payload: ChatPostingPolicy, current=Depends(require_user)
):
    """Admin-only: change who can send messages in a group chat."""
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    _ensure_chat_admin(chat, current["id"])

    policy = payload.posting_policy
    posting_user_ids: list = []
    if policy == "selected":
        posting_user_ids = list(set(payload.posting_user_ids or []))
        # Admins can always post; ensure the current admin is in the set.
        for aid in chat.get("admin_ids") or []:
            if aid not in posting_user_ids:
                posting_user_ids.append(aid)

    await db.chats.update_one(
        {"id": chat_id},
        {
            "$set": {
                "posting_policy": policy,
                "posting_user_ids": posting_user_ids,
            }
        },
    )
    # Post a small system note so members know things changed.
    label = {
        "all": "everyone can post",
        "admin_only": "only admins can post",
        "selected": f"{len(posting_user_ids)} selected people can post",
    }[policy]
    sys_msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "text",
        "body": f"**{current['name']}** updated who can post — {label}.",
        "parent_message_id": None,
        "metadata": {"event": "posting_policy_changed", "policy": policy, "by": current["id"]},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(sys_msg.copy())
    await _broadcast_message(chat_id, sys_msg)
    return {"ok": True, "posting_policy": policy, "posting_user_ids": posting_user_ids}


# ─── Chat-native Dev OS: category + linked project ──────────────────────────
VALID_CATEGORIES = {"engineering", "product", "marketing", "ops", "sales", "general"}


class ChatCategoryUpdate(BaseModel):
    category: Optional[str] = None    # one of VALID_CATEGORIES or None to clear


@router.patch("/chats/{chat_id}/category")
async def update_chat_category(
    chat_id: str, payload: ChatCategoryUpdate, current=Depends(require_user),
):
    """Set or clear the chat's category. Categories help group the sidebar
    and let templates auto-suggest a smart project type when spinning up
    Dev OS from this chat."""
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    cat = (payload.category or "").lower().strip() or None
    if cat is not None and cat not in VALID_CATEGORIES:
        raise HTTPException(400, f"Invalid category. Choose one of: {', '.join(sorted(VALID_CATEGORIES))}")
    await db.chats.update_one({"id": chat_id}, {"$set": {"category": cat}})
    return {"ok": True, "category": cat}


@router.post("/chats/{chat_id}/spin-up-dev-os")
async def spin_up_dev_os_from_chat(
    chat_id: str, current=Depends(require_user),
):
    """One-tap: create a Dev OS project linked to this chat and return it.
    Idempotent — returns the existing linked project if one is already set.
    Used by the rocket pill in the chat header."""
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    existing = await db.dev_projects.find_one(
        {"workspace_id": chat["workspace_id"], "related_chat_id": chat_id},
        {"_id": 0},
    )
    if existing:
        return {"project": existing, "created": False}

    name = (chat.get("name") or "Untitled chat") + " · Project"
    project = {
        "id": new_id(),
        "workspace_id": chat["workspace_id"],
        "created_by": current["id"],
        "name": name[:120],
        "description": f"Spun up from chat #{chat.get('name', 'untitled')}",
        "target_users": "",
        "problem": "",
        "source": "chat",
        "template_id": None,
        "related_chat_id": chat_id,
        "category": chat.get("category"),
        "plan": {"product_brief": "Linked to chat — run `/dev-os scan` to draft proposals from recent messages.", "_llm_status": "stub"},
        "status": "draft",
        "version": "v0.1.0",
        "health": "stable",
        "test_coverage": 0,
        "open_proposals": 0,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_projects.insert_one(project.copy())

    # Point the chat at this new project so the right-rail preview pane
    # + Open Studio pill bind to it immediately (rather than to whatever
    # legacy related_chat_id lookup returned first).
    await db.chats.update_one(
        {"id": chat_id},
        {"$set": {"linked_dev_project_id": project["id"], "updated_at": now_iso()}},
    )

    # Seed stub files immediately so the live-preview iframe in the chat
    # right-rail renders a usable SPA the moment the project appears.
    # No LLM calls — purely deterministic scaffolding. A subsequent real
    # build via the Studio (or @devmgr in chat) overwrites these with
    # LLM-generated content.
    try:
        from services.dev_os_codegen import seed_stub_files
        await seed_stub_files(project)
    except Exception:
        # Seeding is best-effort — failing here must not block the chat link.
        pass

    # Friendly system message announcing the link so everyone in the chat sees it.
    sys_msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "ai-system",
        "body": (
            f"🚀 **Dev OS** · {current.get('name', 'Someone')} spun up project **{project['name']}** from this chat. "
            f"Try `/dev-os scan` to draft proposals or `/dev-os task <title>` to add work.\n"
            f"[Open project →](/dev-os/projects/{project['id']})"
        ),
        "parent_message_id": None,
        "metadata": {"source": "dev_os_spin_up", "project_id": project["id"]},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(sys_msg.copy())
    await _broadcast_message(chat_id, sys_msg)

    return {"project": project, "created": True}



# ─── Next-Ideas suggestions ─────────────────────────────────────────────
# A constantly-refreshing list of 4 short, actionable next steps the team
# can run with one click. Inspired by Emergent's "what to build next"
# bar — keeps momentum visible inside the chat without forcing the user
# to think up the next prompt themselves.
#
# Strategy:
#   • Pull the last ~12 messages + the linked dev project state (name +
#     existing file paths) and ask the LLM for a JSON list of 4 ideas.
#   • Each idea is {label, prompt} — `label` is the chip text, `prompt`
#     is the full text dropped into the composer on click.
#   • Cache the result for 60s per chat in `chat_next_ideas` so we don't
#     spend a credit on every chat-open. A `?refresh=1` query forces.
#   • Falls back to a deterministic, context-aware seed list when the LLM
#     is unavailable — so the panel is never empty.
@router.get("/chats/{chat_id}/next-ideas")
async def chat_next_ideas(
    chat_id: str,
    refresh: int = Query(0),
    current=Depends(require_user),
):
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")

    cached = await db.chat_next_ideas.find_one({"chat_id": chat_id}, {"_id": 0})
    if cached and not refresh:
        # 60-second freshness window
        from datetime import datetime as _dt, timezone as _tz, timedelta as _td
        try:
            generated_at = _dt.fromisoformat(cached["generated_at"].replace("Z", "+00:00"))
            if _dt.now(_tz.utc) - generated_at < _td(seconds=60):
                return {"ideas": cached["ideas"], "cached": True}
        except Exception:
            pass

    # Gather context — recent messages + linked project state.
    hired = bool(chat.get("dev_team_hired"))
    msgs = await db.messages.find(
        {"chat_id": chat_id, "deleted_at": None},
        {"_id": 0, "body": 1, "sender_id": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(12)
    msgs.reverse()
    transcript_lines = []
    for m in msgs:
        body = (m.get("body") or "").strip().replace("\n", " ")
        if not body:
            continue
        transcript_lines.append(f"- {body[:240]}")
    transcript = "\n".join(transcript_lines) or "(no messages yet)"

    # Linked project (if any) — only fed in once @devmanager is hired; unhired
    # chats get research/recommendation ideas, not build prompts.
    project = None
    project_ctx = ""
    if hired:
        project = await db.dev_projects.find_one(
            {"workspace_id": chat["workspace_id"], "related_chat_id": chat_id},
            {"_id": 0, "id": 1, "name": 1},
        )
        if project:
            paths = [
                p["path"] async for p in db.dev_code_files.find(
                    {"project_id": project["id"]}, {"_id": 0, "path": 1},
                ).limit(40)
            ]
            project_ctx = (
                f"\nLinked Dev OS project: '{project['name']}'."
                f" Existing files: {', '.join(paths) if paths else '(none yet)'}."
            )

    ideas = await _llm_next_ideas(transcript, project_ctx, chat.get("name") or "this chat", hired)
    if not ideas:
        ideas = _fallback_next_ideas(bool(project), hired)

    # Cache for ~60s
    await db.chat_next_ideas.update_one(
        {"chat_id": chat_id},
        {"$set": {
            "chat_id": chat_id,
            "ideas": ideas,
            "generated_at": now_iso(),
        }},
        upsert=True,
    )
    return {"ideas": ideas, "cached": False}


async def _llm_next_ideas(transcript: str, project_ctx: str, chat_name: str, hired: bool) -> list:
    """Returns a list of up to 4 {label, prompt} dicts, or [] on failure."""
    import os
    import json as _json
    import re as _re
    if hired:
        system = (
            "You are an opinionated product lead embedded in a team chat. "
            "Read the recent conversation and suggest the 4 highest-leverage "
            "next moves the team can take in ONE message. Each idea must be "
            "a concrete, ready-to-send instruction — a feature to build, a "
            "decision to make, or a question to resolve. NO generic 'maybe "
            "consider X' fluff. Reply ONLY with a JSON array of objects "
            "[{\"label\": \"...\", \"prompt\": \"...\"}]. Label ≤ 6 words, "
            "prompt ≤ 220 chars and written as if the user is about to send it."
        )
    else:
        system = (
            "You are a sharp research copilot embedded in a team chat. Read the "
            "recent conversation and suggest the 4 highest-leverage AI research or "
            "decision-support moves — summaries, comparisons, pros/cons, risk "
            "analysis, recommendations or follow-up questions grounded in the "
            "SPECIFIC topics discussed. Every prompt MUST start with '@ai ' and be "
            "ready to send as-is. NEVER suggest building software, apps, code or "
            "prototypes. Reply ONLY with a JSON array of objects "
            "[{\"label\": \"...\", \"prompt\": \"...\"}]. Label ≤ 6 words, "
            "prompt ≤ 220 chars."
        )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            return []
        chat = (
            LlmChat(
                api_key=key,
                session_id=f"next-ideas-{chat_name[:20]}",
                system_message=system,
            )
            .with_model("openai", "gpt-5.4-mini")
        )
        msg = (
            f"Chat title: {chat_name}{project_ctx}\n\n"
            f"Recent transcript (oldest first):\n{transcript}\n\n"
            "Return the 4 next-move JSON array now."
        )
        resp = await chat.send_message(UserMessage(text=msg))
        if not resp:
            return []
        # Tolerate fenced/with-prose responses — extract the first [...] block.
        match = _re.search(r"\[.*\]", resp, _re.DOTALL)
        if not match:
            return []
        arr = _json.loads(match.group(0))
        out = []
        for r in arr[:4]:
            if not isinstance(r, dict):
                continue
            label = str(r.get("label") or "").strip()[:60]
            prompt = str(r.get("prompt") or "").strip()[:280]
            if label and prompt:
                out.append({"label": label, "prompt": prompt})
        return out
    except Exception as e:
        logger.warning("[next-ideas] LLM call failed: %s", e)
        return []


def _fallback_next_ideas(has_project: bool, hired: bool) -> list:
    """Deterministic seed when the LLM is unavailable."""
    if not hired:
        return [
            {"label": "Summarise this chat", "prompt": "@ai summarise the key points, decisions and open questions from this chat in 5 bullets."},
            {"label": "Get a recommendation", "prompt": "@ai based on the discussion above, what would you recommend we do next and why?"},
            {"label": "Compare AI takes", "prompt": "@ai compare 3 — which of the approaches we discussed should we pick and why?"},
            {"label": "Spot risks & gaps", "prompt": "@ai what risks, blind spots or missing information should we consider before moving forward?"},
        ]
    if has_project:
        return [
            {"label": "Add a status column", "prompt": "@devmgr add a status column to the entity table with options Pending, Approved, Rejected and color-coded badges."},
            {"label": "Wire email notifications", "prompt": "@devmgr send an email notification whenever a new entity is created or approved. Use a stubbed SendGrid call for now."},
            {"label": "Build the dashboard view", "prompt": "@devmgr add a /dashboard view with 4 KPI cards (total, this week, approved, pending) and a 7-day trend chart."},
            {"label": "Ship a public demo", "prompt": "Generate a public share link for this build and post it back here so the team can review."},
        ]
    return [
        {"label": "Spin up a Dev OS project", "prompt": "@devmgr scaffold a working SPA for what we discussed above — login, list view and create form, with a FastAPI backend."},
        {"label": "Summarise the decisions", "prompt": "@ai summarise the key decisions and open questions from this chat in 5 bullets."},
        {"label": "Turn into tasks", "prompt": "@task break the above plan into 5 actionable tasks with owners and due-dates."},
        {"label": "Compare AI takes", "prompt": "@ai compare 3 — which approach should we pick and why?"},
    ]



# ─── Dev Chat creation (Emergent-style collaborative development room) ──────
class DevChatCreate(BaseModel):
    name: str = ""
    member_ids: list[str] = []          # human teammates (excluding creator)
    project_template: Optional[str] = None   # web | mobile | api | tool | data | None


@router.post("/chats/dev")
async def create_dev_chat(payload: DevChatCreate, current=Depends(require_user)):
    """One-shot create a Development Chat. Provisions:
      • a group chat with `kind='development'`
      • a linked Dev OS project (related_chat_id = chat.id)
      • the Dev Manager (@devmgr) hired by default — internal orchestrator
    Returns {chat, project}.
    """
    members = list({current["id"], *(payload.member_ids or [])})
    name = (payload.name or "").strip() or "New Development Project"

    chat = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "type": "group",
        "kind": "development",
        "name": name[:120],
        "member_ids": members,
        "admin_ids": [current["id"]],
        "created_by": current["id"],
        "posting_policy": "all",
        "posting_user_ids": [],
        "category": "engineering",
        "bot_role_ids": ["devmgr"],
        "default_models": [],
        "ai_settings": {},
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.chats.insert_one(chat.copy())

    project = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "created_by": current["id"],
        "name": name[:120],
        "description": f"Development project, born in chat #{name}",
        "target_users": "",
        "problem": "",
        "source": "dev_chat",
        "template_id": payload.project_template,
        "related_chat_id": chat["id"],
        "category": "engineering",
        "plan": {
            "product_brief": "Spun up from a Development chat. Use `@devmgr` for orchestration or `@dev` to fan out to specialists.",
            "_llm_status": "stub",
        },
        "status": "draft",
        "version": "v0.1.0",
        "health": "stable",
        "test_coverage": 0,
        "open_proposals": 0,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_projects.insert_one(project.copy())

    # Welcome system message + Dev Manager auto-intro so the room doesn't
    # feel empty on first load.
    welcome = {
        "id": new_id(),
        "chat_id": chat["id"],
        "sender_id": "ai-system",
        "message_type": "ai-system",
        "body": (
            f"🚀 **Development chat created** — linked to project **{project['name']}**.\n\n"
            f"Tag `@devmgr` to coordinate, `@dev` to ping every developer, or a specific role like "
            f"`@architect`, `@qa`, `@backend`. The live workspace pane on the right has Plan, Tasks, "
            f"Bugs, Preview and Memory tabs."
        ),
        "parent_message_id": None,
        "metadata": {"source": "dev_chat_create", "project_id": project["id"]},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(welcome.copy())

    intro = {
        "id": new_id(),
        "chat_id": chat["id"],
        "sender_id": "ai-agent-devmgr",
        "message_type": "ai-agent",
        "body": (
            "🎯 **Dev Manager** · Hi team. I'm coordinating this room. Tell me what you want to build "
            "in plain English — I'll draft a plan, hire any specialists we need, and keep the project "
            "moving. When in doubt, just say `@devmgr ...` and I'll route it."
        ),
        "parent_message_id": None,
        "metadata": {"source": "dev_chat_intro", "role": "devmgr", "role_label": "Dev Manager"},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(intro.copy())

    chat["linked_dev_project"] = {
        "id": project["id"], "name": project["name"], "status": project["status"],
        "health": project["health"], "version": project["version"], "open_proposals": 0,
    }
    return {"chat": chat, "project": project}


@router.get("/dev-chat/roles")
async def dev_chat_roles_manifest(current=Depends(require_user)):
    """Roles available for @-mention in a Development chat. Used by the
    frontend MentionPopover to render the autocomplete list."""
    from services.dev_chat_agents import roles_for_mention_picker
    return {"roles": roles_for_mention_picker()}


# ─── Hire @devmanager (one-shot Stripe, price via env) ─────────────────────
HIRE_DEV_TEAM_PRICE_USD = float(os.environ.get("HIRE_DEVMANAGER_PRICE_USD", "199"))
# Mirrors the roles exposed via /api/dev-chat/roles so the popover and the
# server-side provisioning stay aligned (no "rogue" role that's pickable but
# not actually on the chat after payment).
HIRE_DEV_TEAM_ROLES = [
    "devmgr", "architect", "frontend", "backend", "database",
    "qa", "security", "devops", "reviewer", "designer", "product", "docs", "growth",
]


@router.get("/hire-devmanager/config")
async def hire_devmanager_config(current=Depends(require_user)):
    """Current one-time hire price so the frontend never hardcodes it."""
    return {"price_usd": HIRE_DEV_TEAM_PRICE_USD, "currency": "usd"}


class HireDevTeamCheckoutRequest(BaseModel):
    origin_url: str  # e.g. https://teamnest.ai


@router.post("/chats/{chat_id}/hire-dev-team/checkout")
async def hire_dev_team_checkout(
    chat_id: str,
    payload: HireDevTeamCheckoutRequest,
    current=Depends(require_user),
):
    """Create a one-shot Stripe checkout (price from HIRE_DEVMANAGER_PRICE_USD)
    that, when paid, attaches @devmanager to this chat and converts it into a
    development chat with a linked Dev OS project. Idempotent at the chat level.

    Demo bypass: the public demo account (`amit@demo.team`) skips Stripe and
    gets the team provisioned immediately — so evaluators can actually try
    the "hire team → build software" flow without a payment step blocking them.
    """
    import os

    from emergentintegrations.payments.stripe.checkout import (
        CheckoutSessionRequest,
        StripeCheckout,
    )

    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")
    if chat.get("dev_team_hired"):
        raise HTTPException(400, "AI dev team is already hired for this chat")

    # ── Demo workspace & super-admin bypass ─────────────────────────
    # The public demo account AND platform super admins (e.g. the workspace
    # owner) get the team provisioned for free so they can exercise the
    # hire → build flow without a payment step. Real workspaces still go
    # through Stripe.
    if current.get("email") == "amit@demo.team" or is_super_admin(current):
        result = await _provision_dev_team_for_chat(chat_id, current["id"])
        return {
            "provisioned": True,
            "demo": True,
            "chat_id": chat_id,
            "project_id": (result.get("project") or {}).get("id"),
            "already_hired": result.get("already_hired", False),
        }

    # Idempotency: if the same user opened a checkout for this chat within
    # the last 5 minutes that hasn't been completed/expired yet, return that
    # session URL instead of minting a brand-new one. Prevents accidental
    # double-clicks creating multiple pending payment_transactions rows.
    from datetime import datetime, timedelta, timezone
    recent_cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    existing = await db.payment_transactions.find_one(
        {
            "chat_id": chat_id,
            "user_id": current["id"],
            "plan_id": "hire_dev_team",
            "status": "pending",
            "created_at": {"$gte": recent_cutoff},
            "checkout_url": {"$exists": True},
        },
        {"_id": 0, "session_id": 1, "checkout_url": 1},
    )
    if existing and existing.get("checkout_url"):
        return {
            "url": existing["checkout_url"],
            "session_id": existing["session_id"],
            "price_usd": HIRE_DEV_TEAM_PRICE_USD,
        }

    stripe_key = os.environ.get("STRIPE_API_KEY")
    if not stripe_key:
        raise HTTPException(503, "Stripe is not configured on this server")

    origin = (payload.origin_url or "").rstrip("/")
    if not origin:
        raise HTTPException(400, "origin_url is required")

    success_url = (
        f"{origin}/chats/{chat_id}?dev_team_session_id={{CHECKOUT_SESSION_ID}}"
    )
    cancel_url = f"{origin}/chats/{chat_id}?dev_team_canceled=1"

    metadata = {
        "workspace_id": current["workspace_id"],
        "user_id": current["id"],
        "user_email": current["email"],
        "chat_id": chat_id,
        "product": "hire_dev_team",
        "amount_usd": str(HIRE_DEV_TEAM_PRICE_USD),
        "source": "teamnest_chat",
    }

    # Reuse the same one-shot pattern used elsewhere in the app for non-
    # subscription charges so behavior stays consistent with the existing
    # /billing pathway.
    from urllib.parse import urlparse
    parsed = urlparse(origin)
    host_url = f"{parsed.scheme}://{parsed.netloc}"
    webhook_url = f"{host_url}/api/webhook/stripe"
    checkout = StripeCheckout(api_key=stripe_key, webhook_url=webhook_url)
    req = CheckoutSessionRequest(
        amount=HIRE_DEV_TEAM_PRICE_USD,
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
    )
    try:
        session = await checkout.create_checkout_session(req)
    except Exception as e:
        import logging
        logging.getLogger("teamnest").error("[hire] Stripe checkout creation failed: %s", e)
        raise HTTPException(
            502,
            "Payment provider error while starting checkout. This usually means "
            "Stripe isn't configured for this environment — please try again "
            "shortly or contact support.",
        )

    await db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "workspace_id": current["workspace_id"],
        "user_id": current["id"],
        "chat_id": chat_id,
        "plan_id": "hire_dev_team",
        "amount": HIRE_DEV_TEAM_PRICE_USD,
        "currency": "usd",
        "status": "pending",
        "payment_status": "unpaid",
        "is_subscription": False,
        "checkout_url": session.url,
        "metadata": metadata,
        "created_at": now_iso(),
    })

    return {
        "url": session.url,
        "session_id": session.session_id,
        "price_usd": HIRE_DEV_TEAM_PRICE_USD,
    }


async def _provision_dev_team_for_chat(chat_id: str, actor_user_id: str) -> dict:
    """Convert a chat into a development chat with the full AI team hired and
    a linked Dev OS project. Idempotent — safe to call multiple times."""
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Chat not found")

    # Idempotency guard.
    if chat.get("dev_team_hired"):
        existing = await db.dev_projects.find_one(
            {"workspace_id": chat["workspace_id"], "related_chat_id": chat_id},
            {"_id": 0},
        )
        return {"chat_id": chat_id, "project": existing, "already_hired": True}

    await db.chats.update_one(
        {"id": chat_id},
        {"$set": {
            "kind": "development",
            "category": chat.get("category") or "engineering",
            "bot_role_ids": HIRE_DEV_TEAM_ROLES,
            "dev_team_hired": True,
            "dev_team_hired_at": now_iso(),
            "dev_team_hired_by": actor_user_id,
            "updated_at": now_iso(),
        }},
    )

    # Spin up linked Dev OS project if one isn't already attached.
    project = await db.dev_projects.find_one(
        {"workspace_id": chat["workspace_id"], "related_chat_id": chat_id},
        {"_id": 0},
    )
    if not project:
        name = (chat.get("name") or "Untitled chat") + " · Project"
        project = {
            "id": new_id(),
            "workspace_id": chat["workspace_id"],
            "created_by": actor_user_id,
            "name": name[:120],
            "description": "Development project — full AI engineering team hired.",
            "target_users": "",
            "problem": "",
            "source": "hire_dev_team",
            "template_id": None,
            "related_chat_id": chat_id,
            "category": "engineering",
            "plan": {
                "product_brief": (
                    "Full AI dev team hired. Tag `@devmgr` to orchestrate, "
                    "or summon any specialist (`@architect`, `@qa`, `@frontend`…) directly."
                ),
                "_llm_status": "stub",
            },
            "status": "draft",
            "version": "v0.1.0",
            "health": "stable",
            "test_coverage": 0,
            "open_proposals": 0,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.dev_projects.insert_one(project.copy())

    # Celebratory system message + Dev Manager intro (mirrors POST /chats/dev).
    msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "ai-system",
        "body": (
            "🎉 **AI Dev Team hired** — 13 engineers are now on this chat: "
            "Dev Manager, Architect, Frontend, Backend, Database, QA, Security, "
            "DevOps, Reviewer, Designer, Product, Docs, Growth.\n\n"
            f"Linked to project **{project['name']}**. Tag `@devmgr` to coordinate or "
            "pick a specialist with `@dev`."
        ),
        "parent_message_id": None,
        "metadata": {"source": "hire_dev_team", "project_id": project["id"]},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(chat_id, msg)

    intro = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-agent-devmgr",
        "message_type": "ai-agent",
        "body": (
            "🎯 **Dev Manager** · Welcome aboard — I'm coordinating this room now. "
            "Tell me what you want to build in plain English, I'll draft a plan and "
            "delegate to the right specialists. Say `@devmgr ...` and I'll route it."
        ),
        "parent_message_id": None,
        "metadata": {"source": "hire_dev_team_intro", "role": "devmgr", "role_label": "Dev Manager"},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(intro.copy())
    await _broadcast_message(chat_id, intro)

    return {"chat_id": chat_id, "project": project, "already_hired": False}


@router.get("/chats/{chat_id}/hire-dev-team/status/{session_id}")
async def hire_dev_team_status(
    chat_id: str, session_id: str, current=Depends(require_user),
):
    """Polled by the frontend after Stripe redirects back. On first sighting of
    a paid session, provisions the dev team on the chat (idempotent).

    Resiliency: in the Emergent Stripe test proxy, freshly-minted sessions
    cannot be looked up by id (the proxy is fire-and-forget). So we always
    check local payment_transactions first — that's the source of truth
    once Stripe's webhook fires `/api/webhook/stripe`. The proxy lookup is
    only used as a best-effort polling shortcut.
    """
    import os

    from emergentintegrations.payments.stripe.checkout import StripeCheckout

    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Transaction not found")
    if tx["workspace_id"] != current["workspace_id"]:
        raise HTTPException(403, "Not your transaction")
    if tx.get("chat_id") != chat_id:
        raise HTTPException(400, "Session does not belong to this chat")

    # Fast path: webhook (or a prior poll) already finalized this txn locally.
    if tx["status"] == "completed":
        await _provision_dev_team_for_chat(chat_id, current["id"])  # idempotent
        return {
            "session_id": session_id,
            "payment_status": "paid",
            "applied": True,
            "chat_id": chat_id,
        }

    payment_status = "unpaid"
    session_status = "open"
    stripe_key = os.environ.get("STRIPE_API_KEY")
    if stripe_key:
        # Best-effort lookup against the same Stripe surface that minted the
        # session. The Emergent test proxy can 404 on lookup — treat as
        # "still pending" rather than failing the whole poll, because the
        # webhook will eventually drive the real state.
        try:
            checkout = StripeCheckout(api_key=stripe_key, webhook_url="https://unused.local/webhook")
            status = await checkout.get_checkout_status(session_id)
            payment_status = getattr(status, "payment_status", None) or payment_status
            session_status = getattr(status, "status", None) or session_status
        except Exception as e:
            logger.info(
                "[hire-dev-team] status lookup miss (proxy or stripe): %s — falling back to local state",
                str(e)[:160],
            )

    applied = False
    if payment_status == "paid" or session_status == "complete":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": "completed",
                "payment_status": "paid",
                "updated_at": now_iso(),
            }},
        )
        await _provision_dev_team_for_chat(chat_id, current["id"])
        applied = True

    return {
        "session_id": session_id,
        "payment_status": payment_status,
        "applied": applied,
        "chat_id": chat_id,
    }




@router.get("/chats/{chat_id}/messages")
async def list_messages(
    chat_id: str,
    limit: int = Query(100, le=500),
    current=Depends(require_user),
):
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]})
    if not chat:
        raise HTTPException(404, "Chat not found")
    # Honor per-user "cleared_at" → user only sees messages after they cleared.
    msg_query = {"chat_id": chat_id}
    state = await db.user_chat_states.find_one(
        {"user_id": current["id"], "chat_id": chat_id},
        {"_id": 0, "cleared_at": 1},
    )
    if state and state.get("cleared_at"):
        msg_query["created_at"] = {"$gt": state["cleared_at"]}
    msgs = await db.messages.find(msg_query, {"_id": 0}).sort("created_at", 1).to_list(limit)
    return msgs


@router.post("/chats/{chat_id}/read")
async def mark_chat_read(chat_id: str, current=Depends(require_user)):
    """Mark a chat as read for the current user (clears its unread badge)."""
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]}, {"_id": 0, "id": 1})
    if not chat:
        raise HTTPException(404, "Chat not found")
    await db.user_chat_states.update_one(
        {"user_id": current["id"], "chat_id": chat_id},
        {"$set": {"last_read_at": now_iso()},
         "$setOnInsert": {"user_id": current["id"], "chat_id": chat_id}},
        upsert=True,
    )
    return {"ok": True}


class AIStopRequest(BaseModel):
    thread_id: Optional[str] = None


@router.post("/chats/{chat_id}/ai/stop")
async def stop_ai(
    chat_id: str,
    payload: Optional[AIStopRequest] = None,
    current=Depends(require_user),
):
    """Stop an in-progress AI generation for THIS user in the chat. Marks the
    running thread(s) canceled and removes the "thinking" placeholder so the
    in-progress answer is discarded (see handle_ai_command cancel checkpoint)."""
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]}, {"_id": 0, "id": 1})
    if not chat:
        raise HTTPException(404, "Chat not found")
    tq: dict = {"chat_id": chat_id, "created_by": current["id"], "status": "running"}
    if payload and payload.thread_id:
        tq["id"] = payload.thread_id
    thread_ids = [t["id"] for t in await db.ai_threads.find(tq, {"_id": 0, "id": 1}).to_list(20)]
    if not thread_ids:
        return {"ok": True, "canceled": 0}
    await db.ai_threads.update_many({"id": {"$in": thread_ids}}, {"$set": {"status": "canceled"}})
    # Soft-delete the running placeholder question(s) so every client drops the
    # "AI is thinking" indicator immediately.
    placeholders = await db.messages.find(
        {"chat_id": chat_id, "message_type": "ai_question",
         "metadata.thread_id": {"$in": thread_ids}, "deleted_at": None},
        {"_id": 0},
    ).to_list(50)
    stamp = now_iso()
    for ph in placeholders:
        await db.messages.update_one({"id": ph["id"]}, {"$set": {"deleted_at": stamp}})
        ph["deleted_at"] = stamp
        await manager.broadcast(chat_id, {"event": "message_updated", "data": ph})
    return {"ok": True, "canceled": len(thread_ids)}


@router.post("/chats/{chat_id}/leave")
async def leave_chat(chat_id: str, current=Depends(require_user)):
    """Member voluntarily leaves a group chat. Posts a system message so
    other members see they left. Direct/personal-AI chats cannot be left —
    use /clear instead to hide the chat from your own view."""
    chat = await db.chats.find_one(
        {"id": chat_id, "workspace_id": current["workspace_id"], "member_ids": current["id"]},
        {"_id": 0},
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    if chat.get("type") != "group":
        raise HTTPException(
            400,
            "You can only leave group chats. To hide this chat from your view use Delete chat instead.",
        )

    await db.chats.update_one({"id": chat_id}, {"$pull": {"member_ids": current["id"]}})

    # Post system message so others see who left.
    sys_msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "text",
        "body": f'**{current["name"]}** left the chat.',
        "parent_message_id": None,
        "metadata": {"event": "member_left", "user_id": current["id"]},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(sys_msg.copy())
    await _broadcast_message(chat_id, sys_msg)
    return {"ok": True, "left_chat_id": chat_id}


@router.post("/chats/{chat_id}/clear")
async def clear_chat_for_me(chat_id: str, current=Depends(require_user)):
    """Hide chat from MY view and hide every existing message from MY view.
    Other members still see everything. If a new message arrives later, the
    chat re-surfaces in my chat list (WhatsApp-style)."""
    chat = await db.chats.find_one(
        {"id": chat_id, "workspace_id": current["workspace_id"], "member_ids": current["id"]},
        {"_id": 0, "id": 1},
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    await db.user_chat_states.update_one(
        {"user_id": current["id"], "chat_id": chat_id},
        {
            "$set": {
                "user_id": current["id"],
                "chat_id": chat_id,
                "cleared_at": now_iso(),
                "updated_at": now_iso(),
            }
        },
        upsert=True,
    )
    return {"ok": True, "cleared_at": now_iso()}


@router.post("/chats/{chat_id}/messages")
async def send_message(
    chat_id: str, payload: MessageCreate, current=Depends(require_user)
):
    chat = await db.chats.find_one({"id": chat_id, "member_ids": current["id"]})
    if not chat:
        raise HTTPException(404, "Chat not found")
    # AI Conversation Mode — explicit exit commands (/exit-ai, /team) end the
    # user's AI session without posting the command as a chat message.
    from services import ai_conversation as _aiconv
    if payload.message_type == "text" and (payload.body or "").strip().lower() in _aiconv.EXIT_COMMANDS:
        await _aiconv.end_session(chat_id, current["id"], reason="user_command")
        return {"ai_session_ended": True}
    # Posting policy enforcement (group chats only).
    if chat.get("type") == "group":
        policy = chat.get("posting_policy") or "all"
        admin_ids = chat.get("admin_ids") or []
        posting_user_ids = chat.get("posting_user_ids") or []
        is_admin = current["id"] in admin_ids
        # System messages from broadcast helpers don't pass through this route
        # — they call _broadcast_message directly — so we only have to gate
        # plain "text" sends here. AI question/answer messages also need to
        # be allowed so people can still query AI in a restricted group.
        # Granular permissions: explicit viewer role overrides any policy.
        viewer_ids = chat.get("viewer_ids") or []
        if current["id"] in viewer_ids and not is_admin:
            raise HTTPException(403, "You are a viewer in this chat — read-only access.")
        if payload.message_type == "text":
            if policy == "admin_only" and not is_admin:
                raise HTTPException(
                    403,
                    "Only admins can post in this chat. You can still react, reply in threads, and ask AI.",
                )
            if policy == "selected":
                allowed = set(posting_user_ids) | set(admin_ids)
                if current["id"] not in allowed:
                    raise HTTPException(
                        403,
                        "You don't have permission to post in this chat. Ask an admin to add you to the posters list.",
                    )
    msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": current["id"],
        "message_type": payload.message_type,
        "body": payload.body,
        "parent_message_id": payload.parent_message_id,
        "metadata": payload.metadata or {},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(chat_id, msg)

    # Mobile push notifications — best-effort, fire-and-forget. Notifies all
    # other chat members on iOS/Android via FCM/APNs. Falls back silently if
    # Firebase isn't configured (still works on web via SSE).
    import asyncio as _asyncio
    from services.push_service import send_to_user as _push_to_user
    sender_name = current.get("name") or current.get("email") or "Someone"
    preview = (payload.body or "").strip()[:140]
    if preview:
        for mid in (chat.get("member_ids") or []):
            if mid == current["id"]:
                continue
            _asyncio.create_task(_push_to_user(
                mid,
                f"{sender_name} · {chat.get('name') or 'TeamNest'}",
                preview,
                {"chat_id": chat_id, "message_id": msg["id"], "type": "chat"},
            ))

    parsed = parse_ai_command(payload.body)
    msg_attachments = (payload.metadata or {}).get("attachments") or []
    if parsed.get("is_ai"):
        # Model selection precedence:
        #   1. per-message popup choice (metadata.selected_models)
        #   2. explicit models typed in text (e.g. "@ai ask claude ...")
        #   3. this chat's remembered inline choice (chat.inline_ai_models)
        #   4. default fast model
        override = (payload.metadata or {}).get("selected_models")
        override_valid = [m for m in override if isinstance(m, str)] if isinstance(override, list) else []
        if override_valid:
            models = override_valid
        elif not parsed.get("default_models", True):
            models = parsed["models"]
        elif chat.get("inline_ai_models"):
            models = chat["inline_ai_models"]
        else:
            models = parsed["models"]
        # "Remember for this chat": persist so we stop asking (and auto-continue
        # follow-ups reuse it).
        if override_valid and (payload.metadata or {}).get("remember_models"):
            await db.chats.update_one({"id": chat_id}, {"$set": {"inline_ai_models": override_valid}})
        asyncio.create_task(
            handle_ai_command(
                chat_id, current["id"], parsed["question"], models,
                compare=parsed.get("compare", False),
                attachments=msg_attachments,
            )
        )
    elif (
        chat.get("type") == "personal_ai"
        and payload.message_type == "text"
        and msg_attachments
    ):
        # In the personal "My AI Assistant" chat, attaching file(s) with any
        # message auto-triggers research on those files — no explicit @ai needed.
        auto_q = (payload.body or "").strip() or (
            "Summarize and extract the key data from the attached file(s)."
        )
        asyncio.create_task(
            handle_ai_command(
                chat_id, current["id"], auto_q, ["gpt-4o-mini"],
                attachments=msg_attachments,
            )
        )

    # Background: opportunistically auto-categorize after the 5th human msg.
    try:
        from services.chat_categorize import maybe_auto_categorize
        asyncio.create_task(maybe_auto_categorize(chat))
    except Exception:
        pass

    task_cmd = parse_task_command(payload.body)
    if task_cmd.get("is_task"):
        asyncio.create_task(
            handle_inline_task(chat_id, current, msg["id"], task_cmd)
        )

    # AI Employee inline commands (CMO / Sales / Paralegal / Restaurant / Bill Pay).
    from services.ai_employee_dispatcher import schedule_employee_if_addressed
    schedule_employee_if_addressed(chat, current, msg)

    # Deployed custom AI employees (from the Builder) — auto-respond when their
    # @handle is mentioned in a chat they're deployed to.
    from services.ai_employee_deploy_dispatcher import schedule_deployed_employee_if_mentioned
    schedule_deployed_employee_if_mentioned(chat, current, msg)

    # Dev OS slash commands: `/dev-os scan`, `/dev-os new <name>`, `/dev-os task`, `/dev-os bug`, `/dev-os plan`, `/dev-os help`
    from services.dev_os_slash import schedule_devos_if_addressed
    is_devos_slash = schedule_devos_if_addressed(chat, current, msg)

    # Dev Chat — AI agent mentions: @devmgr / @dev / @architect / @qa / ...
    # Cheap guard: only runs when chat.kind == 'development'.
    from services.dev_chat_agents import maybe_handle_dev_chat_mentions
    triggered_dev_agents = await maybe_handle_dev_chat_mentions(chat, msg)

    # Chat-native Dev OS auto-suggest. Only on normal text (not slash commands,
    # AI questions, dev-agent mentions, or system events) and only when no project is yet linked.
    if (
        payload.message_type == "text"
        and not is_devos_slash
        and not triggered_dev_agents
        and not parsed.get("is_ai")
    ):
        from services.dev_os_chat_suggest import maybe_suggest
        asyncio.create_task(maybe_suggest(chat, current))

    # AI Conversation Mode — for a plain text message that isn't already an AI
    # command / task / dev / slash trigger, decide whether it's a follow-up to
    # the user's active AI conversation and route accordingly (per-user).
    is_command_like = (
        parsed.get("is_ai")
        or task_cmd.get("is_task")
        or is_devos_slash
        or triggered_dev_agents
    )
    # Multi-assistant switch banner — note which assistant this message
    # addressed; emit "Active AI changed from @X to @Y" when the user switches.
    _invoked = None
    if parsed.get("is_ai"):
        _invoked = ("ai", "@ai")
    elif triggered_dev_agents:
        _invoked = ("devmanager", "@devmanager")
    if _invoked:
        try:
            await _aiconv.note_active_assistant(
                workspace_id=current.get("workspace_id"), chat_id=chat_id,
                user_id=current["id"], assistant_id=_invoked[0], assistant_label=_invoked[1],
            )
        except Exception as e:
            logger.warning("[ai-conv] note_active_assistant failed: %s", e)
    if (
        payload.message_type == "text"
        and not is_command_like
        and chat.get("kind") != "development"
        and not ((payload.metadata or {}).get("attachments"))
        and payload.force_recipient != "team"
    ):
        try:
            await _aiconv.route_untagged_message(chat, current, msg)
        except Exception as e:
            logger.warning("[ai-conv] route_untagged_message failed: %s", e)

    return msg


@router.patch("/messages/{message_id}")
async def edit_message(message_id: str, payload: MessageEdit, current=Depends(require_user)):
    msg = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg["sender_id"] != current["id"]:
        raise HTTPException(403, "Cannot edit others' messages")
    await db.messages.update_one(
        {"id": message_id},
        {"$set": {"body": payload.body, "edited_at": now_iso()}},
    )
    updated = await db.messages.find_one({"id": message_id}, {"_id": 0})
    await manager.broadcast(msg["chat_id"], {"event": "message_updated", "data": updated})
    return updated


@router.delete("/messages/{message_id}")
async def delete_message(message_id: str, current=Depends(require_user)):
    msg = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg["sender_id"] != current["id"]:
        raise HTTPException(403, "Cannot delete others' messages")
    await db.messages.update_one(
        {"id": message_id}, {"$set": {"deleted_at": now_iso(), "body": "[deleted]"}}
    )
    updated = await db.messages.find_one({"id": message_id}, {"_id": 0})
    await manager.broadcast(msg["chat_id"], {"event": "message_updated", "data": updated})
    return {"ok": True}


@router.post("/messages/{message_id}/react")
async def react_message(message_id: str, payload: MessageReact, current=Depends(require_user)):
    msg = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found")
    reactions = msg.get("reactions") or {}
    users = set(reactions.get(payload.emoji, []))
    if current["id"] in users:
        users.discard(current["id"])
    else:
        users.add(current["id"])
    if users:
        reactions[payload.emoji] = list(users)
    else:
        reactions.pop(payload.emoji, None)
    await db.messages.update_one(
        {"id": message_id}, {"$set": {"reactions": reactions}}
    )
    updated = await db.messages.find_one({"id": message_id}, {"_id": 0})
    await manager.broadcast(msg["chat_id"], {"event": "message_updated", "data": updated})
    return updated


@router.post("/messages/{message_id}/pin")
async def pin_message(message_id: str, current=Depends(require_user)):
    msg = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found")
    chat = await db.chats.find_one({"id": msg["chat_id"]}, {"_id": 0})
    pinned = chat.get("pinned_message_ids") or []
    if message_id in pinned:
        pinned.remove(message_id)
    else:
        pinned.append(message_id)
    await db.chats.update_one({"id": chat["id"]}, {"$set": {"pinned_message_ids": pinned}})
    return {"pinned_message_ids": pinned}



async def _resolve_or_create_invitee(
    payload: InviteGuestToChat, current: dict, role: str = "guest"
) -> dict:
    """Return either an existing user (by user_id / email) or a freshly-created
    account. `role` controls the role stamped on brand-new accounts ("guest"
    for chat-scoped guests, "member" for full workspace members)."""
    if payload.user_id:
        target_user = await db.users.find_one({"id": payload.user_id}, PROJ)
        if not target_user:
            raise HTTPException(404, "User not found")
        return target_user
    if not payload.email:
        raise HTTPException(400, "Provide either user_id or email")

    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        return existing
    return await _create_guest_account(payload, current, role=role)


async def _create_guest_account(
    payload: InviteGuestToChat, current: dict, role: str = "guest"
) -> dict:
    """Insert a fresh user record with a one-time password. `role` is "guest"
    for chat-scoped guests or "member" for full workspace members."""
    phone_norm = normalize_phone(payload.phone)
    if phone_norm:
        phone_clash = await db.users.find_one({"phone_normalized": phone_norm})
        if phone_clash:
            raise HTTPException(400, "Phone number is already registered")
    import secrets as _secrets
    prefix = "Member" if role == "member" else "Guest"
    one_time_pwd = f"{prefix}-{_secrets.token_urlsafe(6)}"
    target_user = {
        "id": new_id(),
        "name": (payload.name or payload.email.split("@", 1)[0]).strip(),
        "email": payload.email.lower(),
        "phone": payload.phone or None,
        "phone_normalized": phone_norm or None,
        "password_hash": hash_password(one_time_pwd),
        "must_change_password": True,
        "avatar": None,
        "role": role,
        "workspace_id": current["workspace_id"],
        "status": "active",
        "created_at": now_iso(),
        "preferences": {"favorite_ai_model": "claude", "favorite_models": []},
    }
    await db.users.insert_one(target_user.copy())
    target_user["_one_time_password"] = one_time_pwd
    return target_user


async def _post_guest_added_system_message(chat_id: str, current: dict, target_user: dict):
    """Drop a system message into the chat announcing the new guest."""
    sys_msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "text",
        "body": f'{current["name"]} added **{target_user["name"]}** as a guest collaborator.',
        "parent_message_id": None,
        "metadata": {"event": "guest_added", "guest_id": target_user["id"]},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(sys_msg.copy())
    await _broadcast_message(chat_id, sys_msg)


@router.post("/chats/{chat_id}/invite-guest")
async def invite_guest_to_chat(
    chat_id: str, payload: InviteGuestToChat, current=Depends(require_user)
):
    """Invite a single-chat guest collaborator.

    Two paths:
    * `user_id` provided → add that existing TeamNest user as a guest scoped
      to this chat only.
    * `email` provided → create a fresh "guest" user (auto-generated password
      is communicated via the response so the inviter can share it).
    """
    chat = await db.chats.find_one(
        {"id": chat_id, "member_ids": current["id"], "workspace_id": current["workspace_id"]},
        {"_id": 0},
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    if current.get("role") not in ("owner", "admin", "member"):
        raise HTTPException(403, "You don't have permission to invite guests")

    target_user = await _resolve_or_create_invitee(payload, current)

    if target_user["id"] == current["id"]:
        raise HTTPException(400, "You can't invite yourself as a guest")
    if target_user["id"] in (chat.get("member_ids") or []):
        raise HTTPException(400, "User is already in this chat")

    # Scope guest to this chat only
    existing_mem = await db.workspace_members.find_one(
        {"user_id": target_user["id"], "workspace_id": current["workspace_id"]},
        {"_id": 0, "chat_scope_ids": 1},
    )
    new_scope = list(set((existing_mem or {}).get("chat_scope_ids") or []) | {chat_id})
    await ensure_membership(
        target_user["id"], current["workspace_id"], role="guest", chat_scope_ids=new_scope,
    )

    await db.chats.update_one({"id": chat_id}, {"$addToSet": {"member_ids": target_user["id"]}})
    await _post_guest_added_system_message(chat_id, current, target_user)

    try:
        await _post_reminder(
            target_user["id"],
            f'{current["name"]} invited you as a guest to "{chat.get("name") or "a chat"}".',
            {"id": chat_id},
        )
    except Exception:
        pass

    response = public_user(target_user)
    response["chat_id"] = chat_id
    response["role"] = "guest"
    response["chat_scope_ids"] = new_scope
    if target_user.get("_one_time_password"):
        response["one_time_password"] = target_user["_one_time_password"]
        response["created_new_account"] = True
    return response


@router.post("/chats/{chat_id}/invite-member")
async def invite_member_to_chat(
    chat_id: str, payload: InviteGuestToChat, current=Depends(require_user)
):
    """Invite someone into this chat as a full workspace **member** (unlike
    guests, members are not chat-scoped and can see the whole workspace).

    Two paths, mirroring invite-guest:
    * `user_id` / existing `email` → add that TeamNest user to this workspace
      as a member (if not already) and to this chat.
    * brand-new `email` → create a member account with a one-time password
      (returned so the inviter can share it) and add them to the chat.
    """
    chat = await db.chats.find_one(
        {"id": chat_id, "member_ids": current["id"]}, {"_id": 0}
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    _ensure_chat_admin(chat, current["id"])

    target_user = await _resolve_or_create_invitee(payload, current, role="member")

    if target_user["id"] == current["id"]:
        raise HTTPException(400, "You can't invite yourself")
    if target_user["id"] in (chat.get("member_ids") or []):
        raise HTTPException(400, "User is already in this chat")

    # Ensure a full (non-scoped) workspace membership as a member.
    await ensure_membership(
        target_user["id"], current["workspace_id"], role="member",
    )

    await db.chats.update_one(
        {"id": chat_id}, {"$addToSet": {"member_ids": target_user["id"]}}
    )

    sys_msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "text",
        "body": f'**{target_user["name"]}** was added by **{current["name"]}**.',
        "parent_message_id": None,
        "metadata": {"event": "members_added", "user_ids": [target_user["id"]], "by": current["id"]},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(sys_msg.copy())
    await _broadcast_message(chat_id, sys_msg)

    try:
        await _post_reminder(
            target_user["id"],
            f'{current["name"]} added you to "{chat.get("name") or "a chat"}".',
            {"id": chat_id},
        )
    except Exception:
        pass

    response = public_user(target_user)
    response["chat_id"] = chat_id
    response["role"] = "member"
    if target_user.get("_one_time_password"):
        response["one_time_password"] = target_user["_one_time_password"]
        response["created_new_account"] = True
    return response




@router.get("/chats/{chat_id}/guests")
async def list_chat_guests(chat_id: str, current=Depends(require_user)):
    """List users who are members of THIS chat with role='guest' (chat-scoped)."""
    chat = await db.chats.find_one(
        {"id": chat_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    member_ids = chat.get("member_ids") or []
    guests = []
    async for m in db.workspace_members.find(
        {
            "workspace_id": current["workspace_id"],
            "user_id": {"$in": member_ids},
            "role": "guest",
        },
        {"_id": 0},
    ):
        user = await db.users.find_one({"id": m["user_id"]}, PROJ)
        if not user:
            continue
        guests.append({
            **public_user(user),
            "joined_at": m.get("joined_at"),
            "chat_scope_ids": m.get("chat_scope_ids") or [],
        })
    return guests


@router.delete("/chats/{chat_id}/guests/{user_id}")
async def remove_guest_from_chat(
    chat_id: str, user_id: str, current=Depends(require_user)
):
    """Remove a guest from a specific chat. If they have no other chats in
    their scope after removal, they're removed from the workspace entirely."""
    chat = await db.chats.find_one(
        {"id": chat_id, "workspace_id": current["workspace_id"], "member_ids": current["id"]},
        {"_id": 0},
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    # Only owner/admin can revoke guests; regular members can invite but not kick.
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only workspace owner or admin can remove guests")
    member = await db.workspace_members.find_one(
        {"user_id": user_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not member or member.get("role") != "guest":
        raise HTTPException(400, "Target is not a guest of this workspace")

    new_scope = [c for c in (member.get("chat_scope_ids") or []) if c != chat_id]
    await db.chats.update_one({"id": chat_id}, {"$pull": {"member_ids": user_id}})

    if not new_scope:
        await db.workspace_members.update_one(
            {"user_id": user_id, "workspace_id": current["workspace_id"]},
            {"$set": {"status": "removed", "chat_scope_ids": []}},
        )
    else:
        await db.workspace_members.update_one(
            {"user_id": user_id, "workspace_id": current["workspace_id"]},
            {"$set": {"chat_scope_ids": new_scope}},
        )

    guest_user = await db.users.find_one({"id": user_id}, PROJ)
    sys_msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "text",
        "body": f'{current["name"]} removed **{(guest_user or {}).get("name", "guest")}** from this chat.',
        "parent_message_id": None,
        "metadata": {"event": "guest_removed", "guest_id": user_id},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(sys_msg.copy())
    await _broadcast_message(chat_id, sys_msg)
    return {"ok": True, "still_in_workspace": bool(new_scope)}
