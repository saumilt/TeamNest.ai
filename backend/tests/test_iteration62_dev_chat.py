"""Iteration 62 — Dev Chat v1 (Emergent-style collaborative dev inside chats).

Covers:
- POST /api/chats/dev (creates chat + project + 2 system messages)
- GET  /api/chats/{id} returns kind + bot_role_ids + category + linked_dev_project
- GET  /api/dev-chat/roles returns 14-row manifest
- POST /api/chats/{id}/messages with @architect/@qa/@devmgr/@dev triggers agents
- Non-dev chat with @architect must NOT trigger agents (kind guard)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

DEMO_EMAIL = "amit@demo.team"
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "DemoPass123!")


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="session")
def me(session):
    r = session.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def dev_chat(session):
    """Create a fresh dev chat for the entire module."""
    r = session.post(
        f"{BASE_URL}/api/chats/dev",
        json={"name": f"TEST_iter62_dev_chat_{int(time.time())}"},
        timeout=30,
    )
    assert r.status_code == 200, f"create dev chat failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "chat" in data and "project" in data
    return data


@pytest.fixture(scope="session")
def normal_chat(session, me):
    """Create a non-dev (regular) group chat for guard testing."""
    r = session.post(
        f"{BASE_URL}/api/chats",
        json={
            "type": "group",
            "name": f"TEST_iter62_normal_{int(time.time())}",
            "member_ids": [me["id"]],
        },
        timeout=20,
    )
    assert r.status_code == 200, f"create normal chat: {r.status_code} {r.text[:300]}"
    return r.json()


# ─── POST /api/chats/dev ────────────────────────────────────────────────────
class TestCreateDevChat:
    def test_create_returns_chat_and_project(self, dev_chat):
        chat = dev_chat["chat"]
        proj = dev_chat["project"]

        assert chat["kind"] == "development"
        assert chat["category"] == "engineering"
        assert chat["bot_role_ids"] == ["devmgr"]
        assert chat["type"] == "group"
        assert "id" in chat and chat["id"]

        assert proj["related_chat_id"] == chat["id"]
        assert proj["category"] == "engineering"
        assert proj["source"] == "dev_chat"
        assert proj["name"] == chat["name"]

    def test_create_posts_two_system_messages(self, session, dev_chat):
        chat_id = dev_chat["chat"]["id"]
        # Welcome system + Dev Manager intro
        r = session.get(f"{BASE_URL}/api/chats/{chat_id}/messages", timeout=15)
        assert r.status_code == 200
        msgs = r.json()
        # The two seed messages should be there.
        assert len(msgs) >= 2
        senders = {m.get("sender_id") for m in msgs}
        assert "ai-system" in senders, f"seed system msg missing: senders={senders}"
        assert "ai-agent-devmgr" in senders, f"devmgr intro missing: senders={senders}"


# ─── GET /api/chats/{id} ────────────────────────────────────────────────────
class TestGetChatShape:
    def test_dev_chat_returns_new_fields(self, session, dev_chat):
        chat_id = dev_chat["chat"]["id"]
        r = session.get(f"{BASE_URL}/api/chats/{chat_id}", timeout=15)
        assert r.status_code == 200
        c = r.json()
        assert c["kind"] == "development"
        assert c["bot_role_ids"] == ["devmgr"]
        assert c["category"] == "engineering"
        assert c.get("linked_dev_project") is not None
        lp = c["linked_dev_project"]
        assert lp["id"] == dev_chat["project"]["id"]
        assert "status" in lp and "health" in lp and "version" in lp

    def test_normal_chat_defaults(self, session, normal_chat):
        r = session.get(f"{BASE_URL}/api/chats/{normal_chat['id']}", timeout=15)
        assert r.status_code == 200
        c = r.json()
        assert c.get("kind") in ("group", "development", None) and c["kind"] != "development"
        assert c.get("bot_role_ids", []) == []


# ─── GET /api/dev-chat/roles ────────────────────────────────────────────────
class TestRolesManifest:
    def test_returns_14_rows(self, session):
        r = session.get(f"{BASE_URL}/api/dev-chat/roles", timeout=10)
        assert r.status_code == 200
        roles = r.json().get("roles", [])
        assert len(roles) == 14, f"expected 14 roles, got {len(roles)}"

        keys = {row["key"] for row in roles}
        # devmgr + dev (group) + 12 specialists
        expected = {
            "devmgr", "dev",
            "architect", "frontend", "backend", "database",
            "qa", "security", "devops", "reviewer",
            "designer", "product", "docs", "growth",
        }
        assert keys == expected, f"keys mismatch: {keys ^ expected}"

        # Shape of each row
        sample = roles[0]
        for field in ("key", "trigger", "label", "desc", "badge", "color", "is_group"):
            assert field in sample, f"missing field {field} in {sample}"

        # The `dev` row must be flagged as group
        dev_row = next(r for r in roles if r["key"] == "dev")
        assert dev_row["is_group"] is True
        assert dev_row["trigger"] == "@dev"

        # devmgr must NOT be group
        devmgr_row = next(r for r in roles if r["key"] == "devmgr")
        assert devmgr_row["is_group"] is False


# ─── Mention dispatch (real LLM, allow ~15s) ────────────────────────────────
def _send_and_wait_for_agent(session, chat_id, body, role_keys, timeout=25):
    """Send a message, then poll the chat for ai-agent-* replies for the
    given role keys. Returns the set of role_keys actually seen."""
    r = session.post(
        f"{BASE_URL}/api/chats/{chat_id}/messages",
        json={"body": body, "message_type": "text"},
        timeout=15,
    )
    assert r.status_code == 200, f"post msg failed: {r.status_code} {r.text[:200]}"
    trigger_id = r.json()["id"]

    deadline = time.time() + timeout
    seen = set()
    expected_senders = {f"ai-agent-{rk}" for rk in role_keys}
    while time.time() < deadline:
        time.sleep(2)
        try:
            rr = session.get(f"{BASE_URL}/api/chats/{chat_id}/messages?limit=200", timeout=30)
        except requests.exceptions.RequestException:
            continue
        if rr.status_code != 200:
            continue
        msgs = rr.json()
        # We only care about replies that came AFTER our trigger.
        # Use parent_message_id == trigger_id OR sender in expected set + created after trigger.
        for m in msgs:
            if m.get("sender_id") in expected_senders:
                # Only count if its created_at is >= trigger (i.e., not the pre-existing intro)
                if m.get("parent_message_id") == trigger_id or m.get("id") != trigger_id:
                    role = (m.get("metadata") or {}).get("role")
                    if role in role_keys:
                        seen.add(role)
        if seen >= role_keys:
            return seen, msgs, trigger_id
    return seen, [], trigger_id


class TestSpecialistMention:
    def test_at_architect_triggers_architect(self, session, dev_chat):
        chat_id = dev_chat["chat"]["id"]
        seen, msgs, trigger_id = _send_and_wait_for_agent(
            session, chat_id, "@architect quick: data model for a todo app?",
            role_keys={"architect"}, timeout=30,
        )
        assert "architect" in seen, f"architect reply did not arrive within 30s"
        # Body shape check: must start with 🏗️ **Architect** ·
        arch_msg = next(
            m for m in msgs
            if m.get("sender_id") == "ai-agent-architect"
            and m.get("parent_message_id") == trigger_id
        )
        assert arch_msg["body"].startswith("🏗️ **Architect** ·"), arch_msg["body"][:100]
        assert (arch_msg.get("metadata") or {}).get("role") == "architect"

    def test_at_qa_triggers_qa(self, session, dev_chat):
        chat_id = dev_chat["chat"]["id"]
        seen, msgs, trigger_id = _send_and_wait_for_agent(
            session, chat_id, "@qa write tests for login",
            role_keys={"qa"}, timeout=30,
        )
        assert "qa" in seen

    def test_at_devmgr_triggers_devmgr(self, session, dev_chat):
        chat_id = dev_chat["chat"]["id"]
        seen, msgs, trigger_id = _send_and_wait_for_agent(
            session, chat_id, "@devmgr what's next?",
            role_keys={"devmgr"}, timeout=30,
        )
        assert "devmgr" in seen


class TestDevGroupFanout:
    def test_at_dev_fans_out_to_8(self, session, dev_chat):
        chat_id = dev_chat["chat"]["id"]
        dev_roles = {"architect", "frontend", "backend", "database",
                     "qa", "security", "devops", "reviewer"}
        seen, msgs, trigger_id = _send_and_wait_for_agent(
            session, chat_id, "@dev kickoff — single sentence per role",
            role_keys=dev_roles, timeout=60,
        )
        missing = dev_roles - seen
        assert not missing, f"missing dev roles after @dev fan-out: {missing}"


class TestNonDevChatGuard:
    def test_at_architect_in_normal_chat_does_not_trigger(self, session, normal_chat):
        chat_id = normal_chat["id"]
        # Send the mention. Wait 8s. Verify NO ai-agent-architect message exists.
        r = session.post(
            f"{BASE_URL}/api/chats/{chat_id}/messages",
            json={"body": "@architect this should be ignored", "message_type": "text"},
            timeout=30,
        )
        assert r.status_code == 200
        time.sleep(8)
        msgs = session.get(
            f"{BASE_URL}/api/chats/{chat_id}/messages?limit=200", timeout=30
        ).json()
        bad = [m for m in msgs if (m.get("sender_id") or "").startswith("ai-agent-")]
        assert not bad, f"non-dev chat fired agents: {[m['sender_id'] for m in bad]}"
