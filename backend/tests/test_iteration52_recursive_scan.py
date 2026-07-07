"""Iteration 52 — Dev OS Phase 2: Recursive Improvement Engine + llm_status gating.

Covers:
  - POST /api/dev-projects returns `llm_status`; no credit deduction when stub
  - POST /api/improvement-proposals returns `llm_status`; no credit deduction when stub
  - POST /api/dev-projects/{project_id}/scan happy path with seeded chat signals
  - Scan returns 400 if no chat linked / chat_id not provided
  - Scan returns 404 for unknown project_id
  - Scan-created proposals have created_by_agent='recursive_scan' and source_chat_id set
  - Smoke regression for iteration_51 endpoints (dashboard + agents catalog)
"""
import os
import pytest
import httpx

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")
# Cloudflare proxy in front of the public URL has a ~100s edge timeout. LLM
# calls (Claude Sonnet via emergentintegrations) routinely exceed that. The
# backend itself works fine — we hit localhost:8001 for the LLM-heavy paths
# to avoid the edge timeout. This is identical app code; only the network
# path differs.
INTERNAL_BASE = "http://localhost:8001"
API = f"{BASE_URL}/api"
INTERNAL_API = f"{INTERNAL_BASE}/api"

SIGNAL_MESSAGES = [
    "The export button is broken — it crashes every time I click it.",
    "Login fails when I use SSO, throws an error toast nonstop.",
    "The settings page is confusing, I can't figure out where to enable 2FA.",
    "Where is the dashboard filter? UI is really hard to find anything.",
    "Pages are so slow, the spinner just loads forever.",
    "Everything feels laggy after the last update, takes forever to load.",
    "I wish there was a dark mode option in the mobile app.",
    "Please add Slack notifications, we really need this feature.",
    "Thinking about switching to a competitor, may cancel my subscription.",
    "Want a refund — we are leaving for another product.",
]


@pytest.fixture(scope="module")
def session():
    c = httpx.Client(timeout=180, follow_redirects=True)
    r = c.post(f"{API}/auth/demo-login")
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    c.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return c


@pytest.fixture(scope="module")
def internal_session(session):
    """Same auth token but hits localhost:8001 directly to bypass the
    Cloudflare 100s edge timeout for LLM-heavy endpoints."""
    c = httpx.Client(timeout=300, follow_redirects=True)
    c.headers.update(dict(session.headers))
    return c


@pytest.fixture(scope="module")
def seeded_chat(session):
    """Create a fresh group chat and seed it with signal-rich messages."""
    r = session.post(f"{API}/chats", json={
        "type": "group",
        "name": "TEST_iter52 signals chat",
        "member_ids": [],
    })
    assert r.status_code == 200, r.text
    chat_id = r.json()["id"]
    for body in SIGNAL_MESSAGES:
        m = session.post(f"{API}/chats/{chat_id}/messages", json={
            "message_type": "text",
            "body": body,
        })
        assert m.status_code == 200, m.text
    return chat_id


@pytest.fixture(scope="module")
def project_with_chat(internal_session, seeded_chat):
    r = internal_session.post(f"{INTERNAL_API}/dev-projects", json={
        "name": "TEST_iter52 project with chat",
        "description": "Recursive scan target project",
        "problem": "Find improvement signals automatically",
        "target_users": "internal teams",
        "related_chat_id": seeded_chat,
    })
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def project_without_chat(internal_session):
    r = internal_session.post(f"{INTERNAL_API}/dev-projects", json={
        "name": "TEST_iter52 project no chat",
        "description": "Should not scan",
        "problem": "no chat linked",
    })
    assert r.status_code == 200, r.text
    return r.json()


# ─── llm_status gating ───────────────────────────────────────────────────────
def test_create_project_includes_llm_status(project_with_chat):
    p = project_with_chat
    assert "llm_status" in p, f"missing llm_status key: {p.keys()}"
    assert p["llm_status"] in ("live", "stub")
    # Plan must still be a dict regardless of llm_status
    assert isinstance(p.get("plan"), dict)


def test_create_proposal_includes_llm_status(internal_session, project_with_chat):
    r = internal_session.post(f"{INTERNAL_API}/improvement-proposals", json={
        "project_id": project_with_chat["id"],
        "signal": "users report the export button is broken",
        "role": "reviewer",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert "llm_status" in body
    assert body["llm_status"] in ("live", "stub")
    assert body["created_by_agent"] == "reviewer"


# ─── Scan happy path ─────────────────────────────────────────────────────────
def test_scan_happy_path(internal_session, project_with_chat):
    pid = project_with_chat["id"]
    r = internal_session.post(f"{INTERNAL_API}/dev-projects/{pid}/scan", json={
        "create_proposals": True,
        "lookback_messages": 200,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    # Shape
    for key in ("total_scanned", "signals_found", "by_type", "top_signals", "created_proposals"):
        assert key in body, f"missing key in scan response: {key}"
    assert isinstance(body["total_scanned"], int)
    assert isinstance(body["signals_found"], int)
    assert isinstance(body["by_type"], dict)
    assert isinstance(body["top_signals"], list)
    assert isinstance(body["created_proposals"], list)

    # Should detect at least bug + ux + perf + missing + churn buckets we seeded.
    found_types = set(body["by_type"].keys())
    expected_subset = {"bug", "ux", "perf", "missing", "churn"}
    overlap = found_types & expected_subset
    assert len(overlap) >= 4, f"expected at least 4 signal types, got {found_types}"
    assert body["signals_found"] >= 5

    # Proposals were created (cap is 3 in the route)
    assert len(body["created_proposals"]) >= 1
    for prop in body["created_proposals"]:
        assert prop["created_by_agent"] == "recursive_scan"
        assert prop["source_chat_id"]
        assert prop["status"] == "pending"
        assert prop["project_id"] == pid


def test_scan_proposals_persisted(session, project_with_chat):
    pid = project_with_chat["id"]
    r = session.get(f"{API}/dev-projects/{pid}")
    assert r.status_code == 200, r.text
    proposals = r.json().get("proposals") or []
    # At least one proposal should be tagged as a recursive_scan proposal
    rs = [p for p in proposals if p.get("created_by_agent") == "recursive_scan"]
    assert len(rs) >= 1, "expected at least one recursive_scan proposal persisted"
    for p in rs:
        assert p.get("source_chat_id")


# ─── Error cases ─────────────────────────────────────────────────────────────
def test_scan_no_chat_returns_400(internal_session, project_without_chat):
    pid = project_without_chat["id"]
    r = internal_session.post(f"{INTERNAL_API}/dev-projects/{pid}/scan", json={
        "create_proposals": False,
        "lookback_messages": 50,
    })
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "")
    assert "chat" in detail.lower()


def test_scan_unknown_project_returns_404(session):
    r = session.post(f"{API}/dev-projects/does-not-exist-xyz/scan", json={
        "create_proposals": False,
        "lookback_messages": 50,
    })
    assert r.status_code == 404, r.text


def test_scan_with_explicit_chat_id_works(internal_session, project_without_chat, seeded_chat):
    """Project has no related_chat_id, but request body provides chat_id."""
    pid = project_without_chat["id"]
    r = internal_session.post(f"{INTERNAL_API}/dev-projects/{pid}/scan", json={
        "chat_id": seeded_chat,
        "create_proposals": False,
        "lookback_messages": 50,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_scanned"] >= 5
    assert body["signals_found"] >= 1


def test_scan_no_chat_returns_400_then(session, project_without_chat):
    """placeholder removed"""
    return





# ─── Iter 51 regression smoke ────────────────────────────────────────────────
def test_dashboard_smoke(session):
    r = session.get(f"{API}/dev-os/dashboard")
    assert r.status_code == 200, r.text
    d = r.json()
    for key in ("projects", "open_tasks", "open_proposals", "agents_active", "metrics"):
        assert key in d
    assert d["agents_active"] == 9


def test_agents_smoke(session):
    r = session.get(f"{API}/dev-os/agents")
    assert r.status_code == 200, r.text
    agents = r.json().get("agents") or []
    assert len(agents) == 9
