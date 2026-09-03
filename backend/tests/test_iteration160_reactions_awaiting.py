"""Iteration 160 — Backend contract for reaction toggle + supporting checks
for the 'Awaiting' chat-list filter (client-side derived from last_message).

- POST /api/messages/{id}/react — toggles current user's reaction and returns
  the updated message with a reactions map.
- GET /api/chats — verifies each chat exposes last_message.sender_id so the
  client can compute the Awaiting filter deterministically.
"""

import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

AMIT = {"email": "amit@demo.team", "password": "Demo@2026"}
RAJ = {"email": "raj@demo.team", "password": "Demo@2026"}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def amit_ctx():
    d = _login(AMIT["email"], AMIT["password"])
    return {"token": d["token"], "user_id": d["user"]["id"], "headers": {"Authorization": f"Bearer {d['token']}"}}


@pytest.fixture(scope="module")
def raj_ctx():
    d = _login(RAJ["email"], RAJ["password"])
    return {"token": d["token"], "user_id": d["user"]["id"], "headers": {"Authorization": f"Bearer {d['token']}"}}


@pytest.fixture(scope="module")
def amit_raj_chat(amit_ctx, raj_ctx):
    # Use / create the amit<->raj direct chat.
    r = requests.get(f"{BASE_URL}/api/chats", headers=amit_ctx["headers"], timeout=15)
    assert r.status_code == 200
    data = r.json()
    chats = data if isinstance(data, list) else (data.get("chats") or [])
    for c in chats:
        if c.get("type") == "direct":
            mids = c.get("member_ids") or [m.get("user_id") for m in (c.get("members") or [])]
            if raj_ctx["user_id"] in mids:
                return c["id"]
    # else create it
    r = requests.post(
        f"{BASE_URL}/api/chats",
        headers=amit_ctx["headers"],
        json={"type": "direct", "peer_user_id": raj_ctx["user_id"]},
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _send(headers, chat_id, body):
    r = requests.post(
        f"{BASE_URL}/api/chats/{chat_id}/messages",
        headers=headers,
        json={"body": body, "message_type": "text"},
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    return r.json()


# ---- react endpoint ---------------------------------------------------------
class TestReactEndpoint:
    def test_react_toggle_add_and_remove(self, amit_ctx, amit_raj_chat):
        msg = _send(amit_ctx["headers"], amit_raj_chat, f"TEST_react {uuid.uuid4().hex[:6]}")
        mid = msg["id"]
        # add 👍
        r1 = requests.post(
            f"{BASE_URL}/api/messages/{mid}/react",
            headers=amit_ctx["headers"],
            json={"emoji": "👍"},
            timeout=15,
        )
        assert r1.status_code == 200, r1.text
        u1 = r1.json()
        assert isinstance(u1.get("reactions"), dict)
        assert amit_ctx["user_id"] in (u1["reactions"].get("👍") or [])

        # GET verifies persistence via full chat messages
        rget = requests.get(
            f"{BASE_URL}/api/chats/{amit_raj_chat}/messages",
            headers=amit_ctx["headers"],
            timeout=15,
        )
        assert rget.status_code == 200
        found = next((m for m in (rget.json().get("messages", []) if isinstance(rget.json(), dict) else rget.json()) if m["id"] == mid), None)
        assert found and amit_ctx["user_id"] in (found.get("reactions", {}).get("👍") or [])

        # remove 👍 by re-posting same emoji
        r2 = requests.post(
            f"{BASE_URL}/api/messages/{mid}/react",
            headers=amit_ctx["headers"],
            json={"emoji": "👍"},
            timeout=15,
        )
        assert r2.status_code == 200
        u2 = r2.json()
        # emoji entry should be removed (or empty) after unreacting
        assert amit_ctx["user_id"] not in (u2.get("reactions", {}).get("👍") or [])

    def test_react_two_users_same_emoji(self, amit_ctx, raj_ctx, amit_raj_chat):
        msg = _send(amit_ctx["headers"], amit_raj_chat, f"TEST_react2 {uuid.uuid4().hex[:6]}")
        mid = msg["id"]
        r1 = requests.post(
            f"{BASE_URL}/api/messages/{mid}/react",
            headers=amit_ctx["headers"],
            json={"emoji": "🎉"},
            timeout=15,
        )
        r2 = requests.post(
            f"{BASE_URL}/api/messages/{mid}/react",
            headers=raj_ctx["headers"],
            json={"emoji": "🎉"},
            timeout=15,
        )
        assert r1.status_code == 200 and r2.status_code == 200
        u = r2.json()
        users = set(u.get("reactions", {}).get("🎉") or [])
        assert amit_ctx["user_id"] in users and raj_ctx["user_id"] in users

    def test_react_missing_message_404(self, amit_ctx):
        r = requests.post(
            f"{BASE_URL}/api/messages/does-not-exist/react",
            headers=amit_ctx["headers"],
            json={"emoji": "👍"},
            timeout=15,
        )
        assert r.status_code == 404


# ---- awaiting filter supporting data ---------------------------------------
class TestAwaitingSupport:
    def test_chats_expose_last_message_sender(self, amit_ctx, raj_ctx, amit_raj_chat):
        # raj sends -> amit's list shows last_message.sender_id == raj (so amit's Awaiting will include this chat)
        _send(raj_ctx["headers"], amit_raj_chat, f"TEST_await raj->amit {uuid.uuid4().hex[:6]}")
        time.sleep(0.5)
        r = requests.get(f"{BASE_URL}/api/chats", headers=amit_ctx["headers"], timeout=15)
        assert r.status_code == 200
        d = r.json(); chats = d if isinstance(d, list) else (d.get("chats") or [])
        target = next((c for c in chats if c["id"] == amit_raj_chat), None)
        assert target and target.get("last_message"), "chat should have last_message"
        lm = target["last_message"]
        assert lm.get("sender_id") == raj_ctx["user_id"], f"expected raj as last sender, got {lm.get('sender_id')}"

    def test_awaiting_client_predicate(self, amit_ctx, raj_ctx):
        """Reproduce the client-side awaiting predicate against the real chats
        payload and assert amit sees at least one awaiting chat (the raj chat)."""
        r = requests.get(f"{BASE_URL}/api/chats", headers=amit_ctx["headers"], timeout=15)
        d = r.json(); chats = d if isinstance(d, list) else (d.get("chats") or [])
        my_id = amit_ctx["user_id"]
        awaiting = [
            c for c in chats
            if (lm := c.get("last_message"))
            and lm.get("sender_id")
            and lm["sender_id"] != my_id
            and not str(lm["sender_id"]).startswith("ai")
        ]
        assert awaiting, "expected at least one awaiting chat for amit"
