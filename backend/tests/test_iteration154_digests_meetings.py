"""Iteration 154 backend tests: AI Employee weekly digests + Meetings CRUD + meeting-prep auto-attach.

Covers:
  1. GET /api/ai-employees/_/digests → subscribed employees recap (last 7d)
  2. POST/GET/DELETE /api/meetings (validation + persistence)
  3. POST /api/ai/meeting-prep → auto-attaches next upcoming meeting
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "amit@demo.team", "password": "Demo@2026"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def owner_headers(owner_token):
    return {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def any_chat_id(owner_headers):
    r = requests.get(f"{BASE_URL}/api/chats", headers=owner_headers, timeout=15)
    assert r.status_code == 200, r.text
    items = r.json()
    # find a non-personal_ai chat
    for c in items:
        if c.get("type") != "personal_ai":
            return c["id"]
    return items[0]["id"] if items else None


# ---------- Digests ----------
class TestEmployeeDigests:
    def test_digests_returns_priya_ai_for_cmo(self, owner_headers):
        r = requests.get(
            f"{BASE_URL}/api/ai-employees/_/digests", headers=owner_headers, timeout=30
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "digests" in data
        assert isinstance(data["digests"], list)
        # Find the cmo digest
        cmo = next((d for d in data["digests"] if d.get("employee_key") == "cmo"), None)
        assert cmo is not None, f"cmo digest missing. got: {[d.get('employee_key') for d in data['digests']]}"
        assert cmo["tasks"] == 3, f"expected 3 tasks, got {cmo['tasks']}"
        assert cmo["hours_saved"] == 1.5, f"expected 1.5h, got {cmo['hours_saved']}"
        assert cmo["dollar_savings"] == 270, f"expected 270, got {cmo['dollar_savings']}"
        assert cmo["period"] == "Last 7 days"
        assert "Priya" in (cmo.get("display_full_name") or ""), cmo.get("display_full_name")
        assert isinstance(cmo.get("highlights"), list)
        assert isinstance(cmo.get("recap"), str)
        # recap should be non-empty (AI-generated one-liner)
        assert len(cmo["recap"]) > 0, "recap should be non-empty for cmo with 3 tasks"

    def test_digests_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/ai-employees/_/digests", timeout=15)
        assert r.status_code in (401, 403), r.status_code


# ---------- Meetings CRUD ----------
class TestMeetingsCRUD:
    created_ids: list = []

    def test_create_meeting_validation_empty_title(self, owner_headers):
        r = requests.post(
            f"{BASE_URL}/api/meetings",
            headers=owner_headers,
            json={"title": "  ", "start_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()},
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_create_meeting_validation_empty_start(self, owner_headers):
        r = requests.post(
            f"{BASE_URL}/api/meetings",
            headers=owner_headers,
            json={"title": "TEST_no_start", "start_at": ""},
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_create_meeting_bad_chat_id(self, owner_headers):
        r = requests.post(
            f"{BASE_URL}/api/meetings",
            headers=owner_headers,
            json={
                "title": "TEST_bad_chat",
                "start_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
                "chat_id": "does-not-exist-xyz",
            },
            timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_create_and_persist_meeting(self, owner_headers, any_chat_id):
        start = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()
        payload = {
            "title": "TEST_iter154_meeting",
            "start_at": start,
            "chat_id": any_chat_id,
            "attendees": ["amit@demo.team", "raj@demo.team"],
            "notes": "TEST agenda",
        }
        r = requests.post(f"{BASE_URL}/api/meetings", headers=owner_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title"] == "TEST_iter154_meeting"
        assert data["start_at"] == start
        assert data["chat_id"] == any_chat_id
        assert "id" in data
        assert "_id" not in data
        TestMeetingsCRUD.created_ids.append(data["id"])

        # GET /api/meetings should include it
        r2 = requests.get(f"{BASE_URL}/api/meetings", headers=owner_headers, timeout=15)
        assert r2.status_code == 200
        ids = [m["id"] for m in r2.json().get("items", [])]
        assert data["id"] in ids

    def test_upcoming_filtered_by_chat_and_ordered(self, owner_headers, any_chat_id):
        # Create two more meetings at different times on the same chat
        t1 = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        t2 = (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat()
        r1 = requests.post(
            f"{BASE_URL}/api/meetings",
            headers=owner_headers,
            json={"title": "TEST_upcoming_A", "start_at": t2, "chat_id": any_chat_id},
            timeout=15,
        )
        r2 = requests.post(
            f"{BASE_URL}/api/meetings",
            headers=owner_headers,
            json={"title": "TEST_upcoming_B", "start_at": t1, "chat_id": any_chat_id},
            timeout=15,
        )
        assert r1.status_code == 200 and r2.status_code == 200
        TestMeetingsCRUD.created_ids += [r1.json()["id"], r2.json()["id"]]

        r = requests.get(
            f"{BASE_URL}/api/meetings/upcoming?chat_id={any_chat_id}",
            headers=owner_headers,
            timeout=15,
        )
        assert r.status_code == 200
        items = r.json().get("items", [])
        # Filter to our TEST_upcoming_* ones
        ours = [m for m in items if m["title"].startswith("TEST_upcoming_")]
        assert len(ours) >= 2
        # Ordered soonest-first: TEST_upcoming_B (t1) then TEST_upcoming_A (t2)
        idx_b = next(i for i, m in enumerate(ours) if m["title"] == "TEST_upcoming_B")
        idx_a = next(i for i, m in enumerate(ours) if m["title"] == "TEST_upcoming_A")
        assert idx_b < idx_a, "upcoming should be soonest-first"

        # All returned items should have start_at >= now
        now_iso = datetime.now(timezone.utc).isoformat()
        for m in items:
            assert m["start_at"] >= now_iso[:19], f"stale meeting returned: {m['start_at']}"

    def test_delete_meeting_and_404(self, owner_headers):
        # Delete one we created
        if not TestMeetingsCRUD.created_ids:
            pytest.skip("No meeting created to delete")
        mid = TestMeetingsCRUD.created_ids.pop()
        r = requests.delete(f"{BASE_URL}/api/meetings/{mid}", headers=owner_headers, timeout=15)
        assert r.status_code == 200
        # Second delete returns 404
        r2 = requests.delete(f"{BASE_URL}/api/meetings/{mid}", headers=owner_headers, timeout=15)
        assert r2.status_code == 404

    def test_zz_cleanup(self, owner_headers):
        for mid in list(TestMeetingsCRUD.created_ids):
            requests.delete(f"{BASE_URL}/api/meetings/{mid}", headers=owner_headers, timeout=10)
        TestMeetingsCRUD.created_ids.clear()


# ---------- Meeting Prep auto-attach ----------
class TestMeetingPrepAutoAttach:
    def test_prep_auto_attaches_upcoming_meeting(self, owner_headers, any_chat_id):
        # Schedule a meeting on the chat
        start = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
        rc = requests.post(
            f"{BASE_URL}/api/meetings",
            headers=owner_headers,
            json={
                "title": "TEST_prep_target_meeting",
                "start_at": start,
                "chat_id": any_chat_id,
                "attendees": ["amit@demo.team"],
            },
            timeout=15,
        )
        assert rc.status_code == 200, rc.text
        mid = rc.json()["id"]

        try:
            r = requests.post(
                f"{BASE_URL}/api/ai/meeting-prep",
                headers=owner_headers,
                json={"chat_id": any_chat_id},
                timeout=60,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert "brief" in data and isinstance(data["brief"], str) and len(data["brief"]) > 0
            # meeting should be auto-attached and match our meeting
            assert data.get("meeting") is not None, f"meeting not attached: {data}"
            assert data["meeting"]["id"] == mid
            # Title should match the meeting title
            assert data["title"] == "TEST_prep_target_meeting"
        finally:
            requests.delete(f"{BASE_URL}/api/meetings/{mid}", headers=owner_headers, timeout=10)

    def test_prep_falls_back_to_chat_when_no_meeting(self, owner_headers, any_chat_id):
        # Ensure no upcoming meeting for this chat first (cleanup any TEST_ meetings)
        r_up = requests.get(
            f"{BASE_URL}/api/meetings/upcoming?chat_id={any_chat_id}",
            headers=owner_headers, timeout=15,
        )
        for m in r_up.json().get("items", []):
            requests.delete(f"{BASE_URL}/api/meetings/{m['id']}", headers=owner_headers, timeout=10)

        r = requests.post(
            f"{BASE_URL}/api/ai/meeting-prep",
            headers=owner_headers,
            json={"chat_id": any_chat_id},
            timeout=60,
        )
        # Might attach a workspace-scoped meeting if any exists, or fall back to chat.
        # Either way, 200 + brief non-empty is required.
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("brief"), str) and len(data["brief"]) > 0
        assert "title" in data
