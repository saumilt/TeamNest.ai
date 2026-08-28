"""Iteration 29 — Backend tests for Exit team/chat + Delete chat features.

Covers:
  - POST /api/chats/{id}/leave (group → 200, direct/personal_ai → 400)
  - POST /api/chats/{id}/clear (hides chat for me; re-surfaces on new msg)
  - POST /api/workspace/transfer-ownership (owner → admin demote)
  - POST /api/workspace/leave (owner blocked, non-owner OK, sole-owner closes ws)
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com"
).rstrip("/")


def _post(path, token=None, json=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.post(f"{BASE_URL}{path}", json=json or {}, headers=h, timeout=30)


def _get(path, token=None, params=None):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.get(f"{BASE_URL}{path}", headers=h, params=params or {}, timeout=30)


# ---------- Session-scoped helpers ----------
@pytest.fixture(scope="module")
def _amit():
    r = _post("/api/auth/demo-login")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def amit_token(_amit):
    return _amit["token"]


@pytest.fixture(scope="module")
def amit_user(_amit):
    return _amit["user"]


@pytest.fixture(scope="module")
def _priya():
    r = _post(
        "/api/auth/login",
        json={"email": "priya@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")},
    )
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def priya_token(_priya):
    return _priya["token"]


@pytest.fixture(scope="module")
def priya_user(_priya):
    return _priya["user"]


# ===== /chats/{id}/leave =====
class TestLeaveChat:
    def test_leave_group_chat_success(self, amit_token, priya_token, priya_user):
        # Amit creates a group chat with Priya
        r = _post(
            "/api/chats",
            token=amit_token,
            json={
                "type": "group",
                "name": f"TEST_leave_group_{uuid.uuid4().hex[:6]}",
                "member_ids": [priya_user["id"]],
            },
        )
        assert r.status_code == 200, r.text
        chat = r.json()
        chat_id = chat["id"]
        assert priya_user["id"] in chat["member_ids"]

        # Priya leaves
        r = _post(f"/api/chats/{chat_id}/leave", token=priya_token)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

        # Verify priya removed from member_ids (use Amit's view)
        r2 = _get(f"/api/chats/{chat_id}", token=amit_token)
        assert r2.status_code == 200
        assert priya_user["id"] not in r2.json()["member_ids"]

        # Verify system message was posted
        msgs = _get(f"/api/chats/{chat_id}/messages", token=amit_token).json()
        sys_msgs = [m for m in msgs if m.get("sender_id") == "ai-system"]
        assert any(
            "left the chat" in (m.get("body") or "").lower()
            and (m.get("metadata") or {}).get("event") == "member_left"
            for m in sys_msgs
        ), f"No member_left system message found. Messages: {sys_msgs}"

    def test_leave_personal_ai_chat_blocked(self, amit_token):
        chats = _get("/api/chats", token=amit_token).json()
        personal = next((c for c in chats if c.get("type") == "personal_ai"), None)
        if not personal:
            pytest.skip("no personal_ai chat for demo user")
        r = _post(f"/api/chats/{personal['id']}/leave", token=amit_token)
        assert r.status_code == 400
        body = r.text.lower()
        assert "delete" in body or "group" in body

    def test_leave_direct_chat_blocked(self, amit_token, priya_user):
        # Create a direct chat
        r = _post(
            "/api/chats",
            token=amit_token,
            json={"type": "direct", "name": "", "member_ids": [priya_user["id"]]},
        )
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        r2 = _post(f"/api/chats/{cid}/leave", token=amit_token)
        assert r2.status_code == 400


# ===== /chats/{id}/clear =====
class TestClearChat:
    def test_clear_hides_chat_until_new_message(
        self, amit_token, priya_token, priya_user, amit_user
    ):
        # Create a group chat, send a message, clear it as Priya, verify hidden
        r = _post(
            "/api/chats",
            token=amit_token,
            json={
                "type": "group",
                "name": f"TEST_clear_{uuid.uuid4().hex[:6]}",
                "member_ids": [priya_user["id"]],
            },
        )
        assert r.status_code == 200
        chat_id = r.json()["id"]

        # Amit sends a message
        r = _post(
            f"/api/chats/{chat_id}/messages",
            token=amit_token,
            json={"message_type": "text", "body": "hello before clear"},
        )
        assert r.status_code == 200

        # Confirm Priya sees it
        before = _get(f"/api/chats/{chat_id}/messages", token=priya_token).json()
        assert any("hello before clear" in (m.get("body") or "") for m in before)

        time.sleep(1.1)  # ensure cleared_at > message timestamp

        # Priya clears her chat
        r = _post(f"/api/chats/{chat_id}/clear", token=priya_token)
        assert r.status_code == 200, r.text
        assert "cleared_at" in r.json()

        # GET /api/chats should NOT include this chat for Priya
        priya_chats = _get("/api/chats", token=priya_token).json()
        assert all(c["id"] != chat_id for c in priya_chats), (
            "Cleared chat should be hidden from /chats list"
        )

        # GET messages should be empty (only older messages, all <= cleared_at)
        msgs = _get(f"/api/chats/{chat_id}/messages", token=priya_token).json()
        assert msgs == [] or all(
            (m.get("body") or "") != "hello before clear" for m in msgs
        ), f"Expected no pre-clear messages, got {msgs}"

        time.sleep(1.1)

        # Amit posts a new message → should re-surface for Priya
        r = _post(
            f"/api/chats/{chat_id}/messages",
            token=amit_token,
            json={"message_type": "text", "body": "ping after clear"},
        )
        assert r.status_code == 200

        priya_chats2 = _get("/api/chats", token=priya_token).json()
        assert any(c["id"] == chat_id for c in priya_chats2), (
            "Chat should re-surface after new message"
        )

        msgs2 = _get(f"/api/chats/{chat_id}/messages", token=priya_token).json()
        assert any("ping after clear" in (m.get("body") or "") for m in msgs2)
        # Old message should still be hidden
        assert all(
            "hello before clear" not in (m.get("body") or "") for m in msgs2
        )


# ===== /workspace/transfer-ownership + /workspace/leave =====
class TestWorkspaceLeaveAndTransfer:
    def test_owner_with_other_members_blocked(self, amit_token):
        r = _post("/api/workspace/leave", token=amit_token)
        assert r.status_code == 400, r.text
        assert "transfer" in r.text.lower()

    def _register_user(self):
        email = f"test_user_{uuid.uuid4().hex[:10]}@external.io"
        r = _post(
            "/api/auth/signup",
            json={
                "name": "TEST Leave User",
                "email": email,
                "password": "TestPass@2026",
            },
        )
        assert r.status_code in (200, 201), r.text
        data = r.json()
        return data["token"], data["user"], email

    def test_non_owner_leave_workspace(self, amit_token):
        # Register a new user (gets their own workspace), then invite them to amit's workspace
        # Actually simpler: use add-existing-member from Amit's side, then they leave.
        new_token, new_user, email = self._register_user()

        # Amit adds the new user to his workspace
        r = _post(
            "/api/workspace/add-existing-member",
            token=amit_token,
            json={"user_id": new_user["id"], "role": "member"},
        )
        assert r.status_code == 200, r.text

        # New user switches to amit's workspace
        amit_ws = _get("/api/workspace", token=amit_token).json()
        r = _post(
            "/api/workspace/switch",
            token=new_token,
            json={"workspace_id": amit_ws["id"]},
        )
        assert r.status_code == 200, r.text

        # Now leave amit's workspace (non-owner path)
        r = _post("/api/workspace/leave", token=new_token)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body.get("workspace_closed") is False, (
            "Amit's workspace should NOT close when a non-owner leaves"
        )

    def test_sole_owner_leave_closes_workspace(self):
        # Register a fresh user → gets a brand new workspace (they are sole owner)
        email = f"sole_{uuid.uuid4().hex[:10]}@external.io"
        r = _post(
            "/api/auth/signup",
            json={
                "name": "TEST Sole Owner",
                "email": email,
                "password": "TestPass@2026",
            },
        )
        assert r.status_code in (200, 201), r.text
        token = r.json()["token"]
        ws = _get("/api/workspace", token=token).json()
        ws_id = ws["id"]

        # Leave — should close ws
        r = _post("/api/workspace/leave", token=token)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body.get("workspace_closed") is True

        # Verify the workspace is actually deleted (a re-fetch should 404 or be inaccessible)
        r2 = _get("/api/workspace", token=token)
        # After leaving, user has no active workspace → expect 404 or empty
        assert r2.status_code in (404, 400, 200), r2.text
        if r2.status_code == 200:
            # if 200, the body should NOT have the same id
            assert r2.json().get("id") != ws_id

    def test_transfer_ownership_then_leave(self):
        """Use a fresh workspace so we don't nuke demo data."""
        # 1) Register owner
        owner_email = f"owner_{uuid.uuid4().hex[:8]}@external.io"
        r = _post(
            "/api/auth/signup",
            json={
                "name": "TEST Owner",
                "email": owner_email,
                "password": "TestPass@2026",
            },
        )
        assert r.status_code in (200, 201), r.text
        owner_token = r.json()["token"]
        owner_user = r.json()["user"]
        ws_id = owner_user["workspace_id"]

        # 2) Register second user (will be promoted)
        member_email = f"member_{uuid.uuid4().hex[:8]}@external.io"
        r = _post(
            "/api/auth/signup",
            json={
                "name": "TEST Member",
                "email": member_email,
                "password": "TestPass@2026",
            },
        )
        member_token = r.json()["token"]
        member_user = r.json()["user"]

        # 3) Owner adds member to their workspace
        r = _post(
            "/api/workspace/add-existing-member",
            token=owner_token,
            json={"user_id": member_user["id"], "role": "member"},
        )
        assert r.status_code == 200, r.text

        # Member must switch to that workspace before transfer can validate active membership
        r = _post(
            "/api/workspace/switch",
            token=member_token,
            json={"workspace_id": ws_id},
        )
        assert r.status_code == 200, r.text

        # 4) Owner blocked from leaving (>1 member)
        r = _post("/api/workspace/leave", token=owner_token)
        assert r.status_code == 400, r.text

        # 5) Transfer ownership
        r = _post(
            "/api/workspace/transfer-ownership",
            token=owner_token,
            json={"new_owner_id": member_user["id"]},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["new_owner_id"] == member_user["id"]

        # Verify workspace.owner_id updated
        ws_after = _get("/api/workspace", token=member_token).json()
        assert ws_after.get("owner_id") == member_user["id"]

        # 6) Now original owner (now demoted to admin) can leave
        r = _post("/api/workspace/leave", token=owner_token)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body.get("workspace_closed") is False
