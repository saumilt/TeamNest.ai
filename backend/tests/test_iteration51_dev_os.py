"""Iteration 51 — Dev OS Phase 1.

Covers:
  - GET  /api/dev-os/dashboard
  - GET  /api/dev-os/agents
  - POST /api/dev-projects (stub plan fallback expected; just verify 200 + plan dict + backlog)
  - GET  /api/dev-projects + GET /api/dev-projects/{id} (embedded tasks/proposals)
  - POST /api/dev-tasks + PATCH /api/dev-tasks/{id}
  - POST /api/improvement-proposals + POST /api/improvement-proposals/{pid}/decide
"""
import os
import pytest
import httpx

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EXPECTED_AGENT_KEYS = {
    "product_ceo", "architect", "frontend", "backend",
    "qa", "security", "devops", "growth", "reviewer",
}


@pytest.fixture(scope="module")
def session():
    """Demo-login (Amit/owner). Uses token in header AND keeps cookie."""
    c = httpx.Client(timeout=60, follow_redirects=True)
    r = c.post(f"{API}/auth/demo-login")
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body["token"]
    c.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return c


# ---------- /api/dev-os/dashboard ----------
def test_dashboard_shape(session):
    r = session.get(f"{API}/dev-os/dashboard")
    assert r.status_code == 200, r.text
    d = r.json()
    for key in ("projects", "open_tasks", "open_proposals",
                "deployments_this_month", "agents_active",
                "recursive_summary", "metrics"):
        assert key in d, f"missing key: {key}"
    assert isinstance(d["projects"], list)
    assert isinstance(d["open_tasks"], int)
    assert isinstance(d["open_proposals"], int)
    assert isinstance(d["deployments_this_month"], int)
    assert d["agents_active"] == 9
    assert isinstance(d["recursive_summary"], str)
    assert isinstance(d["metrics"], dict)
    for m in ("bugs_fixed", "test_coverage", "engineering_hours_saved"):
        assert m in d["metrics"]


# ---------- /api/dev-os/agents ----------
def test_agents_catalog(session):
    r = session.get(f"{API}/dev-os/agents")
    assert r.status_code == 200, r.text
    body = r.json()
    # Spec says "array of 9 agents" — endpoint returns {"agents": [...]}.
    agents = body["agents"] if isinstance(body, dict) else body
    assert isinstance(agents, list)
    assert len(agents) == 9
    keys = {a["key"] for a in agents}
    assert keys == EXPECTED_AGENT_KEYS
    for a in agents:
        for f in ("key", "name", "role", "model", "risk_level"):
            assert f in a and a[f], f"agent {a.get('key')} missing {f}"


# ---------- /api/dev-projects (create + list + get) ----------
@pytest.fixture(scope="module")
def created_project(session):
    payload = {
        "name": "TEST_iter51 Dev OS Project",
        "description": "Pytest project for Dev OS regression",
        "target_users": "Pytest runners",
        "problem": "We need an automated test to validate the Dev OS endpoints end-to-end.",
        "business_model": {"pricing": "subscription", "price_point": "$0/mo"},
        "requirements": {"must_have": "Endpoints respond 200", "nice_to_have": ""},
    }
    r = session.post(f"{API}/dev-projects", json=payload)
    assert r.status_code == 200, r.text
    proj = r.json()
    assert "id" in proj and proj["id"]
    assert proj["status"] == "mvp_generated"
    assert isinstance(proj.get("plan"), dict)
    assert proj["name"] == payload["name"]
    return proj


def test_create_project_returns_plan(created_project):
    plan = created_project["plan"]
    # Plan shape (stub or LLM) — both contain these keys.
    for k in ("product_brief", "mvp_modules", "technical_stack",
              "development_backlog", "qa_checklist", "deployment_plan"):
        assert k in plan, f"plan missing {k}"


def test_create_project_seeds_backlog_tasks(session, created_project):
    r = session.get(f"{API}/dev-tasks?project_id={created_project['id']}")
    assert r.status_code == 200, r.text
    tasks = r.json()
    assert isinstance(tasks, list)
    # Stub plan seeds at least 1 backlog task; LLM seeds up to 20.
    assert len(tasks) >= 1, "No backlog tasks were seeded after project creation"
    assert all(t["status"] == "backlog" for t in tasks)
    assert all(t["project_id"] == created_project["id"] for t in tasks)


def test_list_projects_contains_created(session, created_project):
    r = session.get(f"{API}/dev-projects")
    assert r.status_code == 200, r.text
    items = r.json()
    assert any(p["id"] == created_project["id"] for p in items)


def test_get_project_embeds_tasks_and_proposals(session, created_project):
    r = session.get(f"{API}/dev-projects/{created_project['id']}")
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["id"] == created_project["id"]
    assert isinstance(p.get("tasks"), list) and len(p["tasks"]) >= 1
    assert isinstance(p.get("proposals"), list)  # empty initially


def test_get_project_404_on_missing(session):
    r = session.get(f"{API}/dev-projects/does-not-exist-id")
    assert r.status_code == 404


# ---------- /api/dev-tasks (create + update) ----------
def test_task_create_and_status_transition(session, created_project):
    payload = {
        "project_id": created_project["id"],
        "title": "TEST_iter51 Manual task",
        "description": "Created by pytest",
        "priority": "medium",
        "risk_level": "low",
        "status": "backlog",
    }
    r = session.post(f"{API}/dev-tasks", json=payload)
    assert r.status_code == 200, r.text
    task = r.json()
    assert task["title"] == payload["title"]
    assert task["status"] == "backlog"
    tid = task["id"]

    # PATCH backlog -> in_progress
    r = session.patch(f"{API}/dev-tasks/{tid}", json={"status": "in_progress"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in_progress"

    # Verify persistence
    listing = session.get(f"{API}/dev-tasks?project_id={created_project['id']}").json()
    matched = [t for t in listing if t["id"] == tid]
    assert matched and matched[0]["status"] == "in_progress"


# ---------- /api/improvement-proposals (create + decide) ----------
def test_proposal_create_and_approve(session, created_project):
    r = session.post(f"{API}/improvement-proposals", json={
        "project_id": created_project["id"],
        "signal": "Onboarding flow drops users at step 3 — investigate analytics gap.",
    })
    assert r.status_code == 200, r.text
    prop = r.json()
    assert prop["status"] == "pending"
    assert prop["project_id"] == created_project["id"]
    pid = prop["id"]

    # Listing should contain it
    r = session.get(f"{API}/improvement-proposals?project_id={created_project['id']}")
    assert r.status_code == 200
    assert any(p["id"] == pid for p in r.json())

    # Approve
    r = session.post(f"{API}/improvement-proposals/{pid}/decide",
                     json={"decision": "approve", "reviewer_notes": "lgtm"})
    assert r.status_code == 200, r.text
    decided = r.json()
    assert decided["status"] == "approved"
    assert decided["approved_by_user"] is not None
    assert decided["reviewer_notes"] == "lgtm"


def test_proposal_invalid_decision_returns_400(session, created_project):
    r = session.post(f"{API}/improvement-proposals", json={
        "project_id": created_project["id"],
        "signal": "Another test signal",
    })
    pid = r.json()["id"]
    r = session.post(f"{API}/improvement-proposals/{pid}/decide",
                     json={"decision": "yolo"})
    assert r.status_code == 400


def test_proposal_create_404_on_unknown_project(session):
    r = session.post(f"{API}/improvement-proposals", json={
        "project_id": "nonexistent-project-id",
        "signal": "x",
    })
    assert r.status_code == 404


# ---------- Auth gate ----------
def test_dashboard_requires_auth():
    c = httpx.Client(timeout=10)
    r = c.get(f"{API}/dev-os/dashboard")
    assert r.status_code in (401, 403), f"Unauthenticated request should be rejected, got {r.status_code}"
