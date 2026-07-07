"""Iteration 63 — Phase 6 P1+P2 integrations + chat sidebar grouping/rocket badge.

Tests real GitHub/Vercel/Mailgun plumbing surfaced via:
  - GET /api/integrations/status
  - GET /api/integrations/vercel/projects
  - POST /api/dev-projects/{id}/github/export (real or fallback)
  - POST /api/dev-projects/{id}/vercel/link  +  GET
  - POST /api/dev-projects/{id}/vercel/deploy
  - PATCH /api/chats/{id}/category  (used by frontend sidebar grouping)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to frontend/.env value at test time so this file is portable.
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


# ─── /integrations/status ──────────────────────────────────────────────────
class TestIntegrationsStatus:
    def test_status_shape_and_real_accounts(self, session):
        r = session.get(f"{BASE_URL}/api/integrations/status", timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert set(["github", "vercel", "mailgun_domain"]).issubset(data.keys())

        gh = data["github"]
        assert gh.get("ok") is True, f"github not ok: {gh}"
        assert gh.get("login") == "saumilt", f"unexpected login: {gh.get('login')}"

        vc = data["vercel"]
        assert vc.get("ok") is True, f"vercel not ok: {vc}"
        assert vc.get("username") == "sam-7658", f"unexpected vercel username: {vc.get('username')}"

        mg = data["mailgun_domain"]
        assert mg.get("ok") is True, f"mailgun not ok: {mg}"
        assert mg.get("domain") == "teamnest.ai", f"unexpected domain: {mg.get('domain')}"
        assert mg.get("state") == "active"
        assert mg.get("is_verified") is True
        records = mg.get("records") or []
        assert len(records) == 5, f"expected 5 DNS records, got {len(records)}"
        for rec in records:
            assert set(["purpose", "record_type", "name", "value_preview", "valid"]).issubset(rec.keys())
            assert rec["valid"] is True, f"record not valid: {rec}"


# ─── /integrations/vercel/projects ─────────────────────────────────────────
class TestVercelProjects:
    def test_list_projects_ok(self, session):
        r = session.get(f"{BASE_URL}/api/integrations/vercel/projects", timeout=30)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("ok") is True, body
        assert isinstance(body.get("projects"), list)


# ─── GitHub export ─────────────────────────────────────────────────────────
class TestGithubExport:
    def test_export_returns_ok_via_real_or_fallback(self, session, project_id):
        r = session.post(f"{BASE_URL}/api/dev-projects/{project_id}/github/export", timeout=60)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("ok") is True, f"export not ok: {body}"
        pr = body.get("pr") or {}
        assert pr, "expected pr block in response"
        # Either real (api.github.com PR URL) or fallback (real_failed_reason set)
        if pr.get("real") is True:
            assert "github.com" in (pr.get("pr_url") or ""), pr
        else:
            assert body.get("real_failed_reason"), f"expected fallback reason: {body}"


# ─── Vercel link + deploy ──────────────────────────────────────────────────
class TestVercelLinkDeploy:
    def test_link_then_get(self, session, project_id):
        payload = {"vercel_project_id": "prj_test", "vercel_project_name": "demo"}
        r = session.post(
            f"{BASE_URL}/api/dev-projects/{project_id}/vercel/link",
            json=payload, timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("ok") is True
        link = body.get("link") or {}
        assert link.get("vercel_project_id") == "prj_test"
        assert link.get("vercel_project_name") == "demo"

        r2 = session.get(
            f"{BASE_URL}/api/dev-projects/{project_id}/vercel/link", timeout=30,
        )
        assert r2.status_code == 200, r2.text[:300]
        out = r2.json()
        assert out.get("link"), f"expected link to persist: {out}"
        assert out["link"]["vercel_project_id"] == "prj_test"

    def test_deploy_returns_structured_result(self, session, project_id):
        r = session.post(
            f"{BASE_URL}/api/dev-projects/{project_id}/vercel/deploy", timeout=60,
        )
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        # ok may be true or false depending on whether the linked vercel
        # project has a production deployment. Both are acceptable.
        if body.get("ok") is True:
            assert body.get("deployment"), body
        else:
            assert body.get("reason") in {
                "not_linked",
                "no_production_deployment_to_redeploy",
                "list_deployments_failed",
                "redeploy_failed",
                "not_configured",
                "exception",
            }, f"unexpected reason: {body}"


# ─── Chats category PATCH (used by sidebar grouping) ──────────────────────
class TestChatCategory:
    def test_patch_chat_category(self, session):
        r = session.get(f"{BASE_URL}/api/chats", timeout=30)
        assert r.status_code == 200, r.text[:200]
        raw = r.json() or []
        chats = raw if isinstance(raw, list) else (raw.get("chats") or [])
        if not chats:
            pytest.skip("no chats available in demo workspace")
        chat_id = chats[0]["id"]
        r2 = session.patch(
            f"{BASE_URL}/api/chats/{chat_id}/category",
            json={"category": "engineering"}, timeout=30,
        )
        assert r2.status_code == 200, r2.text[:200]
        assert r2.json().get("category") == "engineering"

        # Verify persistence: GET /chats should now show category set
        r3 = session.get(f"{BASE_URL}/api/chats", timeout=30)
        raw3 = r3.json() or []
        chats3 = raw3 if isinstance(raw3, list) else (raw3.get("chats") or [])
        target = next((c for c in chats3 if c["id"] == chat_id), None)
        assert target and target.get("category") == "engineering"
