"""Iteration 67 — RE-TEST of Hire AI Dev Team after critical fixes.

Validates fixes vs iter66:
  1. Status endpoint no longer 502s when proxy 404s on lookup; returns
     200 applied:false for unpaid sessions, 404 for unknown session_id.
  2. HIRE_DEV_TEAM_ROLES now has 13 roles incl. 'growth' (was 12).
  3. Checkout idempotent within 5min — second call returns same session_id.
  4. _provision_dev_team_for_chat seeds BOTH ai-system celebratory AND
     ai-agent-devmgr intro (parity with /chats/dev path).

Plus regressions:
  • @architect in regular chat still triggers ai-agent-architect reply.
  • bare @dev does NOT auto fan-out.
  • GET /dev-chat/roles returns ≥13 roles.
"""

import asyncio
import os
import sys
import time

import pytest
import requests

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break
API = f"{BASE_URL}/api"


# ─── Fixtures ──────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/demo-login", timeout=15)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    s._me = s.get(f"{API}/auth/me", timeout=15).json()
    return s


@pytest.fixture(scope="module")
def fresh_chat(session):
    """Fresh regular chat with no pending payment_transactions."""
    r = session.post(
        f"{API}/chats",
        json={
            "name": f"TEST_iter67_{int(time.time())}",
            "type": "group",
            "member_ids": [session._me["id"]],
        },
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    return r.json()


# ─── Roles manifest ────────────────────────────────────────────────────────
def test_dev_chat_roles_has_13(session):
    r = session.get(f"{API}/dev-chat/roles", timeout=15)
    assert r.status_code == 200
    roles = r.json()
    if isinstance(roles, dict):
        roles = roles.get("roles", [])
    keys = [x.get("key") or x.get("role") for x in roles]
    required = {
        "devmgr", "architect", "frontend", "backend", "database",
        "qa", "security", "devops", "reviewer", "designer",
        "product", "docs", "growth",
    }
    missing = required - set(keys)
    assert not missing, f"missing roles: {missing}; got: {keys}"
    assert len(roles) >= 13, f"expected ≥13 roles, got {len(roles)}"


# ─── Mention regressions in non-development chat ───────────────────────────
def _post_msg(session, chat_id, body):
    r = session.post(f"{API}/chats/{chat_id}/messages", json={"body": body}, timeout=20)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _wait_for_ai(session, chat_id, role, since_ts, timeout_s=45):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        r = session.get(f"{API}/chats/{chat_id}/messages?limit=50", timeout=25)
        if r.status_code == 200:
            msgs = r.json()
            if isinstance(msgs, dict):
                msgs = msgs.get("messages", msgs.get("items", []))
            for m in msgs:
                if (
                    m.get("sender_id") == f"ai-agent-{role}"
                    and m.get("created_at", "") >= since_ts
                ):
                    return m
        time.sleep(2)
    return None


def test_architect_mention_in_regular_chat(session, fresh_chat):
    cid = fresh_chat["id"]
    assert fresh_chat.get("kind") != "development"
    since = time.strftime("%Y-%m-%dT%H:%M:%S")
    _post_msg(session, cid, "@architect outline a todo app architecture please")
    reply = _wait_for_ai(session, cid, "architect", since)
    assert reply is not None, "expected ai-agent-architect reply"


def test_bare_dev_no_fanout(session, fresh_chat):
    cid = fresh_chat["id"]
    since = time.strftime("%Y-%m-%dT%H:%M:%S")
    _post_msg(session, cid, "@dev")
    time.sleep(8)
    r = session.get(f"{API}/chats/{cid}/messages?limit=100", timeout=25)
    msgs = r.json()
    if isinstance(msgs, dict):
        msgs = msgs.get("messages", msgs.get("items", []))
    new_ai = [
        m for m in msgs
        if m.get("sender_id", "").startswith("ai-agent-")
        and m.get("created_at", "") >= since
    ]
    assert len(new_ai) <= 1, f"@dev alone should not fan-out: {[m.get('sender_id') for m in new_ai]}"


# ─── Checkout + idempotency ─────────────────────────────────────────────────
def test_checkout_creates_session(session, fresh_chat):
    r = session.post(
        f"{API}/chats/{fresh_chat['id']}/hire-dev-team/checkout",
        json={"origin_url": BASE_URL},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["url"].startswith("https://")
    assert "stripe.com" in data["url"]
    assert data["session_id"]
    assert data["price_usd"] == 599.0
    session._sid = data["session_id"]
    session._cid = fresh_chat["id"]


def test_checkout_idempotent_within_5min(session):
    """Second checkout within 5 min for same chat returns same session_id."""
    assert hasattr(session, "_sid"), "previous checkout test did not run"
    r = session.post(
        f"{API}/chats/{session._cid}/hire-dev-team/checkout",
        json={"origin_url": BASE_URL},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["session_id"] == session._sid, (
        f"idempotency failed: got new session {data['session_id']} vs {session._sid}"
    )


def _db_client():
    """Fresh motor client per asyncio.run() call to avoid event-loop reuse."""
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        with open("/app/backend/.env") as f:
            for line in f:
                if line.startswith("MONGO_URL=") and not mongo_url:
                    mongo_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                if line.startswith("DB_NAME=") and not db_name:
                    db_name = line.split("=", 1)[1].strip().strip('"').strip("'")
    mongo_url = (mongo_url or "").strip().strip('"').strip("'")
    db_name = (db_name or "").strip().strip('"').strip("'")
    client = AsyncIOMotorClient(mongo_url)
    return client, client[db_name]


def test_only_one_pending_payment_row(session):
    """Verify idempotency at the DB level — only ONE pending row per chat."""
    async def _check():
        client, db = _db_client()
        try:
            rows = await db.payment_transactions.find(
                {"chat_id": session._cid, "plan_id": "hire_dev_team", "status": "pending"},
                {"_id": 0, "session_id": 1, "status": 1},
            ).to_list(10)
            return rows
        finally:
            client.close()
    rows = asyncio.run(_check())
    assert len(rows) == 1, f"expected 1 pending row, got {len(rows)}: {rows}"


# ─── Status endpoint resilience ─────────────────────────────────────────────
def test_status_unknown_session_returns_404(session, fresh_chat):
    r = session.get(
        f"{API}/chats/{fresh_chat['id']}/hire-dev-team/status/cs_unknown_xyz_999",
        timeout=15,
    )
    assert r.status_code == 404
    body = r.json()
    msg = (body.get("detail") or body.get("error") or body.get("message") or "")
    assert "not found" in str(msg).lower() or "transaction" in str(msg).lower()


def test_status_unpaid_returns_200_applied_false(session):
    """KEY FIX: even if proxy 404s on lookup, return 200 applied:false."""
    assert hasattr(session, "_sid"), "previous checkout test did not run"
    r = session.get(
        f"{API}/chats/{session._cid}/hire-dev-team/status/{session._sid}",
        timeout=30,
    )
    assert r.status_code == 200, f"expected 200 not 502 — got {r.status_code} {r.text}"
    data = r.json()
    assert data["applied"] is False
    assert data["session_id"] == session._sid
    assert data["chat_id"] == session._cid


# ─── Provisioning via manual status='completed' flip ────────────────────────
def test_status_provisions_when_locally_completed(session, fresh_chat):
    """Mark payment row as completed locally → next status call provisions
    the team (no Stripe call needed). Verifies devmgr intro + 13 roles."""

    # Fresh chat to avoid collision with idempotency test chat.
    r = session.post(
        f"{API}/chats",
        json={
            "name": f"TEST_iter67_prov_{int(time.time())}",
            "type": "group",
            "member_ids": [session._me["id"]],
        },
        timeout=15,
    )
    assert r.status_code in (200, 201)
    chat = r.json()
    cid = chat["id"]

    rc = session.post(
        f"{API}/chats/{cid}/hire-dev-team/checkout",
        json={"origin_url": BASE_URL},
        timeout=30,
    )
    assert rc.status_code == 200, rc.text
    sid = rc.json()["session_id"]

    # Flip payment row to completed directly in DB.
    async def _flip():
        client, db = _db_client()
        try:
            res = await db.payment_transactions.update_one(
                {"session_id": sid},
                {"$set": {"status": "completed", "payment_status": "paid"}},
            )
            return res.modified_count
        finally:
            client.close()
    modified = asyncio.run(_flip())
    assert modified == 1, "could not flip payment row to completed"

    # Now call status — should provision.
    rs = session.get(f"{API}/chats/{cid}/hire-dev-team/status/{sid}", timeout=30)
    assert rs.status_code == 200, rs.text
    data = rs.json()
    assert data["applied"] is True
    assert data["payment_status"] == "paid"

    # Verify chat state.
    rc2 = session.get(f"{API}/chats/{cid}", timeout=15)
    c = rc2.json()
    assert c["dev_team_hired"] is True
    assert c["kind"] == "development"
    assert isinstance(c.get("bot_role_ids"), list)
    assert len(c["bot_role_ids"]) == 13, f"expected 13 roles, got {len(c['bot_role_ids'])}: {c.get('bot_role_ids')}"
    assert "growth" in c["bot_role_ids"], "growth role missing from bot_role_ids"

    # Verify both ai-system AND ai-agent-devmgr intro messages were seeded.
    rm = session.get(f"{API}/chats/{cid}/messages?limit=50", timeout=15)
    msgs = rm.json()
    if isinstance(msgs, dict):
        msgs = msgs.get("messages", msgs.get("items", []))
    senders = [m.get("sender_id") for m in msgs]
    assert "ai-system" in senders, f"missing ai-system message; got senders: {senders}"
    assert "ai-agent-devmgr" in senders, f"missing ai-agent-devmgr intro; got senders: {senders}"

    # Verify linked dev_project exists.
    rp = session.get(f"{API}/dev-projects", timeout=15)
    if rp.status_code == 200:
        projects = rp.json()
        if isinstance(projects, dict):
            projects = projects.get("projects", projects.get("items", []))
        linked = [p for p in projects if p.get("related_chat_id") == cid]
        assert len(linked) >= 1, "expected linked dev_project for hired chat"
