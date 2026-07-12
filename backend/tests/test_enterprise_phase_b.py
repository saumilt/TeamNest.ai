"""Backend tests for Enterprise Role Intelligence Phase B.

Covers:
- Successor candidates list
- Assign successor -> generates handoff (brief + 30/60/90 checklist)
- Get handoff + progress
- Toggle checklist -> auto-complete transfer_status when all done
- Ask Previous Role -> grounded=true, [S#] citations, NO personal names
- Ask history via session_id
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

OWNER_EMAIL = "sam@funasia.net"
OWNER_PASS = "Perfect$2008"

# Personal names that must NEVER appear in Ask Role answers (anonymization rule).
FORBIDDEN_NAMES = ["Raj", "Priya", "Amit"]


@pytest.fixture(scope="module")
def owner_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": OWNER_EMAIL, "password": OWNER_PASS}, timeout=30)
    assert r.status_code == 200, f"owner login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def seeded_people(owner_client):
    r = owner_client.get(f"{BASE_URL}/api/enterprise/people", timeout=30)
    assert r.status_code == 200, r.text
    people = r.json()["people"]
    assert len(people) >= 3, "expected seeded 3 employees"
    return people


@pytest.fixture(scope="module")
def departing_employee(seeded_people):
    dep = [p for p in seeded_people if p.get("employment_status") == "Departing"]
    assert dep, "expected a Departing employee (Priya)"
    return dep[0]


# ── Candidates ─────────────────────────────────────────────────────────────
def test_successor_candidates(owner_client, departing_employee):
    eid = departing_employee["id"]
    r = owner_client.get(f"{BASE_URL}/api/enterprise/people/{eid}/candidates", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "candidates" in data
    cands = data["candidates"]
    assert len(cands) >= 2, "expected at least 2 other employees"
    ids = [c["id"] for c in cands]
    assert eid not in ids, "candidates should not include the departing employee"
    for c in cands:
        for k in ("id", "employee_name", "employee_email"):
            assert k in c and c[k]


# ── Assign successor & handoff generation ──────────────────────────────────
def test_assign_successor_generates_handoff(owner_client, departing_employee):
    eid = departing_employee["id"]
    cands = owner_client.get(f"{BASE_URL}/api/enterprise/people/{eid}/candidates").json()["candidates"]
    succ = cands[0]
    r = owner_client.post(
        f"{BASE_URL}/api/enterprise/people/{eid}/successor",
        json={"successor_user_id": succ["id"]}, timeout=60,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    h = body["handoff"]
    assert h["successor_name"] == succ["employee_name"]
    assert isinstance(h["brief"], str) and len(h["brief"]) > 20
    # Anonymization check on brief.
    for name in FORBIDDEN_NAMES:
        assert name not in h["brief"], f"brief must NOT expose personal name '{name}': {h['brief']}"
    assert isinstance(h["checklist"], list)
    assert len(h["checklist"]) >= 10, f"expected ~15 checklist items, got {len(h['checklist'])}"
    phases = {c["phase"] for c in h["checklist"]}
    assert phases == {"30", "60", "90"}, f"expected 30/60/90 phases, got {phases}"


def test_get_handoff_returns_progress_and_status(owner_client, departing_employee):
    eid = departing_employee["id"]
    r = owner_client.get(f"{BASE_URL}/api/enterprise/people/{eid}/handoff", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["handoff"] is not None
    p = data["progress"]
    assert set(p.keys()) == {"done", "total", "pct"}
    assert p["total"] >= 10
    assert p["done"] == 0
    assert p["pct"] == 0
    assert data["transfer_status"] == "in_progress"


def test_toggle_checklist_and_auto_complete(owner_client, departing_employee):
    eid = departing_employee["id"]
    h = owner_client.get(f"{BASE_URL}/api/enterprise/people/{eid}/handoff").json()["handoff"]
    items = h["checklist"]
    # Toggle first item done -> in_progress, progress > 0
    r = owner_client.post(
        f"{BASE_URL}/api/enterprise/people/{eid}/handoff/checklist",
        json={"item_id": items[0]["id"], "done": True}, timeout=15,
    )
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["progress"]["done"] == 1
    assert p["transfer_status"] == "in_progress"

    # Complete all remaining -> auto flips to 'complete'
    for it in items[1:]:
        rr = owner_client.post(
            f"{BASE_URL}/api/enterprise/people/{eid}/handoff/checklist",
            json={"item_id": it["id"], "done": True}, timeout=15,
        )
        assert rr.status_code == 200
    final = rr.json()
    assert final["progress"]["done"] == final["progress"]["total"]
    assert final["progress"]["pct"] == 100
    assert final["transfer_status"] == "complete", f"expected complete, got {final['transfer_status']}"

    # Toggle one back off -> reverts to in_progress
    r2 = owner_client.post(
        f"{BASE_URL}/api/enterprise/people/{eid}/handoff/checklist",
        json={"item_id": items[0]["id"], "done": False}, timeout=15,
    )
    assert r2.status_code == 200
    assert r2.json()["transfer_status"] == "in_progress"


def test_toggle_unknown_item_404(owner_client, departing_employee):
    eid = departing_employee["id"]
    r = owner_client.post(
        f"{BASE_URL}/api/enterprise/people/{eid}/handoff/checklist",
        json={"item_id": "chk-does-not-exist", "done": True}, timeout=15,
    )
    assert r.status_code == 404


# ── Ask Previous Role ──────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def ops_role_id(owner_client):
    """Operations role has approved memories seeded — best target for grounding tests."""
    roles = owner_client.get(f"{BASE_URL}/api/enterprise/roles").json()["roles"]
    ops = next((r for r in roles if "Operations" in r["role_name"]), None)
    assert ops, "expected Operations role in seed"
    return ops["id"]


def test_ask_role_grounded_with_citations_and_anonymized(owner_client, ops_role_id):
    r = owner_client.post(
        f"{BASE_URL}/api/enterprise/roles/{ops_role_id}/ask",
        json={"question": "How were recurring service-level complaints at The Colony handled?"},
        timeout=90,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("grounded") is True
    assert isinstance(data.get("session_id"), str) and data["session_id"]
    ans = data["answer"]
    assert isinstance(ans, str) and len(ans) > 20
    # At least one [S#] citation tag present in answer body
    assert re.search(r"\[S\d+\]", ans), f"expected [S#] citation in answer: {ans}"
    # citations list mirrors citations found
    assert isinstance(data["citations"], list) and len(data["citations"]) >= 1
    for c in data["citations"]:
        assert "n" in c and "title" in c
    # Anonymization: departing person's name must NOT appear
    for name in FORBIDDEN_NAMES:
        assert name not in ans, f"answer must NOT expose personal name '{name}': {ans}"


def test_ask_role_multi_turn_history(owner_client, ops_role_id):
    r1 = owner_client.post(
        f"{BASE_URL}/api/enterprise/roles/{ops_role_id}/ask",
        json={"question": "What are the top risks in this role?"},
        timeout=90,
    )
    assert r1.status_code == 200
    sid = r1.json()["session_id"]

    r2 = owner_client.post(
        f"{BASE_URL}/api/enterprise/roles/{ops_role_id}/ask",
        json={"question": "And how were they mitigated?", "session_id": sid},
        timeout=90,
    )
    assert r2.status_code == 200
    assert r2.json()["session_id"] == sid

    hist = owner_client.get(
        f"{BASE_URL}/api/enterprise/roles/{ops_role_id}/ask/history",
        params={"session_id": sid}, timeout=30,
    )
    assert hist.status_code == 200
    turns = hist.json()["turns"]
    assert len(turns) >= 2
    assert turns[0]["question"].startswith("What are the top risks")
    assert turns[1]["session_id"] == sid


def test_ask_role_empty_question_400(owner_client, ops_role_id):
    r = owner_client.post(
        f"{BASE_URL}/api/enterprise/roles/{ops_role_id}/ask",
        json={"question": "   "}, timeout=15,
    )
    assert r.status_code == 400


def test_ask_role_unknown_role_404(owner_client):
    r = owner_client.post(
        f"{BASE_URL}/api/enterprise/roles/does-not-exist/ask",
        json={"question": "anything"}, timeout=15,
    )
    assert r.status_code == 404
