"""Iteration 66 — Hire AI Dev Team ($599 Stripe) + mention parity in any chat.

Verifies:
  • GET /api/dev-chat/roles returns ≥13 (devmgr + 12 specialists; may include "dev" group)
  • @architect / @qa in NON-development chat triggers ai-agent-* reply
  • Bare @dev does NOT auto-fan-out
  • POST /api/chats/{id}/hire-dev-team/checkout → {url, session_id, price_usd}
  • GET /api/chats/{id}/hire-dev-team/status/{sid} → 404 unknown / 200 unpaid applied=false
  • _provision_dev_team_for_chat directly: sets dev_team_hired=true, kind=development,
    bot_role_ids len 12, linked dev_projects with related_chat_id
"""

import asyncio
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Frontend .env stored relative — fall back to read it.
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

API = f"{BASE_URL}/api"


# ─── Fixtures ──────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/demo-login", timeout=15)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    me = s.get(f"{API}/auth/me", timeout=15).json()
    s._me = me
    return s


@pytest.fixture(scope="module")
def regular_chat(session):
    """Create a fresh regular group chat to test mentions/hire flow."""
    # Use the documented existing chat id if it exists; otherwise create.
    r = session.get(f"{API}/chats/378f1d5f-1943-4e49-b6ac-15698957b4d0", timeout=15)
    if r.status_code == 200 and r.json().get("kind") != "development" and not r.json().get("dev_team_hired"):
        return r.json()
    # Create fresh chat
    r = session.post(
        f"{API}/chats",
        json={
            "name": f"TEST_iter66_{int(time.time())}",
            "type": "group",
            "member_ids": [session._me["id"]],
        },
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    return r.json()


# ─── Tests ──────────────────────────────────────────────────────────────────
def test_dev_chat_roles_manifest(session):
    r = session.get(f"{API}/dev-chat/roles", timeout=15)
    assert r.status_code == 200
    roles = r.json()
    # API returns either a list or {"roles": [...]}
    if isinstance(roles, dict):
        roles = roles.get("roles", [])
    assert isinstance(roles, list)
    keys = [x.get("key") or x.get("role") for x in roles]
    # Must contain devmgr + 12 specialists
    required = {"devmgr", "architect", "frontend", "backend", "qa", "security", "devops"}
    assert required.issubset(set(keys)), f"missing roles: {required - set(keys)}; got {keys}"
    assert len(roles) >= 13, f"expected ≥13 roles, got {len(roles)}: {keys}"


def _post_msg(session, chat_id, body):
    r = session.post(
        f"{API}/chats/{chat_id}/messages",
        json={"body": body},
        timeout=20,
    )
    assert r.status_code in (200, 201), f"post msg failed: {r.status_code} {r.text}"
    return r.json()


def _wait_for_ai_reply(session, chat_id, role, since_ts, timeout_s=30):
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


def test_architect_mention_in_regular_chat(session, regular_chat):
    """@architect in a NON-development chat now triggers ai-agent-architect."""
    chat_id = regular_chat["id"]
    assert regular_chat.get("kind") != "development"
    since = time.strftime("%Y-%m-%dT%H:%M:%S")
    _post_msg(session, chat_id, "@architect please outline a high level system design for a todo app")
    reply = _wait_for_ai_reply(session, chat_id, "architect", since, timeout_s=45)
    assert reply is not None, "Expected ai-agent-architect reply in regular chat"
    assert reply.get("message_type") in ("ai-agent", "ai_agent")


def test_qa_mention_in_regular_chat(session, regular_chat):
    chat_id = regular_chat["id"]
    since = time.strftime("%Y-%m-%dT%H:%M:%S")
    _post_msg(session, chat_id, "@qa write 3 test cases for a login form")
    reply = _wait_for_ai_reply(session, chat_id, "qa", since, timeout_s=45)
    assert reply is not None, "Expected ai-agent-qa reply in regular chat"


def test_bare_dev_does_not_fanout(session, regular_chat):
    chat_id = regular_chat["id"]
    since = time.strftime("%Y-%m-%dT%H:%M:%S")
    _post_msg(session, chat_id, "@dev")
    time.sleep(8)
    r = session.get(f"{API}/chats/{chat_id}/messages?limit=100", timeout=25)
    assert r.status_code == 200
    msgs = r.json()
    if isinstance(msgs, dict):
        msgs = msgs.get("messages", msgs.get("items", []))
    new_ai = [
        m for m in msgs
        if m.get("sender_id", "").startswith("ai-agent-")
        and m.get("created_at", "") >= since
    ]
    # Tolerance: a stray previous fan-out may have leaked timing-wise; what we
    # really care about is that bare `@dev` doesn't itself add a flurry.
    assert len(new_ai) <= 1, f"@dev alone should not fan-out, got {len(new_ai)} ai replies: {[m.get('sender_id') for m in new_ai]}"


def test_hire_dev_team_checkout(session, regular_chat):
    chat_id = regular_chat["id"]
    if regular_chat.get("dev_team_hired"):
        pytest.skip("chat already has team hired")
    r = session.post(
        f"{API}/chats/{chat_id}/hire-dev-team/checkout",
        json={"origin_url": BASE_URL},
        timeout=30,
    )
    assert r.status_code == 200, f"checkout failed: {r.status_code} {r.text}"
    data = r.json()
    assert "url" in data and data["url"].startswith("https://")
    assert "checkout.stripe.com" in data["url"] or "stripe.com" in data["url"]
    assert "session_id" in data and data["session_id"]
    assert data.get("price_usd") == 599.0
    # Stash for next test
    session._hire_session_id = data["session_id"]
    session._hire_chat_id = chat_id


def test_hire_status_unknown_404(session, regular_chat):
    r = session.get(
        f"{API}/chats/{regular_chat['id']}/hire-dev-team/status/cs_unknown_xyz_123",
        timeout=15,
    )
    assert r.status_code == 404


def test_hire_status_unpaid_returns_applied_false(session):
    sid = getattr(session, "_hire_session_id", None)
    cid = getattr(session, "_hire_chat_id", None)
    if not sid:
        pytest.skip("no checkout session created")
    r = session.get(f"{API}/chats/{cid}/hire-dev-team/status/{sid}", timeout=20)
    # Stripe may not have a confirmed unpaid yet; tolerate 502 transient
    if r.status_code == 502:
        pytest.skip(f"Stripe transient: {r.text}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("applied") is False
    assert data.get("session_id") == sid


def test_provision_dev_team_direct():
    """Directly invoke _provision_dev_team_for_chat on a freshly-created chat
    so we can validate the post-payment state without going through Stripe."""
    import sys
    sys.path.insert(0, "/app/backend")
    from motor.motor_asyncio import AsyncIOMotorClient

    async def _run():
        # Login via API to get a fresh chat and the user id
        s = requests.Session()
        s.post(f"{API}/auth/demo-login", timeout=15)
        me = s.get(f"{API}/auth/me", timeout=15).json()
        r = s.post(
            f"{API}/chats",
            json={
                "name": f"TEST_iter66_provision_{int(time.time())}",
                "type": "group",
                "member_ids": [me["id"]],
            },
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text
        chat = r.json()
        chat_id = chat["id"]

        # Directly call provision via importing the route module function.
        # We need a Mongo client tied to the same DB the API uses.
        from routes.chats import _provision_dev_team_for_chat
        result = await _provision_dev_team_for_chat(chat_id, me["id"])
        assert result["chat_id"] == chat_id

        # Verify chat state via API
        r2 = s.get(f"{API}/chats/{chat_id}", timeout=15)
        assert r2.status_code == 200
        c = r2.json()
        assert c.get("dev_team_hired") is True
        assert c.get("kind") == "development"
        assert isinstance(c.get("bot_role_ids"), list)
        assert len(c["bot_role_ids"]) == 12, f"expected 12 roles, got {len(c['bot_role_ids'])}"
        # Linked dev project — check via dev_projects listing
        rp = s.get(f"{API}/dev-projects", timeout=15)
        if rp.status_code == 200:
            projects = rp.json()
            if isinstance(projects, dict):
                projects = projects.get("projects", projects.get("items", []))
            linked = [p for p in projects if p.get("related_chat_id") == chat_id]
            assert len(linked) >= 1, "expected at least one linked dev_project"

        # Idempotency
        result2 = await _provision_dev_team_for_chat(chat_id, me["id"])
        assert result2.get("already_hired") is True

    asyncio.run(_run())
