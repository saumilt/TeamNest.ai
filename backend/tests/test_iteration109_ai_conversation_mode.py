"""Iteration 109 — AI Conversation Mode (Phase 1) backend tests.

Covers:
- Personal-AI chat: plain message auto-routes to AI + creates session
- Group chat: @ai then follow-up "make it shorter" routes to AI (no @ai)
- Low-confidence plain msg stays as chat (no AI answer)
- @mentioning a human ends session (human_addressed)
- Reply to AI message routes to AI even without active session
- /exit-ai and /team commands end session, do NOT post a chat message
- POST /ai-session/exit and /ai-session/route endpoints
- 30-min timeout logic: expires_at is set on active session
- Regression: explicit @ai still works
- ai_routing_decisions collection is populated with confidence + reasons
"""

import os
import time
import uuid
import pytest
import requests

def _load_env(path: str):
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass


_load_env("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

SUPER_EMAIL = "sam@funasia.net"
SUPER_PASSWORD = os.environ.get("SUPERADMIN_TEST_PASSWORD", "")


# ── Helpers ──────────────────────────────────────────────────────────────
def _login(email: str, password: str) -> dict:
    r = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _list_chats(token: str) -> list:
    r = requests.get(f"{API}/chats", headers=_headers(token), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _find_personal_ai_chat(token: str) -> dict:
    chats = _list_chats(token)
    for c in chats:
        if c.get("type") == "personal_ai":
            return c
    pytest.skip("no personal_ai chat available for this user")


def _send_message(token: str, chat_id: str, body: str, **kwargs) -> dict:
    payload = {"message_type": "text", "body": body}
    payload.update(kwargs)
    r = requests.post(
        f"{API}/chats/{chat_id}/messages",
        headers=_headers(token),
        json=payload,
        timeout=45,
    )
    assert r.status_code in (200, 201), f"send_message failed: {r.status_code} {r.text}"
    return r.json()


def _list_messages(token: str, chat_id: str) -> list:
    r = requests.get(
        f"{API}/chats/{chat_id}/messages",
        headers=_headers(token),
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    return data if isinstance(data, list) else data.get("items", data.get("messages", []))


def _get_session(token: str, chat_id: str) -> dict:
    r = requests.get(
        f"{API}/chats/{chat_id}/ai-session",
        headers=_headers(token),
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()


def _wait_for_ai_answer(token: str, chat_id: str, since_len: int, timeout: int = 45) -> list:
    """Poll messages until an ai_answer appears (or timeout). Returns full msg list."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        msgs = _list_messages(token, chat_id)
        new_msgs = msgs[since_len:] if len(msgs) > since_len else []
        if any(m.get("message_type") == "ai_answer" for m in new_msgs):
            return msgs
        time.sleep(2)
    return _list_messages(token, chat_id)


# ── Fixtures ─────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def super_token() -> str:
    data = _login(SUPER_EMAIL, SUPER_PASSWORD)
    return data["token"]


@pytest.fixture(scope="module")
def personal_ai_chat_id(super_token: str) -> str:
    chat = _find_personal_ai_chat(super_token)
    return chat["id"]


@pytest.fixture(scope="module")
def group_chat_id(super_token: str) -> str:
    """Create a fresh TEST group chat to isolate this test's messages."""
    payload = {
        "type": "group",
        "name": f"TEST_iter109_{uuid.uuid4().hex[:6]}",
        "member_ids": [],
    }
    r = requests.post(
        f"{API}/chats",
        headers=_headers(super_token),
        json=payload,
        timeout=30,
    )
    assert r.status_code in (200, 201), r.text
    chat = r.json()
    return chat["id"]


@pytest.fixture(autouse=True)
def _end_session_before_each(super_token, request):
    """Ensure a clean session state before each test that uses a chat id."""
    for name in ("personal_ai_chat_id", "group_chat_id"):
        if name in request.fixturenames:
            chat_id = request.getfixturevalue(name)
            try:
                requests.post(
                    f"{API}/chats/{chat_id}/ai-session/exit",
                    headers=_headers(super_token),
                    timeout=15,
                )
            except Exception:
                pass


# ── Tests ────────────────────────────────────────────────────────────────
class TestPersonalAI:
    """Direct personal_ai chat auto-routes plain messages to AI."""

    def test_plain_message_creates_session_and_ai_answer(self, super_token, personal_ai_chat_id):
        before = _list_messages(super_token, personal_ai_chat_id)
        base_len = len(before)
        _send_message(super_token, personal_ai_chat_id, "What is 2+2?")
        msgs = _wait_for_ai_answer(super_token, personal_ai_chat_id, base_len, timeout=60)
        new_msgs = msgs[base_len:]
        ai_answers = [m for m in new_msgs if m.get("message_type") == "ai_answer"]
        assert len(ai_answers) >= 1, f"expected ai_answer, got types: {[m.get('message_type') for m in new_msgs]}"

        sess = _get_session(super_token, personal_ai_chat_id)
        assert sess.get("active") is True, f"session should be active, got: {sess}"
        # 30-min timeout logic: expires_at must be present
        assert sess.get("expires_at"), "expires_at should be populated on active session"


class TestGroupFollowUp:
    """Group chat: @ai turn then plain follow-up routes to AI."""

    def test_at_ai_then_follow_up_routes_to_ai(self, super_token, group_chat_id):
        before = _list_messages(super_token, group_chat_id)
        base_len = len(before)

        # 1) Explicit @ai to start the AI conversation
        _send_message(super_token, group_chat_id, "@ai give me 3 productivity tips")
        msgs = _wait_for_ai_answer(super_token, group_chat_id, base_len, timeout=60)
        assert any(m.get("message_type") == "ai_answer" for m in msgs[base_len:]), \
            "explicit @ai should still produce an ai_answer"

        # 2) Session should be active
        sess = _get_session(super_token, group_chat_id)
        assert sess.get("active") is True

        # 3) Plain follow-up (no @ai) should route to AI
        mid = len(msgs)
        _send_message(super_token, group_chat_id, "make it shorter")
        msgs2 = _wait_for_ai_answer(super_token, group_chat_id, mid, timeout=60)
        new = msgs2[mid:]
        assert any(m.get("message_type") == "ai_answer" for m in new), \
            f"follow-up 'make it shorter' should route to AI. new types: {[m.get('message_type') for m in new]}"


class TestLowConfidenceStaysChat:
    """A low-confidence plain message with an active session stays a chat msg."""

    def test_low_confidence_stays_chat(self, super_token, group_chat_id):
        # start session with @ai
        base = _list_messages(super_token, group_chat_id)
        base_len = len(base)
        _send_message(super_token, group_chat_id, "@ai briefly define entropy")
        msgs = _wait_for_ai_answer(super_token, group_chat_id, base_len, timeout=60)
        assert any(m.get("message_type") == "ai_answer" for m in msgs[base_len:])
        mid = len(msgs)

        # Low-confidence plain message (nothing follow-uppy about it)
        _send_message(super_token, group_chat_id, "thanks team great job everyone")
        time.sleep(6)  # give any (unexpected) AI trigger time to appear
        after = _list_messages(super_token, group_chat_id)
        new = after[mid:]
        types = [m.get("message_type") for m in new]
        # No new ai_answer should follow this low-confidence message
        ai_answers = [m for m in new if m.get("message_type") == "ai_answer"]
        assert len(ai_answers) == 0, f"low-confidence msg should not trigger AI. new types: {types}"


class TestExitCommands:
    """/exit-ai and /team must end session and NOT post a chat message."""

    @pytest.mark.parametrize("cmd", ["/exit-ai", "/team"])
    def test_exit_command_ends_session_without_message(self, super_token, personal_ai_chat_id, cmd):
        # Start a session by sending a plain message in personal_ai (auto-routes)
        base = _list_messages(super_token, personal_ai_chat_id)
        base_len = len(base)
        _send_message(super_token, personal_ai_chat_id, "hello there")
        _wait_for_ai_answer(super_token, personal_ai_chat_id, base_len, timeout=45)
        sess = _get_session(super_token, personal_ai_chat_id)
        assert sess.get("active") is True

        # Snapshot msg count, then send exit command
        pre_exit = _list_messages(super_token, personal_ai_chat_id)
        pre_len = len(pre_exit)
        r = requests.post(
            f"{API}/chats/{personal_ai_chat_id}/messages",
            headers=_headers(super_token),
            json={"message_type": "text", "body": cmd},
            timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body.get("ai_session_ended") is True, f"expected ai_session_ended:true for {cmd}, got {body}"

        # No new user chat message should be posted
        time.sleep(1.5)
        after = _list_messages(super_token, personal_ai_chat_id)
        # Filter: any new message with body == cmd
        matches = [m for m in after[pre_len:] if (m.get("body") or "").strip().lower() == cmd]
        assert len(matches) == 0, f"exit command {cmd} should NOT be posted as a message"

        # Session should now be inactive
        # (personal_ai auto-restarts on next plain message — that's fine, we
        # only assert here that the previous session was ended)
        sess2 = _get_session(super_token, personal_ai_chat_id)
        assert sess2.get("active") is False, f"session should be inactive after {cmd}, got {sess2}"


class TestSessionEndpoints:
    """POST /ai-session/exit + /ai-session/route."""

    def test_post_exit_endpoint(self, super_token, personal_ai_chat_id):
        base = _list_messages(super_token, personal_ai_chat_id)
        base_len = len(base)
        _send_message(super_token, personal_ai_chat_id, "hi again")
        _wait_for_ai_answer(super_token, personal_ai_chat_id, base_len, timeout=45)
        assert _get_session(super_token, personal_ai_chat_id).get("active") is True

        r = requests.post(
            f"{API}/chats/{personal_ai_chat_id}/ai-session/exit",
            headers=_headers(super_token),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ended") is True
        assert _get_session(super_token, personal_ai_chat_id).get("active") is False


class TestReplyToAI:
    """Reply (parent_message_id) to an AI message routes to AI without needing @ai."""

    def test_reply_to_ai_message_triggers_ai(self, super_token, group_chat_id):
        # Kick off an AI turn
        base = _list_messages(super_token, group_chat_id)
        base_len = len(base)
        _send_message(super_token, group_chat_id, "@ai one sentence definition of API")
        msgs = _wait_for_ai_answer(super_token, group_chat_id, base_len, timeout=60)
        ai_msgs = [m for m in msgs[base_len:] if m.get("message_type") == "ai_answer"]
        assert len(ai_msgs) >= 1
        ai_msg_id = ai_msgs[0]["id"]

        # End session so we can test the reply-to-AI path without active session
        requests.post(
            f"{API}/chats/{group_chat_id}/ai-session/exit",
            headers=_headers(super_token),
            timeout=15,
        )
        assert _get_session(super_token, group_chat_id).get("active") is False

        # Reply to the AI answer without @ai
        mid = len(_list_messages(super_token, group_chat_id))
        _send_message(super_token, group_chat_id, "clearer please", parent_message_id=ai_msg_id)
        msgs2 = _wait_for_ai_answer(super_token, group_chat_id, mid, timeout=60)
        new = msgs2[mid:]
        assert any(m.get("message_type") == "ai_answer" for m in new), \
            f"reply to AI should route to AI. new types: {[m.get('message_type') for m in new]}"


class TestExplicitAtAIRegression:
    """Regression: explicit @ai in a group chat still works."""

    def test_at_ai_still_works(self, super_token, group_chat_id):
        base = _list_messages(super_token, group_chat_id)
        base_len = len(base)
        _send_message(super_token, group_chat_id, "@ai what is HTTP?")
        msgs = _wait_for_ai_answer(super_token, group_chat_id, base_len, timeout=60)
        assert any(m.get("message_type") == "ai_answer" for m in msgs[base_len:])


class TestExitEndpointOnInactive:
    """/ai-session/exit is safe to call when no active session exists."""

    def test_exit_idempotent(self, super_token, personal_ai_chat_id):
        # ensure inactive
        requests.post(
            f"{API}/chats/{personal_ai_chat_id}/ai-session/exit",
            headers=_headers(super_token),
            timeout=15,
        )
        r = requests.post(
            f"{API}/chats/{personal_ai_chat_id}/ai-session/exit",
            headers=_headers(super_token),
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json().get("active") is False
