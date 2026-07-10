"""Iteration 93 — AI Employee Builder Phase 1 backend tests.

Covers templates, dashboard, CRUD for employees, and training doc / example
subresources. All ai-builder endpoints require auth via `tn_session` cookie
issued by /api/auth/demo-login.
"""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    return s


# ── Auth guard ──────────────────────────────────────────────────────────
def test_requires_auth():
    r = requests.get(f"{BASE}/api/ai-builder/dashboard", timeout=15)
    assert r.status_code == 401


# ── Templates ───────────────────────────────────────────────────────────
def test_templates_list(session):
    r = session.get(f"{BASE}/api/ai-builder/templates", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "templates" in data and isinstance(data["templates"], list)
    assert len(data["templates"]) >= 10
    ids = {t["id"] for t in data["templates"]}
    for expected in ("sales_assistant", "customer_support", "restaurant_ops", "custom"):
        assert expected in ids
    sample = data["templates"][0]
    for k in ("id", "name", "category", "risk_level", "description"):
        assert k in sample


def test_template_detail(session):
    r = session.get(f"{BASE}/api/ai-builder/templates/sales_assistant", timeout=15)
    assert r.status_code == 200
    t = r.json()
    assert t["id"] == "sales_assistant"
    assert t["job_title"] == "Sales Assistant"
    assert isinstance(t.get("responsibilities"), list) and len(t["responsibilities"]) > 0


def test_template_detail_404(session):
    r = session.get(f"{BASE}/api/ai-builder/templates/does_not_exist", timeout=15)
    assert r.status_code == 404


# ── Dashboard ───────────────────────────────────────────────────────────
def test_dashboard_shape(session):
    r = session.get(f"{BASE}/api/ai-builder/dashboard", timeout=15)
    assert r.status_code == 200
    data = r.json()
    for k in ("total", "draft", "deployed", "needs_review", "marketplace", "training"):
        assert k in data, f"missing dashboard key: {k}"
        assert isinstance(data[k], int)


# ── Create employee: blank / template / job_description ─────────────────
def test_create_blank(session):
    r = session.post(f"{BASE}/api/ai-builder/employees",
                     json={"source": "blank", "name": "TEST_Blank_Emp"}, timeout=15)
    assert r.status_code == 200, r.text
    emp = r.json()
    assert emp["name"] == "TEST_Blank_Emp"
    assert emp["status"] == "Draft"
    assert emp["template_id"] is None
    assert "id" in emp
    # cleanup
    session.delete(f"{BASE}/api/ai-builder/employees/{emp['id']}")


def test_create_from_template(session):
    r = session.post(f"{BASE}/api/ai-builder/employees",
                     json={"source": "template", "template_id": "customer_support"},
                     timeout=15)
    assert r.status_code == 200, r.text
    emp = r.json()
    assert emp["template_id"] == "customer_support"
    assert emp["job_title"] == "Support Agent"
    assert emp["department"] == "Support"
    assert len(emp["responsibilities"]) > 0

    # verify persistence via GET detail
    d = session.get(f"{BASE}/api/ai-builder/employees/{emp['id']}", timeout=15).json()
    assert d["employee"]["id"] == emp["id"]
    assert "completeness" in d and "score" in d["completeness"]
    assert d["documents"] == [] and d["examples"] == []

    session.delete(f"{BASE}/api/ai-builder/employees/{emp['id']}")


def test_create_from_template_invalid(session):
    r = session.post(f"{BASE}/api/ai-builder/employees",
                     json={"source": "template", "template_id": "nope"}, timeout=15)
    assert r.status_code == 404


def test_create_from_job_description(session):
    jd = ("Support engineer job.\n"
          "- Handle escalations from customers\n"
          "- Triage tickets and route to owner\n"
          "- Draft internal runbooks weekly\n")
    r = session.post(f"{BASE}/api/ai-builder/employees",
                     json={"source": "job_description", "name": "TEST_JD_Emp",
                           "job_description": jd}, timeout=15)
    assert r.status_code == 200, r.text
    emp = r.json()
    assert emp["description"].startswith("Support engineer job")
    assert len(emp["responsibilities"]) >= 1
    session.delete(f"{BASE}/api/ai-builder/employees/{emp['id']}")


# ── Full lifecycle: list, patch, docs, examples, completeness, delete ───
def test_full_lifecycle(session):
    # create
    r = session.post(f"{BASE}/api/ai-builder/employees",
                     json={"source": "template", "template_id": "sales_assistant",
                           "name": "TEST_Lifecycle_Emp"}, timeout=15)
    assert r.status_code == 200, r.text
    eid = r.json()["id"]

    # baseline completeness score
    base = session.get(f"{BASE}/api/ai-builder/employees/{eid}", timeout=15).json()
    base_score = base["completeness"]["score"]

    # list includes it
    lst = session.get(f"{BASE}/api/ai-builder/employees", timeout=15).json()
    assert any(e["id"] == eid for e in lst["employees"])

    # patch profile
    p = session.patch(
        f"{BASE}/api/ai-builder/employees/{eid}",
        json={"name": "TEST_Updated_Name", "tone": "Friendly",
              "status": "Training", "responsibilities": ["Do A", "Do B"]},
        timeout=15,
    )
    assert p.status_code == 200
    assert p.json()["name"] == "TEST_Updated_Name"
    assert p.json()["tone"] == "Friendly"
    assert p.json()["status"] == "Training"

    # invalid status guard
    bad = session.patch(f"{BASE}/api/ai-builder/employees/{eid}",
                        json={"status": "BogusStatus"}, timeout=15)
    assert bad.status_code == 400

    # add document
    d = session.post(
        f"{BASE}/api/ai-builder/employees/{eid}/documents",
        json={"title": "TEST SOP", "category": "Knowledge",
              "content": "How we handle inbound leads..."},
        timeout=15,
    )
    assert d.status_code == 200, d.text
    doc_id = d.json()["id"]

    # invalid doc category
    d_bad = session.post(f"{BASE}/api/ai-builder/employees/{eid}/documents",
                         json={"title": "x", "category": "Bogus", "content": "y"},
                         timeout=15)
    assert d_bad.status_code == 400

    # doc without content or file_id
    d_bad2 = session.post(f"{BASE}/api/ai-builder/employees/{eid}/documents",
                          json={"title": "x", "category": "Knowledge"}, timeout=15)
    assert d_bad2.status_code == 400

    # add example
    e = session.post(
        f"{BASE}/api/ai-builder/employees/{eid}/examples",
        json={"title": "TEST Good reply", "example_type": "Sales email",
              "is_good": True, "content": "Hi X, thanks for reaching out...",
              "rationale": "Warm + clear next step"},
        timeout=15,
    )
    assert e.status_code == 200, e.text
    ex_id = e.json()["id"]

    # detail: verify persistence + completeness rises
    d2 = session.get(f"{BASE}/api/ai-builder/employees/{eid}", timeout=15).json()
    assert len(d2["documents"]) == 1 and d2["documents"][0]["id"] == doc_id
    assert len(d2["examples"]) == 1 and d2["examples"][0]["id"] == ex_id
    new_score = d2["completeness"]["score"]
    assert new_score > base_score, f"completeness didn't rise: {base_score} -> {new_score}"

    # delete doc
    dd = session.delete(f"{BASE}/api/ai-builder/employees/{eid}/documents/{doc_id}", timeout=15)
    assert dd.status_code == 200
    # delete example
    de = session.delete(f"{BASE}/api/ai-builder/employees/{eid}/examples/{ex_id}", timeout=15)
    assert de.status_code == 200

    d3 = session.get(f"{BASE}/api/ai-builder/employees/{eid}", timeout=15).json()
    assert d3["documents"] == [] and d3["examples"] == []

    # delete employee cascades docs/examples collections
    r = session.delete(f"{BASE}/api/ai-builder/employees/{eid}", timeout=15)
    assert r.status_code == 200
    r404 = session.get(f"{BASE}/api/ai-builder/employees/{eid}", timeout=15)
    assert r404.status_code == 404


def test_delete_missing(session):
    r = session.delete(f"{BASE}/api/ai-builder/employees/nonexistent-xyz", timeout=15)
    assert r.status_code == 404


def test_doc_on_missing_employee(session):
    r = session.post(f"{BASE}/api/ai-builder/employees/nope/documents",
                     json={"title": "x", "category": "Knowledge", "content": "y"},
                     timeout=15)
    assert r.status_code == 404
