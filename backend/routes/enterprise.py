"""TeamNest Role Intelligence — Enterprise module (Phase A).

Enterprise People, Roles, Role Intelligence profiles, licenses and continuity
scores. Auto-seeds the 'Perfect Restaurant Group' sample on first load so the
workspace has realistic data to explore. Audit events are recorded for key
actions. Specific routes are declared before parameterized ones.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import db, new_id, now_iso, require_user
from services.enterprise_seed import PRICE_PER_SEAT, seed_enterprise

router = APIRouter()


def _owner_only(current: dict):
    if not current.get("is_super_admin") and current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Enterprise admin (owner/admin) only")


async def _audit(ws: str, actor: dict, action: str, target_type: str, target_id: str, meta: dict | None = None):
    await db.enterprise_audit_logs.insert_one({
        "id": new_id(), "workspace_id": ws, "actor_id": actor["id"], "actor_name": actor.get("name"),
        "action": action, "target_type": target_type, "target_id": target_id,
        "meta": meta or {}, "created_at": now_iso(),
    })


async def _ensure_seed(current: dict):
    if await db.enterprise_users.count_documents({"workspace_id": current["workspace_id"]}) == 0:
        await seed_enterprise(current["workspace_id"], current["id"], amit_user_id=current["id"] if current.get("email") == "amit@demo.team" else None)


async def _score_map(ws: str) -> dict:
    rows = await db.enterprise_knowledge_scores.find({"workspace_id": ws}, {"_id": 0}).to_list(500)
    return {r["role_id"]: r for r in rows}


async def _role_map(ws: str) -> dict:
    rows = await db.enterprise_roles.find({"workspace_id": ws}, {"_id": 0}).to_list(500)
    return {r["id"]: r for r in rows}


# ── Overview ───────────────────────────────────────────────────────────────
@router.get("/enterprise/overview")
async def overview(current=Depends(require_user)):
    _owner_only(current)
    await _ensure_seed(current)
    ws = current["workspace_id"]
    people = await db.enterprise_users.find({"workspace_id": ws}, {"_id": 0}).to_list(1000)
    scores = await _score_map(ws)
    roles = await _role_map(ws)
    lic = await db.enterprise_licenses.find_one({"workspace_id": ws}, {"_id": 0}) or {}
    critical = [p for p in people if (scores.get(p["role_id"], {}).get("risk_level") in ("High", "Critical"))]
    roles_no_successor = [r for r in roles.values() if not r.get("active_employee_user_id") or True]
    return {
        "licenses": {
            "seats_purchased": lic.get("seats_purchased", 0),
            "seats_assigned": lic.get("seats_assigned", 0),
            "price_per_seat": lic.get("price_per_seat", PRICE_PER_SEAT),
            "monthly_seat_cost": round(lic.get("seats_assigned", 0) * lic.get("price_per_seat", PRICE_PER_SEAT), 2),
        },
        "counts": {
            "employees": len(people),
            "roles": len(roles),
            "departing": sum(1 for p in people if p["employment_status"] == "Departing"),
            "at_risk": len(critical),
        },
        "risk_preview": [
            {"employee_name": p["employee_name"], "role": roles.get(p["role_id"], {}).get("role_name"),
             "unique_knowledge": p.get("unique_knowledge_level"),
             "continuity_score": scores.get(p["role_id"], {}).get("overall_score", 0),
             "risk_level": scores.get(p["role_id"], {}).get("risk_level", "Unknown")}
            for p in sorted(people, key=lambda x: scores.get(x["role_id"], {}).get("overall_score", 100))
        ],
    }


# ── People ──────────────────────────────────────────────────────────────────
class EmployeeIn(BaseModel):
    employee_name: str
    employee_email: str
    role_id: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    employment_status: str = "Active"
    unique_knowledge_level: str = "Medium"


@router.get("/enterprise/people")
async def list_people(current=Depends(require_user)):
    _owner_only(current)
    await _ensure_seed(current)
    ws = current["workspace_id"]
    people = await db.enterprise_users.find({"workspace_id": ws}, {"_id": 0}).to_list(1000)
    scores = await _score_map(ws)
    roles = await _role_map(ws)
    return {"people": [
        {**p, "role_name": roles.get(p["role_id"], {}).get("role_name"),
         "continuity_score": scores.get(p["role_id"], {}).get("overall_score", 0),
         "risk_level": scores.get(p["role_id"], {}).get("risk_level", "Unknown")}
        for p in people
    ]}


@router.post("/enterprise/people")
async def add_employee(payload: EmployeeIn, current=Depends(require_user)):
    _owner_only(current)
    ws = current["workspace_id"]
    doc = {"id": new_id(), "workspace_id": ws, "user_id": None,
           "employee_name": payload.employee_name, "employee_email": payload.employee_email,
           "role_id": payload.role_id, "department": payload.department, "manager_user_id": None,
           "location": payload.location, "start_date": None, "employment_status": payload.employment_status,
           "enterprise_license_status": "active", "backup_user_id": None, "successor_user_id": None,
           "knowledge_transfer_status": "not_started", "unique_knowledge_level": payload.unique_knowledge_level,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.enterprise_users.insert_one(doc.copy())
    await _audit(ws, current, "employee_added", "employee", doc["id"], {"name": payload.employee_name})
    return {"ok": True, "employee": doc}


@router.get("/enterprise/people/{eid}")
async def get_employee(eid: str, current=Depends(require_user)):
    _owner_only(current)
    ws = current["workspace_id"]
    emp = await db.enterprise_users.find_one({"id": eid, "workspace_id": ws}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    role = await db.enterprise_roles.find_one({"id": emp.get("role_id")}, {"_id": 0}) if emp.get("role_id") else None
    profile = await db.enterprise_role_profiles.find_one({"role_id": emp.get("role_id")}, {"_id": 0}) if emp.get("role_id") else None
    score = await db.enterprise_knowledge_scores.find_one({"role_id": emp.get("role_id")}, {"_id": 0}) if emp.get("role_id") else None
    memories = await db.enterprise_role_memories.find(
        {"role_id": emp.get("role_id"), "approval_status": "approved"}, {"_id": 0}).to_list(50) if emp.get("role_id") else []
    return {"employee": emp, "role": role, "profile": profile, "score": score, "memories": memories}


class EmployeePatch(BaseModel):
    employment_status: Optional[str] = None
    successor_user_id: Optional[str] = None
    backup_user_id: Optional[str] = None
    knowledge_transfer_status: Optional[str] = None
    role_id: Optional[str] = None
    department: Optional[str] = None


@router.patch("/enterprise/people/{eid}")
async def update_employee(eid: str, payload: EmployeePatch, current=Depends(require_user)):
    _owner_only(current)
    ws = current["workspace_id"]
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if not update:
        raise HTTPException(400, "Nothing to update")
    update["updated_at"] = now_iso()
    r = await db.enterprise_users.update_one({"id": eid, "workspace_id": ws}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(404, "Employee not found")
    await _audit(ws, current, "employee_updated", "employee", eid, update)
    return {"ok": True}


# ── Roles + Role Intelligence profile ────────────────────────────────────────
@router.get("/enterprise/roles")
async def list_roles(current=Depends(require_user)):
    _owner_only(current)
    await _ensure_seed(current)
    ws = current["workspace_id"]
    roles = await db.enterprise_roles.find({"workspace_id": ws}, {"_id": 0}).to_list(500)
    scores = await _score_map(ws)
    return {"roles": [{**r, "continuity_score": scores.get(r["id"], {}).get("overall_score", 0),
                       "risk_level": scores.get(r["id"], {}).get("risk_level", "Unknown")} for r in roles]}


@router.get("/enterprise/roles/{role_id}/profile")
async def role_profile(role_id: str, current=Depends(require_user)):
    _owner_only(current)
    ws = current["workspace_id"]
    role = await db.enterprise_roles.find_one({"id": role_id, "workspace_id": ws}, {"_id": 0})
    if not role:
        raise HTTPException(404, "Role not found")
    profile = await db.enterprise_role_profiles.find_one({"role_id": role_id}, {"_id": 0})
    score = await db.enterprise_knowledge_scores.find_one({"role_id": role_id}, {"_id": 0})
    return {"role": role, "profile": profile, "score": score}


# ── Licenses ─────────────────────────────────────────────────────────────────
class SeatPurchase(BaseModel):
    seats: int = 1


@router.get("/enterprise/licenses")
async def get_licenses(current=Depends(require_user)):
    _owner_only(current)
    await _ensure_seed(current)
    ws = current["workspace_id"]
    lic = await db.enterprise_licenses.find_one({"workspace_id": ws}, {"_id": 0}) or {
        "seats_purchased": 0, "seats_assigned": 0, "price_per_seat": PRICE_PER_SEAT}
    assigned = await db.enterprise_users.count_documents({"workspace_id": ws, "enterprise_license_status": "active"})
    return {**lic, "seats_assigned": assigned,
            "monthly_total": round(assigned * lic.get("price_per_seat", PRICE_PER_SEAT), 2)}


@router.post("/enterprise/licenses/purchase")
async def purchase_seats(payload: SeatPurchase, current=Depends(require_user)):
    _owner_only(current)
    if payload.seats < 1:
        raise HTTPException(400, "seats must be >= 1")
    ws = current["workspace_id"]
    lic = await db.enterprise_licenses.find_one({"workspace_id": ws}, {"_id": 0})
    new_total = (lic.get("seats_purchased", 0) if lic else 0) + payload.seats
    await db.enterprise_licenses.update_one(
        {"workspace_id": ws},
        {"$set": {"workspace_id": ws, "seats_purchased": new_total, "price_per_seat": PRICE_PER_SEAT,
                  "updated_at": now_iso()}, "$setOnInsert": {"id": new_id(), "created_at": now_iso()}},
        upsert=True,
    )
    await _audit(ws, current, "licenses_purchased", "license", ws, {"seats": payload.seats, "total": new_total})
    return {"ok": True, "seats_purchased": new_total}


# ── Audit log ────────────────────────────────────────────────────────────────
@router.get("/enterprise/audit")
async def audit_log(current=Depends(require_user)):
    _owner_only(current)
    rows = await db.enterprise_audit_logs.find(
        {"workspace_id": current["workspace_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"logs": rows}
