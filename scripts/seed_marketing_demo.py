"""Seed clean, marketing-quality demo content for store screenshots:
- Curated message thread in 'Max Brenner Expansion Team' chat
- Diverse tasks across todo / in_progress / done with real names
- A polished saved AI research thread for the compare screenshot
"""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path("/app/backend/.env"))

from motor.motor_asyncio import AsyncIOMotorClient


def iso(dt):
    return dt.replace(tzinfo=timezone.utc).isoformat()


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    amit = await db.users.find_one({"email": "amit@demo.team"})
    wm = await db.workspace_members.find_one({"user_id": amit["id"], "role": "owner"})
    ws_id = wm["workspace_id"]

    # Lookup users we'll attribute messages to
    users = {}
    for email in ["amit@demo.team", "raj@demo.team", "priya@demo.team", "neel@demo.team", "sara@demo.team"]:
        u = await db.users.find_one({"email": email})
        if u:
            users[email] = u

    # ----- Curate one perfect chat -----
    chat = await db.chats.find_one({"workspace_id": ws_id, "name": "Max Brenner Expansion Team"})
    if not chat:
        print("[ERR] Max Brenner chat not found")
        return
    chat_id = chat["id"]
    # Wipe existing messages (some may be empty fallbacks)
    await db.messages.delete_many({"chat_id": chat_id})

    now = datetime.now(timezone.utc)
    seed_messages = [
        # (sender_email, body, minutes_ago)
        ("amit@demo.team",
         "Team — kicking off the Frisco expansion planning thread. Goal: open by Q4 2026.",
         180),
        ("priya@demo.team",
         "I pulled foot-traffic data for The Star + Legacy West. Both clear 8k/wk, Legacy West leans business-lunch.",
         165),
        ("raj@demo.team",
         "Lease rates I'm seeing: Legacy West $58/sqft NNN, The Star $52, Frisco Station $46. Numbers below.",
         150),
        ("amit@demo.team",
         "@ai compare these three lease rates vs national QSR average and recommend which corridor fits a 2200 sqft footprint",
         145),
        ("__ai__",
         "**Comparing the three Frisco corridors against national QSR benchmarks**\n\n• National QSR average (Tier-1 metros): **$48–$54/sqft NNN**\n• Legacy West $58 → premium positioning, justified by lunchtime corporate density\n• The Star $52 → balanced traffic, tourist + local mix\n• Frisco Station $46 → best $/traffic ratio but younger demo\n\nFor a 2,200 sqft chocolate-bar concept aimed at families + business lunch, **The Star wins on blended-margin**: traffic is 6% lower than Legacy West but rent is 10% cheaper, and tourist spend lifts dessert SKU mix.\n\nWant me to pull the per-unit P&L model?",
         144),
        ("neel@demo.team",
         "Big +1 on The Star — Dallas Cowboys foot traffic peaks Thu–Sun which matches our dessert-occasion window.",
         130),
        ("sara@demo.team",
         "@task Finalize letter of intent with The Star leasing by next Friday — assignee Raj",
         120),
        ("amit@demo.team",
         "Task created. Let's also book a site visit for the 22nd. Priya, can you coordinate?",
         115),
        ("priya@demo.team",
         "On it. Will share calendar invite by EOD.",
         110),
    ]

    for sender_email, body, mins_ago in seed_messages:
        if sender_email == "__ai__":
            sender_user_id = None
            kind = "ai"
        else:
            sender_user_id = users[sender_email]["id"]
            kind = "text"
        doc = {
            "id": str(uuid.uuid4()),
            "chat_id": chat_id,
            "workspace_id": ws_id,
            "sender_id": sender_user_id,
            "kind": kind,
            "type": kind,
            "body": body,
            "content": body,
            "created_at": iso(now - timedelta(minutes=mins_ago)),
            "reactions": {},
        }
        if kind == "ai":
            doc["ai_model"] = "gpt-4o-mini"
            doc["model"] = "gpt-4o-mini"
        await db.messages.insert_one(doc)
    # Update chat last_message preview
    await db.chats.update_one(
        {"id": chat_id},
        {"$set": {"last_message_at": iso(now - timedelta(minutes=110)),
                  "last_message_preview": "On it. Will share calendar invite by EOD."}}
    )
    print(f"[OK] Seeded {len(seed_messages)} messages in Max Brenner Expansion Team")

    # ----- Curate clean diverse tasks -----
    # Wipe existing duplicates, leave nothing behind, then re-seed 8 polished tasks
    await db.tasks.delete_many({"workspace_id": ws_id})

    tasks = [
        # (title, status, assignee_email, priority, due_offset_days, description)
        ("Sign Letter of Intent with The Star leasing",
         "todo", "raj@demo.team", "high", 3,
         "2,200 sqft endcap, Dec 2026 occupancy. Legal review by Tue."),
        ("Site visit + photos — Frisco corridor",
         "todo", "priya@demo.team", "medium", 5,
         "Tour Legacy West, The Star, Frisco Station back-to-back."),
        ("Build per-unit P&L model (Year 1)",
         "in_progress", "amit@demo.team", "high", 4,
         "Include AI-recommended occupancy cost ratios — see AI thread."),
        ("Design dessert-occasion menu for Texas market",
         "in_progress", "neel@demo.team", "medium", 7,
         "Localize SKUs: pecan praline crepe, BBQ chocolate brownie."),
        ("Confirm franchisee training schedule",
         "in_progress", "sara@demo.team", "low", 14,
         "3-week curriculum in Dallas commissary."),
        ("Vendor RFP — espresso equipment",
         "done", "raj@demo.team", "medium", -2,
         "La Marzocco vs Slayer. Picked La Marzocco Linea PB."),
        ("Q1 marketing brief: \"Open in Texas\"",
         "done", "neel@demo.team", "high", -5,
         "Brief approved, agency kickoff scheduled."),
        ("Domain registration: maxbrennertexas.com",
         "done", "amit@demo.team", "low", -10,
         "Domain secured + redirect to main site."),
    ]
    for title, status, email, priority, due_offset, desc in tasks:
        assignee = users.get(email)
        doc = {
            "id": str(uuid.uuid4()),
            "workspace_id": ws_id,
            "title": title,
            "description": desc,
            "status": status,
            "priority": priority,
            "assignee_id": assignee["id"] if assignee else None,
            "assignee_name": assignee["name"] if assignee else None,
            "due_date": iso(now + timedelta(days=due_offset)),
            "created_by": amit["id"],
            "created_at": iso(now - timedelta(days=max(1, 10 - abs(due_offset)))),
            "updated_at": iso(now - timedelta(hours=2)),
            "chat_id": chat_id if status != "done" else None,
        }
        await db.tasks.insert_one(doc)
    print(f"[OK] Seeded {len(tasks)} clean tasks across todo/in_progress/done")

asyncio.run(main())
