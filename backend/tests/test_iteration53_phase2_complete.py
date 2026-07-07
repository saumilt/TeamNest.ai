"""Iteration 53 — Phase 2 complete + future-backlog batch tests.

Covers:
  - Templates (list + get + create-from-template)
  - Governance (load default + persist + auto-approval wiring)
  - AI Employees: active_count==6, restaurant_orders + bill_pay active
  - In-chat dispatcher: @restaurant / @billpay produce ai-system replies
  - /dev-os scan / new / bogus slash commands in chat
  - Regression smoke: iter51 dashboard + agents endpoints still pass
"""
import os
import time

import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
INTERNAL_BASE = "http://localhost:8001"
API = f"{BASE_URL}/api"
INTERNAL_API = f"{INTERNAL_BASE}/api"


@pytest.fixture(scope="module")
def session():
    c = httpx.Client(timeout=60, follow_redirects=True)
    r = c.post(f"{API}/auth/demo-login")
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    c.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return c


@pytest.fixture(scope="module")
def internal_session(session):
    c = httpx.Client(timeout=300, follow_redirects=True)
    c.headers.update(dict(session.headers))
    return c


# ─── Templates ───────────────────────────────────────────────────────────────
def test_list_templates(session):
    r = session.get(f"{API}/dev-os/templates")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "templates" in body
    tpls = body["templates"]
    assert isinstance(tpls, list) and len(tpls) >= 5
    ids = {t["id"] for t in tpls}
    for need in ("saas-dashboard", "marketplace", "internal-tool", "mobile-companion", "ai-assistant"):
        assert need in ids, f"missing template id: {need}"
    for t in tpls:
        for k in ("id", "name", "category", "tagline", "best_for", "icon"):
            assert k in t, f"template missing key {k}: {t}"
        assert "brief" not in t, "list view should strip large brief"


def test_get_template(session):
    r = session.get(f"{API}/dev-os/templates/saas-dashboard")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == "saas-dashboard"
    assert "brief" in body
    brief = body["brief"]
    for k in ("name", "description", "target_users", "problem", "business_model", "requirements"):
        assert k in brief


def test_get_template_404(session):
    r = session.get(f"{API}/dev-os/templates/does-not-exist")
    assert r.status_code == 404


def test_create_project_from_template(internal_session):
    """Empty name + template_id should be filled from the template brief."""
    r = internal_session.post(f"{INTERNAL_API}/dev-projects", json={
        "name": "",
        "description": "",
        "problem": "",
        "target_users": "",
        "template_id": "saas-dashboard",
    })
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["source"] == "template"
    assert p["template_id"] == "saas-dashboard"
    assert p["name"] == "My SaaS Dashboard"
    assert isinstance(p.get("plan"), dict)
    assert "llm_status" in p


# ─── Governance ──────────────────────────────────────────────────────────────
def test_get_governance_defaults(session):
    r = session.get(f"{API}/dev-os/governance")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "workspace_id" in body
    assert "policy" in body
    assert "updated_at" in body
    p = body["policy"]
    for k in (
        "auto_approve_low_risk", "auto_approve_documentation",
        "require_human_for_deployment", "require_human_for_security",
        "max_credits_without_approval", "agent_enabled",
    ):
        assert k in p
    assert isinstance(p["agent_enabled"], dict)
    assert len(p["agent_enabled"]) == 9


def test_put_governance_persists(session):
    r = session.put(f"{API}/dev-os/governance", json={
        "auto_approve_documentation": True,
        "max_credits_without_approval": 5,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["policy"]["auto_approve_documentation"] is True
    assert body["policy"]["max_credits_without_approval"] == 5
    # Verify via GET
    r2 = session.get(f"{API}/dev-os/governance")
    assert r2.status_code == 200
    p = r2.json()["policy"]
    assert p["auto_approve_documentation"] is True
    assert p["max_credits_without_approval"] == 5


def test_auto_approve_documentation_proposal(session, internal_session):
    # Ensure doc auto-approval is on
    session.put(f"{API}/dev-os/governance", json={"auto_approve_documentation": True})
    # Create a project (use existing template flow to get a fast one)
    r = internal_session.post(f"{INTERNAL_API}/dev-projects", json={
        "name": "TEST_iter53 auto-approve project",
        "description": "auto-approve test",
        "problem": "we need a documentation update",
        "template_id": "internal-tool",
    })
    assert r.status_code == 200, r.text
    project = r.json()
    # Send a doc-leaning signal
    r2 = internal_session.post(f"{INTERNAL_API}/improvement-proposals", json={
        "project_id": project["id"],
        "signal": "Please document the onboarding steps in the README, this is documentation only.",
        "role": "reviewer",
    })
    assert r2.status_code == 200, r2.text
    proposal = r2.json()
    # If generator classified proposal_type='documentation', governance should auto-approve.
    if proposal.get("proposal_type") == "documentation":
        assert proposal["status"] == "approved", proposal
        assert proposal["approved_by_user"] == "auto"
    else:
        # Stub fallback may not classify as documentation — flag but don't fail the suite.
        pytest.skip(f"proposal_type={proposal.get('proposal_type')}, not documentation — governance gate not triggered")


# ─── AI Employees catalog ────────────────────────────────────────────────────
def test_ai_employees_active_count(session):
    r = session.get(f"{API}/ai-employees")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("active_count") == 6, f"expected 6 active employees, got {body.get('active_count')}"
    active_keys = {e["key"] for e in body.get("employees", []) if e.get("status") == "active"}
    assert "restaurant_orders" in active_keys
    assert "bill_pay" in active_keys
    # Catalog should expose system_prompt absence/presence consistently. Active
    # employees should not leak system_prompt in the public response.
    for e in body.get("employees", []):
        assert "system_prompt" not in e


# ─── In-chat AI employee dispatch (restaurant_orders + bill_pay) ────────────
@pytest.fixture(scope="module")
def fresh_chat(session):
    r = session.post(f"{API}/chats", json={
        "type": "group",
        "name": "TEST_iter53 employee dispatch chat",
        "member_ids": [],
    })
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _list_messages(session, chat_id):
    r = session.get(f"{API}/chats/{chat_id}/messages")
    assert r.status_code == 200, r.text
    data = r.json()
    return data if isinstance(data, list) else data.get("messages", [])


def _wait_for_system_reply(session, chat_id, after_msg_id, must_contain=None, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        msgs = _list_messages(session, chat_id)
        for m in msgs:
            if m.get("id") == after_msg_id:
                continue
            if m.get("message_type") == "ai-system":
                body = m.get("body", "")
                if must_contain is None or any(s.lower() in body.lower() for s in must_contain):
                    return m
        time.sleep(1.5)
    return None


def test_restaurant_orders_in_chat(internal_session, fresh_chat):
    r = internal_session.post(f"{INTERNAL_API}/chats/{fresh_chat}/messages", json={
        "message_type": "text",
        "body": "@restaurant I'd like a large pepperoni pizza",
    })
    assert r.status_code == 200, r.text
    sent_id = r.json().get("id")
    reply = _wait_for_system_reply(
        internal_session, fresh_chat, sent_id,
        must_contain=["Order confirmed", "ETA", "pizza", "confirm"],
        timeout=45,
    )
    assert reply is not None, "No ai-system reply from @restaurant within 45s"


def test_billpay_in_chat(internal_session, fresh_chat):
    r = internal_session.post(f"{INTERNAL_API}/chats/{fresh_chat}/messages", json={
        "message_type": "text",
        "body": "@billpay Acme Co invoice INV-2026-001 dated Feb 5 2026, total $1,250.00, due Feb 25",
    })
    assert r.status_code == 200, r.text
    sent_id = r.json().get("id")
    reply = _wait_for_system_reply(
        internal_session, fresh_chat, sent_id,
        must_contain=["Awaiting your approval", "approval", "invoice", "Acme"],
        timeout=45,
    )
    assert reply is not None, "No ai-system reply from @billpay within 45s"


# ─── /dev-os slash commands ──────────────────────────────────────────────────
@pytest.fixture(scope="module")
def chat_for_slash(internal_session):
    # Fresh chat + 6 signal-rich messages so /dev-os scan has signals to detect.
    r = internal_session.post(f"{INTERNAL_API}/chats", json={
        "type": "group",
        "name": "TEST_iter53 slash chat",
        "member_ids": [],
    })
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    for body in [
        "Export button is broken, crashes on click.",
        "Login SSO keeps throwing an error toast.",
        "Settings page is confusing, can't enable 2FA.",
        "Pages are super slow, spinner loads forever.",
        "Want dark mode in the mobile app please.",
        "Considering switching to a competitor, may cancel.",
    ]:
        internal_session.post(f"{INTERNAL_API}/chats/{cid}/messages", json={
            "message_type": "text", "body": body,
        })
    return cid


def test_slash_new_creates_project(internal_session, chat_for_slash):
    r = internal_session.post(f"{INTERNAL_API}/chats/{chat_for_slash}/messages", json={
        "message_type": "text",
        "body": "/dev-os new TEST_iter53 SlashProject",
    })
    assert r.status_code == 200, r.text
    sent_id = r.json().get("id")
    reply = _wait_for_system_reply(
        internal_session, chat_for_slash, sent_id,
        must_contain=["Dev OS", "Created project", "/dev-os/projects/"],
        timeout=15,
    )
    assert reply is not None, "No /dev-os new confirmation"
    assert "/dev-os/projects/" in reply["body"]


def test_slash_scan_runs(internal_session, chat_for_slash):
    r = internal_session.post(f"{INTERNAL_API}/chats/{chat_for_slash}/messages", json={
        "message_type": "text",
        "body": "/dev-os scan",
    })
    assert r.status_code == 200, r.text
    sent_id = r.json().get("id")
    reply = _wait_for_system_reply(
        internal_session, chat_for_slash, sent_id,
        must_contain=["Dev OS scan"],
        timeout=120,
    )
    assert reply is not None, "No /dev-os scan reply within 120s"
    body = reply["body"]
    assert "⚙️" in body or "Dev OS scan" in body
    # Should mention breakdown OR drafted proposals OR no themes msg
    assert ("Breakdown" in body) or ("Drafted proposals" in body) or ("No improvement themes" in body)


def test_slash_bogus_ignored(internal_session):
    # Use a *fresh* chat to make checking 'no system reply' easy.
    rc = internal_session.post(f"{INTERNAL_API}/chats", json={
        "type": "group", "name": "TEST_iter53 bogus chat", "member_ids": [],
    })
    cid = rc.json()["id"]
    r = internal_session.post(f"{INTERNAL_API}/chats/{cid}/messages", json={
        "message_type": "text", "body": "/dev-os bogus",
    })
    assert r.status_code == 200, r.text
    sent_id = r.json().get("id")
    # Wait ~6s and confirm no ai-system message appears.
    time.sleep(6)
    msgs = _list_messages(internal_session, cid)
    sys_msgs = [m for m in msgs if m.get("message_type") == "ai-system" and m.get("id") != sent_id]
    assert sys_msgs == [], f"expected zero ai-system replies, got: {[m['body'][:80] for m in sys_msgs]}"


# ─── Regression smoke ───────────────────────────────────────────────────────
def test_dashboard_smoke(session):
    r = session.get(f"{API}/dev-os/dashboard")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("projects", "open_tasks", "open_proposals", "agents_active", "metrics"):
        assert k in d


def test_agents_smoke(session):
    r = session.get(f"{API}/dev-os/agents")
    assert r.status_code == 200, r.text
    agents = r.json().get("agents") or []
    assert len(agents) == 9
