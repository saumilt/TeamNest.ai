"""Dev OS in-chat slash commands.

Currently supports:
  /dev-os scan          — scan the current chat for improvement signals and
                          draft proposals on the chat's linked Dev OS project
  /dev-os new <name>    — create a Dev OS project linked to this chat

Any other command is ignored so we never accidentally swallow user messages.
"""
import asyncio
import logging
import re
from typing import Any, Dict, Optional

from deps import _broadcast_message, db, new_id, now_iso
from services.recursive_improvement import scan_chat_for_signals

logger = logging.getLogger("teamnest")

DEVOS_RE = re.compile(r"^\s*/dev-?os\s+(\w+)(?:\s+(.*))?\s*$", re.I)


def parse_devos_command(body: str) -> Optional[Dict[str, str]]:
    """Return {action, arg} when the message is a Dev OS slash command."""
    m = DEVOS_RE.match(body or "")
    if not m:
        return None
    return {"action": m.group(1).lower(), "arg": (m.group(2) or "").strip()}


def schedule_devos_if_addressed(chat: Dict[str, Any], user: Dict[str, Any], msg: Dict[str, Any]) -> bool:
    cmd = parse_devos_command(msg.get("body", ""))
    if not cmd:
        return False
    handlers = {
        "scan": _handle_scan,
        "new":  lambda c, u, m: _handle_new_project(c, u, m, cmd["arg"]),
        "task": lambda c, u, m: _handle_new_task(c, u, m, cmd["arg"]),
        "bug":  lambda c, u, m: _handle_new_bug(c, u, m, cmd["arg"]),
        "plan": _handle_show_plan,
        "template":  lambda c, u, m: _handle_template(c, u, m, cmd["arg"]),
        "templates": lambda c, u, m: _handle_template(c, u, m, cmd["arg"]),
        "help": _handle_help,
    }
    handler = handlers.get(cmd["action"])
    if not handler:
        asyncio.create_task(_handle_help(chat, user, msg))
        return True
    asyncio.create_task(handler(chat, user, msg))
    return True


async def _post_system(
    chat_id: str, body: str, parent_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    sys_msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": "ai-system",
        "message_type": "ai-system",
        "body": body,
        "parent_message_id": parent_id,
        "metadata": {"source": "dev_os_slash", **(metadata or {})},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(sys_msg.copy())
    await _broadcast_message(chat_id, sys_msg)
    return sys_msg


async def _handle_template(chat: Dict[str, Any], user: Dict[str, Any], msg: Dict[str, Any], arg: str):
    """`/dev-os template` lists installable templates as tappable chips;
    `/dev-os template <name>` installs one and links it to this chat."""
    templates = await db.mkt_templates.find(
        {"status": "approved"}, {"_id": 0, "files": 0},
    ).sort("installs", -1).to_list(30)

    if not arg:
        if not templates:
            await _post_system(chat["id"], "🧩 No templates are available yet.", parent_id=msg["id"])
            return
        chips = []
        lines = []
        for t in templates[:12]:
            pricing = t.get("pricing") or {}
            free = (pricing.get("model") or "free") == "free"
            price = "free" if free else f"${pricing.get('price_usd')}{'/mo' if pricing.get('model') == 'monthly' else ''}"
            lines.append(f"• **{t['name']}** ({price}) — {t.get('tagline') or t.get('description', '')[:80]}")
            chips.append({"label": f"{t['name']} · {price}", "prompt": f"/dev-os template {t['id']}"})
        await _post_system(
            chat["id"],
            "🧩 **Template App Store** — tap one to queue the install command, "
            "then send. Once installed you can modify and enhance it right here in chat.\n\n"
            + "\n".join(lines),
            parent_id=msg["id"],
            metadata={"idea_chips": chips},
        )
        return

    # Fuzzy match: exact id → exact name → substring.
    low = arg.lower().strip()
    t = (
        next((x for x in templates if x["id"].lower() == low), None)
        or next((x for x in templates if x["name"].lower() == low), None)
        or next((x for x in templates if low in x["name"].lower() or low in x["id"].lower()), None)
    )
    if not t:
        await _post_system(
            chat["id"],
            f"🧩 Couldn't find a template matching **{arg}**. "
            "Type `/dev-os template` to see what's available.",
            parent_id=msg["id"],
        )
        return

    from routes.template_market import _has_access, create_project_from_template
    if not await _has_access(t, user):
        pricing = t.get("pricing") or {}
        price = f"${pricing.get('price_usd')}{'/mo' if pricing.get('model') == 'monthly' else ''}"
        await _post_system(
            chat["id"],
            f"🧩 **{t['name']}** is a paid template ({price}). "
            "Complete the purchase and it'll land in your workspace ready to customize.",
            parent_id=msg["id"],
            metadata={"cta": {"label": f"Buy & install · {price}", "href": f"/market/install/{t['id']}"}},
        )
        return

    # Full template doc (with files) for the copy.
    full = await db.mkt_templates.find_one({"id": t["id"]}, {"_id": 0})
    project_id = await create_project_from_template(full, user)
    await db.dev_projects.update_one(
        {"id": project_id}, {"$set": {"related_chat_id": chat["id"]}},
    )
    await db.chats.update_one(
        {"id": chat["id"]},
        {"$set": {"linked_dev_project_id": project_id, "updated_at": now_iso()}},
    )
    studio_path = f"/dev-os/projects/{project_id}/studio"
    await _post_system(
        chat["id"],
        f"🧩 **{t['name']} installed** and linked to this chat — the working app "
        "is live in the preview already.\n\n"
        "Now just tell me what to change: *\"rename Properties to Listings\"*, "
        "*\"add a commission report\"* — I'll modify the template for you. "
        "Or open the Build Room to use Preview, Builders and Release.",
        parent_id=msg["id"],
        metadata={
            "project_id": project_id,
            "studio_url": studio_path,
            "cta": {"label": "Open Build Room", "href": studio_path},
        },
    )


async def _handle_scan(chat: Dict[str, Any], user: Dict[str, Any], msg: Dict[str, Any]):
    chat_id = chat["id"]
    workspace_id = chat["workspace_id"]
    # Find the project linked to this chat (if any).
    project = await db.dev_projects.find_one(
        {"workspace_id": workspace_id, "related_chat_id": chat_id}, {"_id": 0},
    )
    if not project:
        await _post_system(
            chat_id,
            "⚙️ **Dev OS** · No project is linked to this chat yet. Use `/dev-os new <project name>` to create one.",
            parent_id=msg["id"],
        )
        return
    try:
        from routes.dev_os import _type_for_signal  # local import to dodge cycle
        from services.dev_os_generator import generate_proposal
        from services.dev_os_governance import load_policy, should_auto_approve

        scan = await scan_chat_for_signals(
            chat_id=chat_id, workspace_id=workspace_id, lookback_messages=200,
        )
        summary_lines = [
            f"⚙️ **Dev OS scan** of #{chat.get('name', 'this chat')}",
            f"Scanned **{scan['total_scanned']}** messages · found **{scan['signals_found']}** signals",
        ]
        if scan["by_type"]:
            summary_lines.append(
                "Breakdown: " + ", ".join(f"{k}: {v}" for k, v in scan["by_type"].items()),
            )
        if scan["top_signals"]:
            policy = await load_policy(workspace_id)
            top = scan["top_signals"][:3]
            gens = await asyncio.gather(
                *[generate_proposal(f"{project['name']}: {project.get('description', '')}", s["signal_text"], role="reviewer") for s in top],
                return_exceptions=False,
            )
            created_titles = []
            for s, gen in zip(top, gens):
                proposal = {
                    "id": new_id(),
                    "workspace_id": workspace_id,
                    "project_id": project["id"],
                    "title": gen.get("title", f"Address {s['type']} signals"),
                    "proposal_type": gen.get("proposal_type", _type_for_signal(s["type"])),
                    "source_signal": s["signal_text"][:500],
                    "current_problem": gen.get("current_problem", s["summary"]),
                    "proposed_change": gen.get("proposed_change", ""),
                    "expected_impact": gen.get("expected_impact", ""),
                    "risk_level": gen.get("risk_level", "low"),
                    "required_approval_level": gen.get("required_approval_level", "human_required"),
                    "status": "pending",
                    "created_by_agent": "dev_os_slash_scan",
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
                created_titles.append(f"• {proposal['title']} _(risk: {proposal['risk_level']}, status: {proposal['status']})_")
            summary_lines.append("\n**Drafted proposals:**\n" + "\n".join(created_titles))
        else:
            summary_lines.append("No improvement themes detected. Try again later as the conversation grows.")
        summary_lines.append(f"\n[Open project →](/dev-os/projects/{project['id']})")
        await _post_system(chat_id, "\n".join(summary_lines), parent_id=msg["id"])
    except Exception as e:
        logger.warning("[dev-os-slash] scan failed: %s", e)
        await _post_system(chat_id, f"⚙️ **Dev OS** · scan failed: {e}", parent_id=msg["id"])


async def _handle_new_project(chat: Dict[str, Any], user: Dict[str, Any], msg: Dict[str, Any], name_arg: str):
    chat_id = chat["id"]
    workspace_id = chat["workspace_id"]
    if not name_arg:
        await _post_system(chat_id, "⚙️ **Dev OS** · usage: `/dev-os new <project name>`", parent_id=msg["id"])
        return
    existing = await db.dev_projects.find_one(
        {"workspace_id": workspace_id, "related_chat_id": chat_id}, {"_id": 0, "id": 1},
    )
    if existing:
        await _post_system(
            chat_id,
            "⚙️ **Dev OS** · This chat is already linked to a project. Use `/dev-os scan` to draft proposals.",
            parent_id=msg["id"],
        )
        return
    project = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "created_by": user["id"],
        "name": name_arg.strip(),
        "description": f"Created from chat #{chat.get('name', 'untitled')}",
        "target_users": "",
        "problem": "",
        "source": "chat",
        "template_id": None,
        "related_chat_id": chat_id,
        "plan": {"product_brief": "Linked to chat — run `/dev-os scan` to generate proposals from recent messages.", "_llm_status": "stub"},
        "status": "draft",
        "version": "v0.1.0",
        "health": "stable",
        "test_coverage": 0,
        "open_proposals": 0,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_projects.insert_one(project.copy())
    await _post_system(
        chat_id,
        f"⚙️ **Dev OS** · Created project **{project['name']}** and linked it to this chat. "
        f"Type `/dev-os scan` any time to auto-draft proposals from the conversation.\n"
        f"[Open project →](/dev-os/projects/{project['id']})",
        parent_id=msg["id"],
    )


async def _require_linked_project(chat: Dict[str, Any], msg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Helper — fetch the project linked to this chat, or post a friendly
    'no project linked' system message and return None."""
    project = await db.dev_projects.find_one(
        {"workspace_id": chat["workspace_id"], "related_chat_id": chat["id"]},
        {"_id": 0},
    )
    if not project:
        await _post_system(
            chat["id"],
            "⚙️ **Dev OS** · No project is linked to this chat yet. "
            "Tap the rocket in the chat header, or run `/dev-os new <project name>`.",
            parent_id=msg["id"],
        )
    return project


async def _handle_new_task(chat: Dict[str, Any], user: Dict[str, Any], msg: Dict[str, Any], title: str):
    if not title:
        await _post_system(chat["id"], "⚙️ **Dev OS** · usage: `/dev-os task <title>`", parent_id=msg["id"])
        return
    project = await _require_linked_project(chat, msg)
    if not project:
        return
    task = {
        "id": new_id(),
        "workspace_id": chat["workspace_id"],
        "project_id": project["id"],
        "title": title.strip()[:200],
        "description": f"Created from chat #{chat.get('name', 'untitled')}",
        "status": "backlog",
        "priority": "medium",
        "assigned_agent": None,
        "created_by": user["id"],
        "source_chat_id": chat["id"],
        "source_message_id": msg["id"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_tasks.insert_one(task.copy())
    await _post_system(
        chat["id"],
        f"⚙️ **Dev OS** · Added task **{task['title']}** to *{project['name']}* (backlog).\n"
        f"[Open Kanban →](/dev-os/projects/{project['id']})",
        parent_id=msg["id"],
    )


async def _handle_new_bug(chat: Dict[str, Any], user: Dict[str, Any], msg: Dict[str, Any], title: str):
    if not title:
        await _post_system(chat["id"], "⚙️ **Dev OS** · usage: `/dev-os bug <short description>`", parent_id=msg["id"])
        return
    project = await _require_linked_project(chat, msg)
    if not project:
        return
    from services.dev_os_phase3b import create_bug
    bug = await create_bug(
        workspace_id=chat["workspace_id"], project_id=project["id"], reporter=user["id"],
        title=title.strip()[:200], description=title.strip(), steps=f"reported from chat #{chat.get('name', 'untitled')}",
        severity="medium", affected_screen="", expected="", actual="",
    )
    await _post_system(
        chat["id"],
        f"🐛 **Dev OS** · Bug logged: **{bug.get('title')}** (severity: medium). "
        f"QA agent will reproduce it within the policy SLA.\n"
        f"[Open bugs →](/dev-os/projects/{project['id']})",
        parent_id=msg["id"],
    )


async def _handle_show_plan(chat: Dict[str, Any], user: Dict[str, Any], msg: Dict[str, Any]):
    project = await _require_linked_project(chat, msg)
    if not project:
        return
    plan = project.get("plan") or {}
    brief = plan.get("product_brief") or "_No brief yet — open the project to generate one._"
    pillars = plan.get("pillars") or []
    lines = [
        f"⚙️ **Dev OS · {project['name']}** plan",
        f"_{brief[:280]}_",
    ]
    if pillars:
        lines.append("\n**Pillars:**\n" + "\n".join(f"• {p}" for p in pillars[:5]))
    lines.append(f"\n[Open plan →](/dev-os/projects/{project['id']})")
    await _post_system(chat["id"], "\n".join(lines), parent_id=msg["id"])


async def _handle_help(chat: Dict[str, Any], user: Dict[str, Any], msg: Dict[str, Any]):
    await _post_system(
        chat["id"],
        "⚙️ **Dev OS commands**\n"
        "• `/dev-os new <name>` — spin up project linked to this chat\n"
        "• `/dev-os template` — browse app templates · `/dev-os template <name>` installs one\n"
        "• `/dev-os plan` — show the current product plan\n"
        "• `/dev-os task <title>` — add a backlog task\n"
        "• `/dev-os bug <description>` — file a bug for QA\n"
        "• `/dev-os scan` — let the AI scan recent messages and draft proposals\n",
        parent_id=msg["id"],
    )
