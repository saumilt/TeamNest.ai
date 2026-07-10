"""AI Employee Builder — Phase 1.

Create/train/manage custom AI employees. Endpoints are workspace-scoped and
prefixed with /api/ai-builder. Documents/examples reference the shared upload
store (db.files). Training completeness is computed across all builder phases
so the score grows as more phases are configured.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import db, new_id, now_iso, require_user
from services.ai_employee_style import (
    connector_samples, generate_style_profile, list_connectors,
)
from services.ai_employee_templates import get_template, list_templates

router = APIRouter()

VALID_STATUSES = {
    "Draft", "Training", "Testing", "Ready", "Deployed", "Paused",
    "Needs Review", "Marketplace Pending Review", "Published to Marketplace", "Archived",
}
DOC_CATEGORIES = [
    "Knowledge", "Policy", "Template", "Example", "FAQ", "Do-not-do rule",
    "Escalation rule", "Compliance rule", "Style example", "Workflow example",
]


# ── Completeness scoring ────────────────────────────────────────────────
async def _completeness(emp: dict) -> dict:
    eid = emp["id"]
    docs = await db.ai_employee_training_documents.count_documents({"employee_id": eid})
    examples = await db.ai_employee_examples.count_documents({"employee_id": eid})
    style = await db.ai_employee_style_profiles.count_documents({"employee_id": eid, "status": "saved"})
    perms = await db.ai_employee_permissions.count_documents({"employee_id": eid})
    tools = await db.ai_employee_tool_access.count_documents({"employee_id": eid})
    esc = await db.ai_employee_escalation_rules.count_documents({"employee_id": eid})
    tests = await db.ai_employee_test_runs.count_documents({"employee_id": eid})
    deployed = await db.ai_employee_deployments.count_documents({"employee_id": eid})

    checks = [
        ("Job description complete", bool(emp.get("description"))),
        ("Responsibilities added", len(emp.get("responsibilities") or []) > 0),
        ("Training docs uploaded", docs > 0),
        ("Examples added", examples >= 1),
        ("Style profile added", style > 0),
        ("Permissions configured", perms > 0),
        ("Tools configured", tools > 0),
        ("Escalation rules configured", esc > 0),
        ("Test cases run", tests >= 1),
        ("Deployment configured", deployed > 0),
    ]
    done = sum(1 for _, ok in checks if ok)
    score = round(done / len(checks) * 100)
    recs = []
    if docs == 0:
        recs.append("Upload at least one SOP or document")
    if examples < 3:
        recs.append("Add three example outputs")
    if esc == 0:
        recs.append("Define escalation rules")
    if tests < 5:
        recs.append("Run five sandbox tests")
    if style == 0:
        recs.append("Add a style profile")
    return {
        "score": score,
        "checks": [{"label": lbl, "done": ok} for lbl, ok in checks],
        "recommendations": recs[:5],
    }


def _public_emp(emp: dict) -> dict:
    return {k: v for k, v in emp.items() if k != "_id"}


# ── Templates ───────────────────────────────────────────────────────────
@router.get("/ai-builder/templates")
async def get_templates(current=Depends(require_user)):
    return {"templates": [
        {"id": t["id"], "name": t["name"], "job_title": t.get("job_title"),
         "department": t.get("department"), "category": t.get("category"),
         "industry": t.get("industry", "General"), "risk_level": t.get("risk_level"),
         "tone": t.get("tone"), "description": t.get("description")}
        for t in list_templates()
    ]}


@router.get("/ai-builder/templates/{template_id}")
async def template_detail(template_id: str, current=Depends(require_user)):
    t = get_template(template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    return t


# ── Employees ───────────────────────────────────────────────────────────
class CreateEmployee(BaseModel):
    source: str = "blank"            # blank | template | job_description
    template_id: Optional[str] = None
    name: Optional[str] = None
    job_title: Optional[str] = None
    job_description: Optional[str] = None  # free text for source=job_description


@router.post("/ai-builder/employees")
async def create_employee(payload: CreateEmployee, current=Depends(require_user)):
    ws = current["workspace_id"]
    now = now_iso()
    emp = {
        "id": new_id(), "workspace_id": ws, "creator_user_id": current["id"],
        "name": (payload.name or "New AI Employee").strip(),
        "job_title": (payload.job_title or "").strip(), "department": "",
        "reports_to": "", "description": "", "responsibilities": [],
        "tasks_to_do": [], "tasks_to_avoid": [], "success_metrics": [],
        "tone": "Professional", "output_style": "Concise", "industry": "General",
        "risk_level": "Low", "status": "Draft", "template_id": None,
        "training_completeness_score": 0, "permissions_risk_level": "Low",
        "marketplace_status": "Draft", "created_at": now, "updated_at": now,
    }

    if payload.source == "template" and payload.template_id:
        t = get_template(payload.template_id)
        if not t:
            raise HTTPException(404, "Template not found")
        emp.update({
            "name": payload.name or t["name"], "job_title": t.get("job_title", ""),
            "department": t.get("department", ""), "description": t.get("description", ""),
            "responsibilities": list(t.get("responsibilities", [])),
            "tasks_to_do": list(t.get("tasks_to_do", [])),
            "tasks_to_avoid": list(t.get("tasks_to_avoid", [])),
            "success_metrics": list(t.get("success_metrics", [])),
            "tone": t.get("tone", "Professional"), "output_style": t.get("output_style", "Concise"),
            "industry": t.get("industry", "General"), "risk_level": t.get("risk_level", "Low"),
            "template_id": t["id"],
        })
    elif payload.source == "job_description" and payload.job_description:
        jd = payload.job_description.strip()
        emp["description"] = jd
        # Cheap heuristic: treat sentence/bullet lines as responsibilities.
        lines = [ln.strip("-• \t") for ln in jd.splitlines() if ln.strip()]
        emp["responsibilities"] = [ln for ln in lines[1:8] if len(ln) > 3]
        emp["status"] = "Draft"

    await db.ai_employees.insert_one(emp.copy())
    return _public_emp(emp)


@router.get("/ai-builder/employees")
async def list_employees(current=Depends(require_user)):
    rows = await db.ai_employees.find(
        {"workspace_id": current["workspace_id"], "status": {"$ne": "Archived"}},
        {"_id": 0},
    ).sort("updated_at", -1).to_list(200)
    for r in rows:
        c = await _completeness(r)
        r["training_completeness_score"] = c["score"]
    return {"employees": rows}


@router.get("/ai-builder/employees/{eid}")
async def employee_detail(eid: str, current=Depends(require_user)):
    emp = await db.ai_employees.find_one(
        {"id": eid, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not emp:
        raise HTTPException(404, "AI employee not found")
    docs = await db.ai_employee_training_documents.find({"employee_id": eid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    examples = await db.ai_employee_examples.find({"employee_id": eid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    completeness = await _completeness(emp)
    emp["training_completeness_score"] = completeness["score"]
    return {"employee": emp, "documents": docs, "examples": examples, "completeness": completeness}


class UpdateEmployee(BaseModel):
    name: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    reports_to: Optional[str] = None
    description: Optional[str] = None
    responsibilities: Optional[List[str]] = None
    tasks_to_do: Optional[List[str]] = None
    tasks_to_avoid: Optional[List[str]] = None
    success_metrics: Optional[List[str]] = None
    tone: Optional[str] = None
    output_style: Optional[str] = None
    industry: Optional[str] = None
    risk_level: Optional[str] = None
    status: Optional[str] = None
    marketplace_status: Optional[str] = None


@router.patch("/ai-builder/employees/{eid}")
async def update_employee(eid: str, payload: UpdateEmployee, current=Depends(require_user)):
    emp = await db.ai_employees.find_one({"id": eid, "workspace_id": current["workspace_id"]}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "AI employee not found")
    patch = {k: v for k, v in payload.dict().items() if v is not None}
    if "status" in patch and patch["status"] not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status: {patch['status']}")
    if patch:
        patch["updated_at"] = now_iso()
        await db.ai_employees.update_one({"id": eid}, {"$set": patch})
    emp = await db.ai_employees.find_one({"id": eid}, {"_id": 0})
    return _public_emp(emp)


@router.delete("/ai-builder/employees/{eid}")
async def delete_employee(eid: str, current=Depends(require_user)):
    r = await db.ai_employees.delete_one({"id": eid, "workspace_id": current["workspace_id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "AI employee not found")
    for coll in ("ai_employee_training_documents", "ai_employee_examples",
                 "ai_employee_style_sources", "ai_employee_style_profiles"):
        await db[coll].delete_many({"employee_id": eid})
    return {"ok": True}


# ── Training documents ──────────────────────────────────────────────────
class AddDocument(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: str = "Knowledge"
    content: Optional[str] = None       # pasted text
    file_id: Optional[str] = None       # reference to db.files upload
    filename: Optional[str] = None


@router.post("/ai-builder/employees/{eid}/documents")
async def add_document(eid: str, payload: AddDocument, current=Depends(require_user)):
    if not await db.ai_employees.find_one({"id": eid, "workspace_id": current["workspace_id"]}, {"_id": 1}):
        raise HTTPException(404, "AI employee not found")
    if payload.category not in DOC_CATEGORIES:
        raise HTTPException(400, "Invalid document category")
    if not payload.content and not payload.file_id:
        raise HTTPException(400, "Provide pasted content or an uploaded file")
    doc = {
        "id": new_id(), "employee_id": eid, "workspace_id": current["workspace_id"],
        "title": payload.title.strip(), "category": payload.category,
        "content_preview": (payload.content or "")[:2000],
        "file_id": payload.file_id, "filename": payload.filename,
        "status": "Indexed", "excluded_from_central_learning": True,
        "created_at": now_iso(),
    }
    await db.ai_employee_training_documents.insert_one(doc.copy())
    return _public_emp(doc)


@router.delete("/ai-builder/employees/{eid}/documents/{doc_id}")
async def delete_document(eid: str, doc_id: str, current=Depends(require_user)):
    r = await db.ai_employee_training_documents.delete_one(
        {"id": doc_id, "employee_id": eid, "workspace_id": current["workspace_id"]}
    )
    if r.deleted_count == 0:
        raise HTTPException(404, "Document not found")
    return {"ok": True}


# ── Examples ────────────────────────────────────────────────────────────
class AddExample(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    example_type: str = "General"
    is_good: bool = True
    content: str = Field(min_length=1)
    rationale: Optional[str] = None      # what makes it good/bad
    apply_as_rule: bool = False


@router.post("/ai-builder/employees/{eid}/examples")
async def add_example(eid: str, payload: AddExample, current=Depends(require_user)):
    if not await db.ai_employees.find_one({"id": eid, "workspace_id": current["workspace_id"]}, {"_id": 1}):
        raise HTTPException(404, "AI employee not found")
    ex = {
        "id": new_id(), "employee_id": eid, "workspace_id": current["workspace_id"],
        "title": payload.title.strip(), "example_type": payload.example_type,
        "is_good": payload.is_good, "content": payload.content,
        "rationale": payload.rationale or "", "apply_as_rule": payload.apply_as_rule,
        "private_only": True, "created_at": now_iso(),
    }
    await db.ai_employee_examples.insert_one(ex.copy())
    return _public_emp(ex)


@router.delete("/ai-builder/employees/{eid}/examples/{ex_id}")
async def delete_example(eid: str, ex_id: str, current=Depends(require_user)):
    r = await db.ai_employee_examples.delete_one(
        {"id": ex_id, "employee_id": eid, "workspace_id": current["workspace_id"]}
    )
    if r.deleted_count == 0:
        raise HTTPException(404, "Example not found")
    return {"ok": True}


# ── Dashboard ───────────────────────────────────────────────────────────
@router.get("/ai-builder/dashboard")
async def dashboard(current=Depends(require_user)):
    ws = current["workspace_id"]
    rows = await db.ai_employees.find({"workspace_id": ws}, {"_id": 0}).to_list(500)

    def count(status):
        return sum(1 for r in rows if r.get("status") == status)

    return {
        "total": len(rows),
        "draft": count("Draft"),
        "training": count("Training"),
        "deployed": count("Deployed"),
        "needs_review": count("Needs Review"),
        "marketplace": sum(1 for r in rows if r.get("marketplace_status") in ("Published", "Published to Marketplace")),
        "by_status": {s: count(s) for s in VALID_STATUSES if count(s)},
    }


# ══ Phase 2 · Style training ═════════════════════════════════════════════
async def _require_emp(eid: str, ws: str) -> dict:
    emp = await db.ai_employees.find_one({"id": eid, "workspace_id": ws}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "AI employee not found")
    return emp


@router.get("/ai-builder/style-connectors")
async def style_connectors(current=Depends(require_user)):
    """Available (MOCKED) style-source connectors — sample data only, no OAuth."""
    return {"connectors": list_connectors()}


class ConnectSource(BaseModel):
    source: str                          # gmail | slack | whatsapp
    label: Optional[str] = None


@router.post("/ai-builder/employees/{eid}/style-sources")
async def connect_style_source(eid: str, payload: ConnectSource, current=Depends(require_user)):
    """Connect a MOCKED style source and pull sample writing snippets from it."""
    await _require_emp(eid, current["workspace_id"])
    samples = connector_samples(payload.source)
    if not samples:
        raise HTTPException(400, "Unknown style source")
    row = {
        "id": new_id(), "employee_id": eid, "workspace_id": current["workspace_id"],
        "source": payload.source, "label": payload.label or payload.source.title(),
        "is_mock": True, "samples": samples, "created_at": now_iso(),
    }
    # Replace any existing connection for the same source.
    await db.ai_employee_style_sources.delete_many({"employee_id": eid, "source": payload.source})
    await db.ai_employee_style_sources.insert_one(row.copy())
    return _public_emp(row)


class AddSampleText(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    label: Optional[str] = "Pasted sample"


@router.post("/ai-builder/employees/{eid}/style-sources/manual")
async def add_manual_sample(eid: str, payload: AddSampleText, current=Depends(require_user)):
    """Paste your own writing sample as a style source."""
    await _require_emp(eid, current["workspace_id"])
    row = {
        "id": new_id(), "employee_id": eid, "workspace_id": current["workspace_id"],
        "source": "manual", "label": payload.label or "Pasted sample",
        "is_mock": False, "samples": [payload.text.strip()], "created_at": now_iso(),
    }
    await db.ai_employee_style_sources.insert_one(row.copy())
    return _public_emp(row)


@router.get("/ai-builder/employees/{eid}/style-sources")
async def list_style_sources(eid: str, current=Depends(require_user)):
    await _require_emp(eid, current["workspace_id"])
    rows = await db.ai_employee_style_sources.find(
        {"employee_id": eid}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"sources": rows}


@router.delete("/ai-builder/employees/{eid}/style-sources/{sid}")
async def delete_style_source(eid: str, sid: str, current=Depends(require_user)):
    r = await db.ai_employee_style_sources.delete_one(
        {"id": sid, "employee_id": eid, "workspace_id": current["workspace_id"]}
    )
    if r.deleted_count == 0:
        raise HTTPException(404, "Style source not found")
    return {"ok": True}


@router.post("/ai-builder/employees/{eid}/style-profile/generate")
async def gen_style_profile(eid: str, current=Depends(require_user)):
    """Analyse connected sources + good examples via Claude Fable 5 → draft profile."""
    emp = await _require_emp(eid, current["workspace_id"])
    samples: List[dict] = []
    async for src in db.ai_employee_style_sources.find({"employee_id": eid}, {"_id": 0}):
        for txt in src.get("samples", []):
            samples.append({"source": src.get("label") or src.get("source"), "text": txt})
    # Good examples double as style samples.
    good = await db.ai_employee_examples.find(
        {"employee_id": eid, "is_good": True}, {"_id": 0}
    ).to_list(50)
    for ex in good:
        samples.append({"source": f"Good example: {ex.get('title')}", "text": ex.get("content", "")})
    if not samples:
        raise HTTPException(400, "Connect a style source or add good examples first")
    try:
        profile = await generate_style_profile(emp, samples)
    except ValueError as e:
        raise HTTPException(400, str(e))
    now = now_iso()
    doc = {
        "id": new_id(), "employee_id": eid, "workspace_id": current["workspace_id"],
        "status": "draft", "profile": profile, "sample_count": len(samples),
        "created_at": now, "updated_at": now,
    }
    await db.ai_employee_style_profiles.delete_many({"employee_id": eid, "status": "draft"})
    await db.ai_employee_style_profiles.insert_one(doc.copy())
    return _public_emp(doc)


class SaveStyleProfile(BaseModel):
    profile: dict


@router.post("/ai-builder/employees/{eid}/style-profile")
async def save_style_profile(eid: str, payload: SaveStyleProfile, current=Depends(require_user)):
    """Persist an (optionally edited) style profile as the saved voice."""
    await _require_emp(eid, current["workspace_id"])
    now = now_iso()
    await db.ai_employee_style_profiles.delete_many({"employee_id": eid})
    doc = {
        "id": new_id(), "employee_id": eid, "workspace_id": current["workspace_id"],
        "status": "saved", "profile": payload.profile, "created_at": now, "updated_at": now,
    }
    await db.ai_employee_style_profiles.insert_one(doc.copy())
    return _public_emp(doc)


@router.get("/ai-builder/employees/{eid}/style-profile")
async def get_style_profile(eid: str, current=Depends(require_user)):
    await _require_emp(eid, current["workspace_id"])
    saved = await db.ai_employee_style_profiles.find_one(
        {"employee_id": eid, "status": "saved"}, {"_id": 0}
    )
    draft = await db.ai_employee_style_profiles.find_one(
        {"employee_id": eid, "status": "draft"}, {"_id": 0}
    )
    return {"saved": saved, "draft": draft}


@router.delete("/ai-builder/employees/{eid}/style-profile")
async def delete_style_profile(eid: str, current=Depends(require_user)):
    await db.ai_employee_style_profiles.delete_many({"employee_id": eid})
    return {"ok": True}
