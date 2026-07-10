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
from services.ai_employee_runtime import (
    PERMISSION_LEVELS, build_system_prompt, generate_reply,
)
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
                 "ai_employee_style_sources", "ai_employee_style_profiles",
                 "ai_employee_test_runs", "ai_employee_permissions",
                 "ai_employee_tool_access", "ai_employee_escalation_rules",
                 "ai_employee_deployments"):
        await db[coll].delete_many({"employee_id": eid})
    # Remove any marketplace listing this employee published + licenses for it,
    # plus any license where this (installed) employee was the target.
    await db.ai_employee_marketplace_listings.delete_many({"employee_id": eid})
    await db.ai_employee_marketplace_licenses.delete_many(
        {"$or": [{"installed_employee_id": eid}]})
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



# ══ Phase 3 · Permissions, tools & escalation ════════════════════════════
DEFAULT_TOOLS = [
    "TeamNest chat", "TeamNest tasks", "TeamNest files", "TeamNest calendar",
    "Gmail (mock)", "Slack (mock)", "Web research (mock)",
]


async def _permission_level(eid: str) -> str:
    doc = await db.ai_employee_permissions.find_one({"employee_id": eid}, {"_id": 0})
    return (doc or {}).get("permission_level", "Answer only")


@router.get("/ai-builder/permission-options")
async def permission_options(current=Depends(require_user)):
    return {"levels": PERMISSION_LEVELS, "tools": DEFAULT_TOOLS}


class SetPermissions(BaseModel):
    permission_level: str
    risk_level: Optional[str] = None
    notes: Optional[str] = None


@router.put("/ai-builder/employees/{eid}/permissions")
async def set_permissions(eid: str, payload: SetPermissions, current=Depends(require_user)):
    await _require_emp(eid, current["workspace_id"])
    if payload.permission_level not in PERMISSION_LEVELS:
        raise HTTPException(400, "Invalid permission level")
    now = now_iso()
    doc = {
        "employee_id": eid, "workspace_id": current["workspace_id"],
        "permission_level": payload.permission_level,
        "risk_level": payload.risk_level or "Low",
        "notes": payload.notes or "", "updated_at": now,
    }
    existing = await db.ai_employee_permissions.find_one({"employee_id": eid}, {"_id": 1})
    if existing:
        await db.ai_employee_permissions.update_one({"employee_id": eid}, {"$set": doc})
    else:
        doc["id"] = new_id()
        doc["created_at"] = now
        await db.ai_employee_permissions.insert_one(doc.copy())
    if payload.risk_level:
        await db.ai_employees.update_one(
            {"id": eid}, {"$set": {"permissions_risk_level": payload.risk_level, "updated_at": now}})
    saved = await db.ai_employee_permissions.find_one({"employee_id": eid}, {"_id": 0})
    return saved


@router.get("/ai-builder/employees/{eid}/permissions")
async def get_permissions(eid: str, current=Depends(require_user)):
    await _require_emp(eid, current["workspace_id"])
    perm = await db.ai_employee_permissions.find_one({"employee_id": eid}, {"_id": 0})
    tools = await db.ai_employee_tool_access.find({"employee_id": eid}, {"_id": 0}).to_list(100)
    esc = await db.ai_employee_escalation_rules.find({"employee_id": eid}, {"_id": 0}).sort("created_at", 1).to_list(100)
    return {"permission": perm, "tools": tools, "escalation_rules": esc}


class AddTool(BaseModel):
    tool: str = Field(min_length=1, max_length=100)
    requires_approval: bool = True


@router.post("/ai-builder/employees/{eid}/tools")
async def add_tool(eid: str, payload: AddTool, current=Depends(require_user)):
    await _require_emp(eid, current["workspace_id"])
    if await db.ai_employee_tool_access.find_one({"employee_id": eid, "tool": payload.tool}, {"_id": 1}):
        raise HTTPException(400, "Tool already added")
    row = {
        "id": new_id(), "employee_id": eid, "workspace_id": current["workspace_id"],
        "tool": payload.tool, "requires_approval": payload.requires_approval,
        "enabled": True, "created_at": now_iso(),
    }
    await db.ai_employee_tool_access.insert_one(row.copy())
    return _public_emp(row)


@router.delete("/ai-builder/employees/{eid}/tools/{tool_id}")
async def delete_tool(eid: str, tool_id: str, current=Depends(require_user)):
    r = await db.ai_employee_tool_access.delete_one(
        {"id": tool_id, "employee_id": eid, "workspace_id": current["workspace_id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Tool not found")
    return {"ok": True}


class AddEscalation(BaseModel):
    trigger: str = Field(min_length=1, max_length=200)
    action: str = Field(min_length=1, max_length=200)
    notify_role: Optional[str] = None


@router.post("/ai-builder/employees/{eid}/escalation-rules")
async def add_escalation(eid: str, payload: AddEscalation, current=Depends(require_user)):
    await _require_emp(eid, current["workspace_id"])
    row = {
        "id": new_id(), "employee_id": eid, "workspace_id": current["workspace_id"],
        "trigger": payload.trigger.strip(), "action": payload.action.strip(),
        "notify_role": payload.notify_role or "", "created_at": now_iso(),
    }
    await db.ai_employee_escalation_rules.insert_one(row.copy())
    return _public_emp(row)


@router.delete("/ai-builder/employees/{eid}/escalation-rules/{rule_id}")
async def delete_escalation(eid: str, rule_id: str, current=Depends(require_user)):
    r = await db.ai_employee_escalation_rules.delete_one(
        {"id": rule_id, "employee_id": eid, "workspace_id": current["workspace_id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Rule not found")
    return {"ok": True}


# ══ Phase 3 · Sandbox testing ════════════════════════════════════════════
class SandboxMessage(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: Optional[str] = None


@router.post("/ai-builder/employees/{eid}/sandbox")
async def sandbox_reply(eid: str, payload: SandboxMessage, current=Depends(require_user)):
    emp = await _require_emp(eid, current["workspace_id"])
    style_doc = await db.ai_employee_style_profiles.find_one(
        {"employee_id": eid, "status": "saved"}, {"_id": 0})
    style = style_doc.get("profile") if style_doc else None
    docs = await db.ai_employee_training_documents.find({"employee_id": eid}, {"_id": 0}).to_list(20)
    examples = await db.ai_employee_examples.find({"employee_id": eid}, {"_id": 0}).to_list(20)
    esc = await db.ai_employee_escalation_rules.find({"employee_id": eid}, {"_id": 0}).to_list(50)
    perm = await _permission_level(eid)

    # Multi-turn memory: reuse the session's prior turns as history.
    session_id = payload.session_id or new_id()
    prior = await db.ai_employee_test_runs.find(
        {"employee_id": eid, "session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    history = [{"user": r["user_message"], "ai": r["ai_response"]} for r in prior]

    system = build_system_prompt(emp, style, docs, examples, perm, esc)
    result = await generate_reply(system, payload.message, history=history)

    now = now_iso()
    run = {
        "id": new_id(), "employee_id": eid, "workspace_id": current["workspace_id"],
        "session_id": session_id,
        "user_message": payload.message, "ai_response": result["reply"],
        "model": result["model"], "escalated": result["escalated"],
        "rating": None, "correction": None, "created_at": now,
    }
    await db.ai_employee_test_runs.insert_one(run.copy())
    return _public_emp(run)


class RateRun(BaseModel):
    rating: str                          # good | bad
    correction: Optional[str] = None
    save_as_example: bool = False


@router.post("/ai-builder/employees/{eid}/test-runs/{run_id}/rate")
async def rate_run(eid: str, run_id: str, payload: RateRun, current=Depends(require_user)):
    if payload.rating not in ("good", "bad"):
        raise HTTPException(400, "Rating must be good or bad")
    run = await db.ai_employee_test_runs.find_one(
        {"id": run_id, "employee_id": eid, "workspace_id": current["workspace_id"]}, {"_id": 0})
    if not run:
        raise HTTPException(404, "Test run not found")
    await db.ai_employee_test_runs.update_one(
        {"id": run_id},
        {"$set": {"rating": payload.rating, "correction": payload.correction or None}})
    # Optionally capture as a training example (good = the AI reply; bad = the correction).
    if payload.save_as_example:
        is_good = payload.rating == "good"
        content = run["ai_response"] if is_good else (payload.correction or run["ai_response"])
        ex = {
            "id": new_id(), "employee_id": eid, "workspace_id": current["workspace_id"],
            "title": f"From sandbox: {run['user_message'][:60]}",
            "example_type": "Sandbox", "is_good": is_good, "content": content,
            "rationale": payload.correction or ("Rated good in sandbox" if is_good else "Rated bad in sandbox"),
            "apply_as_rule": False, "private_only": True, "created_at": now_iso(),
        }
        await db.ai_employee_examples.insert_one(ex.copy())
    return {"ok": True}


@router.get("/ai-builder/employees/{eid}/test-runs")
async def list_test_runs(eid: str, session_id: Optional[str] = None, current=Depends(require_user)):
    await _require_emp(eid, current["workspace_id"])
    query = {"employee_id": eid}
    if session_id:
        query["session_id"] = session_id
    rows = await db.ai_employee_test_runs.find(
        query, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"runs": rows}


@router.delete("/ai-builder/employees/{eid}/test-runs")
async def clear_test_runs(eid: str, current=Depends(require_user)):
    await db.ai_employee_test_runs.delete_many(
        {"employee_id": eid, "workspace_id": current["workspace_id"]})
    return {"ok": True}


# ══ Phase 3 · Deployment ═════════════════════════════════════════════════
def _norm_handle(h: str) -> str:
    return "".join(ch for ch in h.strip().lstrip("@").lower() if ch.isalnum() or ch in ("_", "-"))


class Deploy(BaseModel):
    channel: str = "handle"              # handle | chat
    handle: Optional[str] = None
    chat_id: Optional[str] = None


@router.post("/ai-builder/employees/{eid}/deploy")
async def deploy_employee(eid: str, payload: Deploy, current=Depends(require_user)):
    emp = await _require_emp(eid, current["workspace_id"])
    ws = current["workspace_id"]
    handle = _norm_handle(payload.handle or emp.get("name", "employee"))
    if not handle:
        raise HTTPException(400, "Invalid handle")
    # Handle must be unique across the workspace's deployed employees.
    clash = await db.ai_employee_deployments.find_one(
        {"workspace_id": ws, "handle": handle, "employee_id": {"$ne": eid}, "status": "active"},
        {"_id": 1})
    if clash:
        raise HTTPException(409, f"Handle @{handle} is already in use")
    if payload.channel == "chat":
        if not payload.chat_id:
            raise HTTPException(400, "chat_id required for chat deployment")
        if not await db.chats.find_one({"id": payload.chat_id, "workspace_id": ws}, {"_id": 1}):
            raise HTTPException(404, "Chat not found")
    now = now_iso()
    await db.ai_employee_deployments.delete_many({"employee_id": eid})
    dep = {
        "id": new_id(), "employee_id": eid, "workspace_id": ws,
        "channel": payload.channel, "handle": handle, "chat_id": payload.chat_id,
        "status": "active", "deployed_by": current["id"],
        "created_at": now, "updated_at": now,
    }
    await db.ai_employee_deployments.insert_one(dep.copy())
    await db.ai_employees.update_one(
        {"id": eid}, {"$set": {"status": "Deployed", "deployment_handle": handle, "updated_at": now}})
    return _public_emp(dep)


@router.get("/ai-builder/employees/{eid}/deployment")
async def get_deployment(eid: str, current=Depends(require_user)):
    await _require_emp(eid, current["workspace_id"])
    dep = await db.ai_employee_deployments.find_one(
        {"employee_id": eid, "status": "active"}, {"_id": 0})
    return {"deployment": dep}


@router.post("/ai-builder/employees/{eid}/undeploy")
async def undeploy_employee(eid: str, current=Depends(require_user)):
    await _require_emp(eid, current["workspace_id"])
    await db.ai_employee_deployments.delete_many({"employee_id": eid})
    await db.ai_employees.update_one(
        {"id": eid}, {"$set": {"status": "Ready", "updated_at": now_iso()},
                      "$unset": {"deployment_handle": ""}})
    return {"ok": True}
