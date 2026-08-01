"""Multi-scope AI credit governance.

Workspace admins set HARD credit caps at four scopes:

  * user       — a single member (scope_id = user_id)
  * chat       — a single chat/group (scope_id = chat_id)
  * workspace  — the whole workspace (scope_id = workspace_id)
  * enterprise — every workspace owned by the same org owner (scope_id = owner_id)

Enforcement is MOST-RESTRICTIVE-WINS: an AI request is blocked if it would push
usage past ANY applicable cap. Caps reset with the workspace's monthly billing
period (usage is summed from `ai_credit_ledger` since `period_start`).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from deps import db, new_id, now_iso
from services.billing import get_subscription

SCOPES = ("user", "chat", "workspace", "enterprise")


async def _period_start_iso(workspace_id: str) -> str:
    sub = await get_subscription(workspace_id)
    return sub.get("period_start") or "1970-01-01T00:00:00+00:00"


async def _org_workspace_ids(workspace_id: str) -> List[str]:
    """All workspace ids owned by the same owner as `workspace_id` (the 'org')."""
    ws = await db.workspaces.find_one({"id": workspace_id}, {"_id": 0, "owner_id": 1})
    owner_id = (ws or {}).get("owner_id")
    if not owner_id:
        return [workspace_id]
    ids = set()
    async for w in db.workspaces.find({"owner_id": owner_id}, {"_id": 0, "id": 1}):
        ids.add(w["id"])
    ids.add(workspace_id)
    return list(ids)


async def _usage_for(workspace_id: str, scope: str, scope_id: str, since_iso: str) -> int:
    """Credits consumed this period for a given scope (from the credit ledger)."""
    if scope == "user":
        match = {"workspace_id": workspace_id, "user_id": scope_id, "at": {"$gte": since_iso}}
    elif scope == "chat":
        match = {"workspace_id": workspace_id, "chat_id": scope_id, "at": {"$gte": since_iso}}
    elif scope == "workspace":
        match = {"workspace_id": scope_id, "at": {"$gte": since_iso}}
    elif scope == "enterprise":
        match = {"workspace_id": {"$in": await _org_workspace_ids(workspace_id)},
                 "at": {"$gte": since_iso}}
    else:
        return 0
    cur = db.ai_credit_ledger.aggregate([
        {"$match": match},
        {"$group": {"_id": None, "credits": {"$sum": "$amount"}}},
    ])
    rows = await cur.to_list(1)
    return int(rows[0]["credits"]) if rows else 0


async def list_caps(workspace_id: str) -> List[Dict[str, Any]]:
    return await db.credit_caps.find({"workspace_id": workspace_id}, {"_id": 0}).to_list(500)


async def set_cap(workspace_id: str, scope: str, scope_id: str, limit_credits: int,
                  created_by: str) -> Dict[str, Any]:
    if scope not in SCOPES:
        raise ValueError("invalid scope")
    if int(limit_credits) < 0:
        raise ValueError("limit must be >= 0")
    await db.credit_caps.update_one(
        {"workspace_id": workspace_id, "scope": scope, "scope_id": scope_id},
        {"$set": {"limit_credits": int(limit_credits), "updated_at": now_iso(),
                  "updated_by": created_by},
         "$setOnInsert": {"id": new_id(), "created_at": now_iso(), "created_by": created_by}},
        upsert=True,
    )
    return await db.credit_caps.find_one(
        {"workspace_id": workspace_id, "scope": scope, "scope_id": scope_id}, {"_id": 0})


async def delete_cap(workspace_id: str, scope: str, scope_id: str) -> bool:
    r = await db.credit_caps.delete_one(
        {"workspace_id": workspace_id, "scope": scope, "scope_id": scope_id})
    return r.deleted_count > 0


async def check_caps(workspace_id: str, user_id: Optional[str], chat_id: Optional[str],
                     cost: int) -> Dict[str, Any]:
    """Return {allowed, reason?, scope?, limit?, used?}. Most-restrictive-wins."""
    caps = await list_caps(workspace_id)
    if not caps:
        return {"allowed": True}
    since = await _period_start_iso(workspace_id)
    # Order matters only for which message we surface first; check the tightest
    # (smallest remaining) so the user gets the real binding limit.
    applicable = []
    for c in caps:
        scope, sid = c["scope"], c["scope_id"]
        if scope == "user" and sid != user_id:
            continue
        if scope == "chat" and sid != chat_id:
            continue
        applicable.append(c)
    blockers = []
    for c in applicable:
        used = await _usage_for(workspace_id, c["scope"], c["scope_id"], since)
        limit = int(c["limit_credits"])
        if used + cost > limit:
            blockers.append({"scope": c["scope"], "limit": limit, "used": used,
                             "remaining": max(0, limit - used)})
    if blockers:
        b = min(blockers, key=lambda x: x["remaining"])
        label = {"user": "your personal", "chat": "this chat's", "workspace": "the workspace's",
                 "enterprise": "the enterprise"}.get(b["scope"], b["scope"])
        return {
            "allowed": False,
            "reason": (f"AI credit limit reached — {label} cap of {b['limit']} credits "
                       f"is used up ({b['used']}/{b['limit']}). Ask your workspace admin "
                       f"to raise it, or wait for the monthly reset."),
            "scope": b["scope"], "limit": b["limit"], "used": b["used"],
        }
    return {"allowed": True}


async def caps_status(workspace_id: str) -> List[Dict[str, Any]]:
    """Caps with live usage for the admin dashboard."""
    caps = await list_caps(workspace_id)
    since = await _period_start_iso(workspace_id)
    out = []
    for c in caps:
        used = await _usage_for(workspace_id, c["scope"], c["scope_id"], since)
        limit = int(c["limit_credits"])
        out.append({**c, "used": used, "remaining": max(0, limit - used),
                    "pct": round(used / limit * 100) if limit else 0})
    return out


async def user_budget_status(workspace_id: str, user_id: str) -> List[Dict[str, Any]]:
    """Live budget status for the caps that apply to THIS user (for the in-app
    nudge). Includes their personal (user) cap plus any workspace/enterprise cap
    they're subject to; chat caps are excluded (not user-specific). Sorted by
    the tightest (highest pct) first so the UI can nudge on the binding cap."""
    caps = await list_caps(workspace_id)
    since = await _period_start_iso(workspace_id)
    labels = {"user": "your personal", "workspace": "the workspace", "enterprise": "the enterprise"}
    out = []
    for c in caps:
        scope = c["scope"]
        if scope == "chat":
            continue
        if scope == "user" and c["scope_id"] != user_id:
            continue
        limit = int(c["limit_credits"])
        if limit <= 0:
            continue
        used = await _usage_for(workspace_id, scope, c["scope_id"], since)
        out.append({
            "scope": scope, "scope_id": c["scope_id"], "limit": limit, "used": used,
            "remaining": max(0, limit - used), "pct": round(used / limit * 100),
            "label": labels.get(scope, scope),
        })
    out.sort(key=lambda x: x["pct"], reverse=True)
    return out



async def enforce_caps(workspace_id: str, user_id: Optional[str], chat_id: Optional[str],
                       cost: int) -> None:
    """Raise HTTPException(402) with a structured payload when any applicable
    cap would be exceeded. Use at the entry of non-chat AI spend paths (Dev OS
    builds, calls). The frontend detects `detail.code == 'credit_limit_reached'`
    to show a dedicated limit toast/CTA."""
    from fastapi import HTTPException
    res = await check_caps(workspace_id, user_id, chat_id, cost)
    if not res["allowed"]:
        raise HTTPException(402, {
            "code": "credit_limit_reached",
            "message": res["reason"],
            "scope": res.get("scope"),
            "limit": res.get("limit"),
            "used": res.get("used"),
        })


async def check_and_alert(workspace_id: str, user_id: Optional[str], chat_id: Optional[str]) -> None:
    """Fire in-app (+ email) alerts the first time any applicable cap crosses
    80% or 100% this period. Deduped per (cap, threshold, period). Best-effort."""
    try:
        caps = await list_caps(workspace_id)
        if not caps:
            return
        since = await _period_start_iso(workspace_id)
        period_key = since[:7]
        applicable = [
            c for c in caps
            if not (c["scope"] == "user" and c["scope_id"] != user_id)
            and not (c["scope"] == "chat" and c["scope_id"] != chat_id)
        ]
        for c in applicable:
            limit = int(c["limit_credits"])
            if limit <= 0:
                continue
            used = await _usage_for(workspace_id, c["scope"], c["scope_id"], since)
            pct = used / limit
            for label, thr in (("100%", 1.0), ("80%", 0.8)):
                if pct < thr:
                    continue
                exists = await db.credit_cap_alerts.find_one({
                    "workspace_id": workspace_id, "scope": c["scope"],
                    "scope_id": c["scope_id"], "threshold": label, "period": period_key,
                })
                if exists:
                    break
                await db.credit_cap_alerts.insert_one({
                    "id": new_id(), "workspace_id": workspace_id, "scope": c["scope"],
                    "scope_id": c["scope_id"], "threshold": label, "period": period_key,
                    "used": used, "limit": limit, "created_at": now_iso(),
                })
                await _notify_owners(workspace_id, c, label, used, limit)
                break  # only the highest crossed threshold per cap per run
    except Exception as e:  # pragma: no cover
        from deps import logger
        logger.warning("[credit-gov] alert check failed: %s", e)


async def _notify_owners(workspace_id: str, cap: dict, label: str, used: int, limit: int) -> None:
    scope_label = {"user": "a user's", "chat": "a chat's", "workspace": "the workspace's",
                   "enterprise": "the enterprise"}.get(cap["scope"], cap["scope"])
    title = ("AI credit limit reached" if label == "100%"
             else "AI credit limit almost reached")
    body = (f"{scope_label} AI credit cap is at {label} ({used}/{limit} credits used "
            f"this month).")
    from routes.notifications_feed import create_notification
    owners = await db.users.find(
        {"workspace_id": workspace_id, "role": {"$in": ["owner", "admin"]}},
        {"_id": 0, "id": 1, "email": 1, "name": 1},
    ).to_list(50)
    for o in owners:
        try:
            await create_notification(
                o["id"], "credit_cap_alert", title, body,
                meta={"scope": cap["scope"], "scope_id": cap["scope_id"],
                      "threshold": label, "used": used, "limit": limit},
            )
        except Exception:
            pass
    # Also nudge the affected member directly for their PERSONAL cap so cost
    # control is proactive for the person spending (owners already covered above).
    if cap["scope"] == "user" and cap["scope_id"] not in {o["id"] for o in owners}:
        u_title = ("You've reached your AI credit limit" if label == "100%"
                   else "You're nearing your AI credit limit")
        u_body = (f"You've used {label} of your monthly AI credit budget "
                  f"({used}/{limit} credits). "
                  + ("Ask your workspace admin to raise it or wait for the monthly reset."
                     if label == "100%" else "Heavy usage will pause AI once you hit 100%."))
        try:
            await create_notification(
                cap["scope_id"], "credit_cap_alert", u_title, u_body,
                meta={"scope": "user", "scope_id": cap["scope_id"], "threshold": label,
                      "used": used, "limit": limit, "self": True},
            )
        except Exception:
            pass
    # Best-effort email to workspace owners.
    try:
        from services.mailgun_service import send_email
        emails = [o["email"] for o in owners if o.get("email")]
        if emails:
            await send_email(
                to=emails,
                subject=f"TeamNest · {title}",
                html=f"<p>{body}</p><p>Manage limits on the Billing page.</p>",
                text=body,
            )
    except Exception:
        pass
    # Best-effort Slack alert into the workspace's configured channel.
    try:
        from services import slack_service
        scope_word = {"user": "A member's", "chat": "A chat's",
                      "workspace": "The workspace's", "enterprise": "The enterprise"}.get(
            cap["scope"], cap["scope"])
        emoji = ":rotating_light:" if label == "100%" else ":warning:"
        await slack_service.notify_budget_alert(
            workspace_id,
            f"{emoji} *{scope_word} AI credit cap is at {label}* — {used}/{limit} credits used this month.",
        )
    except Exception:
        pass
