"""AI Employee Marketplace — Phase 4.

Creators publish a trained AI employee as a marketplace listing (freezing a
shareable snapshot of its profile, style, permissions and — if opted in —
knowledge). Other workspaces browse and install listings; installing clones the
snapshot into the installer's workspace and records a license. Includes a
creator licensing dashboard and central-learning (knowledge-sharing) controls.

Routes are prefixed /api/ai-builder/marketplace. Specific routes are declared
BEFORE the parameterized /{listing_id} route so they resolve correctly.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import db, new_id, now_iso, require_user

router = APIRouter()

MARKET_CATEGORIES = [
    "Sales", "Customer Support", "Marketing", "Operations", "Finance", "Legal",
    "HR", "Real Estate", "Restaurant", "Healthcare", "Development", "Productivity",
]


def _public(d: dict) -> dict:
    return {k: v for k, v in d.items() if k != "_id"}


async def _build_snapshot(eid: str, share_knowledge: bool) -> dict:
    """Freeze a shareable copy of everything an installer needs."""
    emp = await db.ai_employees.find_one({"id": eid}, {"_id": 0})
    style = await db.ai_employee_style_profiles.find_one(
        {"employee_id": eid, "status": "saved"}, {"_id": 0})
    perm = await db.ai_employee_permissions.find_one({"employee_id": eid}, {"_id": 0})
    tools = await db.ai_employee_tool_access.find({"employee_id": eid}, {"_id": 0}).to_list(100)
    esc = await db.ai_employee_escalation_rules.find({"employee_id": eid}, {"_id": 0}).to_list(100)
    profile_keys = (
        "name", "job_title", "department", "reports_to", "description",
        "responsibilities", "tasks_to_do", "tasks_to_avoid", "success_metrics",
        "tone", "output_style", "industry", "risk_level",
    )
    snap = {
        "profile": {k: emp.get(k) for k in profile_keys},
        "style_profile": (style or {}).get("profile"),
        "permission_level": (perm or {}).get("permission_level", "Answer only"),
        "risk_level": (perm or {}).get("risk_level", "Low"),
        "tools": [{"tool": t["tool"], "requires_approval": t.get("requires_approval", True)} for t in tools],
        "escalation_rules": [{"trigger": r["trigger"], "action": r["action"], "notify_role": r.get("notify_role", "")} for r in esc],
        "share_knowledge": share_knowledge,
    }
    if share_knowledge:
        docs = await db.ai_employee_training_documents.find({"employee_id": eid}, {"_id": 0}).to_list(100)
        exs = await db.ai_employee_examples.find({"employee_id": eid}, {"_id": 0}).to_list(100)
        snap["documents"] = [
            {"title": d["title"], "category": d["category"], "content": d.get("content_preview", "")}
            for d in docs if d.get("content_preview")
        ]
        snap["examples"] = [
            {"title": e["title"], "example_type": e.get("example_type", "General"),
             "is_good": e.get("is_good", True), "content": e.get("content", ""),
             "rationale": e.get("rationale", "")}
            for e in exs
        ]
    return snap


# ── Creator: publish / unpublish ─────────────────────────────────────────
class Publish(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    tagline: Optional[str] = Field(default="", max_length=160)
    description: Optional[str] = Field(default="", max_length=4000)
    category: str = "Productivity"
    price_usd: float = 0.0
    share_knowledge: bool = False


@router.post("/ai-builder/employees/{eid}/marketplace/publish")
async def publish_listing(eid: str, payload: Publish, current=Depends(require_user)):
    emp = await db.ai_employees.find_one(
        {"id": eid, "workspace_id": current["workspace_id"]}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "AI employee not found")
    if payload.category not in MARKET_CATEGORIES:
        raise HTTPException(400, "Invalid category")
    if payload.price_usd < 0 or payload.price_usd > 100000:
        raise HTTPException(400, "Invalid price")

    snapshot = await _build_snapshot(eid, payload.share_knowledge)
    now = now_iso()
    existing = await db.ai_employee_marketplace_listings.find_one({"employee_id": eid}, {"_id": 0})
    base = {
        "employee_id": eid, "workspace_id": current["workspace_id"],
        "creator_user_id": current["id"], "creator_name": current.get("name", "Creator"),
        "title": payload.title.strip(), "tagline": (payload.tagline or "").strip(),
        "description": (payload.description or "").strip(), "category": payload.category,
        "price_usd": round(float(payload.price_usd), 2), "share_knowledge": payload.share_knowledge,
        "snapshot": snapshot, "status": "Published", "updated_at": now,
    }
    if existing:
        await db.ai_employee_marketplace_listings.update_one(
            {"id": existing["id"]}, {"$set": base})
        listing_id = existing["id"]
    else:
        base.update({"id": new_id(), "install_count": 0, "rating": None,
                     "review_count": 0, "created_at": now})
        await db.ai_employee_marketplace_listings.insert_one(base.copy())
        listing_id = base["id"]
    await db.ai_employees.update_one(
        {"id": eid}, {"$set": {"marketplace_status": "Published to Marketplace", "updated_at": now}})
    listing = await db.ai_employee_marketplace_listings.find_one({"id": listing_id}, {"_id": 0})
    return listing


@router.post("/ai-builder/employees/{eid}/marketplace/unpublish")
async def unpublish_listing(eid: str, current=Depends(require_user)):
    emp = await db.ai_employees.find_one(
        {"id": eid, "workspace_id": current["workspace_id"]}, {"_id": 1})
    if not emp:
        raise HTTPException(404, "AI employee not found")
    await db.ai_employee_marketplace_listings.update_one(
        {"employee_id": eid}, {"$set": {"status": "Unpublished", "updated_at": now_iso()}})
    await db.ai_employees.update_one(
        {"id": eid}, {"$set": {"marketplace_status": "Draft", "updated_at": now_iso()}})
    return {"ok": True}


# ── Creator dashboard (SPECIFIC route — before /{listing_id}) ────────────
@router.get("/ai-builder/marketplace/mine")
async def my_listings(current=Depends(require_user)):
    rows = await db.ai_employee_marketplace_listings.find(
        {"creator_user_id": current["id"]}, {"_id": 0, "snapshot": 0}
    ).sort("updated_at", -1).to_list(200)
    total_installs = sum(r.get("install_count", 0) for r in rows)
    total_revenue = 0.0
    for r in rows:
        lic = await db.ai_employee_marketplace_licenses.find(
            {"listing_id": r["id"]}, {"_id": 0, "price_paid": 1}).to_list(10000)
        total_revenue += sum(l.get("price_paid", 0) for l in lic)
    return {
        "listings": rows,
        "summary": {
            "total_listings": len(rows),
            "published": sum(1 for r in rows if r.get("status") == "Published"),
            "total_installs": total_installs,
            "total_revenue_usd": round(total_revenue, 2),
        },
    }


@router.get("/ai-builder/marketplace/installs")
async def my_installs(current=Depends(require_user)):
    rows = await db.ai_employee_marketplace_licenses.find(
        {"installer_workspace_id": current["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return {"installs": rows}


@router.get("/ai-builder/marketplace/categories")
async def market_categories(current=Depends(require_user)):
    return {"categories": MARKET_CATEGORIES}


# ── Browse ───────────────────────────────────────────────────────────────
@router.get("/ai-builder/marketplace")
async def browse(category: Optional[str] = None, q: Optional[str] = None,
                 current=Depends(require_user)):
    query: dict = {"status": "Published"}
    if category and category != "All":
        query["category"] = category
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"tagline": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    rows = await db.ai_employee_marketplace_listings.find(
        query, {"_id": 0, "snapshot": 0}
    ).sort("install_count", -1).to_list(200)
    installed_ids = set()
    async for lic in db.ai_employee_marketplace_licenses.find(
            {"installer_workspace_id": current["workspace_id"]}, {"_id": 0, "listing_id": 1}):
        installed_ids.add(lic["listing_id"])
    for r in rows:
        r["installed"] = r["id"] in installed_ids
        r["is_mine"] = r.get("creator_user_id") == current["id"]
    return {"listings": rows}


@router.get("/ai-builder/marketplace/{listing_id}")
async def listing_detail(listing_id: str, current=Depends(require_user)):
    lst = await db.ai_employee_marketplace_listings.find_one({"id": listing_id}, {"_id": 0})
    if not lst or lst.get("status") != "Published":
        raise HTTPException(404, "Listing not found")
    snap = lst.get("snapshot", {})
    # Public preview of the snapshot — never leak raw private knowledge counts unless shared.
    lst["preview"] = {
        "job_title": snap.get("profile", {}).get("job_title"),
        "department": snap.get("profile", {}).get("department"),
        "responsibilities": snap.get("profile", {}).get("responsibilities", []),
        "tone": snap.get("profile", {}).get("tone"),
        "permission_level": snap.get("permission_level"),
        "tools": [t["tool"] for t in snap.get("tools", [])],
        "escalation_count": len(snap.get("escalation_rules", [])),
        "has_style_profile": bool(snap.get("style_profile")),
        "shares_knowledge": bool(snap.get("share_knowledge")),
        "document_count": len(snap.get("documents", [])) if snap.get("share_knowledge") else 0,
        "example_count": len(snap.get("examples", [])) if snap.get("share_knowledge") else 0,
    }
    lst["installed"] = bool(await db.ai_employee_marketplace_licenses.find_one(
        {"listing_id": listing_id, "installer_workspace_id": current["workspace_id"]}, {"_id": 1}))
    lst["is_mine"] = lst.get("creator_user_id") == current["id"]
    lst.pop("snapshot", None)
    return lst


# ── Install ────────────────────────────────────────────────────────────────
@router.post("/ai-builder/marketplace/{listing_id}/install")
async def install_listing(listing_id: str, current=Depends(require_user)):
    lst = await db.ai_employee_marketplace_listings.find_one({"id": listing_id}, {"_id": 0})
    if not lst or lst.get("status") != "Published":
        raise HTTPException(404, "Listing not found")
    ws = current["workspace_id"]
    if await db.ai_employee_marketplace_licenses.find_one(
            {"listing_id": listing_id, "installer_workspace_id": ws}, {"_id": 1}):
        raise HTTPException(400, "Already installed in this workspace")

    snap = lst.get("snapshot", {})
    prof = snap.get("profile", {})
    now = now_iso()
    new_eid = new_id()
    emp = {
        "id": new_eid, "workspace_id": ws, "creator_user_id": current["id"],
        "name": prof.get("name") or lst["title"], "job_title": prof.get("job_title", ""),
        "department": prof.get("department", ""), "reports_to": prof.get("reports_to", ""),
        "description": prof.get("description", ""),
        "responsibilities": list(prof.get("responsibilities") or []),
        "tasks_to_do": list(prof.get("tasks_to_do") or []),
        "tasks_to_avoid": list(prof.get("tasks_to_avoid") or []),
        "success_metrics": list(prof.get("success_metrics") or []),
        "tone": prof.get("tone", "Professional"), "output_style": prof.get("output_style", "Concise"),
        "industry": prof.get("industry", "General"), "risk_level": prof.get("risk_level", "Low"),
        "status": "Draft", "template_id": None, "training_completeness_score": 0,
        "permissions_risk_level": snap.get("risk_level", "Low"),
        "marketplace_status": "Installed", "installed_from_listing_id": listing_id,
        "created_at": now, "updated_at": now,
    }
    await db.ai_employees.insert_one(emp.copy())

    # Clone style / permissions / tools / escalation.
    if snap.get("style_profile"):
        await db.ai_employee_style_profiles.insert_one({
            "id": new_id(), "employee_id": new_eid, "workspace_id": ws,
            "status": "saved", "profile": snap["style_profile"],
            "created_at": now, "updated_at": now})
    await db.ai_employee_permissions.insert_one({
        "id": new_id(), "employee_id": new_eid, "workspace_id": ws,
        "permission_level": snap.get("permission_level", "Answer only"),
        "risk_level": snap.get("risk_level", "Low"), "notes": "", "created_at": now, "updated_at": now})
    for t in snap.get("tools", []):
        await db.ai_employee_tool_access.insert_one({
            "id": new_id(), "employee_id": new_eid, "workspace_id": ws,
            "tool": t["tool"], "requires_approval": t.get("requires_approval", True),
            "enabled": True, "created_at": now})
    for r in snap.get("escalation_rules", []):
        await db.ai_employee_escalation_rules.insert_one({
            "id": new_id(), "employee_id": new_eid, "workspace_id": ws,
            "trigger": r["trigger"], "action": r["action"],
            "notify_role": r.get("notify_role", ""), "created_at": now})
    if snap.get("share_knowledge"):
        for d in snap.get("documents", []):
            await db.ai_employee_training_documents.insert_one({
                "id": new_id(), "employee_id": new_eid, "workspace_id": ws,
                "title": d["title"], "category": d["category"],
                "content_preview": d.get("content", "")[:2000], "file_id": None, "filename": None,
                "status": "Indexed", "excluded_from_central_learning": True, "created_at": now})
        for e in snap.get("examples", []):
            await db.ai_employee_examples.insert_one({
                "id": new_id(), "employee_id": new_eid, "workspace_id": ws,
                "title": e["title"], "example_type": e.get("example_type", "General"),
                "is_good": e.get("is_good", True), "content": e.get("content", ""),
                "rationale": e.get("rationale", ""), "apply_as_rule": False,
                "private_only": True, "created_at": now})

    price = float(lst.get("price_usd", 0) or 0)
    await db.ai_employee_marketplace_licenses.insert_one({
        "id": new_id(), "listing_id": listing_id, "listing_title": lst["title"],
        "creator_user_id": lst.get("creator_user_id"),
        "installer_workspace_id": ws, "installer_user_id": current["id"],
        "installed_employee_id": new_eid, "price_paid": price, "created_at": now})
    await db.ai_employee_marketplace_listings.update_one(
        {"id": listing_id}, {"$inc": {"install_count": 1}})
    return {"ok": True, "employee_id": new_eid, "employee": _public(emp)}
