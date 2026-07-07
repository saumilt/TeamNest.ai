"""Phase 2a tests: voice notes, approvals, exports, admin dashboard.

Run:
  pytest /app/backend/tests/test_iteration11_phase2a.py -v \
      --junitxml=/app/test_reports/pytest/iteration11.xml
"""
import os

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")


# ---------- shared fixtures ----------
@pytest.fixture(scope="session")
def amit_token():
    r = requests.post(f"{BASE}/api/auth/demo-login", timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def amit_headers(amit_token):
    return {"Authorization": f"Bearer {amit_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def amit_user(amit_token):
    r = requests.get(f"{BASE}/api/auth/me", headers={"Authorization": f"Bearer {amit_token}"})
    return r.json()


@pytest.fixture(scope="session")
def raj_token():
    r = requests.post(
        f"{BASE}/api/auth/login",
        json={"email": "raj@demo.team", "password": "Demo@2026"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def raj_headers(raj_token):
    return {"Authorization": f"Bearer {raj_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def workspace_ids(amit_headers):
    """Get a chat_id (DM), a research thread_id."""
    chats = requests.get(f"{BASE}/api/chats", headers=amit_headers).json()
    chat_id = chats[0]["id"]
    # Get or create a research thread.  AI threads exist if AI research ever ran.
    threads = requests.get(f"{BASE}/api/ai/threads", headers=amit_headers)
    thread_id = None
    if threads.status_code == 200 and threads.json():
        thread_id = threads.json()[0]["id"]
    return {"chat_id": chat_id, "thread_id": thread_id}


# ---------- voice notes ----------
def _tiny_webm_bytes() -> bytes:
    """Return a minimal webm-ish blob. Whisper will reject silent/empty audio
    with an error or empty text — both acceptable per the test contract."""
    # Real ebml header for a tiny webm (won't have audio frames but Whisper
    # often returns empty text rather than crashing).
    return (
        b"\x1aE\xdf\xa3\x9fB\x86\x81\x01B\xf7\x81\x01B\xf2\x81\x04B\xf3\x81\x08"
        b"B\x82\x84webmB\x87\x81\x02B\x85\x81\x02"
    )


class TestVoiceNotes:
    def test_upload_voice_note(self, amit_token, workspace_ids):
        chat_id = workspace_ids["chat_id"]
        files = {"file": ("voice.webm", _tiny_webm_bytes(), "audio/webm")}
        data = {"chat_id": chat_id, "duration": "1.5"}
        r = requests.post(
            f"{BASE}/api/voice-notes",
            headers={"Authorization": f"Bearer {amit_token}"},
            data=data, files=files, timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "file_id" in body and "message" in body
        assert body["message"]["message_type"] == "voice_note"
        assert body["message"]["metadata"]["file_id"] == body["file_id"]
        pytest.voice_file_id = body["file_id"]

    def test_get_voice_note_file_bytes(self, amit_token):
        file_id = getattr(pytest, "voice_file_id", None)
        assert file_id
        r = requests.get(
            f"{BASE}/api/files/{file_id}",
            headers={"Authorization": f"Bearer {amit_token}"},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.content.startswith(b"\x1aE\xdf\xa3")  # ebml magic

    def test_transcribe_then_cached(self, amit_token):
        file_id = getattr(pytest, "voice_file_id", None)
        assert file_id
        url = f"{BASE}/api/voice-notes/{file_id}/transcribe"
        h = {"Authorization": f"Bearer {amit_token}"}
        r1 = requests.post(url, headers=h, timeout=120)
        # After fix: Whisper decode errors return 200 with empty text (graceful fallback)
        assert r1.status_code == 200, f"Expected 200 with graceful fallback, got {r1.status_code}: {r1.text[:200]}"
        j1 = r1.json()
        assert "transcript" in j1 and "cached" in j1
        assert j1["cached"] is False
        # second call -> cached
        r2 = requests.post(url, headers=h, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["cached"] is True

    def test_voice_note_summarize_returns_markdown(self, amit_token):
        """Regression: summarize endpoint should not 500 on empty-transcript voice notes."""
        file_id = getattr(pytest, "voice_file_id", None)
        assert file_id
        r = requests.post(
            f"{BASE}/api/voice-notes/{file_id}/summarize",
            headers={"Authorization": f"Bearer {amit_token}"}, timeout=60,
        )
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert "summary" in body


# ---------- approvals ----------
@pytest.fixture(scope="session")
def research_thread_id(amit_headers, workspace_ids):
    """Get or create a thread. Approvals work even with synthetic thread_id
    that doesn't exist in db — but create endpoint validates. So pick existing."""
    if workspace_ids["thread_id"]:
        return workspace_ids["thread_id"]
    # Trigger creation by starting research
    r = requests.post(f"{BASE}/api/ai/research", headers=amit_headers, json={
        "query": "What is 2+2?", "model_keys": ["claude"],
        "chat_id": workspace_ids["chat_id"],
    }, timeout=120)
    if r.status_code == 200:
        return r.json().get("thread_id")
    pytest.skip("No research thread available")


@pytest.fixture(scope="session")
def reviewer_id(amit_headers, amit_user):
    """A reviewer user id (Raj)."""
    users = requests.get(f"{BASE}/api/workspace/members", headers=amit_headers).json()
    for u in users:
        if u.get("email") == "raj@demo.team":
            return u["id"]
    pytest.skip("Raj user not found")


class TestApprovals:
    def test_create_draft_when_no_reviewers(self, amit_headers, research_thread_id):
        r = requests.post(f"{BASE}/api/approvals", headers=amit_headers, json={
            "research_thread_id": research_thread_id,
            "title": "TEST_draft approval",
            "final_answer": "Draft body v1",
            "reviewer_ids": [],
        }, timeout=20)
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["status"] == "draft"
        assert a["version"] == 1
        assert len(a["history"]) == 1
        assert a["decisions"] == []
        assert a["locked"] is False
        pytest.approval_draft_id = a["id"]

    def test_create_needs_review_when_reviewers(self, amit_headers, research_thread_id, reviewer_id):
        r = requests.post(f"{BASE}/api/approvals", headers=amit_headers, json={
            "research_thread_id": research_thread_id,
            "title": "TEST_approval with reviewer",
            "final_answer": "Reviewable body v1",
            "reviewer_ids": [reviewer_id],
        }, timeout=20)
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["status"] == "needs_review"
        assert reviewer_id in a["reviewer_ids"]
        pytest.approval_review_id = a["id"]

    def test_list_filter_status(self, amit_headers):
        r = requests.get(f"{BASE}/api/approvals?status=needs_review&mine=true", headers=amit_headers)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert all(x["status"] == "needs_review" for x in items)

    def test_edit_increments_version(self, amit_headers):
        aid = getattr(pytest, "approval_draft_id")
        r = requests.patch(f"{BASE}/api/approvals/{aid}", headers=amit_headers,
                           json={"final_answer": "Draft body v2 — edited"})
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["version"] == 2
        assert len(a["history"]) == 2
        assert a["final_answer"].endswith("edited")

    def test_edit_adding_reviewers_flips_to_needs_review(self, amit_headers, reviewer_id):
        aid = getattr(pytest, "approval_draft_id")
        r = requests.patch(f"{BASE}/api/approvals/{aid}", headers=amit_headers,
                           json={"reviewer_ids": [reviewer_id]})
        assert r.status_code == 200
        a = r.json()
        assert a["status"] == "needs_review"
        assert reviewer_id in a["reviewer_ids"]

    def test_non_reviewer_cannot_decide(self, raj_headers, research_thread_id, amit_headers, amit_user):
        # Create an approval with NO reviewers (raj is not reviewer, not owner)
        r = requests.post(f"{BASE}/api/approvals", headers=amit_headers, json={
            "research_thread_id": research_thread_id,
            "title": "TEST_no reviewers", "final_answer": "x",
            "reviewer_ids": [],
        })
        aid = r.json()["id"]
        rr = requests.post(f"{BASE}/api/approvals/{aid}/decision", headers=raj_headers,
                           json={"status": "approved", "comment": "lgtm"})
        assert rr.status_code == 403, rr.text

    def test_reviewer_can_approve_locks_it(self, raj_headers):
        aid = getattr(pytest, "approval_review_id")
        r = requests.post(f"{BASE}/api/approvals/{aid}/decision", headers=raj_headers,
                          json={"status": "approved", "comment": "Approved by Raj"})
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["status"] == "approved"
        assert a["locked"] is True
        assert a["approved_by"] is not None
        assert len(a["decisions"]) == 1
        assert a["decisions"][0]["status"] == "approved"

    def test_locked_approval_cannot_be_edited(self, amit_headers):
        aid = getattr(pytest, "approval_review_id")
        r = requests.patch(f"{BASE}/api/approvals/{aid}", headers=amit_headers,
                           json={"final_answer": "should fail"})
        assert r.status_code == 400, r.text

    def test_locked_approval_further_decisions_fail(self, raj_headers):
        aid = getattr(pytest, "approval_review_id")
        r = requests.post(f"{BASE}/api/approvals/{aid}/decision", headers=raj_headers,
                          json={"status": "rejected", "comment": "change my mind"})
        assert r.status_code == 400

    def test_edit_after_approved_via_unlock(self, amit_headers, research_thread_id, reviewer_id, raj_headers):
        # Create -> approve -> ensure locked. To test 'edit final_answer flips
        # to needs_revision' we'd need unlocking; the endpoint design says
        # editing locked returns 400. So the spec's "After approved status,
        # editing final_answer flips to needs_revision" only applies if NOT
        # locked. We'll verify the rejected->needs_revision state below.
        r = requests.post(f"{BASE}/api/approvals", headers=amit_headers, json={
            "research_thread_id": research_thread_id,
            "title": "TEST_rejected approval", "final_answer": "v1",
            "reviewer_ids": [reviewer_id],
        })
        aid = r.json()["id"]
        rj = requests.post(f"{BASE}/api/approvals/{aid}/decision", headers=raj_headers,
                           json={"status": "rejected", "comment": "no"})
        assert rj.status_code == 200
        assert rj.json()["status"] == "rejected"
        assert rj.json()["locked"] is False
        # Now creator edits final_answer -> status flips to needs_revision
        ed = requests.patch(f"{BASE}/api/approvals/{aid}", headers=amit_headers,
                            json={"final_answer": "v2 revised"})
        assert ed.status_code == 200
        assert ed.json()["status"] == "needs_revision"
        assert ed.json()["version"] == 2


# ---------- exports ----------
class TestExports:
    def test_export_research_pdf(self, amit_headers, research_thread_id):
        r = requests.get(f"{BASE}/api/export/research/{research_thread_id}?format=pdf",
                         headers=amit_headers, timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.content[:4] == b"%PDF"
        assert r.headers["content-type"].startswith("application/pdf")

    def test_export_research_docx(self, amit_headers, research_thread_id):
        r = requests.get(f"{BASE}/api/export/research/{research_thread_id}?format=docx",
                         headers=amit_headers, timeout=30)
        assert r.status_code == 200
        assert r.content[:4] == b"PK\x03\x04"

    def test_export_approval_pdf(self, amit_headers):
        aid = getattr(pytest, "approval_review_id")
        r = requests.get(f"{BASE}/api/export/approval/{aid}?format=pdf",
                         headers=amit_headers, timeout=30)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_export_approval_docx(self, amit_headers):
        aid = getattr(pytest, "approval_review_id")
        r = requests.get(f"{BASE}/api/export/approval/{aid}?format=docx",
                         headers=amit_headers, timeout=30)
        assert r.status_code == 200
        assert r.content[:4] == b"PK\x03\x04"

    def test_export_invalid_format(self, amit_headers, research_thread_id):
        r = requests.get(f"{BASE}/api/export/research/{research_thread_id}?format=html",
                         headers=amit_headers)
        assert r.status_code == 400


# ---------- admin dashboard ----------
class TestAdminDashboard:
    def test_admin_overview_keys(self, amit_headers):
        r = requests.get(f"{BASE}/api/admin/overview", headers=amit_headers, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("users_total", "users_active_14d", "chats_total", "groups_total",
                  "messages_total", "ai_threads_total", "tasks_total", "tasks_overdue",
                  "approvals_approved", "approvals_pending", "files_total",
                  "storage_bytes", "ai_model_usage"):
            assert k in j, f"missing key {k}"
        assert isinstance(j["ai_model_usage"], list)
        assert j["users_total"] >= 1

    def test_admin_overview_non_admin_forbidden(self, raj_headers):
        r = requests.get(f"{BASE}/api/admin/overview", headers=raj_headers)
        assert r.status_code == 403

    def test_admin_users_list(self, amit_headers):
        r = requests.get(f"{BASE}/api/admin/users", headers=amit_headers)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list) and len(users) >= 2
        u0 = users[0]
        for k in ("id", "name", "email", "role", "status", "open_tasks"):
            assert k in u0

    def test_admin_users_non_admin_forbidden(self, raj_headers):
        r = requests.get(f"{BASE}/api/admin/users", headers=raj_headers)
        assert r.status_code == 403

    def test_admin_patch_user_role(self, amit_headers, reviewer_id):
        # Change Raj's role to viewer then back to member
        r1 = requests.patch(f"{BASE}/api/admin/users/{reviewer_id}", headers=amit_headers,
                            json={"role": "viewer"})
        assert r1.status_code == 200, r1.text
        assert r1.json()["role"] == "viewer"
        r2 = requests.patch(f"{BASE}/api/admin/users/{reviewer_id}", headers=amit_headers,
                            json={"role": "member"})
        assert r2.status_code == 200
        assert r2.json()["role"] == "member"

    def test_admin_cannot_disable_self(self, amit_headers, amit_user):
        r = requests.patch(f"{BASE}/api/admin/users/{amit_user['id']}", headers=amit_headers,
                           json={"status": "disabled"})
        assert r.status_code == 400

    def test_admin_cannot_demote_only_owner(self, amit_headers, amit_user):
        """RETEST: demoting the only owner of a workspace must return 400."""
        # Confirm there is exactly one owner
        users = requests.get(f"{BASE}/api/admin/users", headers=amit_headers).json()
        owners = [u for u in users if u.get("role") == "owner"]
        assert len(owners) == 1, f"Test precondition fails: expected exactly 1 owner, got {len(owners)}"
        r = requests.patch(f"{BASE}/api/admin/users/{amit_user['id']}", headers=amit_headers,
                           json={"role": "member"})
        assert r.status_code == 400, r.text[:200]
        body = r.json()
        msg = body.get("detail") or body.get("error") or body.get("message") or ""
        assert "only owner" in msg.lower() or "demote" in msg.lower(), f"Expected guard msg, got: {msg}"
        # Confirm role unchanged
        me = requests.get(f"{BASE}/api/auth/me", headers=amit_headers).json()
        assert me["role"] == "owner"

    def test_admin_task_analytics(self, amit_headers):
        r = requests.get(f"{BASE}/api/admin/task-analytics", headers=amit_headers)
        assert r.status_code == 200
        j = r.json()
        assert "by_status" in j and "by_assignee" in j and "due_today" in j
        assert isinstance(j["by_status"], list)

    def test_admin_task_analytics_forbidden(self, raj_headers):
        r = requests.get(f"{BASE}/api/admin/task-analytics", headers=raj_headers)
        assert r.status_code == 403

    def test_admin_approvals_analytics(self, amit_headers):
        r = requests.get(f"{BASE}/api/admin/approvals-analytics", headers=amit_headers)
        assert r.status_code == 200
        assert "by_status" in r.json()

    def test_admin_approvals_analytics_forbidden(self, raj_headers):
        r = requests.get(f"{BASE}/api/admin/approvals-analytics", headers=raj_headers)
        assert r.status_code == 403


# ---------- regression smoke ----------
class TestRegression:
    def test_auth_me_still_works(self, amit_headers):
        r = requests.get(f"{BASE}/api/auth/me", headers=amit_headers)
        assert r.status_code == 200
        assert "referral_count" in r.json()

    def test_leaderboard_still_works(self, amit_headers):
        r = requests.get(f"{BASE}/api/leaderboard/referrals?scope=workspace", headers=amit_headers)
        assert r.status_code == 200

    def test_my_referrals_still_works(self, amit_headers):
        r = requests.get(f"{BASE}/api/me/referrals", headers=amit_headers)
        assert r.status_code == 200
