"""
Seed a LOCAL TeamNest.ai MongoDB with a small demo workspace, so you're not
staring at an empty app on first login. Creates an owner + two teammates, a
sample group chat with messages, one AI research thread, and a few tasks.

Safe to re-run — it is idempotent (skips anything already present).

Prerequisites: a running MongoDB and a backend/.env with MONGO_URL + DB_NAME
(exactly what the backend uses). Then, from the repo root:

    python scripts/seed_local.py          # loads backend/.env automatically

Log in afterwards with:
    founder@local.test  /  Founder@2026     (workspace owner)
    riya@local.test      /  Member@2026     (teammate)
    sam@local.test       /  Member@2026     (teammate)
"""
import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env so MONGO_URL / DB_NAME exist BEFORE importing deps (deps.py
# reads them at import time), and make backend modules importable.
BACKEND = Path(__file__).resolve().parent.parent / "backend"
load_dotenv(BACKEND / ".env")
sys.path.insert(0, str(BACKEND))

from auth_utils import hash_password  # noqa: E402
from deps import db, ensure_personal_ai_chat, new_id, now_iso  # noqa: E402
from services.workspace_membership import ensure_membership  # noqa: E402

OWNER = {"name": "Local Founder", "email": "founder@acme.com", "password": "Founder@2026"}
TEAMMATES = [
    {"name": "Riya Sharma", "email": "riya@acme.com"},
    {"name": "Sam Lee", "email": "sam@acme.com"},
]
MEMBER_PASSWORD = "Member@2026"
MARKER_CHAT = "Product Launch"
# Emails this script has ever used — `--purge` cascades all of them so a local
# reset is clean regardless of which version created the data.
PURGE_EMAILS = [
    "founder@acme.com", "riya@acme.com", "sam@acme.com",
    "founder@local.test", "riya@local.test", "sam@local.test",
]


async def _upsert_user(name, email, password, role, workspace_id):
    existing = await db.users.find_one({"email": email.lower()}, {"_id": 0})
    if existing:
        return existing
    user = {
        "id": new_id(),
        "name": name,
        "email": email.lower(),
        "phone": None,
        "phone_normalized": None,
        "phone_hash": None,
        "password_hash": hash_password(password),
        "avatar": None,
        "role": role,
        "workspace_id": workspace_id,
        "status": "active",
        "created_at": now_iso(),
    }
    await db.users.insert_one(user.copy())
    await ensure_membership(user["id"], workspace_id, role=role)
    await ensure_personal_ai_chat(user["id"], workspace_id)
    return user


def _msg(chat_id, sender_id, body, mtype="text", metadata=None):
    return {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": sender_id,
        "message_type": mtype,
        "body": body,
        "parent_message_id": None,
        "metadata": metadata or {},
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }


async def _purge():
    """Cascade-delete every seeded workspace (see PURGE_EMAILS) and its data —
    a clean local reset. Run:  python scripts/seed_local.py --purge"""
    users = await db.users.find({"email": {"$in": PURGE_EMAILS}}, {"_id": 0, "id": 1, "workspace_id": 1}).to_list(50)
    ws_ids = sorted({u["workspace_id"] for u in users if u.get("workspace_id")})
    if not ws_ids:
        print("Nothing to purge.")
        return
    chat_ids = [c["id"] for c in await db.chats.find({"workspace_id": {"$in": ws_ids}}, {"_id": 0, "id": 1}).to_list(5000)]
    if chat_ids:  # chat-scoped collections
        for coll in ("messages", "ai_threads"):
            res = await db[coll].delete_many({"chat_id": {"$in": chat_ids}})
            print(f"  purged {res.deleted_count:>4} from {coll}")
    for coll in ("chats", "tasks", "notifications", "workspace_members", "users"):
        res = await db[coll].delete_many({"workspace_id": {"$in": ws_ids}})
        print(f"  purged {res.deleted_count:>4} from {coll}")
    res = await db.workspaces.delete_many({"id": {"$in": ws_ids}})
    print(f"  purged {res.deleted_count:>4} from workspaces")
    print(f"Purged {len(ws_ids)} seed workspace(s).")


async def main():
    if "--purge" in sys.argv:
        await _purge()
        return
    # 1) Owner + workspace
    owner = await db.users.find_one({"email": OWNER["email"].lower()}, {"_id": 0})
    if owner:
        workspace_id = owner["workspace_id"]
        print(f"- Owner already exists; reusing workspace {workspace_id}")
    else:
        workspace_id = new_id()
        await db.workspaces.insert_one({
            "id": workspace_id,
            "name": f"{OWNER['name']}'s Workspace",
            "owner_id": None,
            "created_at": now_iso(),
        })
        owner = await _upsert_user(OWNER["name"], OWNER["email"], OWNER["password"], "owner", workspace_id)
        await db.workspaces.update_one({"id": workspace_id}, {"$set": {"owner_id": owner["id"]}})
        print(f"+ Created owner {OWNER['email']} + workspace {workspace_id}")

    # 2) Teammates
    members = [
        await _upsert_user(t["name"], t["email"], MEMBER_PASSWORD, "member", workspace_id)
        for t in TEAMMATES
    ]
    member_ids = [owner["id"]] + [m["id"] for m in members]
    print(f"+ Team ready: {len(member_ids)} members")

    # 3) Sample group chat + messages + AI research thread
    chat = await db.chats.find_one({"workspace_id": workspace_id, "name": MARKER_CHAT}, {"_id": 0})
    if not chat:
        chat = {
            "id": new_id(),
            "workspace_id": workspace_id,
            "type": "group",
            "name": MARKER_CHAT,
            "description": "Coordinating the v1 launch.",
            "project_folder_id": None,
            "default_models": ["chatgpt", "claude", "gemini"],
            "member_ids": member_ids,
            "admin_ids": [owner["id"]],
            "posting_policy": "all",
            "posting_user_ids": [],
            "created_by": owner["id"],
            "created_at": now_iso(),
            "pinned_message_ids": [],
            "avatar_icon": None,
            "avatar_color": None,
            "avatar_url": None,
        }
        await db.chats.insert_one(chat.copy())

        base = [
            _msg(chat["id"], owner["id"], "Kicking off the launch thread — target ship date is Friday."),
            _msg(chat["id"], members[0]["id"], "Landing page copy is ready for review."),
            _msg(chat["id"], members[1]["id"], "I'll handle the changelog and the email blast."),
        ]
        await db.messages.insert_many([m.copy() for m in base])

        thread_id = new_id()
        answer = ("- Automate the busywork so your team ships faster\n"
                  "- Set it up in minutes, no code required\n"
                  "- You stay in control with approvals on every action")
        q = _msg(chat["id"], owner["id"],
                 "@ai draft a 3-bullet launch announcement for our new AI automation feature.",
                 mtype="ai_question", metadata={"thread_id": thread_id})
        a = _msg(chat["id"], "ai-assistant", answer,
                 mtype="ai_answer", metadata={"thread_id": thread_id, "model": "claude"})
        thread = {
            "id": thread_id,
            "chat_id": chat["id"],
            "question": q["body"],
            "title": "Launch announcement draft",
            "created_by": owner["id"],
            "selected_models": ["claude"],
            "final_answer": answer,
            "status": "complete",
            "votes": {},
            "public_token": None,
            "memory_mode": "off",
            "memory_source_ids": [],
            "linked_human_message_id": None,
            "visibility": "chat",
            "created_at": now_iso(),
        }
        await db.ai_threads.insert_one(thread.copy())
        await db.messages.insert_many([q.copy(), a.copy()])
        print("+ Created sample chat (3 messages) + 1 AI research thread")
    else:
        print("- Sample chat already exists; skipping chat/AI seed")

    # 4) Sample tasks
    if await db.tasks.count_documents({"workspace_id": workspace_id}) == 0:
        specs = [
            ("Finalize launch landing page", members[0]["id"], "high", "in_progress"),
            ("Write changelog and email blast", members[1]["id"], "medium", "todo"),
            ("QA the automation builder", owner["id"], "high", "todo"),
            ("Kickoff meeting notes", owner["id"], "low", "completed"),
        ]
        docs = [{
            "id": new_id(),
            "workspace_id": workspace_id,
            "project_folder_id": None,
            "source_chat_id": None,
            "source_message_id": None,
            "title": title,
            "description": "",
            "assigned_to": assignee,
            "created_by": owner["id"],
            "created_by_employee_key": None,
            "estimated_hours_saved": None,
            "due_date": None,
            "priority": priority,
            "status": status,
            "created_at": now_iso(),
            "completed_at": now_iso() if status == "completed" else None,
            "deleted_at": None,
            "reminder_log": [],
        } for (title, assignee, priority, status) in specs]
        await db.tasks.insert_many(docs)
        print(f"+ Created {len(docs)} sample tasks")
    else:
        print("- Tasks already exist; skipping task seed")

    print("\n" + "-" * 48)
    print("Seed complete. Log in on your local frontend:")
    print(f"  Owner   -> {OWNER['email']}  /  {OWNER['password']}")
    for t in TEAMMATES:
        print(f"  Member  -> {t['email']}  /  {MEMBER_PASSWORD}")
    print("-" * 48)


if __name__ == "__main__":
    asyncio.run(main())
