"""Backend tests for Enterprise Role Intelligence P2 — Knowledge Capture →
Proposed Memory Review queue.

Covers:
- POST /api/enterprise/roles/{role_id}/capture (paste text)
- POST /api/enterprise/roles/{role_id}/capture (via chat_id)
- Empty payload → 400; unknown role → 404
- GET  /api/enterprise/memories/review (proposed queue + pending_count)
- POST /api/enterprise/memories/{mid}/decide (approve / reject / bad decision / unknown id)
- Closed loop: approved captured knowledge appears in Ask Role answer with [S#] and no personal names
- REGRESSION: inline @ai in chat still posts an AI answer (context-aware)
- REGRESSION: AI employee sandbox POST still returns a reply
"""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

OWNER_EMAIL = "sam@funasia.net"
OWNER_PASS = "Perfect$2008"

FORBIDDEN_NAMES = ["Raj", "Priya", "Amit"]


@pytest.fixture(scope="module")
def owner_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": OWNER_EMAIL, "password": OWNER_PASS}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    s.headers.update({"Authorization": f"Bearer {tok}"})
    # Ensure enterprise seed present.
    p = s.get(f"{BASE_URL}/api/enterprise/people", timeout=30)
    assert p.status_code == 200, p.text
    return s


@pytest.fixture(scope="module")
def roles(owner_client):
    r = owner_client.get(f"{BASE_URL}/api/enterprise/roles", timeout=30)
    assert r.status_code == 200, r.text
    rs = r.json().get("roles") or []
    assert len(rs) >= 3, f"expected ≥3 seeded roles, got {len(rs)}"
    return {x["role_name"]: x for x in rs}


# ─── Capture: paste-text path ───────────────────────────────────────────────
def test_capture_text_creates_proposed_memories(owner_client, roles):
    role = roles.get("Finance Director") or list(roles.values())[0]
    text = (
        "When a vendor invoice is disputed we hold payment for 5 business days, "
        "email the vendor with a clarifying note, and cc our external accountant. "
        "The dispute is logged in the AP tracker with a screenshot of the original PO. "
        "For amounts above $10,000 we escalate to the CFO before releasing payment. "
        "Historically we found that vendors who dispute invoices twice in a quarter "
        "should be flagged for a payment-terms renegotiation."
    )
    r = owner_client.post(
        f"{BASE_URL}/api/enterprise/roles/{role['id']}/capture",
        json={"text": text}, timeout=90,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "proposed" in data and "memories" in data
    assert 1 <= data["proposed"] <= 3, f"expected 1-3 memories, got {data['proposed']}"
    for m in data["memories"]:
        assert m["approval_status"] == "proposed"
        assert m["role_id"] == role["id"]
        assert m["source_type"] == "Manual"
        blob = f"{m['title']} {m['content']}"
        for name in FORBIDDEN_NAMES:
            assert name not in blob, f"personal name '{name}' leaked into memory: {blob[:200]}"
    # Save the last proposed id for later approve-cycle tests via shared state.
    pytest._p2_proposed = data["memories"][0]


def test_capture_empty_returns_400(owner_client, roles):
    role = list(roles.values())[0]
    r = owner_client.post(
        f"{BASE_URL}/api/enterprise/roles/{role['id']}/capture",
        json={"text": ""}, timeout=30,
    )
    assert r.status_code == 400, r.text


def test_capture_unknown_role_returns_404(owner_client):
    r = owner_client.post(
        f"{BASE_URL}/api/enterprise/roles/does-not-exist/capture",
        json={"text": "anything"}, timeout=30,
    )
    assert r.status_code == 404, r.text


# ─── Capture: from chat_id ──────────────────────────────────────────────────
@pytest.fixture(scope="module")
def a_chat(owner_client):
    """Grab or create a chat the owner participates in."""
    r = owner_client.get(f"{BASE_URL}/api/chats", timeout=30)
    if r.status_code == 200:
        body = r.json()
        chats = body if isinstance(body, list) else (body.get("chats") or [])
        if chats:
            return chats[0]
    # Fallback: create one
    r = owner_client.post(f"{BASE_URL}/api/chats",
                          json={"name": "P2 capture test", "type": "group", "member_ids": []},
                          timeout=30)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _post_msg(client, chat_id, body):
    return client.post(
        f"{BASE_URL}/api/chats/{chat_id}/messages",
        json={"body": body, "message_type": "text"}, timeout=30,
    )


def test_capture_from_chat(owner_client, roles, a_chat):
    # Seed the chat with a couple of substantive messages first.
    _post_msg(owner_client, a_chat["id"],
              "For the weekly close we lock the AP module by Thursday 5pm and run the reconciliation script overnight.")
    _post_msg(owner_client, a_chat["id"],
              "If a bank statement is missing we pull it manually from the portal and log the retrieval in the audit sheet.")
    time.sleep(1)
    role = list(roles.values())[0]
    r = owner_client.post(
        f"{BASE_URL}/api/enterprise/roles/{role['id']}/capture",
        json={"chat_id": a_chat["id"]}, timeout=90,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    # LLM may occasionally return zero; guard but still assert shape.
    assert "proposed" in data and "memories" in data
    if data["proposed"] > 0:
        assert data["memories"][0]["source_type"] == "TeamNest chat"
        assert data["memories"][0]["source_id"] == a_chat["id"]
        assert data["memories"][0]["approval_status"] == "proposed"


def test_capture_from_unknown_chat_404(owner_client, roles):
    role = list(roles.values())[0]
    r = owner_client.post(
        f"{BASE_URL}/api/enterprise/roles/{role['id']}/capture",
        json={"chat_id": "no-such-chat-xyz"}, timeout=30,
    )
    assert r.status_code == 404, r.text


# ─── Review queue ────────────────────────────────────────────────────────────
def test_review_queue_has_proposed(owner_client):
    r = owner_client.get(f"{BASE_URL}/api/enterprise/memories/review?status=proposed", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "memories" in data and "pending_count" in data
    assert isinstance(data["pending_count"], int)
    assert data["pending_count"] >= 1, "expected at least one proposed after capture tests"
    m = data["memories"][0]
    for k in ("id", "role_id", "role_name", "approval_status", "title", "content", "memory_type"):
        assert k in m, f"missing field {k} in review entry"
    assert m["approval_status"] == "proposed"


# ─── Decide: approve / reject / errors ──────────────────────────────────────
def test_decide_unknown_id_404(owner_client):
    r = owner_client.post(f"{BASE_URL}/api/enterprise/memories/does-not-exist/decide",
                          json={"decision": "approve"}, timeout=30)
    assert r.status_code == 404, r.text


def test_decide_bad_decision_400(owner_client):
    # need a real memory id
    q = owner_client.get(f"{BASE_URL}/api/enterprise/memories/review", timeout=30).json()
    assert q.get("memories"), "no proposed memories to decide against"
    mid = q["memories"][0]["id"]
    r = owner_client.post(f"{BASE_URL}/api/enterprise/memories/{mid}/decide",
                          json={"decision": "maybe"}, timeout=30)
    assert r.status_code == 400, r.text


def test_reject_flow_removes_from_proposed(owner_client):
    q = owner_client.get(f"{BASE_URL}/api/enterprise/memories/review", timeout=30).json()
    assert q.get("memories")
    victim = q["memories"][-1]  # take the oldest to leave newer ones for approve test
    r = owner_client.post(f"{BASE_URL}/api/enterprise/memories/{victim['id']}/decide",
                          json={"decision": "reject"}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json().get("approval_status") == "rejected"
    q2 = owner_client.get(f"{BASE_URL}/api/enterprise/memories/review", timeout=30).json()
    assert all(x["id"] != victim["id"] for x in q2.get("memories", [])), \
        "rejected memory still appears in proposed queue"


def test_approve_flow_adds_to_role_knowledge(owner_client):
    q = owner_client.get(f"{BASE_URL}/api/enterprise/memories/review", timeout=30).json()
    assert q.get("memories"), "no proposed memories to approve"
    m = q["memories"][0]
    mid, role_id = m["id"], m["role_id"]
    # Approve with an edited title to also verify field passthrough.
    r = owner_client.post(
        f"{BASE_URL}/api/enterprise/memories/{mid}/decide",
        json={"decision": "approve", "title": "P2 approved: disputed vendor invoices"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("approval_status") == "approved"
    # Confirm the memory now appears in the role's memories with approved status.
    rr = owner_client.get(f"{BASE_URL}/api/enterprise/roles/{role_id}/memories", timeout=30)
    assert rr.status_code == 200, rr.text
    mems = rr.json().get("memories") or []
    approved = [x for x in mems if x["id"] == mid]
    assert approved, "approved memory not found on role"
    assert approved[0]["approval_status"] == "approved"
    assert approved[0]["title"] == "P2 approved: disputed vendor invoices"
    pytest._p2_approved_role_id = role_id


# ─── Closed loop: Ask Role uses the new approved knowledge ──────────────────
def test_ask_role_uses_newly_approved_knowledge(owner_client):
    role_id = getattr(pytest, "_p2_approved_role_id", None)
    assert role_id, "prior test did not stash an approved role id"
    r = owner_client.post(
        f"{BASE_URL}/api/enterprise/roles/{role_id}/ask",
        json={"question": "How do we handle a disputed vendor invoice?"}, timeout=90,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    ans = (data.get("answer") or "")
    assert ans, "empty answer"
    # No personal names must leak into Ask Role answers.
    for name in FORBIDDEN_NAMES:
        assert name not in ans, f"personal name '{name}' leaked into Ask Role: {ans[:200]}"
    # Grounded + citations expected — the newly approved memory should be reachable.
    assert data.get("grounded") is True, f"expected grounded=True, got {data}"
    assert re.search(r"\[S\d+\]", ans), f"no [S#] citation in answer: {ans[:200]}"


# ─── REGRESSION: inline @ai in chat ─────────────────────────────────────────
def test_inline_ai_in_chat_still_posts_answer(owner_client, a_chat):
    body = "@ai what is 2 + 2? one short sentence."
    r = _post_msg(owner_client, a_chat["id"], body)
    assert r.status_code in (200, 201), r.text
    # Poll for the AI answer message (background task).
    deadline = time.time() + 40
    found = None
    while time.time() < deadline:
        m = owner_client.get(f"{BASE_URL}/api/chats/{a_chat['id']}/messages?limit=30", timeout=15)
        if m.status_code == 200:
            body = m.json()
            msgs = body if isinstance(body, list) else (body.get("messages") or [])
            for x in msgs:
                mt = x.get("message_type")
                if mt in ("ai_answer", "ai_question"):
                    meta = x.get("metadata") or {}
                    if meta.get("status") == "complete" or (x.get("body") and mt == "ai_answer"):
                        found = x
                        break
        if found:
            break
        time.sleep(2)
    assert found, "no AI answer message appeared for @ai command within 40s"


# ─── REGRESSION: AI employee sandbox reply ──────────────────────────────────
def test_ai_employee_sandbox_still_replies(owner_client):
    # Find a saved AI employee in this workspace; if none, skip.
    r = owner_client.get(f"{BASE_URL}/api/ai-builder/employees", timeout=30)
    if r.status_code != 200:
        pytest.skip(f"ai-builder employees list unavailable: {r.status_code}")
    emps = r.json().get("employees") or r.json() or []
    if not emps:
        pytest.skip("no AI employees to sandbox in this workspace")
    eid = emps[0]["id"]
    r = owner_client.post(
        f"{BASE_URL}/api/ai-builder/employees/{eid}/sandbox",
        json={"message": "Give me a one-line greeting."}, timeout=90,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    reply = (data.get("ai_response") or data.get("reply") or "").strip()
    assert reply, f"empty sandbox reply: {data}"
