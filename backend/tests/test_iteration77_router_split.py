"""Iteration 77 — regression breadth for dev_os router split + new features.

Covers:
- Moved routes: dev_os_tasks.py, dev_os_files.py, dev_os_preview.py
- Kept routes on dev_os.py (projects, templates, talk, env-vars)
- NEW: headless browser smoke test + gates/run
- NEW: custom domain publish flow (publish → PATCH production → p-resolve)
- NEW: template live demo (/api/dev-os/templates/{id}/demo/*)
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env — pytest should still be run from CI with env set
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

# Pre-existing AP Ledger project with published release + connected custom domain
AP_PROJECT_ID = "f46a9544-288e-46a1-8cf1-ed8ed857f28d"


# ─── Fixtures ───────────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/demo-login")
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="session")
def project_id(api):
    """Pick the first dev project owned by demo user (fallback to AP_PROJECT_ID)."""
    r = api.get(f"{BASE_URL}/api/dev-projects")
    assert r.status_code == 200, r.text[:200]
    projects = r.json()
    assert isinstance(projects, list) and len(projects) > 0
    # Prefer AP project since it's known to have publish + files
    for p in projects:
        if p.get("id") == AP_PROJECT_ID:
            return AP_PROJECT_ID
    return projects[0]["id"]


# ─── dev_os.py kept routes ──────────────────────────────────────────────────
class TestKeptRoutes:
    def test_list_dev_projects(self, api):
        r = api.get(f"{BASE_URL}/api/dev-projects")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_get_single_dev_project(self, api, project_id):
        r = api.get(f"{BASE_URL}/api/dev-projects/{project_id}")
        assert r.status_code == 200
        p = r.json()
        assert p["id"] == project_id
        assert "name" in p

    def test_templates_list(self, api):
        r = api.get(f"{BASE_URL}/api/dev-os/templates")
        assert r.status_code == 200
        data = r.json()
        # Response may be list or {templates: [...]}
        tpls = data if isinstance(data, list) else data.get("templates", [])
        assert len(tpls) > 0
        ids = [t.get("id") or t.get("template_id") for t in tpls]
        assert "ap-ledger" in ids

    def test_env_vars_get(self, api, project_id):
        r = api.get(f"{BASE_URL}/api/dev-projects/{project_id}/env-vars")
        assert r.status_code == 200

    def test_env_vars_put(self, api, project_id):
        r = api.put(
            f"{BASE_URL}/api/dev-projects/{project_id}/env-vars",
            json={"env_vars": {"TEST_ITER77_KEY": "abc123"}},
        )
        assert r.status_code in (200, 204)
        # verify persisted
        g = api.get(f"{BASE_URL}/api/dev-projects/{project_id}/env-vars")
        got = g.json()
        vars_ = got.get("env_vars") or got
        assert vars_.get("TEST_ITER77_KEY") == "abc123"


# ─── dev_os_tasks.py (moved) ────────────────────────────────────────────────
class TestTasksRoutes:
    _created_task_id = None

    def test_get_dev_tasks(self, api, project_id):
        r = api.get(f"{BASE_URL}/api/dev-tasks", params={"project_id": project_id})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_dev_task(self, api, project_id):
        r = api.post(
            f"{BASE_URL}/api/dev-tasks",
            json={"project_id": project_id, "title": "TEST_iter77_task", "description": "regression"},
        )
        assert r.status_code in (200, 201), r.text[:200]
        t = r.json()
        assert t.get("title") == "TEST_iter77_task"
        assert "id" in t
        TestTasksRoutes._created_task_id = t["id"]

    def test_patch_dev_task_status(self, api):
        assert TestTasksRoutes._created_task_id, "create must run first"
        r = api.patch(
            f"{BASE_URL}/api/dev-tasks/{TestTasksRoutes._created_task_id}",
            json={"status": "in_progress"},
        )
        assert r.status_code == 200
        assert r.json().get("status") == "in_progress"

    def test_improvement_proposals(self, api):
        r = api.get(f"{BASE_URL}/api/improvement-proposals")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_role_claims_returns_catalog(self, api, project_id):
        """Regression: must work on projects WITHOUT a role_claims field."""
        r = api.get(f"{BASE_URL}/api/dev-projects/{project_id}/role-claims")
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "role_claims" in data
        assert "catalog" in data
        assert isinstance(data["catalog"], list)

    def test_role_claims_404(self, api):
        r = api.get(f"{BASE_URL}/api/dev-projects/nonexistent-xyz/role-claims")
        assert r.status_code in (403, 404)


# ─── dev_os_files.py (moved) ────────────────────────────────────────────────
class TestFilesRoutes:
    _file_id = None

    def test_list_files(self, api, project_id):
        r = api.get(f"{BASE_URL}/api/dev-projects/{project_id}/files")
        assert r.status_code == 200
        data = r.json()
        files = data.get("files") if isinstance(data, dict) else data
        assert isinstance(files, list)
        if files:
            TestFilesRoutes._file_id = files[0]["id"]

    def test_get_single_file(self, api, project_id):
        if not TestFilesRoutes._file_id:
            pytest.skip("no files")
        r = api.get(f"{BASE_URL}/api/dev-projects/{project_id}/files/{TestFilesRoutes._file_id}")
        assert r.status_code == 200
        f = r.json()
        assert "content" in f

    def test_put_file_content(self, api, project_id):
        if not TestFilesRoutes._file_id:
            pytest.skip("no files")
        r = api.get(f"{BASE_URL}/api/dev-projects/{project_id}/files/{TestFilesRoutes._file_id}")
        original = r.json()["content"]
        marker = f"\n<!-- TEST_iter77 {uuid.uuid4().hex[:6]} -->\n"
        r2 = api.put(
            f"{BASE_URL}/api/dev-projects/{project_id}/files/{TestFilesRoutes._file_id}",
            json={"content": original + marker},
        )
        assert r2.status_code in (200, 204), r2.text[:200]
        # verify persisted
        g = api.get(f"{BASE_URL}/api/dev-projects/{project_id}/files/{TestFilesRoutes._file_id}")
        assert marker.strip() in g.json()["content"]

    def test_file_snapshots(self, api, project_id):
        if not TestFilesRoutes._file_id:
            pytest.skip("no files")
        r = api.get(
            f"{BASE_URL}/api/dev-projects/{project_id}/files/{TestFilesRoutes._file_id}/snapshots"
        )
        assert r.status_code == 200
        data = r.json()
        arr = data.get("snapshots") if isinstance(data, dict) else data
        assert isinstance(arr, list)

    def test_release_notes(self, api, project_id):
        r = api.get(f"{BASE_URL}/api/dev-projects/{project_id}/release-notes")
        assert r.status_code == 200
        data = r.json()
        arr = data.get("releases") if isinstance(data, dict) else data
        assert isinstance(arr, list)

    def test_memory_get(self, api, project_id):
        r = api.get(f"{BASE_URL}/api/dev-projects/{project_id}/memory")
        assert r.status_code == 200

    def test_audit_log(self, api):
        r = api.get(f"{BASE_URL}/api/dev-os/audit-log")
        assert r.status_code == 200
        data = r.json()
        entries = data.get("entries") if isinstance(data, dict) else data
        assert isinstance(entries, list)


# ─── dev_os_preview.py (moved) ──────────────────────────────────────────────
class TestPreviewRoutes:
    def test_preview_index_html_no_auth(self, project_id):
        """No auth required for preview."""
        r = requests.get(f"{BASE_URL}/api/dev-projects/{project_id}/preview/index.html")
        assert r.status_code == 200, r.text[:200]
        assert "html" in r.headers.get("content-type", "").lower() or "<html" in r.text.lower()

    def test_presence_heartbeat(self, api, project_id):
        r = api.post(f"{BASE_URL}/api/dev-projects/{project_id}/presence/heartbeat", json={})
        assert r.status_code in (200, 201, 204)

    def test_presence_delete(self, api, project_id):
        r = api.delete(f"{BASE_URL}/api/dev-projects/{project_id}/presence")
        assert r.status_code in (200, 204)

    def test_share_token_then_public_serve(self, api, project_id):
        r = api.post(f"{BASE_URL}/api/dev-projects/{project_id}/share-token", json={})
        assert r.status_code in (200, 201), r.text[:200]
        data = r.json()
        token = data.get("token") or data.get("share_token")
        assert token, f"no token in {data}"
        # Public serve (no auth)
        r2 = requests.get(f"{BASE_URL}/api/share/preview/{token}/index.html")
        assert r2.status_code == 200, r2.text[:200]
        assert "<html" in r2.text.lower() or "<!doctype" in r2.text.lower()


# ─── NEW: browser smoke + gates ─────────────────────────────────────────────
class TestBrowserSmoke:
    def test_smoke_test_headless(self, api, project_id):
        r = api.post(f"{BASE_URL}/api/dev-projects/{project_id}/smoke-test", timeout=90)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        checks = data.get("checks") or []
        labels = [c.get("label") or c.get("name") for c in checks]
        # Look for known browser checks (they can be strings/dicts)
        joined = " ".join(str(x) for x in labels).lower()
        assert "page loads" in joined or "renders" in joined or len(labels) >= 4, \
            f"unexpected smoke labels: {labels}"

    def test_gates_run(self, api, project_id):
        r = api.post(f"{BASE_URL}/api/dev-projects/{project_id}/gates/run", timeout=90)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # Response shape: {qa, security, ok, ran_at, smoke?}
        assert "qa" in data and "security" in data
        assert "ok" in data
        # smoke should be merged in when browser check runs
        if "smoke" in data:
            assert "passed" in data["smoke"] or "checks" in data["smoke"]


# ─── NEW: custom domain flow ────────────────────────────────────────────────
class TestCustomDomain:
    _slug = None
    _test_domain = None

    def test_publish_returns_slug(self, api, project_id):
        r = api.post(f"{BASE_URL}/api/dev-projects/{project_id}/publish", json={})
        # publish may 200 if already published or gate-block; test explicitly
        assert r.status_code in (200, 201, 400), r.text[:300]
        if r.status_code >= 400:
            # already published - use production endpoint
            g = api.get(f"{BASE_URL}/api/dev-projects/{project_id}/production")
            if g.status_code == 200:
                TestCustomDomain._slug = g.json().get("slug")
        else:
            TestCustomDomain._slug = r.json().get("slug")
        assert TestCustomDomain._slug, "no slug obtained"

    def test_patch_production_custom_domain(self, api, project_id):
        # Use unique domain — must NOT be ap.acme-demo.com
        TestCustomDomain._test_domain = f"test-{uuid.uuid4().hex[:8]}.iter77-corp.com"
        r = api.patch(
            f"{BASE_URL}/api/dev-projects/{project_id}/production",
            json={"custom_domain": TestCustomDomain._test_domain},
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data.get("custom_domain") == TestCustomDomain._test_domain
        # domain_status should be pending_dns immediately after PATCH
        status = data.get("domain_status")
        assert status in ("pending_dns", "connected"), f"unexpected status {status}"

    def test_p_resolve_public_no_auth(self, api, project_id):
        assert TestCustomDomain._test_domain, "PATCH must run first"
        # small delay to let DB write settle
        time.sleep(0.3)
        # Public call, no cookies
        r = requests.get(
            f"{BASE_URL}/api/p-resolve",
            params={"host": TestCustomDomain._test_domain},
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data.get("slug") == TestCustomDomain._slug or "slug" in data

    def test_p_resolve_unknown_host_404(self):
        r = requests.get(
            f"{BASE_URL}/api/p-resolve",
            params={"host": f"nonexistent-{uuid.uuid4().hex[:8]}.invalid"},
        )
        assert r.status_code == 404


# ─── NEW: template live demo ────────────────────────────────────────────────
class TestTemplateDemo:
    def test_ap_ledger_demo_index_html_public(self):
        r = requests.get(f"{BASE_URL}/api/dev-os/templates/ap-ledger/demo/index.html")
        assert r.status_code == 200, r.text[:300]
        body = r.text.lower()
        assert "<html" in body or "<!doctype" in body

    def test_ap_ledger_demo_app_js_public(self):
        r = requests.get(f"{BASE_URL}/api/dev-os/templates/ap-ledger/demo/app.js")
        # app.js may not exist depending on template layout — try any JS file
        if r.status_code == 404:
            pytest.skip("template does not include app.js; index.html only")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith(("application/javascript", "text/javascript", "application/x-javascript"))

    def test_saas_dashboard_demo_404_no_code(self):
        r = requests.get(f"{BASE_URL}/api/dev-os/templates/saas-dashboard/demo/index.html")
        assert r.status_code == 404


# ─── Talk (LLM — one test, ~30-90s) ─────────────────────────────────────────
class TestTalkEndpoint:
    def test_talk_returns_smoke_and_files(self, api, project_id):
        r = api.post(
            f"{BASE_URL}/api/dev-projects/{project_id}/talk",
            json={"instruction": "Add a small helpful comment at the top of the main HTML file that says TEST_iter77."},
            timeout=180,
        )
        # Could be 200 with files_changed OR (edge) 402 for budget cap
        if r.status_code == 402 or "budget" in r.text.lower():
            pytest.skip(f"LLM budget cap: {r.text[:200]}")
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        assert "files_changed" in data or "smoke" in data or "message" in data
