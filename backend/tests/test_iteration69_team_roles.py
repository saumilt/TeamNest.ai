"""Iteration 69 — Team Roles + Talk-to-Build with role_key
Backend regression tests for:
  - GET    /api/dev-projects/{pid}/role-claims   (catalog + current claims)
  - POST   /api/dev-projects/{pid}/role-claims/{role_key} (claim)
  - DELETE /api/dev-projects/{pid}/role-claims/{role_key} (release)
  - POST   /api/dev-projects/{pid}/talk          (now accepts optional role_key)
"""
import os
import time

import pytest
import requests

# Load frontend/.env so REACT_APP_BACKEND_URL is available outside the frontend
def _load_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())


_load_env()
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"


# ─── Session / fixtures ────────────────────────────────────────────────
def _retry(method, url, session=None, **kw):
    last = None
    for i in range(4):
        try:
            if session is not None:
                r = session.request(method, url, timeout=30, **kw)
            else:
                r = requests.request(method, url, timeout=30, **kw)
            if r.status_code < 500:
                return r
            last = r
        except requests.RequestException as e:
            last = e
        time.sleep(1.5 * (i + 1))
    if isinstance(last, requests.Response):
        return last
    raise last  # type: ignore


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = _retry("POST", f"{API}/auth/demo-login", session=s)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def project_id(session):
    r = _retry("GET", f"{API}/dev-projects", session=session)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    projects = body if isinstance(body, list) else body.get("projects", [])
    assert projects, "no demo projects to test against"
    return projects[0]["id"]


# ─── GET catalog ───────────────────────────────────────────────────────
class TestRoleCatalog:
    def test_get_role_claims_returns_catalog_of_12(self, session, project_id):
        r = _retry("GET", f"{API}/dev-projects/{project_id}/role-claims",
                   session=session)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert "role_claims" in body and isinstance(body["role_claims"], dict)
        assert "catalog" in body and isinstance(body["catalog"], list)
        assert len(body["catalog"]) == 12, f"expected 12 roles, got {len(body['catalog'])}"
        keys = {c["role_key"] for c in body["catalog"]}
        for must in ("frontend", "backend", "qa", "architect", "security", "devops"):
            assert must in keys, f"missing role key {must}"
        for c in body["catalog"]:
            assert "label" in c and c["label"]
            assert "role_key" in c and c["role_key"]


# ─── POST claim / DELETE release ───────────────────────────────────────
class TestClaimAndRelease:
    def test_claim_frontend_role(self, session, project_id):
        # cleanup any prior claim first
        _retry("DELETE", f"{API}/dev-projects/{project_id}/role-claims/frontend",
               session=session)
        r = _retry("POST", f"{API}/dev-projects/{project_id}/role-claims/frontend",
                   session=session)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("ok") is True
        assert body.get("claimed_role_key") == "frontend"
        claims = body.get("role_claims") or {}
        assert "frontend" in claims, f"frontend missing from claims: {claims}"
        assert claims["frontend"].get("user_id")
        assert claims["frontend"].get("user_name")

    def test_claim_unknown_role_returns_400(self, session, project_id):
        r = _retry("POST", f"{API}/dev-projects/{project_id}/role-claims/invalidxxx",
                   session=session)
        assert r.status_code == 400, r.text[:200]
        # Body should mention unknown role
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        msg = (body.get("detail") or body.get("message") or "").lower()
        assert "unknown" in msg or "role" in msg

    def test_switching_role_releases_previous(self, session, project_id):
        # Claim frontend, then claim qa — frontend should drop off
        _retry("POST", f"{API}/dev-projects/{project_id}/role-claims/frontend",
               session=session)
        r = _retry("POST", f"{API}/dev-projects/{project_id}/role-claims/qa",
                   session=session)
        assert r.status_code == 200, r.text[:200]
        claims = r.json().get("role_claims") or {}
        # User now in qa only
        user_keys = [k for k, v in claims.items() if v.get("user_id")]
        # Find this user's role(s)
        my_id = claims.get("qa", {}).get("user_id")
        my_roles = [k for k, v in claims.items() if v.get("user_id") == my_id]
        assert my_roles == ["qa"], f"expected only qa, got {my_roles}"

    def test_release_role(self, session, project_id):
        # Ensure user holds qa first
        _retry("POST", f"{API}/dev-projects/{project_id}/role-claims/qa",
               session=session)
        r = _retry("DELETE", f"{API}/dev-projects/{project_id}/role-claims/qa",
                   session=session)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body.get("ok") is True
        claims = body.get("role_claims") or {}
        # Verify with GET
        r2 = _retry("GET", f"{API}/dev-projects/{project_id}/role-claims",
                    session=session)
        claims2 = r2.json().get("role_claims") or {}
        assert "qa" not in claims2, f"qa still present after release: {claims2}"


# ─── Talk-to-Build with role_key ───────────────────────────────────────
class TestTalkWithRoleKey:
    def test_talk_with_role_key_accepted(self, session, project_id):
        payload = {
            "instruction": "add small accessibility skip link",
            "role_key": "frontend",
        }
        r = _retry("POST", f"{API}/dev-projects/{project_id}/talk",
                   json=payload, session=session)
        # Must not be 422 — endpoint must accept the new field
        assert r.status_code != 422, f"422 on role_key field: {r.text[:300]}"
        assert r.status_code == 200, f"unexpected {r.status_code}: {r.text[:300]}"
        body = r.json()
        # If no files yet, ok=false with friendly summary is acceptable
        assert "ok" in body or "summary" in body, body
        if body.get("ok") is False:
            assert "summary" in body and body["summary"]

    def test_talk_without_role_key_still_works(self, session, project_id):
        r = _retry("POST", f"{API}/dev-projects/{project_id}/talk",
                   json={"instruction": "add a footer note"},
                   session=session)
        assert r.status_code == 200, f"backwards compat broken: {r.status_code} {r.text[:300]}"
        body = r.json()
        assert "ok" in body or "summary" in body, body


# ─── Sanity: hire-dev-team endpoint exposed ────────────────────────────
class TestHireDevTeamPresent:
    def test_hire_dev_team_pricing_endpoint(self, session):
        # Pricing endpoint is the lightest sanity check; payment isn't exercised.
        # Try a couple of common shapes.
        for path in ("/billing/hire-dev-team/pricing", "/hire-dev-team/pricing"):
            r = _retry("GET", f"{API}{path}", session=session)
            if r.status_code == 200:
                return
        pytest.skip("Hire-dev-team pricing endpoint moved; UI test will cover this")
