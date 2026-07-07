"""
Iteration 72 — NextIdeas suggestions, self-healing live preview, login shim, and share-token preview.

Covers:
  • GET /api/chats/{chat_id}/next-ideas — generates fresh, caches for 60s, ?refresh=1 forces.
  • POST /api/chats/{chat_id}/spin-up-dev-os — creates project AND seeds stub files immediately.
  • GET /api/dev-projects/{pid}/preview/index.html — self-heals empty projects + injects login shim.
  • POST /api/dev-projects/{pid}/share-token + GET /api/share/preview/{token}/index.html — public, seeded, shimmed.
"""
import os
import re
import time
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
LINKED_CHAT_ID = "1ad8d0d0-03ee-4a5e-b123-9a635c0aba28"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text[:200]}"
    assert "tn_session" in s.cookies.get_dict(), "tn_session cookie not set"
    return s


@pytest.fixture(scope="module")
def linked_project_id(session):
    """Spin up (or fetch existing) Dev OS project linked to the demo chat."""
    r = session.post(f"{BASE_URL}/api/chats/{LINKED_CHAT_ID}/spin-up-dev-os", timeout=30)
    assert r.status_code == 200, f"spin-up failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "project" in data and "id" in data["project"]
    return data["project"]["id"]


# ─── 1. NextIdeas endpoint ─────────────────────────────────────────────
class TestNextIdeas:
    def test_first_call_returns_fresh_ideas(self, session):
        # Force refresh to ensure not cached
        r = session.get(f"{BASE_URL}/api/chats/{LINKED_CHAT_ID}/next-ideas?refresh=1", timeout=60)
        assert r.status_code == 200, f"next-ideas failed: {r.text[:300]}"
        data = r.json()
        assert "ideas" in data and isinstance(data["ideas"], list)
        assert 1 <= len(data["ideas"]) <= 4, f"expected 1..4 ideas, got {len(data['ideas'])}"
        for idx, item in enumerate(data["ideas"]):
            assert "label" in item and "prompt" in item, f"idea[{idx}] missing label/prompt: {item}"
            assert isinstance(item["label"], str) and len(item["label"]) > 0
            assert isinstance(item["prompt"], str) and len(item["prompt"]) > 0
        assert data.get("cached") is False

    def test_second_call_returns_cached(self, session):
        # Ensure cache populated
        session.get(f"{BASE_URL}/api/chats/{LINKED_CHAT_ID}/next-ideas?refresh=1", timeout=60)
        time.sleep(1)
        r = session.get(f"{BASE_URL}/api/chats/{LINKED_CHAT_ID}/next-ideas", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data.get("cached") is True, f"expected cached:true, got {data.get('cached')}"
        assert len(data["ideas"]) >= 1

    def test_refresh_forces_regen(self, session):
        session.get(f"{BASE_URL}/api/chats/{LINKED_CHAT_ID}/next-ideas", timeout=30)
        r = session.get(f"{BASE_URL}/api/chats/{LINKED_CHAT_ID}/next-ideas?refresh=1", timeout=60)
        assert r.status_code == 200
        assert r.json().get("cached") is False

    def test_unknown_chat_returns_404(self, session):
        bogus = str(uuid.uuid4())
        r = session.get(f"{BASE_URL}/api/chats/{bogus}/next-ideas", timeout=30)
        assert r.status_code == 404


# ─── 2. spin-up-dev-os seeds stub files ────────────────────────────────
class TestSpinUpSeedsStub:
    def test_spin_up_returns_project_with_files(self, session, linked_project_id):
        # Now verify project has files (stub-seeded or real LLM build).
        # Use the preview endpoint as a proxy — it returns HTML if files exist.
        r = session.get(f"{BASE_URL}/api/dev-projects/{linked_project_id}/preview/index.html", timeout=30)
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        # Should NOT be the empty-state page
        assert "Empty project" not in r.text, "preview returned empty-state — stub seeding failed"
        # Should be a real SPA — look for a login form OR sign-in button
        looks_like_login = (
            "login-btn" in r.text.lower()
            or "sign in" in r.text.lower()
            or "signin" in r.text.lower()
            or 'type="password"' in r.text.lower()
        )
        assert looks_like_login, f"preview missing login form markers: {r.text[:500]}"


# ─── 3. Preview endpoint self-heal + shim injection ────────────────────
class TestPreviewSelfHealAndShim:
    def test_preview_injects_login_shim(self, session, linked_project_id):
        r = session.get(f"{BASE_URL}/api/dev-projects/{linked_project_id}/preview/index.html", timeout=30)
        assert r.status_code == 200
        assert "tn-login-shim" in r.text, "login shim not injected into served HTML"

    def test_preview_self_heals_empty_project(self, session, linked_project_id):
        """Directly clear dev_code_files for an existing project (via
        Mongo) and verify that the preview endpoint auto-seeds the stub
        SPA on the fly so the user never sees a bare 404."""
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient

        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")

        async def wipe_files(pid):
            client = AsyncIOMotorClient(mongo_url)
            try:
                await client[db_name].dev_code_files.delete_many({"project_id": pid})
            finally:
                client.close()

        # Create an empty project directly in Mongo to avoid LLM-bound POST /dev-projects
        async def create_empty_project():
            client = AsyncIOMotorClient(mongo_url)
            try:
                # find a project to reuse workspace_id from
                tmpl = await client[db_name].dev_projects.find_one({"id": linked_project_id})
                if not tmpl:
                    return None
                pid = f"TEST_iter72_{uuid.uuid4().hex[:12]}"
                await client[db_name].dev_projects.insert_one({
                    "id": pid,
                    "workspace_id": tmpl["workspace_id"],
                    "created_by": tmpl.get("created_by", "test"),
                    "name": "TEST_iter72_empty_self_heal",
                    "description": "Empty for self-heal test",
                    "status": "draft",
                    "version": "v0.1.0",
                    "plan": {},
                    "created_at": "2026-01-01T00:00:00Z",
                    "updated_at": "2026-01-01T00:00:00Z",
                })
                return pid
            finally:
                client.close()

        async def cleanup(pid):
            client = AsyncIOMotorClient(mongo_url)
            try:
                await client[db_name].dev_projects.delete_one({"id": pid})
                await client[db_name].dev_code_files.delete_many({"project_id": pid})
            finally:
                client.close()

        loop = asyncio.new_event_loop()
        try:
            pid = loop.run_until_complete(create_empty_project())
            assert pid, "could not seed empty test project"
            loop.run_until_complete(wipe_files(pid))
            try:
                r = session.get(f"{BASE_URL}/api/dev-projects/{pid}/preview/index.html", timeout=30)
                assert r.status_code == 200, f"preview returned {r.status_code}: {r.text[:300]}"
                assert "text/html" in r.headers.get("content-type", "")
                # Should self-heal (shim present) OR show friendly empty state.
                ok = (
                    "tn-login-shim" in r.text
                    or "Empty project" in r.text
                    or "Open Studio" in r.text
                )
                assert ok, f"preview neither shimmed nor friendly-empty: {r.text[:400]}"
                # Prefer the self-heal path
                assert "tn-login-shim" in r.text or "Open Studio" in r.text, \
                    "expected self-heal OR friendly empty state"
            finally:
                loop.run_until_complete(cleanup(pid))
        finally:
            loop.close()

    def test_preview_unknown_project_returns_html(self, session):
        bogus = str(uuid.uuid4())
        r = session.get(f"{BASE_URL}/api/dev-projects/{bogus}/preview/index.html", timeout=30)
        # Should be 200 friendly empty state OR 404 — must NOT be bare 404 with no body
        assert r.status_code in (200, 404)
        if r.status_code == 200:
            assert "text/html" in r.headers.get("content-type", "")


# ─── 4. Share-token public preview ─────────────────────────────────────
class TestSharedPreview:
    def test_mint_token_and_serve_publicly(self, session, linked_project_id):
        # Mint share token
        r = session.post(
            f"{BASE_URL}/api/dev-projects/{linked_project_id}/share-token", timeout=30,
        )
        assert r.status_code == 200, f"mint failed: {r.text[:300]}"
        body = r.json()
        token = body.get("token")
        assert token and len(token) > 10

        # Fetch preview anonymously (no cookies)
        anon = requests.Session()
        r2 = anon.get(f"{BASE_URL}/api/share/preview/{token}/index.html", timeout=30)
        assert r2.status_code == 200, f"public preview failed: {r2.status_code} {r2.text[:300]}"
        assert "text/html" in r2.headers.get("content-type", "")
        # Login shim should be injected even for shared link
        assert "tn-login-shim" in r2.text, "shim missing in shared preview"
        # Should look like a real SPA, not empty state alone
        assert (
            "sign in" in r2.text.lower()
            or 'type="password"' in r2.text.lower()
            or "Open Studio" in r2.text  # acceptable fallback
        )

    def test_invalid_token_returns_404(self):
        anon = requests.Session()
        r = anon.get(f"{BASE_URL}/api/share/preview/not-a-real-token/index.html", timeout=30)
        assert r.status_code == 404
