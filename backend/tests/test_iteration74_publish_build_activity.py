"""Iteration 74 — Publish flow + build activity + idea chips + deploy error handling.

Focuses on the new features shipped this iteration:
  1. POST /api/dev-projects/{id}/publish, re-publish version bump, empty-project 400
  2. GET /api/p/{slug}/index.html public serve, 404 for missing slug
  3. PATCH /api/dev-projects/{id}/production for custom_domain, bad slug, taken slug
  4. GET /api/build-activities/{id}
  5. Chat continuation edit → build_progress message + activity + idea_chips message
  6. Vercel / Netlify deploy with fake token returns clean 4xx/502, NOT unhandled 500
"""
import os
import re
import time

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://nest-app-prep.preview.emergentagent.com",
).rstrip("/")

EXISTING_CHAT_ID = "d553cda0-62f4-4c2d-aae1-4b168208ed1e"
EXISTING_PROJECT_ID = "dc4942dc-c4a5-4020-8419-fef40ea6a19a"


# ─── Fixtures (self-contained; conftest.py's demo_login uses api_client=json) ──
@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ─── 1. Publish flow regression ───────────────────────────────────────────
class TestPublish:
    def test_publish_existing_project_bumps_version(self, h):
        # First publish
        r1 = requests.post(
            f"{BASE_URL}/api/dev-projects/{EXISTING_PROJECT_ID}/publish",
            json={}, headers=h, timeout=30,
        )
        assert r1.status_code == 200, f"publish v_x failed: {r1.status_code} {r1.text[:200]}"
        d1 = r1.json()
        assert "slug" in d1 and "version" in d1 and "files_count" in d1 and "path" in d1
        assert d1["files_count"] >= 1
        assert d1["path"] == f"/p/{d1['slug']}"
        v1 = d1["version"]

        # Re-publish → increments version
        r2 = requests.post(
            f"{BASE_URL}/api/dev-projects/{EXISTING_PROJECT_ID}/publish",
            json={}, headers=h, timeout=30,
        )
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["version"] == v1 + 1, f"expected v{v1+1}, got v{d2['version']}"
        assert d2["slug"] == d1["slug"], "slug should be stable across re-publish"

    def test_publish_project_with_no_files_returns_400(self, h):
        # Create an empty project (no dev_code_files rows) then try to publish it.
        # Cheapest way: create via /api/dev-projects then immediately try publish.
        rc = requests.post(
            f"{BASE_URL}/api/dev-projects",
            json={"name": "TEST_iter74_empty_publish", "description": "empty"},
            headers=h, timeout=120,
        )
        # Some deployments require a chat_id; fall back to skip cleanly.
        if rc.status_code not in (200, 201):
            pytest.skip(f"cannot create empty test project: {rc.status_code} {rc.text[:150]}")
        pid = rc.json().get("id") or rc.json().get("project", {}).get("id")
        if not pid:
            pytest.skip("no project id returned")
        try:
            rp = requests.post(
                f"{BASE_URL}/api/dev-projects/{pid}/publish",
                json={}, headers=h, timeout=15,
            )
            assert rp.status_code == 400
            detail = (rp.json().get("detail") or "").lower()
            assert "no files" in detail or "run a build" in detail
        finally:
            requests.delete(f"{BASE_URL}/api/dev-projects/{pid}", headers=h, timeout=10)


# ─── 2. Public production serving ────────────────────────────────────────
class TestPublicServe:
    def test_public_serve_index_html_no_auth(self, h):
        # First ensure it's published so we have a slug.
        rp = requests.post(
            f"{BASE_URL}/api/dev-projects/{EXISTING_PROJECT_ID}/publish",
            json={}, headers=h, timeout=30,
        )
        assert rp.status_code == 200
        slug = rp.json()["slug"]

        # Fetch without auth headers.
        r = requests.get(f"{BASE_URL}/api/p/{slug}/index.html", timeout=15)
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "").lower()
        assert "<html" in r.text.lower() or "<!doctype" in r.text.lower()

    def test_public_serve_root_slug_no_auth(self, h):
        rp = requests.post(
            f"{BASE_URL}/api/dev-projects/{EXISTING_PROJECT_ID}/publish",
            json={}, headers=h, timeout=30,
        )
        slug = rp.json()["slug"]
        r = requests.get(f"{BASE_URL}/api/p/{slug}", timeout=15)
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "").lower()

    def test_public_serve_missing_slug_returns_404_html(self):
        r = requests.get(f"{BASE_URL}/api/p/nonexistent-slug-xyz-999", timeout=15)
        assert r.status_code == 404
        assert "text/html" in r.headers.get("content-type", "").lower()
        assert "404" in r.text or "not" in r.text.lower()


# ─── 3. Production PATCH (custom domain + slug validation) ───────────────
class TestProductionPatch:
    def test_patch_custom_domain_sets_pending_dns(self, h):
        # Ensure published first.
        requests.post(
            f"{BASE_URL}/api/dev-projects/{EXISTING_PROJECT_ID}/publish",
            json={}, headers=h, timeout=30,
        )
        r = requests.patch(
            f"{BASE_URL}/api/dev-projects/{EXISTING_PROJECT_ID}/production",
            json={"custom_domain": "demo.example.org"},
            headers=h, timeout=15,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        d = r.json()
        assert d.get("custom_domain") == "demo.example.org"
        assert d.get("domain_status") == "pending_dns"

    def test_patch_bad_slug_returns_400(self, h):
        r = requests.patch(
            f"{BASE_URL}/api/dev-projects/{EXISTING_PROJECT_ID}/production",
            json={"slug": "AB"}, headers=h, timeout=15,
        )
        assert r.status_code == 400
        assert "slug" in (r.json().get("detail") or "").lower()

    def test_patch_taken_slug_returns_409(self, h):
        # Try to steal the slug of ANOTHER already-published project.
        # Query the dev-projects list to find another project, or fall back to
        # asserting nothing when no other release exists.
        rlist = requests.get(f"{BASE_URL}/api/dev-projects", headers=h, timeout=15)
        assert rlist.status_code == 200
        projects = rlist.json() if isinstance(rlist.json(), list) else rlist.json().get("projects", [])
        other = next((p for p in projects if p.get("id") != EXISTING_PROJECT_ID), None)
        if not other:
            pytest.skip("only one dev project in workspace — can't test 409 conflict")

        # Publish the other project so it has a slug.
        rp = requests.post(
            f"{BASE_URL}/api/dev-projects/{other['id']}/publish",
            json={}, headers=h, timeout=30,
        )
        if rp.status_code != 200:
            pytest.skip(f"other project can't be published: {rp.text[:120]}")
        other_slug = rp.json()["slug"]

        # Now try to take THAT slug on EXISTING_PROJECT_ID.
        r = requests.patch(
            f"{BASE_URL}/api/dev-projects/{EXISTING_PROJECT_ID}/production",
            json={"slug": other_slug}, headers=h, timeout=15,
        )
        assert r.status_code == 409, f"expected 409 taken, got {r.status_code} {r.text[:200]}"
        assert "taken" in (r.json().get("detail") or "").lower()


# ─── 4. Build activities endpoint ────────────────────────────────────────
class TestBuildActivity:
    def test_get_build_activity_404_for_missing(self, h):
        r = requests.get(
            f"{BASE_URL}/api/build-activities/does-not-exist-xxx",
            headers=h, timeout=10,
        )
        assert r.status_code == 404


# ─── 5. Chat continuation edit → build_progress + idea_chips ─────────────
class TestChatContinuationBuildActivity:
    def test_devmgr_edit_produces_build_progress_and_ideas(self, h):
        # Post a small edit to devmgr on the existing dev chat.
        edit_body = "@devmgr change the header subtitle to Powered by TeamNest"
        rmsg = requests.post(
            f"{BASE_URL}/api/chats/{EXISTING_CHAT_ID}/messages",
            json={"body": edit_body}, headers=h, timeout=20,
        )
        assert rmsg.status_code in (200, 201), f"post msg failed: {rmsg.status_code} {rmsg.text[:200]}"
        my_msg_id = rmsg.json().get("id")
        assert my_msg_id

        # Poll the chat messages for a build_progress message that appeared
        # after our trigger (up to ~90s). Real LLM edits take a while.
        activity_id = None
        deadline = time.time() + 90
        while time.time() < deadline and not activity_id:
            time.sleep(3)
            rlist = requests.get(
                f"{BASE_URL}/api/chats/{EXISTING_CHAT_ID}/messages?limit=50",
                headers=h, timeout=15,
            )
            if rlist.status_code != 200:
                continue
            msgs = rlist.json() if isinstance(rlist.json(), list) else rlist.json().get("messages", [])
            for m in msgs:
                if m.get("message_type") == "build_progress":
                    aid = (m.get("metadata") or {}).get("build_activity_id")
                    if aid:
                        # Prefer the newest one — it will be near end of list.
                        activity_id = aid
        assert activity_id, "no build_progress message appeared within 90s"

        # Poll the activity itself → status should become 'done' and have steps.
        deadline = time.time() + 90
        act = None
        while time.time() < deadline:
            ra = requests.get(
                f"{BASE_URL}/api/build-activities/{activity_id}",
                headers=h, timeout=10,
            )
            assert ra.status_code == 200, f"activity fetch failed: {ra.status_code} {ra.text[:200]}"
            act = ra.json()
            if act.get("status") in ("done", "error"):
                break
            time.sleep(3)
        assert act is not None
        assert act.get("status") == "done", f"activity not done: {act.get('status')}, summary={act.get('summary')}"
        assert isinstance(act.get("steps"), list) and len(act["steps"]) >= 2
        # files_changed should be a list (may be empty for benign edits)
        assert isinstance(act.get("files_changed"), list)

        # Idea chips message must appear.
        deadline = time.time() + 30
        found_chips = None
        while time.time() < deadline and not found_chips:
            time.sleep(3)
            rlist = requests.get(
                f"{BASE_URL}/api/chats/{EXISTING_CHAT_ID}/messages?limit=50",
                headers=h, timeout=15,
            )
            msgs = rlist.json() if isinstance(rlist.json(), list) else rlist.json().get("messages", [])
            for m in msgs:
                meta = m.get("metadata") or {}
                chips = meta.get("idea_chips")
                if chips and meta.get("source") == "build_recommendations":
                    # Ensure chip matches shape
                    if isinstance(chips, list) and len(chips) >= 3:
                        found_chips = chips
                        break
        assert found_chips, "idea_chips message did not appear after build completion"
        for c in found_chips[:4]:
            assert c.get("label") and c.get("prompt")
            assert c["prompt"].lower().startswith("@devmgr"), f"prompt must start with @devmgr: {c['prompt']}"


# ─── 6. Vercel / Netlify deploy with fake tokens — clean error, no 500 ────
class TestDeployFakeTokenErrors:
    def test_vercel_fake_token_clean_error(self, h):
        r = requests.post(
            f"{BASE_URL}/api/dev-projects/{EXISTING_PROJECT_ID}/deploy/vercel",
            json={"token": "fake-token-abc-123"}, headers=h, timeout=30,
        )
        # Must NOT be an unhandled 500 (500 would indicate a Python crash).
        assert r.status_code != 500, f"unhandled 500: {r.text[:400]}"
        # Should be 4xx (401/403) or 502.
        assert 400 <= r.status_code < 600
        assert r.status_code in (400, 401, 402, 403, 404, 429, 502), f"unexpected status {r.status_code}: {r.text[:200]}"
        detail = (r.json().get("detail") or "").lower()
        assert "vercel" in detail, f"error detail should mention Vercel: {detail}"

    def test_netlify_fake_token_clean_error(self, h):
        r = requests.post(
            f"{BASE_URL}/api/dev-projects/{EXISTING_PROJECT_ID}/deploy/netlify",
            json={"token": "fake-token-abc-123"}, headers=h, timeout=30,
        )
        assert r.status_code != 500, f"unhandled 500: {r.text[:400]}"
        assert r.status_code in (400, 401, 402, 403, 404, 429, 502), f"unexpected status {r.status_code}: {r.text[:200]}"
        detail = (r.json().get("detail") or "").lower()
        assert "netlify" in detail, f"error detail should mention Netlify: {detail}"
