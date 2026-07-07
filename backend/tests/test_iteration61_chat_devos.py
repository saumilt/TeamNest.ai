"""Iteration 61: Chat-native Dev OS — backend regression.

Covers:
  * GET /api/chats/{id} returns `category` + `linked_dev_project`.
  * PATCH /api/chats/{id}/category (valid + invalid + clear).
  * POST /api/chats/{id}/spin-up-dev-os is idempotent.
  * Slash handlers (`/dev-os new|task|bug|plan|help|<unknown>`).
  * AI auto-suggest after 3+ engineering signals + 24h cooldown.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


# ─── Fixtures ────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def me(session):
    r = session.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 200
    return r.json()


@pytest.fixture
def fresh_group_chat(session, me):
    """Brand-new group chat with no linked project."""
    name = f"TEST_iter61_{uuid.uuid4().hex[:6]}"
    r = session.post(
        f"{API}/chats",
        json={"type": "group", "name": name, "member_ids": [me["id"]]},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()


# ─── GET /api/chats/{id} ─────────────────────────────────────────────────────
class TestGetChat:
    def test_includes_category_and_linked_dev_project_fields(self, session, fresh_group_chat):
        r = session.get(f"{API}/chats/{fresh_group_chat['id']}", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "category" in data
        assert data["category"] is None  # fresh chat
        assert "linked_dev_project" in data
        assert data["linked_dev_project"] is None


# ─── PATCH /api/chats/{id}/category ──────────────────────────────────────────
class TestCategoryPatch:
    def test_set_valid_category(self, session, fresh_group_chat):
        r = session.patch(
            f"{API}/chats/{fresh_group_chat['id']}/category",
            json={"category": "engineering"},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["category"] == "engineering"
        # Verify persistence
        chat = session.get(f"{API}/chats/{fresh_group_chat['id']}").json()
        assert chat["category"] == "engineering"

    def test_each_of_six_categories(self, session, fresh_group_chat):
        for cat in ["engineering", "product", "marketing", "ops", "sales", "general"]:
            r = session.patch(
                f"{API}/chats/{fresh_group_chat['id']}/category",
                json={"category": cat},
                timeout=10,
            )
            assert r.status_code == 200, f"{cat}: {r.text}"
            assert r.json()["category"] == cat

    def test_clear_category(self, session, fresh_group_chat):
        session.patch(
            f"{API}/chats/{fresh_group_chat['id']}/category", json={"category": "ops"}
        )
        r = session.patch(
            f"{API}/chats/{fresh_group_chat['id']}/category",
            json={"category": None},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["category"] is None

    def test_invalid_category_returns_400(self, session, fresh_group_chat):
        r = session.patch(
            f"{API}/chats/{fresh_group_chat['id']}/category",
            json={"category": "not_a_real_cat"},
            timeout=10,
        )
        assert r.status_code == 400


# ─── POST /api/chats/{id}/spin-up-dev-os ─────────────────────────────────────
class TestSpinUpDevOs:
    def test_idempotent_create(self, session, fresh_group_chat):
        chat_id = fresh_group_chat["id"]
        # First call → creates
        r1 = session.post(f"{API}/chats/{chat_id}/spin-up-dev-os", timeout=20)
        assert r1.status_code == 200, r1.text
        body1 = r1.json()
        assert body1["created"] is True
        assert "project" in body1
        project_id = body1["project"]["id"]
        assert body1["project"].get("related_chat_id") == chat_id

        # Second call → returns same project, not re-created
        r2 = session.post(f"{API}/chats/{chat_id}/spin-up-dev-os", timeout=20)
        assert r2.status_code == 200
        body2 = r2.json()
        assert body2["created"] is False
        assert body2["project"]["id"] == project_id

        # GET chat now returns linked_dev_project populated
        chat = session.get(f"{API}/chats/{chat_id}").json()
        assert chat["linked_dev_project"] is not None
        assert chat["linked_dev_project"]["id"] == project_id
        for k in ["name", "status", "health", "version", "open_proposals"]:
            assert k in chat["linked_dev_project"], f"missing key {k}"

    def test_announces_via_system_message(self, session, fresh_group_chat):
        chat_id = fresh_group_chat["id"]
        session.post(f"{API}/chats/{chat_id}/spin-up-dev-os", timeout=20)
        time.sleep(0.5)
        msgs = session.get(f"{API}/chats/{chat_id}/messages?limit=20").json()
        sys_msgs = [m for m in msgs if m.get("sender_id") == "ai-system"]
        assert any("Dev OS" in (m.get("body") or "") for m in sys_msgs)


# ─── Slash commands ──────────────────────────────────────────────────────────
def _send(session, chat_id, body):
    r = session.post(
        f"{API}/chats/{chat_id}/messages",
        json={"message_type": "text", "body": body},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()


def _ai_system_bodies(session, chat_id, since_id=None):
    msgs = session.get(f"{API}/chats/{chat_id}/messages?limit=200").json()
    out = []
    started = since_id is None
    for m in msgs:
        if not started:
            if m["id"] == since_id:
                started = True
            continue
        if m.get("sender_id") == "ai-system":
            out.append(m.get("body") or "")
    return out


class TestSlashCommands:
    def test_help_handler(self, session, fresh_group_chat):
        msg = _send(session, fresh_group_chat["id"], "/dev-os help")
        time.sleep(0.8)
        bodies = _ai_system_bodies(session, fresh_group_chat["id"], since_id=msg["id"])
        assert any("Dev OS commands" in b or "commands" in b.lower() for b in bodies), bodies

    def test_unknown_action_returns_help(self, session, fresh_group_chat):
        msg = _send(session, fresh_group_chat["id"], "/dev-os totallyfake")
        time.sleep(0.8)
        bodies = _ai_system_bodies(session, fresh_group_chat["id"], since_id=msg["id"])
        assert any("commands" in b.lower() or "help" in b.lower() for b in bodies), bodies

    def test_task_without_project_friendly_msg(self, session, fresh_group_chat):
        msg = _send(session, fresh_group_chat["id"], "/dev-os task fix login bug")
        time.sleep(0.8)
        bodies = _ai_system_bodies(session, fresh_group_chat["id"], since_id=msg["id"])
        assert any("No project" in b or "no project" in b.lower() for b in bodies), bodies

    def test_bug_without_project_friendly_msg(self, session, fresh_group_chat):
        msg = _send(session, fresh_group_chat["id"], "/dev-os bug api crashes on null")
        time.sleep(0.8)
        bodies = _ai_system_bodies(session, fresh_group_chat["id"], since_id=msg["id"])
        assert any("no project" in b.lower() for b in bodies), bodies

    def test_plan_without_project_friendly_msg(self, session, fresh_group_chat):
        msg = _send(session, fresh_group_chat["id"], "/dev-os plan")
        time.sleep(0.8)
        bodies = _ai_system_bodies(session, fresh_group_chat["id"], since_id=msg["id"])
        assert any("no project" in b.lower() for b in bodies), bodies

    def test_new_then_task_then_bug_then_plan(self, session, fresh_group_chat):
        chat_id = fresh_group_chat["id"]
        # /dev-os new
        msg1 = _send(session, chat_id, "/dev-os new TEST_iter61_proj")
        time.sleep(1.0)
        bodies = _ai_system_bodies(session, chat_id, since_id=msg1["id"])
        assert any("Created project" in b or "TEST_iter61_proj" in b for b in bodies), bodies

        # /dev-os task
        msg2 = _send(session, chat_id, "/dev-os task implement login")
        time.sleep(1.0)
        bodies = _ai_system_bodies(session, chat_id, since_id=msg2["id"])
        assert any("Added task" in b or "implement login" in b for b in bodies), bodies

        # /dev-os bug
        msg3 = _send(session, chat_id, "/dev-os bug login crashes when email empty")
        time.sleep(1.5)
        bodies = _ai_system_bodies(session, chat_id, since_id=msg3["id"])
        assert any("Bug" in b or "bug logged" in b.lower() for b in bodies), bodies

        # /dev-os plan
        msg4 = _send(session, chat_id, "/dev-os plan")
        time.sleep(1.0)
        bodies = _ai_system_bodies(session, chat_id, since_id=msg4["id"])
        assert any("plan" in b.lower() or "Linked to chat" in b for b in bodies), bodies


# ─── Auto-suggest ────────────────────────────────────────────────────────────
class TestAutoSuggest:
    def test_three_engineering_signals_triggers_suggestion_and_cooldown(self, session, fresh_group_chat):
        chat_id = fresh_group_chat["id"]
        # 3 engineering keyword messages
        _send(session, chat_id, "we have a bug in the API endpoint that I want to ship")
        _send(session, chat_id, "we should ship the new feature this sprint")
        _send(session, chat_id, "the database migration is broken on prod backend")
        time.sleep(2.5)
        msgs = session.get(f"{API}/chats/{chat_id}/messages?limit=200").json()
        sys_msgs = [m for m in msgs if (m.get("metadata") or {}).get("source") == "dev_os_suggest"]
        assert len(sys_msgs) == 1, f"expected exactly 1 dev_os_suggest, got {len(sys_msgs)}"

        # Cooldown: 3 more keyword messages → no new suggestion
        _send(session, chat_id, "another API bug we need to fix")
        _send(session, chat_id, "frontend deploy broken — feature flag wrong")
        _send(session, chat_id, "backend webhook endpoint failing on schema migration")
        time.sleep(2.5)
        msgs = session.get(f"{API}/chats/{chat_id}/messages?limit=200").json()
        sys_msgs = [m for m in msgs if (m.get("metadata") or {}).get("source") == "dev_os_suggest"]
        assert len(sys_msgs) == 1, f"cooldown broken — got {len(sys_msgs)} suggestions"
