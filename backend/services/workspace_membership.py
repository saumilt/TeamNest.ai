"""Multi-workspace membership service.

A user can be a member of multiple workspaces. The source of truth for "who is
in what workspace with what role" is the `workspace_members` collection:

    { user_id, workspace_id, role, status, joined_at }

The `users.workspace_id` field is now the user's CURRENT/ACTIVE workspace
pointer; switching workspaces updates that pointer. `users.role` is kept as a
legacy fallback for users that haven't been migrated yet.
"""
from deps import PROJ, db, ensure_personal_ai_chat, logger, now_iso


async def ensure_membership(
    user_id: str,
    workspace_id: str,
    role: str = "member",
    status: str = "active",
    chat_scope_ids: list | None = None,
) -> dict:
    """Idempotently create OR re-activate a workspace_members row.

    `chat_scope_ids` restricts a member to specific chats only (used for
    single-chat guest collaborators). When None we leave the existing scope
    alone; when [] we explicitly clear it (full workspace access).
    """
    existing = await db.workspace_members.find_one(
        {"user_id": user_id, "workspace_id": workspace_id}, {"_id": 0}
    )
    if existing:
        update_set: dict = {}
        if existing.get("status") == "removed":
            update_set.update({"status": status, "role": role, "joined_at": now_iso()})
        if chat_scope_ids is not None:
            update_set["chat_scope_ids"] = list(chat_scope_ids) or None
        if update_set:
            await db.workspace_members.update_one(
                {"user_id": user_id, "workspace_id": workspace_id},
                {"$set": update_set},
            )
            existing.update(update_set)
        return existing
    rec = {
        "user_id": user_id,
        "workspace_id": workspace_id,
        "role": role,
        "status": status,
        "joined_at": now_iso(),
        "chat_scope_ids": list(chat_scope_ids) if chat_scope_ids else None,
    }
    await db.workspace_members.insert_one(rec.copy())
    # Make sure the user has a personal AI chat in this workspace too — but
    # NOT for chat-scoped guests; a guest only sees the chats they were
    # explicitly invited to.
    if not chat_scope_ids:
        try:
            await ensure_personal_ai_chat(user_id, workspace_id)
        except Exception as e:
            logger.warning("ensure_personal_ai_chat failed during membership creation: %s", e)
    return rec


async def get_membership(user_id: str, workspace_id: str) -> dict | None:
    return await db.workspace_members.find_one(
        {"user_id": user_id, "workspace_id": workspace_id}, {"_id": 0}
    )


async def list_user_workspaces(user_id: str) -> list:
    """Return all workspaces the user is in, joined with the workspace doc."""
    memberships = await db.workspace_members.find(
        {"user_id": user_id, "status": {"$ne": "removed"}}, {"_id": 0}
    ).to_list(100)
    if not memberships:
        return []
    ws_ids = [m["workspace_id"] for m in memberships]
    workspaces = await db.workspaces.find(
        {"id": {"$in": ws_ids}}, {"_id": 0}
    ).to_list(100)
    by_id = {w["id"]: w for w in workspaces}
    out = []
    for m in memberships:
        w = by_id.get(m["workspace_id"])
        if not w:
            continue
        out.append({
            "workspace_id": m["workspace_id"],
            "name": w.get("name", "Workspace"),
            "role": m.get("role", "member"),
            "status": m.get("status", "active"),
            "joined_at": m.get("joined_at"),
            "owner_id": w.get("owner_id"),
        })
    # Stable order: own workspaces first (owner role), then by joined_at.
    out.sort(key=lambda x: (0 if x["role"] == "owner" else 1, x.get("joined_at") or ""))
    return out


async def list_workspace_members(workspace_id: str) -> list:
    """Return every user in this workspace with their per-workspace role."""
    memberships = await db.workspace_members.find(
        {"workspace_id": workspace_id, "status": {"$ne": "removed"}}, {"_id": 0}
    ).to_list(1000)
    if not memberships:
        return []
    user_ids = [m["user_id"] for m in memberships]
    users = await db.users.find({"id": {"$in": user_ids}}, PROJ).to_list(1000)
    role_by_uid = {m["user_id"]: m for m in memberships}
    out = []
    for u in users:
        m = role_by_uid.get(u["id"], {})
        # Overlay the per-workspace role + status on the user dict so all
        # downstream code (which expects `role`/`status`) keeps working.
        u_copy = dict(u)
        u_copy["role"] = m.get("role") or u.get("role", "member")
        u_copy["status"] = m.get("status") or u.get("status", "active")
        out.append(u_copy)
    return out


async def migrate_legacy_users(db_) -> int:
    """One-time migration: every user with `workspace_id` but no `workspace_members`
    row gets one. Also backfills `phone_normalized` from `phone` when missing.
    Idempotent — safe to run on every startup."""
    migrated = 0
    async for u in db_.users.find(
        {"workspace_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "workspace_id": 1, "role": 1, "status": 1, "created_at": 1, "phone": 1, "phone_normalized": 1},
    ):
        ws_id = u["workspace_id"]
        already = await db_.workspace_members.find_one(
            {"user_id": u["id"], "workspace_id": ws_id}, {"_id": 0, "user_id": 1}
        )
        if not already:
            await db_.workspace_members.insert_one({
                "user_id": u["id"],
                "workspace_id": ws_id,
                "role": u.get("role", "member"),
                "status": u.get("status", "active"),
                "joined_at": u.get("created_at") or now_iso(),
            })
            migrated += 1
        # Phone normalization backfill
        if u.get("phone") and not u.get("phone_normalized"):
            digits = "".join(c for c in str(u["phone"]) if c.isdigit())
            if digits:
                await db_.users.update_one(
                    {"id": u["id"]}, {"$set": {"phone_normalized": digits}}
                )
    if migrated:
        logger.info("[migrate] backfilled %d workspace_members rows", migrated)
    return migrated
