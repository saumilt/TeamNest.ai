"""Iteration 159 — Backend tests for Read Receipts + Partial AI streaming.

Features covered:
- GET /api/chats/{chat_id}/read-state  → {states: {user_id: {read_at, delivered_at}}}
- POST /api/chats/{chat_id}/read       → sets last_read_at + last_delivered_at
- GET /api/chats/{chat_id}/messages    → advances last_delivered_at when new msg
- POST /api/chats/{chat_id}/messages   → @ai multi-model partials streaming
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- Fixtures ----------
def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login for {email} failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def amit():
    # Super admin — unlimited AI credits
    return _login("amit@demo.team", "Demo@2026")


@pytest.fixture(scope="module")
def raj():
    return _login("raj@demo.team", "Demo@2026")


@pytest.fixture(scope="module")
def direct_chat(amit, raj):
    """Return a direct chat containing both amit and raj."""
    me = amit.get(f"{API}/auth/me", timeout=10).json()
    other = raj.get(f"{API}/auth/me", timeout=10).json()
    r = amit.get(f"{API}/chats", timeout=15)
    assert r.status_code == 200
    chats = r.json()
    # look for existing direct chat with raj
    for c in chats:
        if c.get("kind") == "direct" and other["id"] in (c.get("member_ids") or []):
            return c["id"], me["id"], other["id"]
    # otherwise create — API uses "type" (not "kind") for creation
    r = amit.post(
        f"{API}/chats",
        json={"type": "direct", "kind": "direct", "member_ids": [me["id"], other["id"]]},
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"], me["id"], other["id"]


@pytest.fixture(scope="module")
def group_chat(amit):
    """Return a group chat that amit is a member of (Marketing Site Refresh preferred)."""
    r = amit.get(f"{API}/chats", timeout=15)
    assert r.status_code == 200
    chats = r.json()
    for c in chats:
        if c.get("kind") == "group" and "marketing" in (c.get("title") or "").lower():
            return c["id"]
    for c in chats:
        if c.get("kind") == "group":
            return c["id"]
    pytest.skip("No group chat available")


# ---------- Read state / read receipts ----------
class TestReadState:
    def test_read_state_returns_states_map(self, amit, direct_chat):
        chat_id, _, _ = direct_chat
        r = amit.get(f"{API}/chats/{chat_id}/read-state", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "states" in data and isinstance(data["states"], dict)

    def test_read_state_forbidden_when_not_member(self, raj):
        # raj is not a member of a random chat id
        r = raj.get(f"{API}/chats/does-not-exist-{uuid.uuid4()}/read-state", timeout=10)
        assert r.status_code == 404

    def test_post_read_updates_state_and_persists(self, amit, direct_chat):
        chat_id, me_id, _ = direct_chat
        r = amit.post(f"{API}/chats/{chat_id}/read", timeout=15)
        assert r.status_code == 200 and r.json().get("ok") is True

        r = amit.get(f"{API}/chats/{chat_id}/read-state", timeout=10)
        assert r.status_code == 200
        s = r.json()["states"].get(me_id) or {}
        assert s.get("read_at"), f"expected read_at set, got {s}"
        assert s.get("delivered_at"), f"expected delivered_at set, got {s}"


# ---------- Delivery via GET messages ----------
class TestDeliveryAdvance:
    def test_get_messages_advances_delivered(self, amit, raj, direct_chat):
        chat_id, me_id, other_id = direct_chat
        # amit sends a message
        payload = {"chat_id": chat_id, "body": f"TEST_delivered_{uuid.uuid4().hex[:6]}"}
        r = amit.post(f"{API}/chats/{chat_id}/messages", json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text

        # raj lists messages → his last_delivered_at should advance
        r = raj.get(f"{API}/chats/{chat_id}/messages", timeout=15)
        assert r.status_code == 200
        time.sleep(0.5)

        # inspect via read-state
        r = raj.get(f"{API}/chats/{chat_id}/read-state", timeout=10)
        assert r.status_code == 200
        raj_state = r.json()["states"].get(other_id) or {}
        assert raj_state.get("delivered_at"), f"raj's delivered_at not advanced: {raj_state}"

    def test_get_messages_delivered_idempotent(self, raj, direct_chat):
        chat_id, _, other_id = direct_chat
        r1 = raj.get(f"{API}/chats/{chat_id}/read-state", timeout=10).json()
        d1 = (r1["states"].get(other_id) or {}).get("delivered_at")
        # call messages again — no new sender messages so delivered_at should NOT change
        raj.get(f"{API}/chats/{chat_id}/messages", timeout=15)
        r2 = raj.get(f"{API}/chats/{chat_id}/read-state", timeout=10).json()
        d2 = (r2["states"].get(other_id) or {}).get("delivered_at")
        assert d1 == d2, f"delivered_at re-advanced when idempotent: {d1} -> {d2}"


# ---------- Multi-model @ai partials streaming ----------
def _wait_for_ai_answer(session, chat_id: str, after_id: str, timeout: float = 90.0):
    """Poll GET messages until an ai_answer whose thread relates to after_id shows up."""
    start = time.time()
    partial_seen = False
    partial_total_seen = 0
    last_msgs = []
    while time.time() - start < timeout:
        try:
            r = session.get(f"{API}/chats/{chat_id}/messages?limit=200", timeout=30)
        except requests.exceptions.RequestException:
            time.sleep(1.0)
            continue
        if r.status_code == 200:
            msgs = r.json()
            last_msgs = msgs
            marker_idx = next((i for i, m in enumerate(msgs) if m.get("id") == after_id), -1)
            if marker_idx >= 0:
                tail = msgs[marker_idx + 1 :]
                for m in tail:
                    md = m.get("metadata") or {}
                    if m.get("message_type") == "ai_question":
                        if (md.get("partial_done") or 0) > 0:
                            partial_seen = True
                        partial_total_seen = max(partial_total_seen, md.get("partial_total") or 0)
                for m in tail:
                    if m.get("message_type") == "ai_answer":
                        return partial_seen, partial_total_seen, m, tail
        time.sleep(1.0)
    return partial_seen, partial_total_seen, None, last_msgs


class TestMultiModelPartials:
    def test_multi_model_ai_streams_partials_then_answer(self, amit, direct_chat):
        chat_id, _, _ = direct_chat
        # marker message so we can slice from it
        marker = amit.post(
            f"{API}/chats/{chat_id}/messages",
            json={"chat_id": chat_id, "body": f"marker_{uuid.uuid4().hex[:6]}"},
            timeout=15,
        ).json()
        marker_id = marker["id"]

        # send multi-model @ai question
        r = amit.post(
            f"{API}/chats/{chat_id}/messages",
            json={
                "chat_id": chat_id,
                "body": "@ai what is 2+2?",
                "metadata": {"selected_models": ["chatgpt", "claude", "gemini"]},
            },
            timeout=20,
        )
        assert r.status_code in (200, 201), r.text

        partial_seen, partial_total, answer, _ = _wait_for_ai_answer(amit, chat_id, marker_id, timeout=120)
        assert answer is not None, "multi-model @ai never posted an ai_answer (stuck on thinking)"
        md = answer.get("metadata") or {}
        assert md.get("response_count", 0) >= 1
        # partial_total on the placeholder should have been 3 for a 3-model run
        assert partial_total == 3, f"expected partial_total=3, got {partial_total}"

    def test_single_model_ai_does_not_stream_partials(self, amit, direct_chat):
        chat_id, _, _ = direct_chat
        marker = amit.post(
            f"{API}/chats/{chat_id}/messages",
            json={"chat_id": chat_id, "body": f"marker_single_{uuid.uuid4().hex[:6]}"},
            timeout=15,
        ).json()
        marker_id = marker["id"]

        r = amit.post(
            f"{API}/chats/{chat_id}/messages",
            json={
                "chat_id": chat_id,
                "body": "@ai say hello",
                "metadata": {"selected_models": ["chatgpt"]},
            },
            timeout=20,
        )
        assert r.status_code in (200, 201)

        partial_seen, partial_total, answer, tail = _wait_for_ai_answer(amit, chat_id, marker_id, timeout=90)
        assert answer is not None, "single-model @ai never posted ai_answer"
        # single-model must NOT populate partials on the placeholder
        assert partial_total == 0, f"single-model run wrote partials (partial_total={partial_total})"
        for m in tail:
            md = m.get("metadata") or {}
            if m.get("message_type") == "ai_question" and (md.get("partial_total") or 0) > 0:
                pytest.fail(f"single-model run wrote partials: {md}")
