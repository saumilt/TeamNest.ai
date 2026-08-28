"""Iteration 134 — backend regression for:
 - POST /api/calls/{id}/decline  (missed call card + idempotency + answered_elsewhere)
 - POST /api/tasks  (assigned_to=self, source_chat_id) → GET /api/tasks?scope=mine
 - POST /api/workspace/invite/{id}/resend (owner/admin allowed, pending members)
Uses the demo workspace (amit + priya + raj all in same workspace).
"""
import os
import time
import uuid

import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


def _login(email: str, password: str) -> dict:
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text[:200]}"
    return r.json()


@pytest.fixture(scope="module")
def amit():
    return _login("amit@demo.team", os.environ.get("DEMO_PASSWORD", "DemoPass123!"))


@pytest.fixture(scope="module")
def priya():
    return _login("priya@demo.team", os.environ.get("DEMO_PASSWORD", "DemoPass123!"))


@pytest.fixture(scope="module")
def raj():
    return _login("raj@demo.team", os.environ.get("DEMO_PASSWORD", "DemoPass123!"))


def _h(user):
    return {"Authorization": f"Bearer {user['token']}"}


@pytest.fixture(scope="module")
def shared_chat(amit, priya):
    """Find a chat that both amit and priya are members of; prefer 'Marketing Site Refresh'."""
    r = requests.get(f"{BASE}/api/chats", headers=_h(amit), timeout=20)
    assert r.status_code == 200, r.text
    chats = r.json()
    amit_id = amit["user"]["id"]
    priya_id = priya["user"]["id"]
    # First try a chat that includes both amit and priya
    for c in chats:
        mids = c.get("member_ids") or []
        if amit_id in mids and priya_id in mids and c.get("type") != "personal_ai":
            return c
    pytest.skip("No shared multi-member chat between amit & priya")


# ---- 1. Auth + not-found guards on /decline ----
class TestDeclineGuards:
    def test_decline_unauth_returns_401(self):
        r = requests.post(f"{BASE}/api/calls/does-not-matter/decline", timeout=10)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"

    def test_decline_unknown_call_returns_404(self, amit):
        bogus = f"bogus-{uuid.uuid4()}"
        r = requests.post(f"{BASE}/api/calls/{bogus}/decline", headers=_h(amit), timeout=15)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"


# ---- 2. Missed call: real active call → decline posts one system message ----
class TestMissedCallCardFlow:
    def _messages(self, user, chat_id):
        r = requests.get(f"{BASE}/api/chats/{chat_id}/messages?limit=200", headers=_h(user), timeout=20)
        assert r.status_code == 200, r.text
        return r.json()

    def _start_call(self, user, chat_id, mode="audio"):
        r = requests.post(f"{BASE}/api/calls/start", headers=_h(user),
                          json={"chat_id": chat_id, "mode": mode}, timeout=20)
        assert r.status_code == 200, f"start failed: {r.status_code} {r.text[:400]}"
        return r.json()

    def _end_call(self, user, call_id):
        try:
            requests.post(f"{BASE}/api/calls/{call_id}/end", headers=_h(user), json={}, timeout=15)
        except Exception:
            pass

    def test_decline_posts_one_missed_card_and_is_idempotent(self, amit, priya, shared_chat):
        chat_id = shared_chat["id"]
        started = self._start_call(amit, chat_id, mode="audio")
        call = started["call"]
        call_id = call["id"]
        try:
            # priya (the callee) declines
            r1 = requests.post(f"{BASE}/api/calls/{call_id}/decline", headers=_h(priya), timeout=20)
            assert r1.status_code == 200, r1.text
            j1 = r1.json()
            assert j1.get("ok") is True
            assert not j1.get("answered_elsewhere"), f"expected no answered_elsewhere, got {j1}"

            time.sleep(0.5)
            # Verify one call_missed system message exists for this call_id
            msgs = self._messages(amit, chat_id)
            missed = [m for m in msgs if m.get("message_type") == "call_missed"
                      and (m.get("metadata") or {}).get("call_id") == call_id]
            assert len(missed) == 1, f"expected exactly 1 call_missed card, got {len(missed)}"
            md = missed[0]["metadata"]
            assert md.get("mode") == "audio"
            assert md.get("from_id") == amit["user"]["id"], f"from_id wrong: {md}"
            assert md.get("from_name") == amit["user"]["name"]
            assert missed[0].get("sender_id") == "ai-system"

            # Second decline: must be idempotent — no additional card.
            r2 = requests.post(f"{BASE}/api/calls/{call_id}/decline", headers=_h(priya), timeout=20)
            assert r2.status_code == 200
            time.sleep(0.5)
            msgs2 = self._messages(amit, chat_id)
            missed2 = [m for m in msgs2 if m.get("message_type") == "call_missed"
                       and (m.get("metadata") or {}).get("call_id") == call_id]
            assert len(missed2) == 1, f"second decline created a duplicate: {len(missed2)}"
        finally:
            self._end_call(amit, call_id)

    def test_decline_after_someone_joined_returns_answered_elsewhere_no_card(
            self, amit, priya, raj, shared_chat):
        chat_id = shared_chat["id"]
        # Skip if raj isn't a chat member
        if raj["user"]["id"] not in (shared_chat.get("member_ids") or []):
            pytest.skip("raj not a member of the shared chat — skipping answered_elsewhere case")
        started = self._start_call(amit, chat_id, mode="video")
        call_id = started["call"]["id"]
        try:
            # priya joins first
            rj = requests.post(f"{BASE}/api/calls/{call_id}/join", headers=_h(priya), timeout=20)
            assert rj.status_code == 200, rj.text
            # raj declines → should be answered_elsewhere, NO missed card
            rd = requests.post(f"{BASE}/api/calls/{call_id}/decline", headers=_h(raj), timeout=20)
            assert rd.status_code == 200, rd.text
            j = rd.json()
            assert j.get("answered_elsewhere") is True, f"expected answered_elsewhere, got {j}"
            time.sleep(0.5)
            msgs = self._messages(amit, chat_id)
            missed = [m for m in msgs if m.get("message_type") == "call_missed"
                      and (m.get("metadata") or {}).get("call_id") == call_id]
            assert len(missed) == 0, f"expected NO missed card, got {len(missed)}"
        finally:
            self._end_call(amit, call_id)


# ---- 3. Recap → Task: POST /api/tasks assigned to self, appears in scope=mine ----
class TestRecapToTask:
    def test_create_task_self_assigned_and_visible_in_mine(self, amit, shared_chat):
        title = f"TEST_recap_action_{uuid.uuid4().hex[:8]}"
        payload = {
            "title": title,
            "assigned_to": amit["user"]["id"],
            "source_chat_id": shared_chat["id"],
            "status": "todo",
        }
        r = requests.post(f"{BASE}/api/tasks", headers=_h(amit), json=payload, timeout=20)
        assert r.status_code in (200, 201), f"create task failed: {r.status_code} {r.text[:300]}"
        created = r.json()
        assert created.get("title") == title
        assert created.get("assigned_to") == amit["user"]["id"]
        assert created.get("status") == "todo"
        assert created.get("source_chat_id") == shared_chat["id"]
        task_id = created.get("id")
        assert task_id

        # Confirm it appears in /api/tasks?scope=mine
        r2 = requests.get(f"{BASE}/api/tasks?scope=mine", headers=_h(amit), timeout=20)
        assert r2.status_code == 200, r2.text
        mine = r2.json()
        ids = [t.get("id") for t in mine]
        assert task_id in ids, f"created task {task_id} not returned in scope=mine (got {len(ids)} tasks)"


# ---- 4. Resend invite (owner/admin) for a pending member ----
class TestResendInvite:
    def _find_pending_member_id(self, amit) -> str | None:
        r = requests.get(f"{BASE}/api/workspace/members", headers=_h(amit), timeout=20)
        assert r.status_code == 200, r.text
        for m in r.json():
            if m.get("status") == "invited" or m.get("must_change_password"):
                if m.get("id") != amit["user"]["id"]:
                    return m.get("id")
        return None

    def test_resend_requires_auth(self):
        r = requests.post(f"{BASE}/api/workspace/invite/some-user/resend", timeout=10)
        assert r.status_code == 401

    def test_resend_unknown_member_returns_404(self, amit):
        r = requests.post(f"{BASE}/api/workspace/invite/bogus-{uuid.uuid4()}/resend",
                          headers=_h(amit), timeout=15)
        assert r.status_code == 404

    def test_resend_pending_member_allowed_for_owner(self, amit):
        # Create a fresh pending member so we always have one to resend
        new_email = f"test_pending_{uuid.uuid4().hex[:8]}@teamnest-test.dev"
        inv = requests.post(
            f"{BASE}/api/workspace/invite", headers=_h(amit),
            json={"email": new_email, "name": "TEST Pending", "role": "member"}, timeout=20,
        )
        # If email is not configured, invite creation still succeeds; if it is,
        # this is a fresh user with status=invited + must_change_password=True.
        assert inv.status_code == 200, f"invite create failed: {inv.status_code} {inv.text[:300]}"
        member_id = inv.json().get("id")
        assert member_id
        try:
            r = requests.post(f"{BASE}/api/workspace/invite/{member_id}/resend",
                              headers=_h(amit), timeout=25)
            # 200 if Mailgun is configured, 503 if not — either proves the
            # endpoint is reachable + guarded correctly for a pending member.
            assert r.status_code in (200, 503), f"unexpected {r.status_code}: {r.text[:300]}"
        finally:
            # Cleanup: soft-delete the test user
            try:
                requests.delete(f"{BASE}/api/workspace/members/{member_id}",
                                headers=_h(amit), timeout=15)
            except Exception:
                pass

    def test_resend_forbidden_for_non_admin(self, raj, amit):
        # raj is a plain member — cannot resend invites
        # Use amit's fresh invite so a target exists
        new_email = f"test_pending_{uuid.uuid4().hex[:8]}@teamnest-test.dev"
        inv = requests.post(
            f"{BASE}/api/workspace/invite", headers=_h(amit),
            json={"email": new_email, "name": "TEST Pending2", "role": "member"}, timeout=20,
        )
        assert inv.status_code == 200
        member_id = inv.json().get("id")
        try:
            r = requests.post(f"{BASE}/api/workspace/invite/{member_id}/resend",
                              headers=_h(raj), timeout=15)
            assert r.status_code == 403, f"expected 403 for member role, got {r.status_code}"
        finally:
            try:
                requests.delete(f"{BASE}/api/workspace/members/{member_id}",
                                headers=_h(amit), timeout=15)
            except Exception:
                pass
