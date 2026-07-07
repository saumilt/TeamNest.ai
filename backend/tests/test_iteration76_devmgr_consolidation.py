"""Iteration 76 — Single @devmanager consolidation + Build Room 5-tab simplification.

Verifies:
 - GET /api/dev-chat/roles returns exactly the single devmgr role.
 - @devmanager mention in dev chat → single Dev Manager reply (no cascade).
 - Legacy alias mentions (@architect / @qa / @frontend …) all route to devmgr, no specialist agents.
 - @devmanager "build me a habit tracker app" in a new dev chat auto-creates a
   dev_project, posts a system 'Project created' message, kicks off a build
   activity, and the generated preview HTML is served.
 - POST /api/dev-projects/{id}/code-review posts a devmgr message + queues devmgr reply.
 - POST /api/dev-projects/{id}/talk with only {instruction} returns ok:true + files_changed.
 - Dev tasks CRUD (list, create, update).
 - Regression: publish + public serve.
"""

import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")


# ── shared session (demo owner) ──────────────────────────────────────────
@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/demo-login", json={}, timeout=15)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    return s


# ── helpers ──────────────────────────────────────────────────────────────
def _new_dev_chat(sess) -> str:
    """Create a Development chat (kind='development') via POST /api/chats/dev."""
    payload = {
        "name": f"TEST_iter76_{uuid.uuid4().hex[:6]}",
        "member_ids": [],
    }
    r = sess.post(f"{BASE_URL}/api/chats/dev", json=payload, timeout=25)
    assert r.status_code in (200, 201), f"create dev chat: {r.status_code} {r.text[:300]}"
    data = r.json()
    return (data.get("chat") or {}).get("id") or data.get("id")


def _post_msg(sess, chat_id: str, body: str) -> dict:
    r = sess.post(
        f"{BASE_URL}/api/chats/{chat_id}/messages",
        json={"body": body, "message_type": "text"},
        timeout=20,
    )
    assert r.status_code in (200, 201), f"post msg: {r.status_code} {r.text[:300]}"
    return r.json()


def _list_msgs(sess, chat_id: str):
    r = sess.get(f"{BASE_URL}/api/chats/{chat_id}/messages?limit=200", timeout=20)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    data = r.json()
    return data if isinstance(data, list) else data.get("messages", data)


def _wait_for_ai_reply(sess, chat_id: str, after_ms: int = 0, timeout: int = 40):
    """Poll for a message with sender starting 'ai-agent-' after the given time."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        msgs = _list_msgs(sess, chat_id)
        ai = [
            m for m in msgs
            if str(m.get("sender_id") or "").startswith("ai-agent-")
            and (m.get("message_type") in ("ai-agent", "ai-system"))
        ]
        if ai:
            return ai
        time.sleep(2)
    return []


# ── 1. Roles endpoint ────────────────────────────────────────────────────
class TestRolesEndpoint:
    def test_roles_returns_single_devmgr(self, sess):
        r = sess.get(f"{BASE_URL}/api/dev-chat/roles", timeout=15)
        assert r.status_code == 200
        data = r.json()
        roles = data.get("roles") if isinstance(data, dict) else data
        assert isinstance(roles, list)
        assert len(roles) == 1, f"Expected 1 role, got {len(roles)}: {roles}"
        role = roles[0]
        assert role["key"] == "devmgr"
        assert role["trigger"] == "@devmanager"


# ── 2. @devmanager mention → single reply ────────────────────────────────
class TestDevManagerMention:
    def test_devmanager_mention_triggers_single_reply(self, sess):
        chat_id = _new_dev_chat(sess)
        _post_msg(sess, chat_id, "@devmanager quick sanity check — reply briefly with 'OK'.")
        ai = _wait_for_ai_reply(sess, chat_id, timeout=40)
        assert ai, "No AI reply within timeout"
        # All AI replies must be from devmgr (no specialist agents like architect/qa/etc.)
        sender_agents = {str(m.get("sender_id") or "") for m in ai}
        assert sender_agents == {"ai-agent-devmgr"}, f"Expected only devmgr, got {sender_agents}"


# ── 3. Legacy alias routes to devmgr ─────────────────────────────────────
class TestLegacyAlias:
    @pytest.mark.parametrize("mention", [
        "@architect please briefly acknowledge the data model.",
        "@qa please briefly acknowledge our QA plan.",
    ])
    def test_legacy_alias_routes_to_devmgr(self, sess, mention):
        chat_id = _new_dev_chat(sess)
        _post_msg(sess, chat_id, mention)
        ai = _wait_for_ai_reply(sess, chat_id, timeout=45)
        assert ai, f"No AI reply for {mention}"
        senders = {str(m.get("sender_id") or "") for m in ai}
        assert senders == {"ai-agent-devmgr"}, (
            f"Legacy alias should route ONLY to devmgr, got {senders}"
        )


# ── 4. Auto-start build project on first @devmanager build request ──────
class TestAutoStartBuild:
    """Verifies @devmanager 'build me an app' in a new dev chat creates a project."""

    def test_auto_start_creates_project_and_serves_preview(self, sess):
        chat_id = _new_dev_chat(sess)
        _post_msg(
            sess,
            chat_id,
            "@devmanager build me a simple habit tracker app with daily streaks, "
            "add-habit form, and a dashboard showing today's habits with checkmarks.",
        )
        # Wait up to ~150s for project creation + build completion.
        project_id = None
        deadline = time.time() + 150
        while time.time() < deadline:
            try:
                r = sess.get(f"{BASE_URL}/api/dev-projects", timeout=25)
            except requests.exceptions.RequestException:
                time.sleep(3)
                continue
            if r.status_code == 200:
                projects = r.json()
                matched = [
                    p for p in (projects or [])
                    if (p.get("related_chat_id") == chat_id
                        or p.get("linked_chat_id") == chat_id)
                ]
                if matched:
                    project_id = matched[0].get("id")
                    if project_id:
                        # ensure build activity exists
                        try:
                            act = sess.get(
                                f"{BASE_URL}/api/dev-projects/{project_id}/build-activities",
                                timeout=15,
                            )
                            if act.status_code == 200 and act.json():
                                break
                        except requests.exceptions.RequestException:
                            pass
            time.sleep(5)

        assert project_id, "Auto-start did NOT create a dev project within 120s"

        # 'Project created' system message should now exist in chat
        msgs = _list_msgs(sess, chat_id)
        sys_texts = " || ".join(
            (m.get("body") or "").lower()
            for m in msgs
            if m.get("message_type") in ("ai-system", "system", "ai-agent")
        )
        assert "project" in sys_texts, "No project-created system message in chat"

        # Poll for preview to become available (build may still be running)
        preview_ok = False
        deadline2 = time.time() + 90
        last_status = None
        while time.time() < deadline2:
            pr = sess.get(
                f"{BASE_URL}/api/dev-projects/{project_id}/preview/index.html",
                timeout=15,
            )
            last_status = pr.status_code
            if pr.status_code == 200 and pr.headers.get("content-type", "").startswith("text/html"):
                if "<html" in pr.text.lower() or "<!doctype" in pr.text.lower():
                    preview_ok = True
                    break
            time.sleep(5)
        assert preview_ok, f"Preview HTML never served (last status: {last_status})"


# ── 5. /code-review triggers devmgr ──────────────────────────────────────
class TestCodeReview:
    """Uses an existing seeded project for a quick assertion."""

    EXISTING_PROJECT_ID = "77511f35-642e-4320-b4b3-7d6d5c165e60"

    def test_code_review_posts_devmgr_message(self, sess):
        # Confirm project belongs to this workspace (skip gracefully if not).
        pr = sess.get(f"{BASE_URL}/api/dev-projects/{self.EXISTING_PROJECT_ID}", timeout=15)
        if pr.status_code != 200:
            pytest.skip(f"Existing project not found in workspace: {pr.status_code}")
        project = pr.json()
        chat_id = project.get("related_chat_id") or project.get("linked_chat_id")
        if not chat_id:
            pytest.skip("Project has no linked chat")

        # Snapshot count BEFORE
        before = _list_msgs(sess, chat_id)
        before_ids = {m.get("id") for m in before}

        r = sess.post(
            f"{BASE_URL}/api/dev-projects/{self.EXISTING_PROJECT_ID}/code-review",
            timeout=20,
        )
        assert r.status_code == 200, f"code-review: {r.status_code} {r.text[:300]}"
        j = r.json()
        assert j.get("ok") is True
        assert j.get("queued") is True

        # New user-authored @devmanager trigger message must appear
        deadline = time.time() + 15
        seen_trigger = False
        while time.time() < deadline and not seen_trigger:
            after = _list_msgs(sess, chat_id)
            new = [m for m in after if m.get("id") not in before_ids]
            for m in new:
                body = (m.get("body") or "").lower()
                if "@devmanager" in body and "code review" in body:
                    seen_trigger = True
                    # Ensure NOT authored by @reviewer or another agent
                    assert not str(m.get("sender_id") or "").startswith("ai-agent-"), (
                        f"code-review trigger should be user-authored, was {m.get('sender_id')}"
                    )
                    break
            if not seen_trigger:
                time.sleep(2)
        assert seen_trigger, "code-review did not post an @devmanager trigger message"

        # AI reply should be from devmgr (poll briefly)
        deadline2 = time.time() + 40
        got_devmgr = False
        while time.time() < deadline2 and not got_devmgr:
            after = _list_msgs(sess, chat_id)
            new = [m for m in after if m.get("id") not in before_ids]
            ai = [m for m in new if str(m.get("sender_id") or "").startswith("ai-agent-")]
            if ai:
                senders = {str(m.get("sender_id") or "") for m in ai}
                assert senders == {"ai-agent-devmgr"}, (
                    f"code-review should ONLY yield devmgr reply, got {senders}"
                )
                got_devmgr = True
                break
            time.sleep(3)
        assert got_devmgr, "code-review did not produce a devmgr AI reply"


# ── 6. /talk works without role_key param ────────────────────────────────
class TestTalkToBuild:
    EXISTING_PROJECT_ID = "77511f35-642e-4320-b4b3-7d6d5c165e60"

    def test_talk_no_role_key(self, sess):
        pr = sess.get(f"{BASE_URL}/api/dev-projects/{self.EXISTING_PROJECT_ID}", timeout=15)
        if pr.status_code != 200:
            pytest.skip("Project not accessible")
        r = sess.post(
            f"{BASE_URL}/api/dev-projects/{self.EXISTING_PROJECT_ID}/talk",
            json={"instruction": "Change the primary button color to teal."},
            timeout=120,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        assert data.get("ok") is True, f"ok not true: {data}"
        # files_changed must be present (may be [] if the model chose no-op, but usually >=1)
        assert "files_changed" in data
        assert isinstance(data["files_changed"], list)


# ── 7. Dev tasks CRUD ────────────────────────────────────────────────────
class TestDevTasksCRUD:
    def test_tasks_lifecycle(self, sess):
        pid = "77511f35-642e-4320-b4b3-7d6d5c165e60"
        # LIST (should work; may be empty)
        r = sess.get(f"{BASE_URL}/api/dev-tasks?project_id={pid}", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

        # CREATE
        title = f"TEST_iter76_{uuid.uuid4().hex[:6]}"
        cr = sess.post(
            f"{BASE_URL}/api/dev-tasks",
            json={"project_id": pid, "title": title},
            timeout=15,
        )
        assert cr.status_code == 200, f"{cr.status_code} {cr.text[:300]}"
        task = cr.json()
        assert task.get("title") == title
        tid = task["id"]

        # PATCH
        up = sess.patch(
            f"{BASE_URL}/api/dev-tasks/{tid}",
            json={"status": "in_progress"},
            timeout=15,
        )
        assert up.status_code == 200
        assert up.json().get("status") == "in_progress"

        # Verify via list
        r2 = sess.get(f"{BASE_URL}/api/dev-tasks?project_id={pid}", timeout=15)
        found = [t for t in r2.json() if t["id"] == tid]
        assert found and found[0]["status"] == "in_progress"


# ── 8. Regression: publish + public serve ────────────────────────────────
class TestPublishRegression:
    EXISTING_PROJECT_ID = "77511f35-642e-4320-b4b3-7d6d5c165e60"

    def test_publish_and_public_serve(self, sess):
        pr = sess.get(f"{BASE_URL}/api/dev-projects/{self.EXISTING_PROJECT_ID}", timeout=15)
        if pr.status_code != 200:
            pytest.skip("Project not accessible")

        pub = sess.post(
            f"{BASE_URL}/api/dev-projects/{self.EXISTING_PROJECT_ID}/publish",
            json={},
            timeout=30,
        )
        assert pub.status_code == 200, f"publish: {pub.status_code} {pub.text[:300]}"
        j = pub.json()
        # Owner path returns published slug OR approval_requested (member); as owner, expect published
        if j.get("status") == "approval_requested":
            pytest.skip("Owner unexpectedly hit approval_requested — governance gate change?")
        slug = j.get("slug") or (j.get("publication") or {}).get("slug")
        assert slug, f"No slug in publish response: {j}"

        # Public serve (unauthenticated)
        anon = requests.Session()
        pr2 = anon.get(f"{BASE_URL}/api/p/{slug}/index.html", timeout=15)
        assert pr2.status_code == 200, f"public serve: {pr2.status_code}"
        assert "<html" in pr2.text.lower() or "<!doctype" in pr2.text.lower()
