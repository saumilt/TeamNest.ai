"""
Iteration 73 — DevProjectSwitcher pointer regression.

Verifies the fix for bug #3 (carry-over from iteration 72):
  • GET /api/chats/{cid} prefers `chat.linked_dev_project_id` over related_chat_id.
  • GET /api/chats list also reflects the pointer.
  • POST /api/chats/{cid}/active-dev-project/{pid} flips the pointer for both shapes.
  • POST /api/chats/{cid}/spin-up-dev-os sets the pointer on the chat.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
LINKED_CHAT_ID = "1ad8d0d0-03ee-4a5e-b123-9a635c0aba28"
PROJECT_A = "cb18e4c2-bff2-401e-8f3e-86d74dca308a"  # Design Accounts Payable
PROJECT_B = "b51bfe01-b01e-4f83-8842-522842099519"  # Engineering · Project


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text[:200]}"
    assert "tn_session" in s.cookies.get_dict()
    return s


def _activate(session, pid):
    r = session.post(
        f"{BASE_URL}/api/chats/{LINKED_CHAT_ID}/active-dev-project/{pid}", timeout=30
    )
    assert r.status_code == 200, f"activate {pid} failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert data.get("ok") is True
    assert data.get("active_project_id") == pid


class TestPointerDrivesGetChat:
    """GET /api/chats/{id} must reflect the active pointer for BOTH projects."""

    def test_switch_to_project_a_then_get_chat(self, session):
        _activate(session, PROJECT_A)
        time.sleep(0.3)
        r = session.get(f"{BASE_URL}/api/chats/{LINKED_CHAT_ID}", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data.get("linked_dev_project_id") == PROJECT_A, (
            f"pointer not set to A: {data.get('linked_dev_project_id')}"
        )
        ldp = data.get("linked_dev_project")
        assert ldp is not None, "linked_dev_project missing"
        assert ldp.get("id") == PROJECT_A, (
            f"linked_dev_project.id != A: {ldp.get('id')}"
        )
        # Sanity: name field present and matches the expected project
        assert "Design Accounts Payable" in (ldp.get("name") or ""), (
            f"unexpected project name: {ldp.get('name')}"
        )

    def test_switch_to_project_b_then_get_chat(self, session):
        _activate(session, PROJECT_B)
        time.sleep(0.3)
        r = session.get(f"{BASE_URL}/api/chats/{LINKED_CHAT_ID}", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data.get("linked_dev_project_id") == PROJECT_B
        ldp = data.get("linked_dev_project")
        assert ldp is not None and ldp.get("id") == PROJECT_B
        assert "Engineering" in (ldp.get("name") or "")

    def test_toggle_back_to_a(self, session):
        """Round-trip — proves it's not just sticky to one value."""
        _activate(session, PROJECT_A)
        time.sleep(0.3)
        r = session.get(f"{BASE_URL}/api/chats/{LINKED_CHAT_ID}", timeout=30)
        assert r.status_code == 200
        assert r.json().get("linked_dev_project", {}).get("id") == PROJECT_A


class TestPointerDrivesChatList:
    """GET /api/chats must also reflect the pointer (chat-list pill)."""

    def _find_chat(self, session):
        r = session.get(f"{BASE_URL}/api/chats", timeout=30)
        assert r.status_code == 200
        for c in r.json():
            if c.get("id") == LINKED_CHAT_ID:
                return c
        pytest.fail(f"chat {LINKED_CHAT_ID} not in /api/chats response")

    def test_list_reflects_project_a(self, session):
        _activate(session, PROJECT_A)
        time.sleep(0.3)
        c = self._find_chat(session)
        assert c.get("linked_dev_project_id") == PROJECT_A
        ldp = c.get("linked_dev_project")
        assert ldp is not None
        assert ldp.get("id") == PROJECT_A, (
            f"chat-list linked_dev_project.id != A: {ldp.get('id')}"
        )

    def test_list_reflects_project_b(self, session):
        _activate(session, PROJECT_B)
        time.sleep(0.3)
        c = self._find_chat(session)
        assert c.get("linked_dev_project_id") == PROJECT_B
        ldp = c.get("linked_dev_project")
        assert ldp is not None and ldp.get("id") == PROJECT_B


class TestSpinUpSetsPointer:
    """POST /chats/{id}/spin-up-dev-os must set chat.linked_dev_project_id."""

    def test_spin_up_writes_pointer(self, session):
        # Use a fresh chat to avoid touching the seed chat's pointer
        r = session.post(
            f"{BASE_URL}/api/chats",
            json={"type": "direct", "name": "TEST_iter73_spinup",
                  "member_ids": [], "default_models": []},
            timeout=30,
        )
        assert r.status_code == 200, f"create chat failed: {r.status_code} {r.text[:200]}"
        cid = r.json()["id"]

        try:
            sr = session.post(
                f"{BASE_URL}/api/chats/{cid}/spin-up-dev-os", timeout=60
            )
            assert sr.status_code == 200, (
                f"spin-up failed: {sr.status_code} {sr.text[:300]}"
            )
            project = sr.json().get("project")
            assert project and project.get("id"), "spin-up missing project.id"
            pid = project["id"]

            # GET /api/chats/{cid} must return linked_dev_project matching pid
            gr = session.get(f"{BASE_URL}/api/chats/{cid}", timeout=30)
            assert gr.status_code == 200
            data = gr.json()
            assert data.get("linked_dev_project_id") == pid, (
                f"pointer not set after spin-up: {data.get('linked_dev_project_id')} vs {pid}"
            )
            ldp = data.get("linked_dev_project")
            assert ldp is not None and ldp.get("id") == pid
        finally:
            # Best-effort cleanup
            try:
                session.delete(f"{BASE_URL}/api/chats/{cid}", timeout=10)
            except Exception:
                pass
