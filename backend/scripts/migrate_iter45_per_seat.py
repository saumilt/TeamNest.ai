"""Iteration 45 — Migrate existing workspaces to the new per-seat pricing.

Run once after deploy. Idempotent: skips workspaces that already have the new
pool. Touches only `workspace_billing` (resets credits_used_this_period back
to 0 so seats get a fresh allowance on the new plan).
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timezone

from deps import db, logger
from services.billing import PLANS, _period_end, _period_start


async def migrate():
    cur = db.workspace_billing.find({}, {"_id": 0})
    count = 0
    async for sub in cur:
        plan_id = sub.get("plan_id") or "free"
        plan = PLANS.get(plan_id)
        if not plan:
            continue
        ps = _period_start()
        pe = _period_end(ps)
        await db.workspace_billing.update_one(
            {"workspace_id": sub["workspace_id"]},
            {"$set": {
                "period_start": ps.isoformat(),
                "period_end": pe.isoformat(),
                "credits_used_this_period": 0,
                "migrated_to_per_seat_at": datetime.now(timezone.utc).isoformat(),
                "previous_plan_pricing": {
                    "pro_monthly": 20,
                    "team_monthly": 50,
                    "pro_credits": 6000,
                    "team_credits": 18000,
                },
            }},
        )
        count += 1
    logger.info("[migration-iter45] reset %s workspace_billing records", count)
    return count


if __name__ == "__main__":
    n = asyncio.run(migrate())
    print(f"Migrated {n} workspace_billing records to the new per-seat pricing model.")
