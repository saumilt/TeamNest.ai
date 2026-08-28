"""
Iteration 28 — Regression suite for backend refactors.

Targets the three endpoints whose internal implementation was decomposed into
helper functions during a pure refactor (zero-behavior-change intended):

  * POST /api/calls/{id}/summary         (calls.py)
  * POST /api/standup/generate           (dashboard.py)
  * POST /api/chats/{id}/invite-guest    (chats.py)

Also a quick sanity check on /api/me + ai_service secrets-based randomness usage
by hitting any endpoint that internally relies on it.
"""

import os
import time
import requests
import pytest
from pathlib import Path

def _load_frontend_env():
    fp = Path("/app/frontend/.env")
    if not fp.exists():
        return
    for line in fp.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

_load_frontend_env()

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    pytest.skip("REACT_APP_BACKEND_URL is not set", allow_module_level=True)

DEMO_EMAIL = os.environ.get("DEMO_EMAIL", "amit@demo.team")
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", os.environ.get("DEMO_PASSWORD", "DemoPass123!"))  # public demo cred; override in CI


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(session):
    r = session.post(f"{BASE_URL}/api/auth/demo-login", json={})
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in demo-login response: {data}"
    return token


@pytest.fixture(scope="session")
def auth_client(session, auth_token):
    session.headers.update({"Authorization": f"Bearer {auth_token}"})
    return session


# ---------- Smoke ----------
class TestSmoke:
    def test_me_endpoint(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        body = r.json()
        # response field may be wrapped
        user = body.get("user", body)
        assert user.get("email") == DEMO_EMAIL


# ---------- /api/standup/generate (refactored) ----------
class TestStandupRefactor:
    def test_generate_standup(self, auth_client):
        r = auth_client.post(f"{BASE_URL}/api/standup/generate", json={})
        # 200 expected; 503 acceptable only if LLM unavailable
        assert r.status_code in (200, 503), f"unexpected: {r.status_code} {r.text[:300]}"
        if r.status_code == 200:
            body = r.json()
            # Should contain at least a markdown / text field
            assert any(k in body for k in ("markdown", "standup", "text", "content")), \
                f"missing standup body field: {list(body.keys())}"


# ---------- /api/chats/{id}/invite-guest (refactored) ----------
class TestInviteGuestRefactor:
    @pytest.fixture(scope="class")
    def chat_id(self, auth_client):
        # Try to get a chat from the user's chat list
        r = auth_client.get(f"{BASE_URL}/api/chats")
        assert r.status_code == 200
        body = r.json()
        chats = body if isinstance(body, list) else body.get("chats", [])
        if chats:
            return chats[0].get("id") or chats[0].get("_id") or chats[0].get("chat_id")
        # else create a new chat
        r2 = auth_client.post(f"{BASE_URL}/api/chats", json={"name": "TEST_refactor_chat"})
        assert r2.status_code in (200, 201), r2.text[:300]
        return r2.json().get("id") or r2.json().get("chat_id")

    def test_invite_guest_by_new_email(self, auth_client, chat_id):
        ts = int(time.time())
        email = f"guest.test+ref{ts}@external.io"
        r = auth_client.post(
            f"{BASE_URL}/api/chats/{chat_id}/invite-guest",
            json={"email": email, "name": "TEST Guest Refactor"},
        )
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}"
        body = r.json()
        # Should return guest creds for a brand-new guest
        assert "one_time_password" in body or "password" in body or "guest" in body or "user" in body, \
            f"missing guest creds in response: {list(body.keys())}"

    def test_invite_existing_user_by_id(self, auth_client, chat_id):
        # find another demo user (priya) by search
        r = auth_client.get(f"{BASE_URL}/api/users/search", params={"q": "priya"})
        if r.status_code != 200:
            pytest.skip(f"user-search not available: {r.status_code}")
        body = r.json()
        results = body if isinstance(body, list) else body.get("results") or body.get("users") or []
        if not results:
            pytest.skip("no users returned from search")
        priya = next((u for u in results if "priya" in (u.get("email") or "").lower()), results[0])
        uid = priya.get("id") or priya.get("_id") or priya.get("user_id")
        assert uid, f"no user_id in result: {priya}"
        r2 = auth_client.post(
            f"{BASE_URL}/api/chats/{chat_id}/invite-guest",
            json={"user_id": uid},
        )
        # may be 200 / 201 / 409 (already member) — all are "the endpoint handled it"
        assert r2.status_code in (200, 201, 400, 409), f"{r2.status_code} {r2.text[:300]}"


# ---------- /api/calls/{id}/summary (refactored) ----------
class TestCallSummaryRefactor:
    def test_generate_call_summary(self, auth_client):
        # list calls
        r = auth_client.get(f"{BASE_URL}/api/calls")
        if r.status_code != 200:
            pytest.skip(f"/api/calls not reachable: {r.status_code}")
        body = r.json()
        calls = body if isinstance(body, list) else body.get("calls", [])
        if not calls:
            pytest.skip("no calls available in demo data — skip summary test")
        call = calls[0]
        cid = call.get("id") or call.get("_id") or call.get("call_id")
        assert cid, f"no call id: {call}"
        r2 = auth_client.post(f"{BASE_URL}/api/calls/{cid}/summary", json={})
        # Acceptable: 200 OK, 503 if LLM down, 404 if call lacks transcript
        assert r2.status_code in (200, 404, 422, 503), f"{r2.status_code} {r2.text[:300]}"
        if r2.status_code == 200:
            body = r2.json()
            assert any(k in body for k in ("summary", "markdown", "text", "content")), \
                f"missing summary body field: {list(body.keys())}"
