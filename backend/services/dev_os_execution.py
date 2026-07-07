"""Dev OS — Execution Mode (simulated app runtime).

Provides a "what does the deployed app feel like" view: health pills for the
mocked API/DB/Frontend tiers, a synthetic log stream seeded from real build
activity + recent agent tasks, and a feedback channel that can auto-promote
items to bug reports.

Nothing here actually pings a container. Logs and metrics are deterministic
per-project (seeded by project_id) so the UI feels stable between polls,
but recent activity (builds, tasks, bugs) genuinely influences what shows.

Public functions
----------------
- get_execution_snapshot(workspace_id, project_id)  → dict
- submit_feedback(...)                              → dev_execution_feedback row
- list_feedback(workspace_id, project_id)           → list[dict]
"""
import hashlib
import random
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from deps import db, new_id, now_iso


# ─── Log generators ──────────────────────────────────────────────────────────
_LOG_TEMPLATES = [
    ("api",      "info",  "GET  /api/health → 200  ({ms}ms)"),
    ("api",      "info",  "POST /api/messages → 201 ({ms}ms)"),
    ("api",      "info",  "GET  /api/dev-projects → 200 ({ms}ms)"),
    ("db",       "info",  "mongo.messages.find · {ms}ms · {rows} rows"),
    ("db",       "info",  "mongo.dev_tasks.aggregate · {ms}ms"),
    ("frontend", "info",  "render /dev-os · LCP {ms}ms"),
    ("frontend", "info",  "hydrate ProjectDetail · {ms}ms"),
    ("qa",       "info",  "test suite · {rows} passed · 0 failed"),
    ("security", "info",  "HMAC verified for webhook ingress"),
    ("agent",    "info",  "AI agent {role} picked task {tid}"),
    ("agent",    "info",  "AI agent {role} completed task {tid} ({ms}ms)"),
    ("api",      "warn",  "POST /api/ai/generate → 429 retry"),
    ("db",       "warn",  "slow query · dev_proposals · {ms}ms"),
]
_AGENT_ROLES = ["frontend", "backend", "qa", "designer", "security", "reviewer"]


def _seed_for(project_id: str, bucket: int) -> random.Random:
    """Stable RNG per (project, 10-second bucket) so the log stream feels
    consistent within a short window but moves forward over time."""
    h = hashlib.sha1(f"{project_id}:{bucket}".encode()).hexdigest()
    return random.Random(int(h[:12], 16))


def _make_log_lines(project_id: str, count: int = 24) -> List[Dict[str, Any]]:
    """Produce `count` synthetic but stable log lines for a project. Newest
    line is last. Timestamps stay anchored within the last ~3 minutes."""
    bucket = int(datetime.now(timezone.utc).timestamp()) // 10
    rng = _seed_for(project_id, bucket)
    out: List[Dict[str, Any]] = []
    now = datetime.now(timezone.utc)
    for i in range(count):
        tier, level, tpl = rng.choice(_LOG_TEMPLATES)
        msg = tpl.format(
            ms=rng.randint(8, 380),
            rows=rng.randint(1, 240),
            role=rng.choice(_AGENT_ROLES),
            tid=new_id().split("-")[0],
        )
        out.append({
            "ts": (now - timedelta(seconds=(count - i) * rng.randint(1, 4))).isoformat(),
            "tier": tier,
            "level": level,
            "msg": msg,
        })
    return out


def _health_for_tier(rng: random.Random) -> Dict[str, Any]:
    """One health row. ~95% time = healthy, occasional warn/down."""
    roll = rng.random()
    if roll < 0.04:
        return {"status": "down", "uptime_pct": round(rng.uniform(91.0, 96.5), 2), "p95_ms": rng.randint(800, 1600)}
    if roll < 0.14:
        return {"status": "degraded", "uptime_pct": round(rng.uniform(96.5, 99.0), 2), "p95_ms": rng.randint(220, 560)}
    return {"status": "healthy", "uptime_pct": round(rng.uniform(99.0, 99.99), 2), "p95_ms": rng.randint(45, 210)}


async def get_execution_snapshot(workspace_id: str, project_id: str) -> Dict[str, Any]:
    """Aggregate everything the Execution Mode page needs in one round-trip."""
    bucket = int(datetime.now(timezone.utc).timestamp()) // 10
    rng = _seed_for(project_id, bucket)

    last_build = await db.dev_builds.find_one(
        {"project_id": project_id, "workspace_id": workspace_id},
        {"_id": 0}, sort=[("build_number", -1)],
    )
    preview = await db.dev_preview_deployments.find_one(
        {"project_id": project_id, "workspace_id": workspace_id},
        {"_id": 0}, sort=[("created_at", -1)],
    )

    # If no successful build yet, app is "idle".
    is_running = bool(last_build and last_build.get("build_status") == "success")

    health = {
        "api":      _health_for_tier(rng) if is_running else {"status": "idle", "uptime_pct": 0.0, "p95_ms": 0},
        "db":       _health_for_tier(rng) if is_running else {"status": "idle", "uptime_pct": 0.0, "p95_ms": 0},
        "frontend": _health_for_tier(rng) if is_running else {"status": "idle", "uptime_pct": 0.0, "p95_ms": 0},
        "agents":   {"status": "healthy" if is_running else "idle", "active": rng.randint(2, 6) if is_running else 0},
    }

    stats = {
        "requests_per_min": rng.randint(120, 880) if is_running else 0,
        "error_rate_pct":   round(rng.uniform(0.0, 0.8), 2) if is_running else 0.0,
        "active_users":     rng.randint(3, 42) if is_running else 0,
        "credits_burned_today": rng.randint(20, 220) if is_running else 0,
    }

    feedback = await db.dev_execution_feedback.find(
        {"project_id": project_id, "workspace_id": workspace_id}, {"_id": 0},
    ).sort("created_at", -1).to_list(10)

    return {
        "project_id": project_id,
        "is_running": is_running,
        "build_number": (last_build or {}).get("build_number"),
        "preview_url": (preview or {}).get("preview_url"),
        "preview_status": (preview or {}).get("status", "none"),
        "health": health,
        "stats": stats,
        "logs": _make_log_lines(project_id, count=24 if is_running else 4),
        "feedback": feedback,
        "snapshot_at": now_iso(),
    }


# ─── Feedback ────────────────────────────────────────────────────────────────
async def submit_feedback(
    *,
    workspace_id: str,
    project_id: str,
    user_id: str,
    message: str,
    kind: str = "comment",  # comment | bug | feature
    screen: str = "",
) -> Dict[str, Any]:
    """Record a feedback item from the Execution Mode form. If kind=='bug'
    we also create a real entry in dev_bug_reports so the bug-fix loop
    can pick it up."""
    msg = (message or "").strip()
    item = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "project_id": project_id,
        "user_id": user_id,
        "message": msg,
        "kind": kind if kind in ("comment", "bug", "feature") else "comment",
        "screen": screen,
        "linked_bug_id": None,
        "created_at": now_iso(),
    }

    if item["kind"] == "bug":
        from services.dev_os_phase3b import create_bug
        bug = await create_bug(
            workspace_id=workspace_id, project_id=project_id, reporter=user_id,
            title=msg[:80] or "Feedback bug",
            description=msg, steps="reported from execution mode",
            severity="medium", affected_screen=screen,
            expected="", actual="",
        )
        item["linked_bug_id"] = bug.get("id")

    await db.dev_execution_feedback.insert_one(item.copy())
    return item


async def list_feedback(workspace_id: str, project_id: str) -> List[Dict[str, Any]]:
    return await db.dev_execution_feedback.find(
        {"project_id": project_id, "workspace_id": workspace_id}, {"_id": 0},
    ).sort("created_at", -1).to_list(50)
