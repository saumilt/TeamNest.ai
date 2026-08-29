"""Iteration 155 backend tests:
1. Save-As-Template (POST/GET/DELETE /api/automations/templates/custom + canvas-templates ordering)
2. Meeting Reminders scheduler (idempotent, remind_minutes threshold)
3. Digest Email (owner/admin manual send; member 403)
"""
import os
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


# ------------- Fixtures -------------
@pytest.fixture(scope="module")
def owner_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "amit@demo.team", "password": "Demo@2026"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def member_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "raj@demo.team", "password": "Demo@2026"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def any_chat_id(owner_headers):
    r = requests.get(f"{BASE_URL}/api/chats", headers=owner_headers, timeout=15)
    assert r.status_code == 200
    for c in r.json():
        if c.get("type") != "personal_ai":
            return c["id"]
    return r.json()[0]["id"]


# ------------- Save As Template -------------
class TestSaveAsTemplate:
    created_ids: list = []

    def test_save_requires_title(self, owner_headers):
        r = requests.post(
            f"{BASE_URL}/api/automations/templates/custom",
            headers=owner_headers,
            json={"title": "  ", "plan": {"trigger": {"type": "manual"}, "steps": []}},
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_save_requires_trigger_in_plan(self, owner_headers):
        r = requests.post(
            f"{BASE_URL}/api/automations/templates/custom",
            headers=owner_headers,
            json={"title": "TEST_no_trigger", "plan": {"steps": []}},
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_save_success_and_returns_no_mongo_id(self, owner_headers):
        payload = {
            "title": "TEST_iter155_custom_tpl",
            "description": "TEST description",
            "plan": {
                "trigger": {"type": "manual", "label": "Run manually", "config": {}},
                "steps": [{"kind": "ai", "label": "Summarize", "config": {"op": "summarize"}}],
            },
        }
        r = requests.post(
            f"{BASE_URL}/api/automations/templates/custom",
            headers=owner_headers, json=payload, timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data
        assert "_id" not in data
        assert data["title"] == "TEST_iter155_custom_tpl"
        assert data["category"] == "Team"
        assert data["plan"]["trigger"]["type"] == "manual"
        TestSaveAsTemplate.created_ids.append(data["id"])

    def test_canvas_templates_custom_first_then_builtins(self, owner_headers):
        r = requests.get(f"{BASE_URL}/api/automations/canvas-templates", headers=owner_headers, timeout=15)
        assert r.status_code == 200, r.text
        tpls = r.json().get("templates", [])
        assert len(tpls) >= 6, f"expected custom+5 builtins, got {len(tpls)}"
        # First one must be our custom (newest first)
        first = tpls[0]
        assert first.get("custom") is True, f"first template should be custom: {first}"
        assert first["id"] in TestSaveAsTemplate.created_ids
        # Built-ins after custom should NOT have custom:true
        builtins = [t for t in tpls if not t.get("custom")]
        assert len(builtins) == 5, f"expected 5 builtins, got {len(builtins)}"
        # Custom must have an id
        assert isinstance(first.get("id"), str) and len(first["id"]) > 0

    def test_member_cannot_delete_others_template(self, member_headers):
        if not TestSaveAsTemplate.created_ids:
            pytest.skip("no template created")
        tid = TestSaveAsTemplate.created_ids[0]
        r = requests.delete(
            f"{BASE_URL}/api/automations/templates/custom/{tid}",
            headers=member_headers, timeout=15,
        )
        assert r.status_code == 403, r.text

    def test_delete_missing_returns_404(self, owner_headers):
        r = requests.delete(
            f"{BASE_URL}/api/automations/templates/custom/does-not-exist-xyz",
            headers=owner_headers, timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_owner_can_delete_and_it_disappears_from_list(self, owner_headers):
        if not TestSaveAsTemplate.created_ids:
            pytest.skip("no template created")
        tid = TestSaveAsTemplate.created_ids.pop(0)
        r = requests.delete(
            f"{BASE_URL}/api/automations/templates/custom/{tid}",
            headers=owner_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        # Verify removal
        r2 = requests.get(f"{BASE_URL}/api/automations/canvas-templates", headers=owner_headers, timeout=15)
        ids = [t.get("id") for t in r2.json().get("templates", [])]
        assert tid not in ids

    def test_zz_cleanup(self, owner_headers):
        for tid in list(TestSaveAsTemplate.created_ids):
            requests.delete(
                f"{BASE_URL}/api/automations/templates/custom/{tid}",
                headers=owner_headers, timeout=10,
            )
        TestSaveAsTemplate.created_ids.clear()


# ------------- Meeting Reminders -------------
class TestMeetingReminders:
    created_ids: list = []

    def test_create_meeting_has_remind_minutes_default_and_reminded_at_none(self, owner_headers, any_chat_id):
        start = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()
        r = requests.post(
            f"{BASE_URL}/api/meetings",
            headers=owner_headers,
            json={"title": "TEST_iter155_default_rm", "start_at": start, "chat_id": any_chat_id},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("remind_minutes") == 10, f"default remind_minutes should be 10, got {data.get('remind_minutes')}"
        assert data.get("reminded_at") is None
        TestMeetingReminders.created_ids.append(data["id"])

    def test_create_meeting_custom_remind_minutes(self, owner_headers, any_chat_id):
        start = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()
        r = requests.post(
            f"{BASE_URL}/api/meetings",
            headers=owner_headers,
            json={"title": "TEST_iter155_custom_rm", "start_at": start, "chat_id": any_chat_id, "remind_minutes": 5},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("remind_minutes") == 5
        TestMeetingReminders.created_ids.append(r.json()["id"])

    def test_reminder_tick_posts_once_and_is_idempotent(self, owner_headers, any_chat_id):
        # Schedule meeting due in 5 minutes with 10-min lead => should be reminded
        start = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        rc = requests.post(
            f"{BASE_URL}/api/meetings",
            headers=owner_headers,
            json={
                "title": "TEST_iter155_reminder_due",
                "start_at": start,
                "chat_id": any_chat_id,
                "remind_minutes": 10,
            },
            timeout=15,
        )
        assert rc.status_code == 200
        mid = rc.json()["id"]
        TestMeetingReminders.created_ids.append(mid)

        # Snapshot messages BEFORE
        before = requests.get(
            f"{BASE_URL}/api/chats/{any_chat_id}/messages?limit=200",
            headers=owner_headers, timeout=15,
        )
        assert before.status_code == 200
        before_reminders = [m for m in before.json() if (m.get("metadata") or {}).get("event") == "meeting_reminder" and mid in (m.get("body") or "") + str(m.get("metadata") or {})]

        # Trigger the tick via the running 60s loop by calling it directly
        # We import and run the coroutine — the app process shares the same DB.
        # Simpler: just wait up to ~75s for the running loop to fire.
        import time
        posted_msg = None
        for _ in range(15):
            time.sleep(6)
            msgs = requests.get(
                f"{BASE_URL}/api/chats/{any_chat_id}/messages?limit=200",
                headers=owner_headers, timeout=15,
            ).json()
            for m in msgs:
                meta = m.get("metadata") or {}
                if meta.get("event") == "meeting_reminder" and "TEST_iter155_reminder_due" in (m.get("body") or ""):
                    posted_msg = m
                    break
            if posted_msg:
                break

        assert posted_msg is not None, "reminder message not posted by scheduler within ~90s"
        body = posted_msg.get("body") or ""
        assert body.startswith("⏰"), f"body should start with ⏰, got: {body[:80]!r}"
        assert "TEST_iter155_reminder_due" in body
        assert "starts in" in body.lower()
        assert "prep brief" in body.lower(), f"prep brief section missing: {body[:200]!r}"

        # meeting.reminded_at should now be set
        rm = requests.get(f"{BASE_URL}/api/meetings", headers=owner_headers, timeout=15)
        mrec = next((x for x in rm.json().get("items", []) if x["id"] == mid), None)
        assert mrec is not None
        assert mrec.get("reminded_at"), f"reminded_at not set: {mrec}"

        # Wait another tick to check idempotency — no second reminder
        time.sleep(65)
        msgs2 = requests.get(
            f"{BASE_URL}/api/chats/{any_chat_id}/messages?limit=200",
            headers=owner_headers, timeout=15,
        ).json()
        matches = [
            m for m in msgs2
            if (m.get("metadata") or {}).get("event") == "meeting_reminder"
            and "TEST_iter155_reminder_due" in (m.get("body") or "")
        ]
        assert len(matches) == 1, f"expected exactly 1 reminder message, got {len(matches)}"

    def test_zz_cleanup(self, owner_headers):
        for mid in list(TestMeetingReminders.created_ids):
            requests.delete(f"{BASE_URL}/api/meetings/{mid}", headers=owner_headers, timeout=10)
        TestMeetingReminders.created_ids.clear()


# ------------- Digest Email -------------
class TestDigestEmail:
    def test_member_cannot_send_digest(self, member_headers):
        r = requests.post(
            f"{BASE_URL}/api/ai-employees/_/digest-email",
            headers=member_headers, timeout=30,
        )
        assert r.status_code == 403, r.text

    def test_owner_can_send_digest_returns_sent_and_recipients(self, owner_headers):
        r = requests.post(
            f"{BASE_URL}/api/ai-employees/_/digest-email",
            headers=owner_headers, timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "sent" in data
        assert "recipients" in data
        assert isinstance(data["recipients"], list)
        # Owner amit@demo.team should be among recipients
        assert any("amit@demo.team" in (e or "").lower() for e in data["recipients"]), data
        # sent should be true (Mailgun configured); if not, still non-empty recipients + reason present
        if not data.get("sent"):
            assert "reason" in data, "if not sent, must have reason"
