"""AI Employee Builder — Developer Program (Beta).

Individuals apply to become an approved "AI Employee Builder". Access to create
AI employees is gated to: super admins, users approved through this program, OR
workspaces on the top-level Team plan ($19.99). Super Admins review and approve
/ reject applications.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import db, new_id, now_iso, require_super_admin, require_user
from services.billing import get_subscription

router = APIRouter()

BUILDER_PLAN_IDS = {"team"}
REAPPLY_COOLDOWN_DAYS = 30


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


async def builder_access(current: dict) -> tuple[bool, Optional[str]]:
    """Returns (has_access, reason). reason ∈ super_admin|approved|team_plan|None."""
    if current.get("is_super_admin"):
        return True, "super_admin"
    u = await db.users.find_one({"id": current["id"]}, {"_id": 0, "builder_approved": 1})
    if u and u.get("builder_approved"):
        return True, "approved"
    try:
        sub = await get_subscription(current["workspace_id"])
        if (sub or {}).get("plan_id") in BUILDER_PLAN_IDS:
            return True, "team_plan"
    except Exception:
        pass
    return False, None


async def require_builder(current=Depends(require_user)) -> dict:
    ok, _ = await builder_access(current)
    if not ok:
        raise HTTPException(
            403,
            "Building AI employees is in Beta. Apply to the Builder Program or "
            "upgrade to the Team plan to unlock it.",
        )
    return current


# ── Applicant ────────────────────────────────────────────────────────────
class Application(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    company: Optional[str] = Field(default="", max_length=160)
    website: Optional[str] = Field(default="", max_length=200)
    motivation: str = Field(min_length=10, max_length=2000)      # why they want to build
    value_prop: str = Field(min_length=10, max_length=2000)      # how they'll add value
    agent_ideas: str = Field(min_length=10, max_length=2000)     # unique AI employees they'd design


@router.get("/builder-program/me")
async def my_status(current=Depends(require_user)):
    ok, reason = await builder_access(current)
    app = await db.builder_applications.find_one(
        {"user_id": current["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    reapply_at = None
    can_reapply = True
    if app and app.get("status") == "rejected":
        decided = _parse_iso(app.get("updated_at"))
        if decided:
            unlock = decided + timedelta(days=REAPPLY_COOLDOWN_DAYS)
            if datetime.now(timezone.utc) < unlock:
                can_reapply = False
                reapply_at = unlock.isoformat()
    return {"builder_access": ok, "reason": reason, "application": app,
            "can_reapply": can_reapply, "reapply_at": reapply_at,
            "reapply_cooldown_days": REAPPLY_COOLDOWN_DAYS}


@router.post("/builder-program/apply")
async def apply(payload: Application, current=Depends(require_user)):
    existing = await db.builder_applications.find_one(
        {"user_id": current["id"], "status": {"$in": ["pending", "approved"]}}, {"_id": 0})
    if existing:
        raise HTTPException(400, f"You already have a {existing['status']} application")
    # Rejection cooldown — cannot re-apply until the cooldown elapses.
    last_rejected = await db.builder_applications.find_one(
        {"user_id": current["id"], "status": "rejected"}, {"_id": 0}, sort=[("updated_at", -1)])
    if last_rejected:
        decided = _parse_iso(last_rejected.get("updated_at"))
        if decided:
            unlock = decided + timedelta(days=REAPPLY_COOLDOWN_DAYS)
            if datetime.now(timezone.utc) < unlock:
                raise HTTPException(
                    429,
                    f"Your previous application was declined. You can re-apply after "
                    f"{unlock.date().isoformat()}.",
                )
    now = now_iso()
    doc = {
        "id": new_id(), "user_id": current["id"],
        "user_email": current.get("email"), "user_name": current.get("name"),
        "workspace_id": current["workspace_id"],
        "full_name": payload.full_name.strip(), "company": (payload.company or "").strip(),
        "website": (payload.website or "").strip(), "motivation": payload.motivation.strip(),
        "value_prop": payload.value_prop.strip(), "agent_ideas": payload.agent_ideas.strip(),
        "status": "pending", "decided_by": None, "decision_note": "",
        "created_at": now, "updated_at": now,
    }
    await db.builder_applications.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


# ── Super Admin review ─────────────────────────────────────────────────────
@router.get("/builder-program/applications")
async def list_applications(status: Optional[str] = None, current=Depends(require_super_admin)):
    query: dict = {}
    if status and status != "all":
        query["status"] = status
    rows = await db.builder_applications.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    counts = {}
    for s in ("pending", "approved", "rejected"):
        counts[s] = await db.builder_applications.count_documents({"status": s})
    return {"applications": rows, "counts": counts}


class Decision(BaseModel):
    decision: str                       # approve | reject
    note: Optional[str] = ""


@router.post("/builder-program/applications/{app_id}/decide")
async def decide(app_id: str, payload: Decision, current=Depends(require_super_admin)):
    if payload.decision not in ("approve", "reject"):
        raise HTTPException(400, "decision must be approve or reject")
    app = await db.builder_applications.find_one({"id": app_id}, {"_id": 0})
    if not app:
        raise HTTPException(404, "Application not found")
    status = "approved" if payload.decision == "approve" else "rejected"
    now = now_iso()
    await db.builder_applications.update_one(
        {"id": app_id},
        {"$set": {"status": status, "decided_by": current.get("email"),
                  "decision_note": payload.note or "", "updated_at": now}})
    await db.users.update_one(
        {"id": app["user_id"]},
        {"$set": {"builder_approved": status == "approved", "updated_at": now}})
    # Audit trail — one immutable record per decision.
    await db.builder_program_audit.insert_one({
        "id": new_id(), "application_id": app_id, "user_id": app["user_id"],
        "user_email": app.get("user_email"), "decision": status,
        "note": payload.note or "", "decided_by": current.get("email"),
        "created_at": now,
    })
    return {"ok": True, "status": status}


@router.get("/builder-program/applications/{app_id}/audit")
async def application_audit(app_id: str, current=Depends(require_super_admin)):
    rows = await db.builder_program_audit.find(
        {"application_id": app_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"audit": rows}
