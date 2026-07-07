"""Dev OS — Nightly Recursive Scan scheduler.

Once every 24 hours, walks every dev_project that has a `related_chat_id` and:

  1. Skips projects scanned in the last 22h (gives a small jitter window).
  2. Skips projects whose linked chat has no new messages since last_scan_at.
  3. Runs `scan_chat_for_signals` (regex, cheap).
  4. If `signals_found >= MIN_SIGNALS_FOR_DIGEST`, asks the Reviewer Agent to
     draft proposals for the top themes (parallel LLM calls).
  5. Persists proposals — only those above the workspace's policy threshold
     stay as `pending`; safe ones auto-approve via `should_auto_approve`.
  6. Posts a single system-message digest to the linked chat.

Designed to be safe to run on every node — uses an upsert on the project's
`last_scan_at` field as a soft lock (last writer wins; duplicate scans are
idempotent because proposals are tagged by (project_id, source_signal)).
"""
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from deps import _broadcast_message, db, logger, new_id, now_iso

MIN_SIGNALS_FOR_DIGEST = 3       # don't spam chats with tiny digests
MIN_HOURS_BETWEEN_SCANS = 22     # gives daily-cron-ish cadence
MAX_PROPOSALS_PER_SCAN = 3       # cap LLM cost per project per night


def _parse(dt: str | None) -> datetime | None:
    if not dt:
        return None
    try:
        return datetime.fromisoformat(dt.replace("Z", "+00:00"))
    except Exception:
        return None


async def _scan_one_project(project: Dict[str, Any]) -> int:
    """Returns the number of proposals persisted for this project. 0 means we
    either skipped or found nothing worth drafting."""
    # Lazy imports — avoid circular import with routes/services on startup.
    from routes.dev_os import _type_for_signal
    from services.dev_os_generator import generate_proposal
    from services.dev_os_governance import load_policy, should_auto_approve
    from services.recursive_improvement import scan_chat_for_signals

    chat_id = project.get("related_chat_id")
    workspace_id = project["workspace_id"]
    project_id = project["id"]

    chat = await db.chats.find_one({"id": chat_id, "workspace_id": workspace_id}, {"_id": 0, "id": 1, "name": 1})
    if not chat:
        return 0

    # Respect the workspace's opt-out switch.
    policy_doc = await load_policy(workspace_id)
    if not policy_doc["policy"].get("nightly_scan_enabled", True):
        return 0

    # Only scan if there are new messages since the previous scan.
    last_scan = _parse(project.get("last_scan_at"))
    if last_scan:
        latest = await db.messages.find_one(
            {"chat_id": chat_id, "deleted_at": None},
            {"_id": 0, "created_at": 1},
            sort=[("created_at", -1)],
        )
        latest_dt = _parse((latest or {}).get("created_at"))
        if latest_dt and latest_dt <= last_scan:
            await db.dev_projects.update_one(
                {"id": project_id}, {"$set": {"last_scan_at": now_iso()}},
            )
            return 0

    scan = await scan_chat_for_signals(
        chat_id=chat_id, workspace_id=workspace_id, lookback_messages=200,
    )
    if scan["signals_found"] < MIN_SIGNALS_FOR_DIGEST:
        await db.dev_projects.update_one(
            {"id": project_id}, {"$set": {"last_scan_at": now_iso()}},
        )
        return 0

    top = scan["top_signals"][:MAX_PROPOSALS_PER_SCAN]
    summary_ctx = f"{project['name']}: {project.get('description', '')}"
    gens = await asyncio.gather(
        *[generate_proposal(summary_ctx, s["signal_text"], role="reviewer") for s in top],
        return_exceptions=True,
    )

    policy = policy_doc
    persisted_titles = []
    persisted_count = 0
    for s, gen in zip(top, gens):
        if isinstance(gen, Exception):
            logger.warning("[devos-nightly] proposal gen failed for %s: %s", project_id, gen)
            continue
        # Dedupe by (project_id, source_signal) so a re-scan after the cron
        # window doesn't double-post the same theme.
        existing = await db.improvement_proposals.find_one(
            {
                "project_id": project_id,
                "source_signal": s["signal_text"][:500],
                "created_by_agent": "devos_nightly",
            },
            {"_id": 0, "id": 1},
        )
        if existing:
            continue
        proposal = {
            "id": new_id(),
            "workspace_id": workspace_id,
            "project_id": project_id,
            "title": gen.get("title", f"Address {s['type']} signals"),
            "proposal_type": gen.get("proposal_type", _type_for_signal(s["type"])),
            "source_signal": s["signal_text"][:500],
            "current_problem": gen.get("current_problem", s["summary"]),
            "proposed_change": gen.get("proposed_change", ""),
            "expected_impact": gen.get("expected_impact", ""),
            "risk_level": gen.get("risk_level", "low"),
            "required_approval_level": gen.get("required_approval_level", "human_required"),
            "status": "pending",
            "created_by_agent": "devos_nightly",
            "source_chat_id": chat_id,
            "approved_by_user": None,
            "reviewer_notes": "",
            "estimated_credits": int(gen.get("estimated_credits", 5)),
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        if should_auto_approve(policy, proposal):
            proposal["status"] = "approved"
            proposal["approved_by_user"] = "auto"
            proposal["decided_at"] = now_iso()
        await db.improvement_proposals.insert_one(proposal.copy())
        persisted_titles.append(f"• {proposal['title']} _(risk: {proposal['risk_level']}, status: {proposal['status']})_")
        persisted_count += 1

    if persisted_count == 0:
        await db.dev_projects.update_one(
            {"id": project_id}, {"$set": {"last_scan_at": now_iso()}},
        )
        return 0

    # Post the digest into the linked chat.
    digest_lines = [
        f"🌙 **Dev OS · nightly scan** of #{chat.get('name', 'this chat')}",
        f"Scanned **{scan['total_scanned']}** messages · found **{scan['signals_found']}** signals",
    ]
    if scan["by_type"]:
        digest_lines.append(
            "Breakdown: " + ", ".join(f"{k}: {v}" for k, v in scan["by_type"].items()),
        )
    digest_lines.append("\n**New proposals:**\n" + "\n".join(persisted_titles))
    digest_lines.append(f"\n[Open project →](/dev-os/projects/{project_id})")

    sys_msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "ai-system",
        "body": "\n".join(digest_lines),
        "parent_message_id": None,
        "metadata": {"source": "devos_nightly", "project_id": project_id},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(sys_msg.copy())
    await _broadcast_message(chat_id, sys_msg)
    await db.dev_projects.update_one(
        {"id": project_id},
        {"$set": {"last_scan_at": now_iso(), "open_proposals": (project.get("open_proposals") or 0) + persisted_count}},
    )
    return persisted_count


async def _tick_once() -> int:
    """Single pass — scan every project that's due for a nightly scan."""
    now = datetime.now(timezone.utc)
    cursor = db.dev_projects.find(
        {"related_chat_id": {"$ne": None}},
        {"_id": 0},
    )
    scanned = 0
    drafted = 0
    async for proj in cursor:
        last_scan = _parse(proj.get("last_scan_at"))
        if last_scan and now - last_scan < timedelta(hours=MIN_HOURS_BETWEEN_SCANS):
            continue
        try:
            drafted += await _scan_one_project(proj)
            scanned += 1
        except Exception as e:
            logger.warning("[devos-nightly] scan failed for %s: %s", proj.get("id"), e)
    if scanned:
        logger.info("[devos-nightly] scanned %d projects, drafted %d proposals", scanned, drafted)

    # Build today's per-workspace digest after the scan pass so the UI reflects
    # whatever just landed. If the digest has content AND the workspace opted
    # in to daily push, fan out one OneSignal push per workspace owner.
    try:
        from datetime import datetime as _dt, timezone as _tz
        from services.dev_os_daily_digest import upsert_digest
        from services.dev_os_governance import load_policy
        from services.onesignal_service import send_push
        # Prefer Mailgun (configured 2026-06-22); fall back to Resend stub.
        from services import mailgun_service, resend_service
        _email_provider = mailgun_service if mailgun_service._configured() else resend_service
        send_email = _email_provider.send_email
        render_digest_email = _email_provider.render_digest_email
        now_utc = _dt.now(_tz.utc)
        hour = now_utc.hour  # quiet-hours uses UTC for now; per-workspace TZ is a follow-on
        workspaces = await db.dev_projects.distinct("workspace_id")
        for wid in workspaces:
            try:
                digest = await upsert_digest(wid)
                policy = (await load_policy(wid))["policy"]
                stats = (digest or {}).get("stats") or {}
                pending = stats.get("pending_proposals", 0)
                auto = stats.get("auto_approved_last_24h", 0)
                if pending == 0 and auto == 0:
                    continue  # nothing actionable; skip all delivery

                # Quiet-hours guard — supports wrap-around windows (e.g. 22→7).
                qs = policy.get("quiet_hours_start")
                qe = policy.get("quiet_hours_end")
                if isinstance(qs, int) and isinstance(qe, int):
                    in_quiet = (qs <= hour < qe) if qs < qe else (hour >= qs or hour < qe)
                    if in_quiet:
                        logger.info("[devos-digest] %s in quiet hours (%s-%s), deferring", wid, qs, qe)
                        continue

                members = await db.users.find(
                    {"workspace_ids": wid}, {"_id": 0, "id": 1, "email": 1, "name": 1},
                ).to_list(50)
                if not members:
                    continue

                top_theme_str = ""
                themes = stats.get("top_themes") or {}
                if themes:
                    k, v = next(iter(themes.items()))
                    top_theme_str = f" · top theme: {k} (×{v})"
                body_text = f"{pending} pending · {auto} auto-approved last 24h{top_theme_str}"

                if policy.get("daily_push_enabled", True):
                    await send_push(
                        external_user_ids=[m["id"] for m in members],
                        heading="☀️ Dev OS daily digest",
                        message=body_text,
                        url="/dev-os",
                        data={"source": "dev_os_daily_digest", "workspace_id": wid},
                    )
                if policy.get("daily_email_enabled", False):
                    ws_doc = await db.workspaces.find_one({"id": wid}, {"_id": 0, "name": 1}) or {}
                    html = render_digest_email(ws_doc.get("name", "Your workspace"), digest)
                    await send_email(
                        to=[m["email"] for m in members if m.get("email")],
                        subject=f"Dev OS · {body_text}",
                        html=html,
                        tags={"source": "dev_os_daily_digest", "workspace_id": wid},
                    )
            except Exception as e:
                logger.warning("[devos-digest] per-workspace step failed for %s: %s", wid, e)
    except Exception as e:
        logger.warning("[devos-digest] aggregation failed: %s", e)

    return drafted


async def nightly_scan_loop(interval_seconds: int = 3600):
    """Run forever. Called from server.py startup. Sleeps between ticks.
    Default cadence: wake every hour but only act on projects whose
    `last_scan_at` is older than 22h."""
    await asyncio.sleep(60)  # jitter so we don't fire at exactly the same time as task reminders
    while True:
        try:
            await _tick_once()
        except Exception as e:
            logger.exception("[devos-nightly] tick crashed: %s", e)
        await asyncio.sleep(interval_seconds)
