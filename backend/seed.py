"""Seed demo workspace + users + folders + chats on startup if empty."""
import os
from datetime import datetime, timedelta, timezone

from auth_utils import hash_password
from models import new_id, now_iso

# Demo password is intentionally well-known for the demo workspace; override via env in production.
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "Demo@2026")


async def seed_demo(db) -> None:
    existing = await db.users.count_documents({})
    if existing > 0:
        await _seed_phase2_topup(db)
        return

    workspace_id = new_id()
    now = now_iso()

    # Users
    user_defs = [
        ("Amit Patel", "amit@demo.team", "owner"),
        ("Priya Shah", "priya@demo.team", "admin"),
        ("Raj Mehta", "raj@demo.team", "member"),
        ("Neel Desai", "neel@demo.team", "member"),
        ("Sara Khan", "sara@demo.team", "viewer"),
    ]
    avatars = [
        "https://images.unsplash.com/photo-1609371497456-3a55a205d5eb?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NjZ8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMGF2YXRhcnxlbnwwfHx8fDE3Nzg1NDY2NDJ8MA&ixlib=rb-4.1.0&q=85",
        "https://images.unsplash.com/photo-1768247695726-022586dea3a1?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NjZ8MHwxfHNlYXJjaHwzfHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMGF2YXRhcnxlbnwwfHx8fDE3Nzg1NDY2NDJ8MA&ixlib=rb-4.1.0&q=85",
        "https://images.unsplash.com/photo-1764971591006-b6eb67a8f0cb?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NjZ8MHwxfHNlYXJjaHw0fHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMGF2YXRhcnxlbnwwfHx8fDE3Nzg1NDY2NDJ8MA&ixlib=rb-4.1.0&q=85",
        "https://images.unsplash.com/photo-1633625510483-c177f4308f33?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NjZ8MHwxfHNlYXJjaHwyfHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMGF2YXRhcnxlbnwwfHx8fDE3Nzg1NDY2NDJ8MA&ixlib=rb-4.1.0&q=85",
        "https://images.unsplash.com/photo-1609371497456-3a55a205d5eb?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NjZ8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMGF2YXRhcnxlbnwwfHx8fDE3Nzg1NDY2NDJ8MA&ixlib=rb-4.1.0&q=85",
    ]

    users = []
    for (name, email, role), avatar in zip(user_defs, avatars):
        users.append({
            "id": new_id(),
            "name": name,
            "email": email,
            "password_hash": hash_password(DEMO_PASSWORD),
            "avatar": avatar,
            "role": role,
            "workspace_id": workspace_id,
            "status": "active",
            "created_at": now,
        })
    await db.users.insert_many([u.copy() for u in users])

    # Workspace
    owner = users[0]
    await db.workspaces.insert_one({
        "id": workspace_id,
        "name": "Emergent Demo Workspace",
        "owner_id": owner["id"],
        "created_at": now,
    })

    # Project folders
    folder_names = [
        ("Q2 Product Launch", "Pricing, launch markets, and go-to-market plan for the new Pro tier."),
        ("Engineering Hiring", "Senior engineer pipeline + comp benchmarks."),
        ("Marketing Site Refresh", "Hero copy, redesign brief, and landing-page experiments."),
        ("Customer Insights H1", "Power-user interviews and churn analysis for the first half."),
        ("AI Startup Ideas", "Brainstorm pad for AI startup opportunities."),
    ]
    folders = []
    for name, desc in folder_names:
        folders.append({
            "id": new_id(),
            "workspace_id": workspace_id,
            "name": name,
            "description": desc,
            "owner_id": owner["id"],
            "member_ids": [u["id"] for u in users[:4]],
            "created_at": now,
        })
    await db.folders.insert_many([f.copy() for f in folders])

    # Group chats
    group_defs = [
        ("Q2 Product Launch", "Launch market + pricing decisions.", folders[0]["id"]),
        ("Engineering Hiring", "Pipeline review + comp benchmarks.", folders[1]["id"]),
        ("Marketing Site Refresh", "Site redesign + copy review.", folders[2]["id"]),
        ("AI Product Brainstorm", "Open AI product brainstorm.", folders[4]["id"]),
    ]
    chats = []
    for name, desc, folder_id in group_defs:
        chats.append({
            "id": new_id(),
            "workspace_id": workspace_id,
            "type": "group",
            "name": name,
            "description": desc,
            "project_folder_id": folder_id,
            "default_models": ["chatgpt", "claude", "gemini"],
            "member_ids": [u["id"] for u in users],
            "created_by": owner["id"],
            "created_at": now,
            "pinned_message_ids": [],
        })
    await db.chats.insert_many([c.copy() for c in chats])

    # Personal AI chat per user
    personal_chats = []
    for u in users:
        personal_chats.append({
            "id": new_id(),
            "workspace_id": workspace_id,
            "type": "personal_ai",
            "name": "My AI Assistant",
            "description": "Your personal AI workspace.",
            "project_folder_id": None,
            "default_models": ["claude"],
            "member_ids": [u["id"]],
            "created_by": u["id"],
            "created_at": now,
            "pinned_message_ids": [],
        })
    await db.chats.insert_many([c.copy() for c in personal_chats])

    # Sample task
    raj = next(u for u in users if u["name"] == "Raj Mehta")
    due = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    task = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "project_folder_id": folders[0]["id"],
        "source_chat_id": chats[0]["id"],
        "source_message_id": None,
        "title": "Finalise pricing for Pro tier launch",
        "description": "Compare $20/$25/$29 ladders and finalise the one we lead with on the marketing site.",
        "assigned_to": raj["id"],
        "created_by": owner["id"],
        "due_date": due,
        "priority": "high",
        "status": "todo",
        "created_at": now,
        "completed_at": None,
    }
    await db.tasks.insert_one(task.copy())

    # Welcome messages
    welcome_msg = {
        "id": new_id(),
        "chat_id": chats[0]["id"],
        "sender_id": owner["id"],
        "message_type": "text",
        "body": "Welcome team. Let's lock the Pro-tier launch market and pricing this week.",
        "parent_message_id": None,
        "metadata": {},
        "reactions": {},
        "created_at": now,
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(welcome_msg.copy())

    await _seed_phase2_demo(db, workspace_id, users, folders, chats, owner)

    print(f"Seeded demo workspace {workspace_id} with {len(users)} users.")


async def _seed_phase2_topup(db):
    """Idempotent Phase-2 demo data insertion for existing demo workspaces."""
    # Find the demo workspace by its known name; bail if not present
    ws = await db.workspaces.find_one({"name": "Emergent Demo Workspace"}, {"_id": 0})
    if not ws:
        return
    # If we've already seeded a Phase-2 call, skip
    if await db.calls.count_documents({"workspace_id": ws["id"], "summary.source": "demo_seed"}) > 0:
        return
    users = await db.users.find({"workspace_id": ws["id"]}, {"_id": 0}).to_list(100)
    if not users:
        return
    owner = next((u for u in users if u.get("role") == "owner"), users[0])
    folders = await db.folders.find({"workspace_id": ws["id"]}, {"_id": 0}).to_list(50)
    chats = await db.chats.find({"workspace_id": ws["id"], "type": "group"}, {"_id": 0}).to_list(50)
    if len(folders) < 2 or len(chats) < 2:
        return
    await _seed_phase2_demo(db, ws["id"], users, folders, chats, owner)


async def _seed_phase2_demo(db, workspace_id, users, folders, chats, owner):
    """Phase 2 sample data: historical calls + transcripts + summaries, approvals, overdue task."""
    now_dt = datetime.now(timezone.utc)
    priya = next(u for u in users if u["name"] == "Priya Shah")
    raj = next(u for u in users if u["name"] == "Raj Mehta")
    neel = next(u for u in users if u["name"] == "Neel Desai")
    sara = next(u for u in users if u["name"] == "Sara Khan")

    # ---- Sample Call 1: Q2 Product Launch — Market & Pricing ----
    call1_started = (now_dt - timedelta(days=1, hours=2)).isoformat()
    call1_ended = (now_dt - timedelta(days=1, hours=2) + timedelta(minutes=42)).isoformat()
    call1_id = new_id()
    call1 = {
        "id": call1_id,
        "workspace_id": workspace_id,
        "chat_id": chats[0]["id"],
        "mode": "video",
        "status": "ended",
        "livekit_room": f"call_{call1_id}",
        "started_by": owner["id"],
        "started_by_name": owner["name"],
        "participants": [
            {"id": owner["id"], "name": owner["name"], "joined_at": call1_started, "left_at": call1_ended},
            {"id": priya["id"], "name": priya["name"], "joined_at": call1_started, "left_at": call1_ended},
            {"id": raj["id"], "name": raj["name"], "joined_at": call1_started, "left_at": call1_ended},
        ],
        "started_at": call1_started,
        "ended_at": call1_ended,
        "duration_seconds": 42 * 60,
        "transcript": {
            "text": (
                "Amit Patel: Let's compare US-first vs EU-first for the Pro tier launch.\n"
                "Priya Shah: The US SMB market is roughly 4× larger and the SaaS pricing tolerance is higher — we'd see faster volume there.\n"
                "Raj Mehta: I dug into ACV. EU has 35-40% higher contract values but a longer enterprise sales cycle.\n"
                "Amit Patel: What about compliance lift?\n"
                "Raj Mehta: For EU we'll need DPAs, sub-processor list, and standard SCCs. For US we're already good on SOC 2 path.\n"
                "Priya Shah: My recommendation is US first to capture volume, then EU in Q3 once SOC 2 lands.\n"
                "Amit Patel: Agreed. Raj — can you finalize the pricing ladder by next Friday?\n"
                "Raj Mehta: Yes, I'll have the $20 / $25 / $29 comparison and conversion-rate model ready."
            ),
            "language": "en",
            "duration": 42 * 60,
            "segments": None,
            "source": "demo_seed",
        },
        "summary": {
            "markdown": (
                "## TL;DR\nUS first for the Pro-tier launch; EU follows in Q3 once SOC 2 + DPA are signed.\n\n"
                "## Participants\n- Amit Patel\n- Priya Shah\n- Raj Mehta\n\n"
                "## Key discussion points\n- US SMB market is ~4× larger and tolerates higher SaaS pricing\n"
                "- EU enterprise ACVs are 35-40% higher but sales cycles are 2× longer\n"
                "- Compliance lift for EU: DPA + sub-processors + SCCs\n\n"
                "## Decisions\n- **Primary launch market:** US\n- **Secondary (Q3):** EU\n\n"
                "## Action items\n- **Raj — finalize $20 / $25 / $29 pricing ladder + conversion model — due next Friday**\n\n"
                "## Suggested next steps\n- Kick off SOC 2 audit\n- Draft EU DPA + sub-processor list"
            ),
            "generated_at": call1_ended,
            "generated_by": owner["id"],
            "source": "demo_seed",
        },
    }
    await db.calls.insert_one(call1.copy())
    # Post call_ended card in chat
    await db.messages.insert_one({
        "id": new_id(),
        "chat_id": chats[0]["id"],
        "sender_id": "ai-system",
        "message_type": "call_ended",
        "body": "",
        "parent_message_id": None,
        "metadata": {
            "call_id": call1_id, "mode": "video", "status": "ended",
            "started_by": owner["id"], "started_by_name": owner["name"],
            "started_at": call1_started, "ended_at": call1_ended,
            "duration_seconds": 42 * 60, "participants": call1["participants"],
        },
        "reactions": {}, "created_at": call1_ended,
        "edited_at": None, "deleted_at": None,
    })

    # ---- Sample Call 2: Engineering Hiring pipeline review ----
    call2_started = (now_dt - timedelta(hours=20)).isoformat()
    call2_ended = (now_dt - timedelta(hours=20) + timedelta(minutes=28)).isoformat()
    call2_id = new_id()
    call2 = {
        "id": call2_id,
        "workspace_id": workspace_id,
        "chat_id": chats[1]["id"],
        "mode": "audio",
        "status": "ended",
        "livekit_room": f"call_{call2_id}",
        "started_by": owner["id"],
        "started_by_name": owner["name"],
        "participants": [
            {"id": owner["id"], "name": owner["name"], "joined_at": call2_started, "left_at": call2_ended},
            {"id": neel["id"], "name": neel["name"], "joined_at": call2_started, "left_at": call2_ended},
            {"id": sara["id"], "name": sara["name"], "joined_at": call2_started, "left_at": call2_ended},
        ],
        "started_at": call2_started,
        "ended_at": call2_ended,
        "duration_seconds": 28 * 60,
        "transcript": {
            "text": (
                "Amit Patel: We need to lock the senior-engineer hiring plan for Q2.\n"
                "Neel Desai: We have 18 candidates in the pipeline; the strongest 3 are at on-site stage.\n"
                "Sara Khan: Comp benchmark says we're 8% below market for the staff-engineer band.\n"
                "Neel Desai: I'd suggest bumping the band to $200-$240K and closing the top two candidates this week.\n"
                "Amit Patel: Good. Let's prepare offer drafts and circulate for approval."
            ),
            "language": "en",
            "duration": 28 * 60,
            "segments": None,
            "source": "demo_seed",
        },
    }
    await db.calls.insert_one(call2.copy())
    await db.messages.insert_one({
        "id": new_id(),
        "chat_id": chats[1]["id"],
        "sender_id": "ai-system",
        "message_type": "call_ended",
        "body": "",
        "parent_message_id": None,
        "metadata": {
            "call_id": call2_id, "mode": "audio", "status": "ended",
            "started_by": owner["id"], "started_by_name": owner["name"],
            "started_at": call2_started, "ended_at": call2_ended,
            "duration_seconds": 28 * 60, "participants": call2["participants"],
        },
        "reactions": {}, "created_at": call2_ended,
        "edited_at": None, "deleted_at": None,
    })

    # ---- Sample approved research + approval ----
    thread_id = new_id()
    await db.ai_threads.insert_one({
        "id": thread_id,
        "chat_id": chats[0]["id"],
        "question": "Should we launch the Pro tier in the US or EU first?",
        "created_by": owner["id"],
        "selected_models": ["chatgpt", "claude", "gemini"],
        "final_answer": "US first — bigger SMB market, faster volume, lighter compliance. Expand to EU in Q3 once SOC 2 + DPA land.",
        "status": "complete",
        "votes": {},
        "public_token": None,
        "auto_synthesized": True,
        "created_at": (now_dt - timedelta(days=1, hours=2)).isoformat(),
    })
    await db.approvals.insert_one({
        "id": new_id(),
        "workspace_id": workspace_id,
        "research_thread_id": thread_id,
        "title": "Pro-tier launch market: US vs EU",
        "final_answer": "US first for the Pro-tier launch. EU follows in Q3 once SOC 2 + DPA + sub-processors are signed. SMB volume in the US justifies the order.",
        "version": 1,
        "history": [{
            "version": 1, "edited_by": owner["id"],
            "final_answer": "US first for the Pro-tier launch...",
            "at": (now_dt - timedelta(hours=20)).isoformat(),
        }],
        "status": "approved",
        "created_by": owner["id"],
        "reviewer_ids": [priya["id"]],
        "decisions": [{
            "by": priya["id"], "by_name": priya["name"],
            "status": "approved",
            "comment": "Aligned with the pipeline forecast. Approved.",
            "at": (now_dt - timedelta(hours=18)).isoformat(),
        }],
        "comments": [],
        "approved_by": priya["id"],
        "approved_at": (now_dt - timedelta(hours=18)).isoformat(),
        "locked": True,
        "project_folder_id": folders[0]["id"],
        "created_at": (now_dt - timedelta(hours=21)).isoformat(),
        "updated_at": (now_dt - timedelta(hours=18)).isoformat(),
    })

    # ---- Sample pending approval ----
    thread2_id = new_id()
    await db.ai_threads.insert_one({
        "id": thread2_id,
        "chat_id": chats[1]["id"],
        "question": "Senior-engineer comp band for Q2 hiring",
        "created_by": owner["id"],
        "selected_models": ["claude"],
        "final_answer": "Lift the staff-engineer comp band to $200-$240K base + 0.25-0.6% equity for the top two candidates and revisit in 90 days.",
        "status": "complete",
        "votes": {},
        "public_token": None,
        "auto_synthesized": False,
        "single_model": True,
        "created_at": (now_dt - timedelta(hours=20)).isoformat(),
    })
    await db.approvals.insert_one({
        "id": new_id(),
        "workspace_id": workspace_id,
        "research_thread_id": thread2_id,
        "title": "Q2 senior-engineer comp band",
        "final_answer": "Raise the staff-engineer band to $200-$240K base + 0.25-0.6% equity. Re-benchmark in 90 days. Close the top two on-site candidates this week.",
        "version": 1,
        "history": [{
            "version": 1, "edited_by": owner["id"],
            "final_answer": "Raise the staff-engineer band...",
            "at": (now_dt - timedelta(hours=2)).isoformat(),
        }],
        "status": "needs_review",
        "created_by": owner["id"],
        "reviewer_ids": [priya["id"]],
        "decisions": [],
        "comments": [],
        "approved_by": None,
        "approved_at": None,
        "locked": False,
        "project_folder_id": folders[1]["id"],
        "created_at": (now_dt - timedelta(hours=2)).isoformat(),
        "updated_at": (now_dt - timedelta(hours=2)).isoformat(),
    })

    # ---- Overdue task ----
    overdue_due = (now_dt - timedelta(days=1)).isoformat()
    await db.tasks.insert_one({
        "id": new_id(),
        "workspace_id": workspace_id,
        "project_folder_id": folders[0]["id"],
        "source_chat_id": chats[0]["id"],
        "source_message_id": None,
        "title": "Benchmark SaaS pricing tiers vs Linear, Notion, Figma",
        "description": "Pull current public Pro/Team prices and credits from Linear, Notion, and Figma to inform our launch ladder.",
        "assigned_to": raj["id"],
        "created_by": owner["id"],
        "due_date": overdue_due,
        "priority": "high",
        "status": "todo",
        "created_at": (now_dt - timedelta(days=3)).isoformat(),
        "completed_at": None,
    })
