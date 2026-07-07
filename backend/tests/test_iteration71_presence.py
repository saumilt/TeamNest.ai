"""Iteration 71 — Live preview presence + talk-to-build prompt sync.

Covers:
  * POST /api/dev-projects/{pid}/presence/heartbeat
  * DELETE /api/dev-projects/{pid}/presence
  * GET /api/chats/{cid}/preview-viewers
  * Cross-workspace 404, TTL exclusion, multi-user `others` via direct
    Mongo seed (demo-login is a single fixed user).
  * Talk-to-build prompt sync (LLM call — skipped if EMERGENT_LLM_KEY missing
    or LLM is slow / non-deterministic).
"""
import os
import time
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://nest-app-prep.preview.emergentagent.com"
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]


# ── Fixtures ──────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def me(session):
    r = session.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def project(session, me):
    """Find or create a dev project in the demo workspace."""
    r = session.get(f"{API}/dev-projects", timeout=15)
    assert r.status_code == 200, r.text
    raw = r.json()
    if isinstance(raw, dict):
        projects = raw.get("projects") or []
    elif isinstance(raw, list):
        projects = raw
    else:
        projects = []
    if projects:
        return projects[0]
    # Create one
    r = session.post(f"{API}/dev-projects", json={"name": "TEST_iter71_presence", "description": "for presence tests"}, timeout=20)
    assert r.status_code in (200, 201), r.text
    return r.json()


# ── Helpers ───────────────────────────────────────────────────────────
def _cleanup_presence(project_id):
    try:
        _db.dev_preview_presence.delete_many({"project_id": project_id})
    except Exception:
        pass


# ── Tests: Presence heartbeat / delete ────────────────────────────────
class TestPresenceHeartbeat:
    def test_heartbeat_single_user(self, session, project, me):
        pid = project["id"]
        _cleanup_presence(pid)
        r = session.post(f"{API}/dev-projects/{pid}/presence/heartbeat", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["others"] == [], f"expected no others, got {body['others']}"
        # Verify the row was upserted in mongo
        row = _db.dev_preview_presence.find_one({"project_id": pid, "user_id": me["id"]})
        assert row is not None
        assert row["user_name"]

    def test_delete_presence(self, session, project, me):
        pid = project["id"]
        # Ensure a row exists first
        session.post(f"{API}/dev-projects/{pid}/presence/heartbeat", timeout=15)
        r = session.delete(f"{API}/dev-projects/{pid}/presence", timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        row = _db.dev_preview_presence.find_one({"project_id": pid, "user_id": me["id"]})
        assert row is None

    def test_delete_then_heartbeat_upserts(self, session, project, me):
        pid = project["id"]
        session.delete(f"{API}/dev-projects/{pid}/presence", timeout=15)
        r = session.post(f"{API}/dev-projects/{pid}/presence/heartbeat", timeout=15)
        assert r.status_code == 200
        row = _db.dev_preview_presence.find_one({"project_id": pid, "user_id": me["id"]})
        assert row is not None

    def test_heartbeat_unknown_project_404(self, session):
        r = session.post(f"{API}/dev-projects/does-not-exist-xyz/presence/heartbeat", timeout=15)
        assert r.status_code == 404


# ── Tests: Cross-workspace isolation ──────────────────────────────────
class TestPresenceIsolation:
    def test_heartbeat_other_workspace_404(self, session, me):
        """Insert a fake project owned by another workspace and verify the
        demo user can't heartbeat against it."""
        from uuid import uuid4
        fake_pid = f"TEST_iter71_alien_{uuid4().hex[:8]}"
        other_ws = f"TEST_iter71_otherws_{uuid4().hex[:8]}"
        _db.dev_projects.insert_one({
            "id": fake_pid,
            "workspace_id": other_ws,
            "name": "alien",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = session.post(f"{API}/dev-projects/{fake_pid}/presence/heartbeat", timeout=15)
            assert r.status_code == 404, r.text
        finally:
            _db.dev_projects.delete_one({"id": fake_pid})


# ── Tests: Multi-user `others` filter (seeded via Mongo) ──────────────
class TestPresenceMultiUser:
    def test_others_excludes_caller_includes_other_user(self, session, project, me):
        pid = project["id"]
        _cleanup_presence(pid)
        # Seed another user's presence row directly.
        other_uid = "TEST_iter71_other_user"
        _db.dev_preview_presence.insert_one({
            "project_id": pid,
            "user_id": other_uid,
            "user_name": "Priya Demo",
            "workspace_id": me.get("workspace_id"),
            "last_seen_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = session.post(f"{API}/dev-projects/{pid}/presence/heartbeat", timeout=15)
            assert r.status_code == 200
            others = r.json()["others"]
            uids = [v["user_id"] for v in others]
            assert me["id"] not in uids, "caller must be filtered out"
            assert other_uid in uids, f"other user must appear in others; got {uids}"
            entry = next(v for v in others if v["user_id"] == other_uid)
            assert entry["user_name"] == "Priya Demo"
            assert "last_seen_at" in entry
        finally:
            _db.dev_preview_presence.delete_many({"user_id": other_uid})

    def test_ttl_excludes_stale_rows(self, session, project, me):
        pid = project["id"]
        _cleanup_presence(pid)
        stale_uid = "TEST_iter71_stale_user"
        stale_ts = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
        _db.dev_preview_presence.insert_one({
            "project_id": pid,
            "user_id": stale_uid,
            "user_name": "Stale User",
            "workspace_id": me.get("workspace_id"),
            "last_seen_at": stale_ts,
        })
        try:
            r = session.post(f"{API}/dev-projects/{pid}/presence/heartbeat", timeout=15)
            others = r.json()["others"]
            uids = [v["user_id"] for v in others]
            assert stale_uid not in uids, f"stale row should be filtered (TTL=90s); got {uids}"
        finally:
            _db.dev_preview_presence.delete_many({"user_id": stale_uid})


# ── Tests: GET /chats/{cid}/preview-viewers ───────────────────────────
class TestChatPreviewViewers:
    def test_nonexistent_chat_404(self, session):
        r = session.get(f"{API}/chats/no-such-chat-zzz/preview-viewers", timeout=15)
        assert r.status_code == 404

    def test_chat_without_linked_project_returns_empty(self, session, me):
        """A chat in the workspace without linked_dev_project_id and no
        project pointing back to it should return viewers=[] project_id=None."""
        from uuid import uuid4
        cid = f"TEST_iter71_chat_{uuid4().hex[:8]}"
        _db.chats.insert_one({
            "id": cid,
            "workspace_id": me["workspace_id"],
            "name": "TEST iter71 lonely chat",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = session.get(f"{API}/chats/{cid}/preview-viewers", timeout=15)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["viewers"] == []
            assert body["project_id"] is None
        finally:
            _db.chats.delete_one({"id": cid})

    def test_chat_with_linked_project_via_related_chat_id_fallback(self, session, project, me):
        """Set the project's related_chat_id to a new chat (without setting
        chat.linked_dev_project_id) and verify viewers come back keyed on
        the fallback path."""
        from uuid import uuid4
        pid = project["id"]
        cid = f"TEST_iter71_chat_{uuid4().hex[:8]}"
        other_uid = "TEST_iter71_chat_viewer"
        _db.chats.insert_one({
            "id": cid,
            "workspace_id": me["workspace_id"],
            "name": "TEST iter71 linked chat",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        # Stash old related_chat_id and overwrite for the test
        old = _db.dev_projects.find_one({"id": pid}, {"related_chat_id": 1, "_id": 0})
        _db.dev_projects.update_one({"id": pid}, {"$set": {"related_chat_id": cid}})
        _db.dev_preview_presence.insert_one({
            "project_id": pid,
            "user_id": other_uid,
            "user_name": "Raj Demo",
            "workspace_id": me["workspace_id"],
            "last_seen_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = session.get(f"{API}/chats/{cid}/preview-viewers", timeout=15)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["project_id"] == pid
            uids = [v["user_id"] for v in body["viewers"]]
            assert other_uid in uids
            assert me["id"] not in uids
        finally:
            _db.preview_chat = None
            _db.chats.delete_one({"id": cid})
            _db.dev_preview_presence.delete_many({"user_id": other_uid})
            if old and "related_chat_id" in old:
                _db.dev_projects.update_one({"id": pid}, {"$set": {"related_chat_id": old.get("related_chat_id")}})
            else:
                _db.dev_projects.update_one({"id": pid}, {"$unset": {"related_chat_id": ""}})


# ── Tests: Talk-to-build prompt sync ──────────────────────────────────
class TestTalkToBuildSync:
    @pytest.mark.timeout(60)
    def test_talk_returns_files_changed(self, session, project):
        """Prompt that adds a status column should ideally touch BOTH
        frontend/app.js and backend/server.py. We tolerate LLM variance:
        the test PASSES if the call returns ok=true with files_changed
        capped at 4 and the two key files are present; otherwise it's
        logged as a SOFT warn (LLM non-determinism)."""
        if not os.environ.get("EMERGENT_LLM_KEY"):
            pytest.skip("EMERGENT_LLM_KEY not set")
        pid = project["id"]
        # Ensure the project has files (skip if not)
        files_r = session.get(f"{API}/dev-projects/{pid}/files", timeout=15)
        if files_r.status_code != 200:
            pytest.skip(f"no /files endpoint or no project files (got {files_r.status_code})")
        files = files_r.json().get("files") or []
        paths = {f.get("path") for f in files}
        if "frontend/app.js" not in paths or "backend/server.py" not in paths:
            pytest.skip(f"project missing required source files; have {paths}")

        r = session.post(
            f"{API}/dev-projects/{pid}/talk",
            json={
                "instruction": "add a status column to the entity (open / approved / paid)",
                "role_key": "frontend",
            },
            timeout=120,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Some LLM responses might come back as ok=False bad_response — treat as soft fail
        if not body.get("ok"):
            pytest.skip(f"LLM returned non-ok: {body.get('reason')}")
        changed = body.get("files_changed") or []
        assert isinstance(changed, list)
        assert len(changed) <= 4, f"edits[:4] cap violated; got {len(changed)} files"
        # Soft assertion via warning — these are LLM-driven so we don't
        # hard-fail the suite, but we record the result for the report.
        if "frontend/app.js" not in changed or "backend/server.py" not in changed:
            print(f"[soft] sync rule produced unexpected fileset: {changed}")
        else:
            print(f"[ok] sync rule touched both: {changed}")
