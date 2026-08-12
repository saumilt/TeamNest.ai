"""TeamNest Role Intelligence — Enterprise module (Phase A).

Enterprise People, Roles, Role Intelligence profiles, licenses and continuity
scores. Auto-seeds the 'Perfect Restaurant Group' sample on first load so the
workspace has realistic data to explore. Audit events are recorded for key
actions. Specific routes are declared before parameterized ones.
"""
from typing import List, Optional

import json

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


async def _freshness_map(ws: str) -> dict:
    """Per-role knowledge freshness: newest captured item + newest approved item
    + count of approved memories. Powers the 'Knowledge freshness' indicator."""
    pipeline = [
        {"$match": {"workspace_id": ws}},
        {"$group": {
            "_id": "$role_id",
            "last_captured_at": {"$max": "$created_at"},
            "last_approved_at": {"$max": {"$cond": [
                {"$eq": ["$approval_status", "approved"]}, "$created_at", None]}},
            "approved_count": {"$sum": {"$cond": [
                {"$eq": ["$approval_status", "approved"]}, 1, 0]}},
        }},
    ]
    out = {}
    async for r in db.enterprise_role_memories.aggregate(pipeline):
        out[r["_id"]] = {
            "last_captured_at": r.get("last_captured_at"),
            "last_approved_at": r.get("last_approved_at"),
            "approved_count": r.get("approved_count", 0),
        }
    return out


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
    fresh = await _freshness_map(ws)
    return {"roles": [{**r, "continuity_score": scores.get(r["id"], {}).get("overall_score", 0),
                       "risk_level": scores.get(r["id"], {}).get("risk_level", "Unknown"),
                       "freshness": fresh.get(r["id"], {})} for r in roles]}


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


# ── Successor assignment + knowledge transfer ────────────────────────────────
async def _role_bundle(role_id: str):
    """Return (role, profile, approved_memories) for a role."""
    role = await db.enterprise_roles.find_one({"id": role_id}, {"_id": 0})
    profile = await db.enterprise_role_profiles.find_one({"role_id": role_id}, {"_id": 0})
    memories = await db.enterprise_role_memories.find(
        {"role_id": role_id, "approval_status": "approved"}, {"_id": 0}).to_list(50)
    return role, profile, memories


@router.get("/enterprise/people/{eid}/candidates")
async def successor_candidates(eid: str, current=Depends(require_user)):
    """Other enterprise employees who could be the successor/backup."""
    _owner_only(current)
    ws = current["workspace_id"]
    emp = await db.enterprise_users.find_one({"id": eid, "workspace_id": ws}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    roles = await _role_map(ws)
    others = await db.enterprise_users.find(
        {"workspace_id": ws, "id": {"$ne": eid}}, {"_id": 0}).to_list(1000)
    return {"candidates": [
        {"id": o["id"], "employee_name": o["employee_name"], "employee_email": o["employee_email"],
         "role_name": roles.get(o.get("role_id"), {}).get("role_name"), "department": o.get("department")}
        for o in others
    ]}


class SuccessorIn(BaseModel):
    successor_user_id: str


@router.post("/enterprise/people/{eid}/successor")
async def assign_successor(eid: str, payload: SuccessorIn, current=Depends(require_user)):
    """Assign a successor and generate a fresh handoff package (checklist + brief)."""
    _owner_only(current)
    ws = current["workspace_id"]
    emp = await db.enterprise_users.find_one({"id": eid, "workspace_id": ws}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    succ = await db.enterprise_users.find_one({"id": payload.successor_user_id, "workspace_id": ws}, {"_id": 0})
    if not succ:
        raise HTTPException(404, "Successor not found")

    await db.enterprise_users.update_one(
        {"id": eid, "workspace_id": ws},
        {"$set": {"successor_user_id": payload.successor_user_id,
                  "knowledge_transfer_status": "in_progress", "updated_at": now_iso()}},
    )

    from services.enterprise_intelligence import build_checklist, generate_handoff_brief
    role, profile, memories = await _role_bundle(emp.get("role_id"))
    checklist = build_checklist(role or {}, profile)
    brief = await generate_handoff_brief(role or {}, profile, memories)

    doc = {
        "workspace_id": ws, "employee_id": eid, "role_id": emp.get("role_id"),
        "successor_user_id": payload.successor_user_id, "successor_name": succ["employee_name"],
        "brief": brief, "checklist": checklist, "updated_at": now_iso(),
    }
    await db.enterprise_handoffs.update_one(
        {"employee_id": eid, "workspace_id": ws},
        {"$set": doc, "$setOnInsert": {"id": new_id(), "created_at": now_iso()}}, upsert=True,
    )
    await _audit(ws, current, "successor_assigned", "employee", eid,
                 {"successor": succ["employee_name"]})
    return {"ok": True, "handoff": {**doc, "successor_name": succ["employee_name"]}}


@router.get("/enterprise/people/{eid}/handoff")
async def get_handoff(eid: str, current=Depends(require_user)):
    _owner_only(current)
    ws = current["workspace_id"]
    emp = await db.enterprise_users.find_one({"id": eid, "workspace_id": ws}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    handoff = await db.enterprise_handoffs.find_one({"employee_id": eid, "workspace_id": ws}, {"_id": 0})
    total = len(handoff["checklist"]) if handoff else 0
    done = sum(1 for c in handoff["checklist"] if c["done"]) if handoff else 0
    return {"handoff": handoff, "progress": {"done": done, "total": total,
            "pct": round(done / total * 100) if total else 0},
            "transfer_status": emp.get("knowledge_transfer_status", "not_started")}


class ChecklistToggle(BaseModel):
    item_id: str
    done: bool


@router.post("/enterprise/people/{eid}/handoff/checklist")
async def toggle_checklist(eid: str, payload: ChecklistToggle, current=Depends(require_user)):
    _owner_only(current)
    ws = current["workspace_id"]
    handoff = await db.enterprise_handoffs.find_one({"employee_id": eid, "workspace_id": ws}, {"_id": 0})
    if not handoff:
        raise HTTPException(404, "No handoff package — assign a successor first")
    found = False
    for c in handoff["checklist"]:
        if c["id"] == payload.item_id:
            c["done"] = payload.done
            c["done_at"] = now_iso() if payload.done else None
            found = True
            break
    if not found:
        raise HTTPException(404, "Checklist item not found")
    await db.enterprise_handoffs.update_one(
        {"employee_id": eid, "workspace_id": ws},
        {"$set": {"checklist": handoff["checklist"], "updated_at": now_iso()}})
    total = len(handoff["checklist"])
    done = sum(1 for c in handoff["checklist"] if c["done"])
    # Auto-complete transfer when every item is checked.
    new_status = "complete" if done == total and total else "in_progress"
    await db.enterprise_users.update_one(
        {"id": eid, "workspace_id": ws},
        {"$set": {"knowledge_transfer_status": new_status, "updated_at": now_iso()}})
    return {"ok": True, "progress": {"done": done, "total": total,
            "pct": round(done / total * 100) if total else 0}, "transfer_status": new_status}


# ── Ask Previous Role (grounded, anonymized chat) ────────────────────────────
class AskIn(BaseModel):
    question: str
    session_id: Optional[str] = None


@router.get("/enterprise/roles/{role_id}/ask/history")
async def ask_history(role_id: str, session_id: str, current=Depends(require_user)):
    _owner_only(current)
    ws = current["workspace_id"]
    rows = await db.enterprise_role_qa.find(
        {"workspace_id": ws, "role_id": role_id, "session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    return {"turns": rows}


@router.post("/enterprise/roles/{role_id}/ask")
async def ask_role(role_id: str, payload: AskIn, current=Depends(require_user)):
    """Answer a successor's question grounded ONLY in the role's approved knowledge."""
    _owner_only(current)
    ws = current["workspace_id"]
    role = await db.enterprise_roles.find_one({"id": role_id, "workspace_id": ws}, {"_id": 0})
    if not role:
        raise HTTPException(404, "Role not found")
    if not payload.question.strip():
        raise HTTPException(400, "Question is required")

    session_id = payload.session_id or new_id()
    _, profile, memories = await _role_bundle(role_id)
    history = await db.enterprise_role_qa.find(
        {"workspace_id": ws, "role_id": role_id, "session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(20)

    from services.enterprise_intelligence import ask_previous_role
    result = await ask_previous_role(role, profile, memories, payload.question, history)

    turn = {"id": new_id(), "workspace_id": ws, "role_id": role_id, "session_id": session_id,
            "question": payload.question, "answer": result["answer"],
            "citations": result["citations"], "created_at": now_iso()}
    await db.enterprise_role_qa.insert_one(turn.copy())
    return {"session_id": session_id, "answer": result["answer"],
            "citations": result["citations"], "grounded": result["grounded"], "model": result["model"]}


# ── Phase C: Expertise Map + Knowledge Risk dashboard ────────────────────────
_BREAKDOWN_KEYS = [
    "role_description_score", "sop_score", "workflow_score", "recurring_task_score",
    "relationship_score", "decision_score", "communication_score", "expertise_score",
    "successor_score", "review_score",
]


@router.get("/enterprise/risk-dashboard")
async def risk_dashboard(current=Depends(require_user)):
    _owner_only(current)
    await _ensure_seed(current)
    ws = current["workspace_id"]
    roles = await db.enterprise_roles.find({"workspace_id": ws}, {"_id": 0}).to_list(500)
    people = await db.enterprise_users.find({"workspace_id": ws}, {"_id": 0}).to_list(1000)
    scores = await _score_map(ws)

    by_role: dict = {}
    for p in people:
        by_role.setdefault(p.get("role_id"), []).append(p)
    fresh = await _freshness_map(ws)

    items = []
    for r in roles:
        sc = scores.get(r["id"], {})
        rp = by_role.get(r["id"], [])
        departing = any(p["employment_status"] == "Departing" for p in rp)
        no_backup = not r.get("backup_employee_user_id")
        no_successor = not any(p.get("successor_user_id") for p in rp)
        high_unique = any(p.get("unique_knowledge_level") in ("High", "Critical") for p in rp)
        single_person = len(rp) <= 1 and no_backup and no_successor
        flags = []
        if departing:
            flags.append("Departing")
        if single_person:
            flags.append("Single-person dependency")
        if no_successor:
            flags.append("No successor")
        if no_backup:
            flags.append("No backup")
        if high_unique:
            flags.append("High unique knowledge")
        items.append({
            "role_id": r["id"], "role_name": r["role_name"], "department": r["department"],
            "continuity_score": sc.get("overall_score", 0), "risk_level": sc.get("risk_level", "Unknown"),
            "flags": flags, "headcount": len(rp),
            "person_id": rp[0]["id"] if rp else None,
            "person_name": rp[0]["employee_name"] if rp else None,
            "freshness": fresh.get(r["id"], {}),
            "breakdown": {k: sc.get(k, 0) for k in _BREAKDOWN_KEYS},
        })
    items.sort(key=lambda x: x["continuity_score"])

    dist = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    for it in items:
        dist[it["risk_level"]] = dist.get(it["risk_level"], 0) + 1
    avg = round(sum(i["continuity_score"] for i in items) / len(items)) if items else 0
    return {
        "summary": {
            "roles": len(items),
            "at_risk": sum(1 for i in items if i["risk_level"] in ("High", "Critical")),
            "critical": dist["Critical"],
            "single_person_deps": sum(1 for i in items if "Single-person dependency" in i["flags"]),
            "avg_continuity": avg,
        },
        "distribution": dist,
        "roles": items,
    }


# ── Phase D: Storage metering + packs + billing ──────────────────────────────
R2_BASE_RATE_PER_GB = 0.015          # Cloudflare R2 base ($/GB-month)
STORAGE_MARKUP_PCT = 40              # TeamNest markup
INCLUDED_GB_BASE = 5.0              # free allowance included with the enterprise plan
_STORAGE_SOURCES = [
    ("Approved knowledge", "enterprise_role_memories"),
    ("Role profiles", "enterprise_role_profiles"),
    ("Handoff packages", "enterprise_handoffs"),
    ("Ask Role history", "enterprise_role_qa"),
    ("People records", "enterprise_users"),
    ("Role definitions", "enterprise_roles"),
    ("Audit logs", "enterprise_audit_logs"),
]
STORAGE_PACKS = [
    {"id": "pack-10", "name": "10 GB pack", "gb": 10, "price_usd": 2.99},
    {"id": "pack-50", "name": "50 GB pack", "gb": 50, "price_usd": 12.99},
    {"id": "pack-100", "name": "100 GB pack", "gb": 100, "price_usd": 19.99},
]


async def _measure_bytes(ws: str, collection: str) -> int:
    total = 0
    async for doc in db[collection].find({"workspace_id": ws}, {"_id": 0}):
        total += len(json.dumps(doc, default=str).encode("utf-8"))
    return total


async def _compute_storage(ws: str) -> dict:
    """Shared storage-meter computation (used by /storage and /billing)."""
    breakdown = []
    total_bytes = 0
    for label, coll in _STORAGE_SOURCES:
        b = await _measure_bytes(ws, coll)
        cnt = await db[coll].count_documents({"workspace_id": ws})
        breakdown.append({"label": label, "bytes": b, "count": cnt})
        total_bytes += b

    total_gb = total_bytes / (1024 ** 3)
    effective_rate = round(R2_BASE_RATE_PER_GB * (1 + STORAGE_MARKUP_PCT / 100), 5)

    packs = await db.enterprise_storage_packs.find({"workspace_id": ws}, {"_id": 0}).to_list(100)
    included_gb = INCLUDED_GB_BASE + sum(p.get("gb", 0) for p in packs)
    billable_gb = max(0.0, total_gb - included_gb)
    monthly_cost = round(billable_gb * effective_rate, 2)

    return {
        "usage": {
            "total_bytes": total_bytes,
            "total_mb": round(total_bytes / (1024 ** 2), 3),
            "total_gb": round(total_gb, 6),
            "breakdown": breakdown,
        },
        "pricing": {
            "base_rate_per_gb": R2_BASE_RATE_PER_GB,
            "markup_pct": STORAGE_MARKUP_PCT,
            "effective_rate_per_gb": effective_rate,
            "included_gb": round(included_gb, 2),
            "billable_gb": round(billable_gb, 6),
            "monthly_storage_cost": monthly_cost,
        },
        "packs_available": STORAGE_PACKS,
        "packs_purchased": packs,
        "note": "Displayed for transparency — not charged. Base Cloudflare R2 rate + 40% platform markup.",
    }


@router.get("/enterprise/storage")
async def storage_meter(current=Depends(require_user)):
    _owner_only(current)
    await _ensure_seed(current)
    return await _compute_storage(current["workspace_id"])


class StoragePackIn(BaseModel):
    pack_id: str


async def grant_storage_pack_to_workspace(ws: str, pack_id: str, actor: dict, via: str = "web") -> dict:
    """Add a storage pack to a workspace (shared by the web purchase route and
    the mobile IAP webhook fulfillment). Returns the created pack doc."""
    pack = next((p for p in STORAGE_PACKS if p["id"] == pack_id), None)
    if not pack:
        raise HTTPException(404, "Unknown storage pack")
    doc = {"id": new_id(), "workspace_id": ws, "pack_id": pack["id"], "name": pack["name"],
           "gb": pack["gb"], "price_usd": pack["price_usd"], "source": via, "purchased_at": now_iso()}
    await db.enterprise_storage_packs.insert_one(doc.copy())
    await _audit(ws, actor, "storage_pack_purchased", "storage", pack["id"],
                 {"gb": pack["gb"], "price_usd": pack["price_usd"], "via": via})
    return doc


@router.post("/enterprise/storage/packs/purchase")
async def purchase_storage_pack(payload: StoragePackIn, current=Depends(require_user)):
    _owner_only(current)
    doc = await grant_storage_pack_to_workspace(current["workspace_id"], payload.pack_id, current, via="web")
    return {"ok": True, "pack": doc}


@router.get("/enterprise/billing")
async def billing_summary(current=Depends(require_user)):
    """Combined enterprise billing: seat licenses + storage (displayed, not charged)."""
    _owner_only(current)
    await _ensure_seed(current)
    ws = current["workspace_id"]
    lic = await db.enterprise_licenses.find_one({"workspace_id": ws}, {"_id": 0}) or {}
    assigned = await db.enterprise_users.count_documents({"workspace_id": ws, "enterprise_license_status": "active"})
    seat_price = lic.get("price_per_seat", PRICE_PER_SEAT)
    seat_cost = round(assigned * seat_price, 2)

    storage = await _compute_storage(ws)
    storage_cost = storage["pricing"]["monthly_storage_cost"]
    return {
        "seats": {
            "seats_purchased": lic.get("seats_purchased", 0),
            "seats_assigned": assigned,
            "price_per_seat": seat_price,
            "monthly_seat_cost": seat_cost,
        },
        "storage": storage,
        "total_monthly_estimate": round(seat_cost + storage_cost, 2),
    }


# ── Knowledge capture → Proposed Memory Review (P2) ──────────────────────────
class CaptureIn(BaseModel):
    text: Optional[str] = None
    chat_id: Optional[str] = None
    source_type: str = "Manual"
    source_id: Optional[str] = None


@router.post("/enterprise/roles/{role_id}/capture")
async def capture_knowledge(role_id: str, payload: CaptureIn, current=Depends(require_user)):
    """Capture knowledge for a role from pasted text or a workspace chat, then
    stage it as PROPOSED memories for admin review (grounded, anonymized by the
    extractor). Approved items feed Ask Role + handoff packages."""
    _owner_only(current)
    ws = current["workspace_id"]
    role = await db.enterprise_roles.find_one({"id": role_id, "workspace_id": ws}, {"_id": 0})
    if not role:
        raise HTTPException(404, "Role not found")

    text = (payload.text or "").strip()
    source_type = payload.source_type
    source_id = payload.source_id
    if payload.chat_id:
        chat = await db.chats.find_one({"id": payload.chat_id, "member_ids": current["id"]}, {"_id": 0, "id": 1})
        if not chat:
            raise HTTPException(404, "Chat not found or not accessible")
        from services.ai_runtime import build_chat_context
        text = await build_chat_context(payload.chat_id, limit=30)
        source_type = "TeamNest chat"
        source_id = payload.chat_id
    if not text:
        raise HTTPException(400, "Provide text or a chat_id with messages to capture from")

    from services.enterprise_intelligence import propose_memories_from_text
    proposed = await propose_memories_from_text(role, text)
    if not proposed:
        return {"proposed": 0, "memories": [], "note": "Nothing worth preserving was found in that source."}

    now = now_iso()
    docs = []
    for p in proposed:
        docs.append({
            "id": new_id(), "workspace_id": ws, "role_id": role_id,
            "source_user_id": current["id"], "source_type": source_type, "source_id": source_id,
            "memory_type": p["memory_type"], "title": p["title"], "content": p["content"],
            "sensitivity_level": p["sensitivity_level"], "visibility": "role",
            "transferable": p["transferable"], "approved_by_user_id": None,
            "approval_status": "proposed", "retention_policy": "keep_indefinitely",
            "confidence": p["confidence"], "source_date": now[:10],
            "last_reviewed_at": None, "created_at": now, "updated_at": now,
        })
    await db.enterprise_role_memories.insert_many([d.copy() for d in docs])
    await _audit(ws, current, "knowledge_captured", "role", role_id,
                 {"count": len(docs), "source_type": source_type})
    return {"proposed": len(docs), "memories": docs}


@router.get("/enterprise/memories/review")
async def review_queue(status: str = "proposed", current=Depends(require_user)):
    _owner_only(current)
    ws = current["workspace_id"]
    roles = await _role_map(ws)
    rows = await db.enterprise_role_memories.find(
        {"workspace_id": ws, "approval_status": status}, {"_id": 0}
    ).sort("created_at", -1).to_list(300)
    pending = await db.enterprise_role_memories.count_documents(
        {"workspace_id": ws, "approval_status": "proposed"})
    return {"memories": [{**m, "role_name": roles.get(m["role_id"], {}).get("role_name")} for m in rows],
            "pending_count": pending}


class MemoryDecision(BaseModel):
    decision: str  # approve | reject
    title: Optional[str] = None
    content: Optional[str] = None
    transferable: Optional[bool] = None
    sensitivity_level: Optional[str] = None


@router.post("/enterprise/memories/{mid}/decide")
async def decide_memory(mid: str, payload: MemoryDecision, current=Depends(require_user)):
    _owner_only(current)
    ws = current["workspace_id"]
    mem = await db.enterprise_role_memories.find_one({"id": mid, "workspace_id": ws}, {"_id": 0, "id": 1})
    if not mem:
        raise HTTPException(404, "Memory not found")
    if payload.decision not in ("approve", "reject"):
        raise HTTPException(400, "decision must be 'approve' or 'reject'")

    update = {"last_reviewed_at": now_iso(), "updated_at": now_iso()}
    for k in ("title", "content", "transferable", "sensitivity_level"):
        v = getattr(payload, k)
        if v is not None:
            update[k] = v
    if payload.decision == "approve":
        update["approval_status"] = "approved"
        update["approved_by_user_id"] = current["id"]
    else:
        update["approval_status"] = "rejected"
    await db.enterprise_role_memories.update_one({"id": mid, "workspace_id": ws}, {"$set": update})
    await _audit(ws, current, f"memory_{payload.decision}d", "memory", mid, {})
    return {"ok": True, "approval_status": update["approval_status"]}


@router.get("/enterprise/roles/{role_id}/memories")
async def role_memories(role_id: str, current=Depends(require_user)):
    _owner_only(current)
    ws = current["workspace_id"]
    rows = await db.enterprise_role_memories.find(
        {"workspace_id": ws, "role_id": role_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(300)
    return {"memories": rows}


# ── Audit log ────────────────────────────────────────────────────────────────
@router.get("/enterprise/audit")
async def audit_log(current=Depends(require_user)):
    _owner_only(current)
    rows = await db.enterprise_audit_logs.find(
        {"workspace_id": current["workspace_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"logs": rows}
