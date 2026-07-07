"""Phase 2b — LiveKit Calls backend tests.

Covers:
- GET /api/calls/config (configured + url)
- POST /api/calls/start (audio/video, system msg, JWT token, rejoined)
- POST /api/calls/{id}/join (different user, fresh token, participants[])
- POST /api/calls/{id}/end (initiator vs non-initiator)
- GET /api/calls/by-chat/{chat_id} (reverse chronological)
- GET /api/calls/{id} (detail)
- POST /api/webhooks/livekit (no auth → 401)
"""
import base64
import json
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "Demo@2026")


def _login(email, password=None):
    if password is None:
        password = DEMO_PASSWORD
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def amit_token():
    return _login("amit@demo.team")


@pytest.fixture(scope="module")
def raj_token():
    return _login("raj@demo.team")


@pytest.fixture(scope="module")
def priya_token():
    return _login("priya@demo.team")


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def group_chat_id(amit_token, raj_token, priya_token):
    """Create a TEST_ group chat with Amit (owner), Raj, Priya."""
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(amit_token), timeout=15).json()
    raj_me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(raj_token), timeout=15).json()
    priya_me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(priya_token), timeout=15).json()
    payload = {
        "type": "group",
        "name": f"TEST_calls_{uuid.uuid4().hex[:6]}",
        "member_ids": [raj_me["id"], priya_me["id"]],
    }
    r = requests.post(f"{BASE_URL}/api/chats", json=payload, headers=_h(amit_token), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["id"], me["id"], raj_me["id"], priya_me["id"]


def _is_jwt(tok: str) -> bool:
    parts = tok.split(".")
    if len(parts) != 3:
        return False
    # Each part is base64url
    try:
        for p in parts[:2]:
            base64.urlsafe_b64decode(p + "=" * (-len(p) % 4))
        return True
    except Exception:
        return False


# ---- /api/calls/config ----
class TestCallConfig:
    def test_config_configured_and_url(self, amit_token):
        r = requests.get(f"{BASE_URL}/api/calls/config", headers=_h(amit_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("configured") is True
        assert isinstance(data.get("url"), str) and data["url"].startswith("wss://")

    def test_config_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/calls/config", timeout=15)
        assert r.status_code in (401, 403)


# ---- /api/calls/start ----
class TestCallStart:
    def test_start_audio_creates_call(self, amit_token, group_chat_id):
        chat_id, amit_id, _, _ = group_chat_id
        r = requests.post(
            f"{BASE_URL}/api/calls/start",
            json={"chat_id": chat_id, "mode": "audio"},
            headers=_h(amit_token),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["rejoined"] is False
        assert data["url"].startswith("wss://")
        assert _is_jwt(data["token"]), "token not JWT"
        assert len(data["token"]) > 200
        c = data["call"]
        assert c["status"] == "active"
        assert c["mode"] == "audio"
        assert c["started_by"] == amit_id
        assert c["livekit_room"] == f"call_{c['id']}"
        assert isinstance(c["participants"], list) and len(c["participants"]) == 1
        assert c["participants"][0]["id"] == amit_id
        # System message should have been posted
        msgs = requests.get(
            f"{BASE_URL}/api/chats/{chat_id}/messages?limit=10",
            headers=_h(amit_token),
            timeout=15,
        ).json()
        assert any(
            m.get("message_type") == "call_started" and m.get("metadata", {}).get("call_id") == c["id"]
            for m in msgs
        ), "call_started system message not found"
        # Persist for later tests
        TestCallStart.call_id = c["id"]
        TestCallStart.chat_id = chat_id

    def test_start_second_time_returns_rejoined(self, amit_token):
        chat_id = TestCallStart.chat_id
        r = requests.post(
            f"{BASE_URL}/api/calls/start",
            json={"chat_id": chat_id, "mode": "audio"},
            headers=_h(amit_token),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["rejoined"] is True, "expected rejoined=True for second start"
        assert data["call"]["id"] == TestCallStart.call_id
        assert _is_jwt(data["token"])

    def test_start_invalid_chat_404(self, amit_token):
        r = requests.post(
            f"{BASE_URL}/api/calls/start",
            json={"chat_id": "does-not-exist", "mode": "audio"},
            headers=_h(amit_token),
            timeout=15,
        )
        assert r.status_code == 404


# ---- /api/calls/{id}/join ----
class TestCallJoin:
    def test_join_invalid_call_returns_404(self, raj_token):
        r = requests.post(
            f"{BASE_URL}/api/calls/{uuid.uuid4()}/join",
            headers=_h(raj_token),
            timeout=15,
        )
        assert r.status_code == 404

    def test_join_by_different_user_adds_participant(self, raj_token, group_chat_id):
        call_id = TestCallStart.call_id
        _, _, raj_id, _ = group_chat_id
        r = requests.post(
            f"{BASE_URL}/api/calls/{call_id}/join",
            headers=_h(raj_token),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert _is_jwt(data["token"])
        # Verify Raj added to participants via GET
        detail = requests.get(
            f"{BASE_URL}/api/calls/{call_id}",
            headers=_h(raj_token),
            timeout=15,
        ).json()
        ids = [p["id"] for p in detail["participants"]]
        assert raj_id in ids

    def test_join_after_end_returns_400(self, amit_token, raj_token, group_chat_id):
        """Start an isolated call, end it as initiator, then join → 400."""
        chat_id, _, _, _ = group_chat_id
        # Create a NEW chat so we don't affect existing call
        r = requests.post(
            f"{BASE_URL}/api/chats",
            json={"type": "group", "name": f"TEST_end_{uuid.uuid4().hex[:6]}", "member_ids": []},
            headers=_h(amit_token),
            timeout=15,
        )
        ch = r.json()["id"]
        s = requests.post(
            f"{BASE_URL}/api/calls/start", json={"chat_id": ch, "mode": "audio"},
            headers=_h(amit_token), timeout=20,
        ).json()
        cid = s["call"]["id"]
        e = requests.post(f"{BASE_URL}/api/calls/{cid}/end", json={}, headers=_h(amit_token), timeout=20)
        assert e.status_code == 200
        # Now join → 400
        j = requests.post(f"{BASE_URL}/api/calls/{cid}/join", headers=_h(raj_token), timeout=15)
        assert j.status_code == 400


# ---- /api/calls/{id}/end ----
class TestCallEnd:
    def test_non_initiator_end_only_marks_self(self, amit_token, raj_token, priya_token, group_chat_id):
        chat_id, _, raj_id, priya_id = group_chat_id
        # New isolated chat with all 3
        ch = requests.post(
            f"{BASE_URL}/api/chats",
            json={"type": "group", "name": f"TEST_ni_{uuid.uuid4().hex[:6]}",
                  "member_ids": [raj_id, priya_id]},
            headers=_h(amit_token), timeout=15,
        ).json()["id"]
        s = requests.post(f"{BASE_URL}/api/calls/start", json={"chat_id": ch, "mode": "audio"},
                          headers=_h(amit_token), timeout=20).json()
        cid = s["call"]["id"]
        # Raj + Priya join
        requests.post(f"{BASE_URL}/api/calls/{cid}/join", headers=_h(raj_token), timeout=15)
        requests.post(f"{BASE_URL}/api/calls/{cid}/join", headers=_h(priya_token), timeout=15)
        # Raj (non-initiator) ends
        e = requests.post(f"{BASE_URL}/api/calls/{cid}/end", json={}, headers=_h(raj_token), timeout=20)
        assert e.status_code == 200
        detail = requests.get(f"{BASE_URL}/api/calls/{cid}", headers=_h(amit_token), timeout=15).json()
        assert detail["status"] == "active", "call should remain active when non-initiator leaves"
        raj_p = [p for p in detail["participants"] if p["id"] == raj_id][0]
        assert raj_p["left_at"] is not None
        # Cleanup
        requests.post(f"{BASE_URL}/api/calls/{cid}/end", json={}, headers=_h(amit_token), timeout=20)

    def test_initiator_end_ends_call_and_posts_card(self, amit_token, group_chat_id):
        chat_id, _, _, _ = group_chat_id
        ch = requests.post(
            f"{BASE_URL}/api/chats",
            json={"type": "group", "name": f"TEST_init_end_{uuid.uuid4().hex[:6]}", "member_ids": []},
            headers=_h(amit_token), timeout=15,
        ).json()["id"]
        s = requests.post(f"{BASE_URL}/api/calls/start", json={"chat_id": ch, "mode": "video"},
                          headers=_h(amit_token), timeout=20).json()
        cid = s["call"]["id"]
        time.sleep(1)  # accumulate some duration
        e = requests.post(f"{BASE_URL}/api/calls/{cid}/end", json={}, headers=_h(amit_token), timeout=20)
        assert e.status_code == 200, e.text
        detail = requests.get(f"{BASE_URL}/api/calls/{cid}", headers=_h(amit_token), timeout=15).json()
        assert detail["status"] == "ended"
        assert detail["ended_at"] is not None
        assert isinstance(detail["duration_seconds"], int) and detail["duration_seconds"] >= 0
        # call_ended system message present?
        msgs = requests.get(
            f"{BASE_URL}/api/chats/{ch}/messages?limit=20",
            headers=_h(amit_token), timeout=15,
        ).json()
        assert any(m.get("message_type") == "call_ended" and m.get("metadata", {}).get("call_id") == cid for m in msgs)


# ---- /api/calls/by-chat/{chat_id} ----
class TestCallList:
    def test_by_chat_returns_reverse_chronological(self, amit_token, group_chat_id):
        chat_id, _, _, _ = group_chat_id
        r = requests.get(f"{BASE_URL}/api/calls/by-chat/{chat_id}", headers=_h(amit_token), timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        # Sorted desc by started_at
        starts = [i["started_at"] for i in items]
        assert starts == sorted(starts, reverse=True)

    def test_by_chat_invalid_404(self, amit_token):
        r = requests.get(f"{BASE_URL}/api/calls/by-chat/nonexistent", headers=_h(amit_token), timeout=15)
        assert r.status_code == 404


# ---- /api/webhooks/livekit ----
class TestWebhook:
    def test_webhook_no_auth_returns_401(self):
        r = requests.post(
            f"{BASE_URL}/api/webhooks/livekit",
            data=json.dumps({"event": "room_finished", "room": {"name": "call_fake"}}),
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_webhook_bad_auth_returns_401(self):
        r = requests.post(
            f"{BASE_URL}/api/webhooks/livekit",
            data=json.dumps({"event": "room_finished", "room": {"name": "call_fake"}}),
            headers={"Content-Type": "application/json", "Authorization": "not-a-real-jwt"},
            timeout=15,
        )
        assert r.status_code == 401


# ---- Cleanup: end any lingering active calls ----
@pytest.fixture(scope="module", autouse=True)
def _cleanup_calls_at_end(amit_token, group_chat_id):
    yield
    try:
        chat_id, _, _, _ = group_chat_id
        items = requests.get(f"{BASE_URL}/api/calls/by-chat/{chat_id}", headers=_h(amit_token), timeout=15).json()
        for c in items:
            if c.get("status") == "active":
                requests.post(f"{BASE_URL}/api/calls/{c['id']}/end", json={}, headers=_h(amit_token), timeout=15)
    except Exception:
        pass
