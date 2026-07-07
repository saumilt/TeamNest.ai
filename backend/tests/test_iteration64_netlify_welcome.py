"""Iteration 64 — Netlify real integration + welcome email on signup.

New backend surface covered:
  - GET /api/integrations/status  ⇒ now includes `netlify` block
  - GET /api/integrations/netlify/sites
  - POST /api/dev-projects/{id}/netlify/link  +  GET
  - POST /api/dev-projects/{id}/netlify/deploy  (ok:true OR ok:false reason:* both fine)
  - POST /api/auth/signup  ⇒ fires welcome email in background (fire-and-forget)
"""
import os
import time
import subprocess
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def project_id(session):
    r = session.get(f"{BASE_URL}/api/dev-projects", timeout=30)
    assert r.status_code == 200, r.text[:200]
    raw = r.json() or []
    projects = raw if isinstance(raw, list) else (raw.get("projects") or [])
    assert projects, "expected at least one seeded dev project"
    return projects[0]["id"]


# ─── /integrations/status (netlify block) ──────────────────────────────────
class TestNetlifyStatus:
    def test_status_includes_netlify(self, session):
        r = session.get(f"{BASE_URL}/api/integrations/status", timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "netlify" in data, f"netlify missing from status: keys={list(data.keys())}"
        nl = data["netlify"]
        assert nl.get("ok") is True, f"netlify not ok: {nl}"
        # Expected real fields for the configured Netlify token
        assert nl.get("full_name") == "Sam Thakkar", (
            f"unexpected netlify full_name: {nl.get('full_name')}"
        )
        # email/id/site_count keys should at least exist
        for k in ("id", "email", "site_count"):
            assert k in nl, f"netlify block missing key {k}: {nl}"
        assert isinstance(nl.get("site_count"), int)


# ─── /integrations/netlify/sites ───────────────────────────────────────────
class TestNetlifySites:
    def test_list_sites(self, session):
        r = session.get(f"{BASE_URL}/api/integrations/netlify/sites", timeout=30)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("ok") is True, body
        assert isinstance(body.get("sites"), list)


# ─── /dev-projects/{id}/netlify/link + deploy ──────────────────────────────
class TestNetlifyLinkDeploy:
    def test_link_then_get(self, session, project_id):
        payload = {"netlify_site_id": "test", "netlify_site_name": "demo-site"}
        r = session.post(
            f"{BASE_URL}/api/dev-projects/{project_id}/netlify/link",
            json=payload, timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("ok") is True, body
        link = body.get("link") or {}
        assert link.get("netlify_site_id") == "test"
        assert link.get("netlify_site_name") == "demo-site"

        # Verify persistence via GET
        r2 = session.get(
            f"{BASE_URL}/api/dev-projects/{project_id}/netlify/link", timeout=30,
        )
        assert r2.status_code == 200, r2.text[:300]
        out = r2.json()
        link2 = out.get("link") or {}
        assert link2.get("netlify_site_id") == "test", out
        assert link2.get("netlify_site_name") == "demo-site"

    def test_deploy_returns_structured_result(self, session, project_id):
        r = session.post(
            f"{BASE_URL}/api/dev-projects/{project_id}/netlify/deploy", timeout=60,
        )
        # Spec: ok:true with deploy, OR ok:false reason:* — both acceptable
        # Status should be 200 regardless (structured response)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        if body.get("ok") is True:
            assert body.get("deploy") or body.get("deployment"), body
        else:
            assert body.get("reason"), f"expected reason on failure: {body}"


# ─── /auth/signup fires welcome email (fire-and-forget) ────────────────────
class TestSignupWelcomeEmail:
    def test_signup_latency_and_welcome_log(self):
        ts = int(time.time())
        email = f"welcome-test-{ts}@example.com"
        payload = {
            "email": email,
            "password": "WelcomeTest@2026",
            "name": "Welcome Test",
            "workspace_name": f"WelcomeWS-{ts}",
        }
        s = requests.Session()
        t0 = time.time()
        r = s.post(f"{BASE_URL}/api/auth/signup", json=payload, timeout=15)
        elapsed = time.time() - t0
        # Signup latency must not be inflated by the email send
        assert elapsed < 5.0, f"signup took too long: {elapsed:.2f}s (expected < 5s)"
        # Accept 200 or 201
        assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text[:200]}"

        # Give the background task a moment to actually send + log
        time.sleep(2.5)

        # Now scan supervisor backend log for the welcome line
        try:
            out = subprocess.check_output(
                ["tail", "-n", "400", "/var/log/supervisor/backend.out.log"],
                stderr=subprocess.STDOUT, timeout=10,
            ).decode("utf-8", errors="ignore")
        except Exception:
            out = ""
        try:
            err = subprocess.check_output(
                ["tail", "-n", "400", "/var/log/supervisor/backend.err.log"],
                stderr=subprocess.STDOUT, timeout=10,
            ).decode("utf-8", errors="ignore")
        except Exception:
            err = ""
        combined = out + "\n" + err

        marker = "[welcome] sent to"
        assert marker in combined and email in combined, (
            f"welcome log line not found for {email}.\n"
            f"--- tail backend.out.log ---\n{out[-1500:]}\n"
            f"--- tail backend.err.log ---\n{err[-1500:]}"
        )
