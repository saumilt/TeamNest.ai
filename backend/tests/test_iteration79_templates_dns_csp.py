"""Iteration 79 — Regression tests for:
  1) Template gallery: booking + real-estate-crm code templates
  2) Template live demo endpoints + CSP header
  3) One-click install for both code templates (instant, files seeded, smoke pass, preview CSP)
  4) DNS-proof custom domain flow (verify-domain negative + p-resolve does NOT flip to connected)
  5) Chat pipeline regression after dev_chat_ideas.py split (import sanity)
  6) Preview CSP header on existing project (regression)
"""
import os
import re
import time

import pytest
import requests

_env_url = os.environ.get("REACT_APP_BACKEND_URL")
if not _env_url:
    # Fallback: read from frontend/.env (pytest doesn't inherit React env)
    try:
        with open("/app/frontend/.env") as _fh:
            for _ln in _fh:
                if _ln.startswith("REACT_APP_BACKEND_URL="):
                    _env_url = _ln.split("=", 1)[1].strip()
                    break
    except Exception:
        pass
assert _env_url, "REACT_APP_BACKEND_URL not set"
BASE_URL = _env_url.rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "amit@demo.team"
DEMO_PASSWORD = "Demo@2026"

EXISTING_PROJECT_ID = "40391fb0-f562-45d8-a7bf-0b10e0c1b49d"  # Restaurant Franchise Management Platform


# ─── Fixtures ────────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def public():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth():
    """Cookie-authed session using demo-login."""
    s = requests.Session()
    r = s.post(f"{API}/auth/demo-login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
    if r.status_code != 200:
        # Fallback to plain login
        r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="session")
def created_projects(auth):
    """Track created projects for cleanup."""
    created = []
    yield created
    # Cleanup
    for pid in created:
        try:
            auth.delete(f"{API}/dev-projects/{pid}", timeout=15)
        except Exception:
            pass
        # Best-effort DB-level cleanup via delete endpoint should handle files + releases
        # but if it doesn't, just try again
        try:
            auth.delete(f"{API}/dev-projects/{pid}", timeout=15)
        except Exception:
            pass


# ─── 1) Template catalog ─────────────────────────────────────────────────
class TestTemplateCatalog:
    def test_catalog_lists_new_templates(self, auth):
        r = auth.get(f"{API}/dev-os/templates", timeout=15)
        assert r.status_code == 200
        data = r.json()
        # can be a list or dict-wrapped
        items = data if isinstance(data, list) else data.get("templates") or data.get("items") or []
        by_id = {t["id"]: t for t in items}
        assert "ap-ledger" in by_id
        assert "booking" in by_id
        assert "real-estate-crm" in by_id
        # Both new templates should have code_template keys
        assert by_id["booking"].get("code_template") == "booking"
        assert by_id["real-estate-crm"].get("code_template") == "real_estate_crm"
        assert by_id["ap-ledger"].get("code_template") == "ap_ledger"

    def test_catalog_has_exactly_3_code_templates(self, auth):
        r = auth.get(f"{API}/dev-os/templates", timeout=15)
        items = r.json() if isinstance(r.json(), list) else r.json().get("templates") or []
        code_ones = [t for t in items if t.get("code_template")]
        assert len(code_ones) == 3, f"Expected 3 code templates, got {len(code_ones)}: {[t['id'] for t in code_ones]}"


# ─── 2) Template demo endpoints + CSP ────────────────────────────────────
class TestTemplateDemos:
    @pytest.mark.parametrize("tpl_id", ["booking", "real-estate-crm", "ap-ledger"])
    def test_demo_html_returns_200_with_csp(self, public, tpl_id):
        r = public.get(f"{API}/dev-os/templates/{tpl_id}/demo/index.html", timeout=15)
        assert r.status_code == 200, f"{tpl_id} demo returned {r.status_code}"
        assert "text/html" in r.headers.get("content-type", "").lower()
        csp = r.headers.get("content-security-policy") or r.headers.get("Content-Security-Policy")
        assert csp, f"{tpl_id} missing CSP header"
        assert "connect-src 'none'" in csp
        assert "frame-ancestors 'self'" in csp
        # Body should have login shim marker (means shim was injected)
        assert "tn-login-shim" in r.text


# ─── 3) One-click install ────────────────────────────────────────────────
class TestOneClickInstall:
    @pytest.mark.parametrize("tpl_id,expected_code_key", [
        ("booking", "booking"),
        ("real-estate-crm", "real_estate_crm"),
    ])
    def test_install_is_instant_and_files_seeded(self, auth, created_projects, tpl_id, expected_code_key):
        t0 = time.time()
        r = auth.post(
            f"{API}/dev-projects",
            json={
                "template_id": tpl_id,
                "name": f"TEST_iter79_{tpl_id}",
                "description": "",
                "target_users": "",
                "problem": "",
                "source": "template",
            },
            timeout=30,
        )
        elapsed = time.time() - t0
        assert r.status_code == 200, f"create failed {r.status_code}: {r.text[:400]}"
        proj = r.json()
        pid = proj["id"]
        created_projects.append(pid)
        assert elapsed < 15, f"Install too slow ({elapsed:.1f}s) — should be instant"
        assert proj["status"] == "prototype_ready", f"Expected prototype_ready, got {proj['status']}"
        assert proj.get("template_id") == tpl_id

        # Files seeded
        rf = auth.get(f"{API}/dev-projects/{pid}/files", timeout=15)
        assert rf.status_code == 200
        files_json = rf.json()
        files = files_json if isinstance(files_json, list) else files_json.get("files") or []
        assert len(files) == 7, f"Expected 7 seeded files for {tpl_id}, got {len(files)}: {[f.get('path') for f in files]}"

        # Preview with CSP header
        rp = auth.get(f"{API}/dev-projects/{pid}/preview/index.html", timeout=15)
        assert rp.status_code == 200
        csp = rp.headers.get("content-security-policy") or rp.headers.get("Content-Security-Policy")
        assert csp and "connect-src 'none'" in csp, f"Preview missing CSP for {tpl_id}"

        # Smoke test
        rs = auth.post(f"{API}/dev-projects/{pid}/smoke-test", json={}, timeout=30)
        assert rs.status_code == 200, f"smoke-test http failed {rs.status_code}: {rs.text[:200]}"
        smoke = rs.json()
        assert smoke.get("passed") is True, f"Smoke test not passed for {tpl_id}: {smoke}"


# ─── 4) DNS-proof custom-domain flow ─────────────────────────────────────
class TestDNSProofDomain:
    @pytest.fixture(scope="class")
    def published_project(self, auth):
        """Create + publish a booking template project for domain tests."""
        r = auth.post(
            f"{API}/dev-projects",
            json={"template_id": "booking", "name": "TEST_iter79_dns", "description": "",
                  "target_users": "", "problem": "", "source": "template"},
            timeout=30,
        )
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text[:200]}"
        pid = r.json()["id"]

        # Publish it
        rp = auth.post(f"{API}/dev-projects/{pid}/publish",
                       json={"override_gates": True}, timeout=60)
        assert rp.status_code == 200, f"publish failed: {rp.status_code} {rp.text[:300]}"

        yield pid

        # cleanup
        try:
            auth.delete(f"{API}/dev-projects/{pid}", timeout=15)
        except Exception:
            pass

    def test_patch_custom_domain_pending_dns(self, auth, published_project):
        pid = published_project
        r = auth.patch(f"{API}/dev-projects/{pid}/production",
                       json={"custom_domain": "app.some-unregistered-test-domain-xyz.com"},
                       timeout=20)
        assert r.status_code == 200, f"patch failed: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert data.get("domain_status") == "pending_dns"
        assert (data.get("domain_verify_token") or "").startswith("tn-verify-")
        assert data.get("platform_host"), "platform_host must be set"

    def test_verify_domain_negative(self, auth, published_project):
        pid = published_project
        r = auth.post(f"{API}/dev-projects/{pid}/verify-domain", timeout=20)
        assert r.status_code == 200, f"verify-domain failed: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert data.get("verified") is False
        assert data.get("domain_status") == "pending_dns"
        assert "no matching" in (data.get("detail") or "").lower() or "not" in (data.get("detail") or "").lower()

    def test_p_resolve_does_not_flip_to_connected(self, public, auth, published_project):
        pid = published_project
        r = public.get(f"{API}/p-resolve",
                       params={"host": "app.some-unregistered-test-domain-xyz.com"},
                       timeout=20)
        assert r.status_code == 200, f"p-resolve failed: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert data.get("slug"), "p-resolve should return a slug"

        # Now re-fetch production and ensure status is STILL pending_dns
        rp = auth.get(f"{API}/dev-projects/{pid}/production", timeout=15)
        assert rp.status_code == 200
        prod = rp.json()
        assert prod.get("domain_status") == "pending_dns", \
            f"REGRESSION: domain_status flipped to {prod.get('domain_status')} despite failed DNS proof"

    def test_clear_custom_domain(self, auth, published_project):
        pid = published_project
        r = auth.patch(f"{API}/dev-projects/{pid}/production",
                       json={"custom_domain": ""}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("custom_domain") in (None, "")
        assert data.get("domain_status") is None
        assert data.get("domain_verify_token") is None


# ─── 5) Chat pipeline import regression ──────────────────────────────────
class TestChatPipelineImports:
    def test_dev_chat_ideas_importable(self):
        # Direct import — validates the refactor split did not break anything
        from services import dev_chat_ideas as dci
        assert callable(dci._strip_leadins)
        assert callable(dci._looks_actionable)
        assert callable(dci._is_continuation)
        assert callable(dci._llm_build_ideas)
        assert callable(dci._post_build_recommendations)

    def test_dev_chat_agents_imports_from_ideas(self):
        # Ensure the agents module still imports and re-exports the moved fns
        from services import dev_chat_agents as dca
        # Whether re-exported or just imported, the module must load without error
        assert dca is not None


# ─── 6) Existing project preview still works + CSP header ────────────────
class TestPreviewRegression:
    def test_existing_project_preview_has_csp(self, auth):
        r = auth.get(f"{API}/dev-projects/{EXISTING_PROJECT_ID}/preview/index.html", timeout=20)
        # Project may not exist in current DB; if it doesn't skip gracefully
        if r.status_code == 404:
            pytest.skip(f"Reference project {EXISTING_PROJECT_ID} not in DB")
        assert r.status_code == 200, f"preview failed: {r.status_code} {r.text[:200]}"
        csp = r.headers.get("content-security-policy") or r.headers.get("Content-Security-Policy")
        assert csp and "connect-src 'none'" in csp
        assert "frame-ancestors 'self'" in csp
