"""TeamNest Dev OS — Daily Digest aggregator (Phase 2 polish).

Builds a single per-workspace summary covering the last 24 hours:
  - pending proposal count + top 5 titles
  - auto-approved count
  - top signal themes across all chat-linked projects
  - recently deployed proposals

Persists to `dev_os_digests` as one doc per (workspace_id, date_iso). Designed
to be cheap so the nightly scheduler can call it as the last step.
"""
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from deps import db, logger, new_id, now_iso


def _today_key(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%d")


def _parse(dt: str | None) -> datetime | None:
    if not dt:
        return None
    try:
        return datetime.fromisoformat(dt.replace("Z", "+00:00"))
    except Exception:
        return None


async def build_digest(workspace_id: str) -> Dict[str, Any]:
    """Compute a fresh digest doc for a workspace. Does NOT persist — callers
    decide whether to upsert or just return."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=24)

    # Pending proposals across the workspace
    pending = await db.improvement_proposals.find(
        {"workspace_id": workspace_id, "status": "pending"},
        {"_id": 0, "id": 1, "title": 1, "risk_level": 1, "project_id": 1, "proposal_type": 1, "created_at": 1},
    ).sort("created_at", -1).limit(5).to_list(5)

    pending_count = await db.improvement_proposals.count_documents(
        {"workspace_id": workspace_id, "status": "pending"},
    )

    # Auto-approved in the last 24h
    auto_approved = []
    auto_count_24h = 0
    cursor2 = db.improvement_proposals.find(
        {"workspace_id": workspace_id, "approved_by_user": "auto", "status": "approved"},
        {"_id": 0, "decided_at": 1, "title": 1, "proposal_type": 1, "risk_level": 1},
    ).sort("decided_at", -1)
    async for p in cursor2:
        decided = _parse(p.get("decided_at"))
        if decided and decided >= since:
            auto_count_24h += 1
            if len(auto_approved) < 5:
                auto_approved.append(p)

    # Recently deployed (proposals or projects whose health flipped)
    recently_deployed = await db.improvement_proposals.find(
        {"workspace_id": workspace_id, "status": "deployed"},
        {"_id": 0, "title": 1, "project_id": 1, "decided_at": 1},
    ).sort("decided_at", -1).limit(5).to_list(5)

    # Top signal themes from the latest nightly scans
    theme_counter: Counter = Counter()
    theme_cursor = db.improvement_proposals.find(
        {
            "workspace_id": workspace_id,
            "created_by_agent": {"$in": ["devos_nightly", "recursive_scan", "dev_os_slash_scan"]},
            "created_at": {"$gte": since.isoformat()},
        },
        {"_id": 0, "proposal_type": 1},
    )
    async for p in theme_cursor:
        theme_counter[p.get("proposal_type") or "other"] += 1

    # Project activity counters
    project_count = await db.dev_projects.count_documents({"workspace_id": workspace_id})

    return {
        "workspace_id": workspace_id,
        "date": _today_key(now),
        "generated_at": now_iso(),
        "stats": {
            "pending_proposals": pending_count,
            "auto_approved_last_24h": auto_count_24h,
            "projects": project_count,
            "top_themes": dict(theme_counter.most_common(5)),
        },
        "pending_top": pending,
        "auto_approved_recent": auto_approved,
        "recently_deployed": recently_deployed,
        "headline": _headline(pending_count, auto_count_24h, theme_counter),
    }


def _headline(pending: int, auto_approved: int, themes: Counter) -> str:
    if pending == 0 and auto_approved == 0 and not themes:
        return "All quiet across your projects today."
    bits = []
    if pending:
        bits.append(f"**{pending}** pending proposal{'s' if pending != 1 else ''} waiting")
    if auto_approved:
        bits.append(f"**{auto_approved}** auto-approved in last 24h")
    if themes:
        top = themes.most_common(1)[0]
        bits.append(f"top theme: **{top[0]}** (×{top[1]})")
    return " · ".join(bits)


async def upsert_digest(workspace_id: str) -> Dict[str, Any]:
    """Compute + persist today's digest. Returns the persisted doc."""
    digest = await build_digest(workspace_id)
    key = {"workspace_id": workspace_id, "date": digest["date"]}
    await db.dev_os_digests.update_one(
        key,
        {"$set": digest, "$setOnInsert": {"id": new_id()}},
        upsert=True,
    )
    return await db.dev_os_digests.find_one(key, {"_id": 0})


async def latest_digest(workspace_id: str) -> Dict[str, Any] | None:
    """Return today's digest if it exists, otherwise the most recent one,
    otherwise build a fresh one on the fly (without persisting)."""
    today = _today_key()
    doc = await db.dev_os_digests.find_one(
        {"workspace_id": workspace_id, "date": today}, {"_id": 0},
    )
    if doc:
        return doc
    # Fall back to most recent
    recent = await db.dev_os_digests.find_one(
        {"workspace_id": workspace_id}, {"_id": 0}, sort=[("date", -1)],
    )
    if recent:
        return recent
    # Build on demand so the UI never shows an empty state on day 1.
    try:
        return await build_digest(workspace_id)
    except Exception as e:
        logger.warning("[devos-digest] build failed for %s: %s", workspace_id, e)
        return None
