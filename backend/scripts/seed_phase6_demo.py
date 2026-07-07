"""Phase 6 — demo seed for 3 example companies.

Run with:  python -m scripts.seed_phase6_demo
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, "/app/backend")

from dotenv import load_dotenv  # noqa: E402

load_dotenv("/app/backend/.env")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

COMPANIES = [
    {
        "name": "Perfect Restaurant Group",
        "owner_email": "amit@demo.team",  # we reuse the existing demo workspace
        "active_employees": ["cmo", "sales", "bookkeeper"],
        "external_contacts": [
            {"name": "Chef Rao", "phone": "+15005550010", "role": "Vendor", "company": "Rao's Spices"},
            {"name": "Devesh (Franchise Lead)", "phone": "+15005550011", "role": "Franchise Lead",
             "company": "Frisco Investor LLC"},
        ],
        "sample_chat_prompts": [
            "@AI CMO create a 30-day grand opening calendar for Max Brenner Dallas.",
            "@AI Sales draft a cold email to 5 franchise prospects in Texas.",
        ],
    },
    {
        "name": "Thakkar Developers",
        "owner_email": "amit@demo.team",
        "active_employees": ["paralegal", "bookkeeper"],
        "external_contacts": [
            {"name": "Brett Heilig", "phone": "+15005550012", "role": "Attorney", "company": "DLA Piper"},
            {"name": "Kanan Investor", "phone": "+15005550013", "role": "Investor",
             "company": "Kanan Capital LLC"},
        ],
        "sample_chat_prompts": [
            "@AI Paralegal summarize the default risks in the latest LOI for the Allen project.",
        ],
    },
    {
        "name": "FunAsia Media",
        "owner_email": "amit@demo.team",
        "active_employees": ["cmo", "sales", "bookkeeper"],
        "external_contacts": [
            {"name": "Anil (Local Restaurant Owner)", "phone": "+15005550014",
             "role": "Advertiser", "company": "Royal Tandoor"},
        ],
        "sample_chat_prompts": [
            "@AI Sales create a local advertiser sales campaign for South Asian restaurants in Dallas.",
        ],
    },
]


async def main():
    mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]

    # Find the demo user / workspace.
    user = await db.users.find_one({"email": "amit@demo.team"}, {"_id": 0})
    if not user:
        print("Demo user amit@demo.team not found. Skipping seed.")
        return
    workspace_id = user["workspace_id"]

    now = datetime.now(timezone.utc)
    for company in COMPANIES:
        print(f"Seeding {company['name']}…")
        # Subscriptions
        for key in company["active_employees"]:
            await db.ai_employee_subscriptions.update_one(
                {"workspace_id": workspace_id, "employee_key": key},
                {
                    "$setOnInsert": {
                        "id": f"seed-{workspace_id}-{key}",
                        "workspace_id": workspace_id,
                        "employee_key": key,
                        "phase": "trial",
                        "status": "trial_active",
                        "started_by": user["id"],
                        "trial_started_at": now.isoformat(),
                        "trial_ends_at": (now + timedelta(days=5)).isoformat(),
                        "trial_credits_total": 500,
                        "trial_credits_used": 0,
                        "monthly_credits_total": 3000,
                        "monthly_credits_used": 0,
                        "auto_convert": True,
                        "created_at": now.isoformat(),
                        "updated_at": now.isoformat(),
                    }
                },
                upsert=True,
            )
        # External contacts (use Twilio magic test numbers so SMS works in test mode)
        for c in company["external_contacts"]:
            await db.external_contacts.update_one(
                {"workspace_id": workspace_id, "phone": c["phone"]},
                {
                    "$setOnInsert": {
                        "id": f"seed-{workspace_id}-{c['phone']}",
                        "workspace_id": workspace_id,
                        "created_by": user["id"],
                        "name": c["name"],
                        "phone": c["phone"],
                        "company": c.get("company"),
                        "role": c.get("role"),
                        "relationship": "external",
                        "sms_opted_in": True,
                        "created_at": now.isoformat(),
                    }
                },
                upsert=True,
            )
        print(f"  ✓ {len(company['active_employees'])} subs, {len(company['external_contacts'])} contacts")

    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(main())
