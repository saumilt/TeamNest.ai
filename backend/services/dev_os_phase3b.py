"""Dev OS — Phase 3b: bug reports, preview comments, release notes, project
memory, and an immutable audit log. Consolidated into one service file to
keep the surface area small while we ship the full backlog quickly."""
import logging
from typing import Any, Dict, List, Optional

from deps import db, new_id, now_iso

logger = logging.getLogger("teamnest")


# ─── Bug reports ────────────────────────────────────────────────────────────
async def create_bug(*, workspace_id: str, project_id: str, reporter: str, title: str,
                     description: str, steps: str, severity: str = "medium",
                     affected_screen: str = "", expected: str = "", actual: str = "") -> Dict[str, Any]:
    bug = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "project_id": project_id,
        "reporter_id": reporter,
        "title": title,
        "description": description,
        "steps_to_reproduce": steps,
        "expected_result": expected,
        "actual_result": actual,
        "severity": severity,            # low | medium | high | critical
        "affected_screen": affected_screen,
        "assigned_agent": "qa",          # QA reproduces first
        "status": "reported",            # reported | reproducing | proposing_fix | fix_in_review | preview_ready | verified | closed
        "timeline": [{"event": "reported", "by": reporter, "at": now_iso()}],
        "preview_link": None,
        "fix_proposal": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_bug_reports.insert_one(bug.copy())
    await log_audit(workspace_id, reporter, "bug.created", {"project_id": project_id, "bug_id": bug["id"]})
    return bug


async def advance_bug(bug_id: str, by_user: str) -> Dict[str, Any] | None:
    """Tick a bug forward through its workflow. Used by the 'Advance' button."""
    flow = ["reported", "reproducing", "proposing_fix", "fix_in_review", "preview_ready", "verified", "closed"]
    bug = await db.dev_bug_reports.find_one({"id": bug_id}, {"_id": 0})
    if not bug:
        return None
    idx = flow.index(bug["status"]) if bug["status"] in flow else 0
    nxt = flow[min(idx + 1, len(flow) - 1)]
    push = {"event": nxt, "by": by_user, "at": now_iso()}
    update: Dict[str, Any] = {"status": nxt, "updated_at": now_iso()}
    # Reassign owning agent based on lifecycle.
    update["assigned_agent"] = {
        "reproducing": "qa", "proposing_fix": "backend", "fix_in_review": "reviewer",
        "preview_ready": "devops", "verified": "qa", "closed": "qa",
    }.get(nxt, bug["assigned_agent"])
    await db.dev_bug_reports.update_one(
        {"id": bug_id}, {"$set": update, "$push": {"timeline": push}},
    )
    await log_audit(bug["workspace_id"], by_user, "bug.advanced", {"bug_id": bug_id, "to": nxt})
    return await db.dev_bug_reports.find_one({"id": bug_id}, {"_id": 0})


# ─── Preview comments ───────────────────────────────────────────────────────
async def create_preview_comment(*, workspace_id: str, project_id: str, build_id: Optional[str],
                                  user_id: str, screen_name: str, comment: str) -> Dict[str, Any]:
    row = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "project_id": project_id,
        "build_id": build_id,
        "user_id": user_id,
        "screen_name": screen_name,
        "comment": comment,
        "screenshot_url": None,
        "converted_to_task_id": None,
        "converted_to_bug_id": None,
        "resolved": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_preview_comments.insert_one(row.copy())
    return row


async def convert_comment_to_bug(comment_id: str, by_user: str) -> Dict[str, Any] | None:
    c = await db.dev_preview_comments.find_one({"id": comment_id}, {"_id": 0})
    if not c:
        return None
    bug = await create_bug(
        workspace_id=c["workspace_id"], project_id=c["project_id"],
        reporter=by_user, title=c["comment"][:80],
        description=c["comment"], steps="(from preview comment)",
        affected_screen=c["screen_name"] or "",
    )
    await db.dev_preview_comments.update_one(
        {"id": comment_id}, {"$set": {"converted_to_bug_id": bug["id"], "resolved": True, "updated_at": now_iso()}},
    )
    return bug


# ─── Release notes (Growth agent) ───────────────────────────────────────────
async def generate_release_notes(workspace_id: str, project_id: str, version: str, by_user: str) -> Dict[str, Any]:
    """Compile a release-notes doc from recently-deployed proposals + done tasks.
    Uses live Growth agent (Claude Sonnet 4.5) to draft the customer-facing copy."""
    deployed = await db.improvement_proposals.find(
        {"workspace_id": workspace_id, "project_id": project_id, "status": "deployed"},
        {"_id": 0, "title": 1, "expected_impact": 1, "proposal_type": 1},
    ).sort("decided_at", -1).limit(10).to_list(10)
    done_tasks = await db.dev_tasks.find(
        {"workspace_id": workspace_id, "project_id": project_id, "status": {"$in": ["done", "deployed"]}},
        {"_id": 0, "title": 1, "owning_agent": 1},
    ).sort("updated_at", -1).limit(10).to_list(10)

    # Compose plain-text release notes — keep this offline if LLM fails.
    summary_lines = [f"## Release {version}", ""]
    if deployed:
        summary_lines.append("### What's new")
        for d in deployed:
            summary_lines.append(f"- **{d['title']}** — {d.get('expected_impact','')}")
        summary_lines.append("")
    if done_tasks:
        summary_lines.append("### Improvements")
        for t in done_tasks:
            summary_lines.append(f"- {t['title']}")
        summary_lines.append("")
    summary_lines.append(f"Released on {now_iso().split('T')[0]}.")
    notes_md = "\n".join(summary_lines)

    # Best-effort LLM polish (live, but tolerant of failure).
    try:
        from services.dev_os_generator import _llm_call_safe   # type: ignore
        polished = await _llm_call_safe(notes_md, "Polish these release notes for customer-facing copy.")
        if polished:
            notes_md = polished
    except Exception:
        pass

    doc = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "project_id": project_id,
        "version": version,
        "notes_md": notes_md,
        "deployed_proposals": [d["title"] for d in deployed],
        "done_task_count": len(done_tasks),
        "generated_by": by_user,
        "generated_by_agent": "growth",
        "created_at": now_iso(),
    }
    await db.dev_release_notes.insert_one(doc.copy())
    await log_audit(workspace_id, by_user, "release_notes.generated", {"project_id": project_id, "version": version})
    return doc


# ─── Project memory ────────────────────────────────────────────────────────
async def add_memory(*, workspace_id: str, project_id: str, user_id: str, category: str,
                     note: str, source: str = "manual") -> Dict[str, Any]:
    item = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "project_id": project_id,
        "category": category,            # product / technical / ui / business / user_feedback / bugs / patterns / roadmap / security / deployment / stack
        "note": note,
        "source": source,                # manual / chat / proposal / bug / pr / preview_comment
        "outdated": False,
        "linked_task_id": None,
        "linked_pr_id": None,
        "added_by": user_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_project_memory.insert_one(item.copy())
    await log_audit(workspace_id, user_id, "memory.added", {"project_id": project_id, "memory_id": item["id"]})
    return item


async def list_memory(*, workspace_id: str, project_id: str) -> List[Dict[str, Any]]:
    return await db.dev_project_memory.find(
        {"workspace_id": workspace_id, "project_id": project_id, "outdated": {"$ne": True}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)


# ─── Audit log ─────────────────────────────────────────────────────────────
async def log_audit(workspace_id: str, actor_id: str, action: str, meta: Dict[str, Any]) -> None:
    """Append-only. No update / delete API exposed."""
    try:
        await db.dev_audit_logs.insert_one({
            "id": new_id(),
            "workspace_id": workspace_id,
            "actor_id": actor_id,
            "action": action,
            "meta": meta,
            "created_at": now_iso(),
        })
    except Exception as e:
        logger.warning("[devos-audit] write failed: %s", e)


async def list_audit(workspace_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    return await db.dev_audit_logs.find(
        {"workspace_id": workspace_id}, {"_id": 0},
    ).sort("created_at", -1).to_list(limit)
