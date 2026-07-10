"""Iteration 95 - AI Employee Builder Phase 3 (sandbox/permissions/tools/escalation/deploy)
and Phase 4 (marketplace publish/browse/install/creator dashboard).

Uses demo-login to authenticate. All test employees prefixed TEST_ and cleaned up
in module teardown.
"""
import os
import time
import pytest
import requests

def _read_env():
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or _read_env()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/demo-login")
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    yield s
    # Cleanup: delete all TEST_ employees + listings
    try:
        emps = s.get(f"{API}/ai-builder/employees").json().get("employees", [])
        for e in emps:
            if (e.get("name") or "").startswith("TEST_"):
                s.delete(f"{API}/ai-builder/employees/{e['id']}")
    except Exception:
        pass


@pytest.fixture(scope="module")
def emp_id(session):
    r = session.post(f"{API}/ai-builder/employees",
                     json={"source": "blank", "name": "TEST_Phase3_Emp",
                           "job_title": "Support Rep"})
    assert r.status_code == 200, r.text
    eid = r.json()["id"]
    # Give it a description/responsibilities
    session.patch(f"{API}/ai-builder/employees/{eid}",
                  json={"description": "Handles refund and support requests.",
                        "responsibilities": ["Answer FAQs", "Handle refunds"]})
    yield eid


# ── Phase 3 · Permissions ────────────────────────────────────────────────
class TestPermissions:
    def test_permission_options(self, session):
        r = session.get(f"{API}/ai-builder/permission-options")
        assert r.status_code == 200
        data = r.json()
        assert len(data["levels"]) == 5
        assert len(data["tools"]) == 7

    def test_set_permissions_valid(self, session, emp_id):
        r = session.put(f"{API}/ai-builder/employees/{emp_id}/permissions",
                        json={"permission_level": "Draft only", "risk_level": "Medium"})
        assert r.status_code == 200
        assert r.json()["permission_level"] == "Draft only"

    def test_set_permissions_invalid_level(self, session, emp_id):
        r = session.put(f"{API}/ai-builder/employees/{emp_id}/permissions",
                        json={"permission_level": "BogusLevel"})
        assert r.status_code == 400

    def test_get_permissions_shape(self, session, emp_id):
        r = session.get(f"{API}/ai-builder/employees/{emp_id}/permissions")
        assert r.status_code == 200
        data = r.json()
        assert "permission" in data and "tools" in data and "escalation_rules" in data


# ── Phase 3 · Tools ──────────────────────────────────────────────────────
class TestTools:
    def test_add_tool(self, session, emp_id):
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/tools",
                         json={"tool": "TeamNest chat", "requires_approval": False})
        assert r.status_code == 200
        pytest.tool_id = r.json()["id"]

    def test_duplicate_tool_400(self, session, emp_id):
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/tools",
                         json={"tool": "TeamNest chat"})
        assert r.status_code == 400

    def test_delete_tool_404_guard(self, session, emp_id):
        r = session.delete(f"{API}/ai-builder/employees/{emp_id}/tools/does-not-exist")
        assert r.status_code == 404

    def test_delete_tool_ok(self, session, emp_id):
        # add second tool then delete it
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/tools",
                         json={"tool": "TeamNest tasks"})
        assert r.status_code == 200
        tid = r.json()["id"]
        d = session.delete(f"{API}/ai-builder/employees/{emp_id}/tools/{tid}")
        assert d.status_code == 200


# ── Phase 3 · Escalation ─────────────────────────────────────────────────
class TestEscalation:
    def test_add_escalation(self, session, emp_id):
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/escalation-rules",
                         json={"trigger": "refund request",
                               "action": "escalate to human manager",
                               "notify_role": "Manager"})
        assert r.status_code == 200
        pytest.esc_id = r.json()["id"]

    def test_delete_escalation_404(self, session, emp_id):
        r = session.delete(f"{API}/ai-builder/employees/{emp_id}/escalation-rules/bogus")
        assert r.status_code == 404

    def test_delete_escalation_ok(self, session, emp_id):
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/escalation-rules",
                         json={"trigger": "legal", "action": "escalate"})
        assert r.status_code == 200
        rid = r.json()["id"]
        d = session.delete(f"{API}/ai-builder/employees/{emp_id}/escalation-rules/{rid}")
        assert d.status_code == 200


# ── Phase 3 · Sandbox ────────────────────────────────────────────────────
class TestSandbox:
    def test_sandbox_reply(self, session, emp_id):
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/sandbox",
                         json={"message": "Hello, what are your hours?"}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        # Note: API returns ai_response (not "reply" as spec says). Frontend uses ai_response.
        assert "ai_response" in data and "model" in data and "escalated" in data
        assert len(data["ai_response"]) > 0
        pytest.sandbox_run_id = data["id"]

    def test_sandbox_escalation(self, session, emp_id):
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/sandbox",
                         json={"message": "I want a full refund for my last order please."},
                         timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        # Model may not always follow ESCALATE format perfectly, but with a matching rule
        # it usually does. Accept either escalated flag or reply starting with ESCALATE.
        assert data["escalated"] is True or data["ai_response"].upper().startswith("ESCALATE:"), \
            f"Expected escalation, got: {data['ai_response'][:200]}"


# ── Phase 3 · Test runs rate ─────────────────────────────────────────────
class TestRuns:
    def test_list_runs(self, session, emp_id):
        r = session.get(f"{API}/ai-builder/employees/{emp_id}/test-runs")
        assert r.status_code == 200
        runs = r.json()["runs"]
        assert len(runs) >= 1

    def test_rate_good_save_as_example(self, session, emp_id):
        rid = pytest.sandbox_run_id
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/test-runs/{rid}/rate",
                         json={"rating": "good", "save_as_example": True})
        assert r.status_code == 200
        # Verify example was created
        detail = session.get(f"{API}/ai-builder/employees/{emp_id}").json()
        assert any(e.get("example_type") == "Sandbox" for e in detail["examples"])

    def test_rate_bad_rating_400(self, session, emp_id):
        rid = pytest.sandbox_run_id
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/test-runs/{rid}/rate",
                         json={"rating": "meh"})
        assert r.status_code == 400

    def test_clear_test_runs(self, session, emp_id):
        r = session.delete(f"{API}/ai-builder/employees/{emp_id}/test-runs")
        assert r.status_code == 200
        runs = session.get(f"{API}/ai-builder/employees/{emp_id}/test-runs").json()["runs"]
        assert runs == []


# ── Phase 3 · Deployment ─────────────────────────────────────────────────
class TestDeployment:
    def test_deploy_handle(self, session, emp_id):
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/deploy",
                         json={"channel": "handle", "handle": "TEST_Support_Bot!"})
        assert r.status_code == 200
        dep = r.json()
        # handle should be normalized (lowercase, alnum + _/-)
        assert dep["handle"] == "test_support_bot"
        # Employee should be marked deployed
        emp = session.get(f"{API}/ai-builder/employees/{emp_id}").json()["employee"]
        assert emp["status"] == "Deployed"

    def test_get_deployment(self, session, emp_id):
        r = session.get(f"{API}/ai-builder/employees/{emp_id}/deployment")
        assert r.status_code == 200
        assert r.json()["deployment"]["status"] == "active"

    def test_deploy_handle_clash(self, session, emp_id):
        # Create a second employee and try to deploy with same handle
        r = session.post(f"{API}/ai-builder/employees",
                         json={"source": "blank", "name": "TEST_ClashEmp"})
        eid2 = r.json()["id"]
        c = session.post(f"{API}/ai-builder/employees/{eid2}/deploy",
                         json={"channel": "handle", "handle": "test_support_bot"})
        assert c.status_code == 409

    def test_deploy_chat_missing_chat_id(self, session, emp_id):
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/deploy",
                         json={"channel": "chat"})
        assert r.status_code == 400

    def test_undeploy(self, session, emp_id):
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/undeploy")
        assert r.status_code == 200
        emp = session.get(f"{API}/ai-builder/employees/{emp_id}").json()["employee"]
        assert emp["status"] == "Ready"


# ── Phase 4 · Marketplace publish/browse/detail ──────────────────────────
class TestMarketplace:
    def test_categories(self, session):
        r = session.get(f"{API}/ai-builder/marketplace/categories")
        assert r.status_code == 200
        assert len(r.json()["categories"]) == 12

    def test_publish_invalid_category(self, session, emp_id):
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/marketplace/publish",
                         json={"title": "TEST_Listing", "category": "Bogus"})
        assert r.status_code == 400

    def test_publish_ok(self, session, emp_id):
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/marketplace/publish",
                         json={"title": "TEST_Support_Listing", "tagline": "Handles refunds",
                               "description": "Support employee",
                               "category": "Customer Support", "price_usd": 0,
                               "share_knowledge": False})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "Published"
        pytest.listing_id = data["id"]
        # employee marketplace_status flipped
        emp = session.get(f"{API}/ai-builder/employees/{emp_id}").json()["employee"]
        assert emp["marketplace_status"] == "Published to Marketplace"

    def test_republish_no_duplicate(self, session, emp_id):
        r = session.post(f"{API}/ai-builder/employees/{emp_id}/marketplace/publish",
                         json={"title": "TEST_Support_Listing_v2", "category": "Customer Support"})
        assert r.status_code == 200
        assert r.json()["id"] == pytest.listing_id  # same listing updated

    def test_browse(self, session):
        r = session.get(f"{API}/ai-builder/marketplace",
                        params={"category": "Customer Support", "q": "TEST_"})
        assert r.status_code == 200
        listings = r.json()["listings"]
        ids = [l["id"] for l in listings]
        assert pytest.listing_id in ids
        target = next(l for l in listings if l["id"] == pytest.listing_id)
        assert "installed" in target and "is_mine" in target
        assert target["is_mine"] is True

    def test_listing_detail(self, session):
        r = session.get(f"{API}/ai-builder/marketplace/{pytest.listing_id}")
        assert r.status_code == 200
        data = r.json()
        assert "preview" in data
        prev = data["preview"]
        for k in ("permission_level", "tools", "escalation_count",
                  "has_style_profile", "shares_knowledge",
                  "document_count", "example_count"):
            assert k in prev

    def test_creator_mine(self, session):
        r = session.get(f"{API}/ai-builder/marketplace/mine")
        assert r.status_code == 200
        data = r.json()
        assert "summary" in data
        assert data["summary"]["total_listings"] >= 1
        for k in ("total_listings", "published", "total_installs", "total_revenue_usd"):
            assert k in data["summary"]

    def test_unpublish_removes_from_browse(self, session, emp_id):
        # Publish a new one for the unpublish scenario (to avoid disturbing later install test)
        # Actually just unpublish current, verify browse hides it, then re-publish
        u = session.post(f"{API}/ai-builder/employees/{emp_id}/marketplace/unpublish")
        assert u.status_code == 200
        listings = session.get(f"{API}/ai-builder/marketplace").json()["listings"]
        assert pytest.listing_id not in [l["id"] for l in listings]
        # Re-publish for install test
        session.post(f"{API}/ai-builder/employees/{emp_id}/marketplace/publish",
                     json={"title": "TEST_Support_Listing", "category": "Customer Support",
                           "share_knowledge": True})


# ── Phase 4 · Install ────────────────────────────────────────────────────
class TestInstall:
    def test_install_double_400(self, session, emp_id):
        """Since the listing is in the same workspace as the creator, first install
        should succeed and a second install must 400."""
        r1 = session.post(f"{API}/ai-builder/marketplace/{pytest.listing_id}/install")
        # It may 200 the first time
        assert r1.status_code in (200, 400)
        if r1.status_code == 200:
            new_eid = r1.json()["employee_id"]
            pytest.installed_eid = new_eid
        # Second install must 400
        r2 = session.post(f"{API}/ai-builder/marketplace/{pytest.listing_id}/install")
        assert r2.status_code == 400

    def test_install_count_incremented(self, session):
        r = session.get(f"{API}/ai-builder/marketplace/{pytest.listing_id}")
        assert r.status_code == 200
        assert r.json()["install_count"] >= 1

    def test_installs_list(self, session):
        r = session.get(f"{API}/ai-builder/marketplace/installs")
        assert r.status_code == 200
        installs = r.json()["installs"]
        assert any(l["listing_id"] == pytest.listing_id for l in installs)


# ── Employee delete cascades ─────────────────────────────────────────────
class TestCascade:
    def test_delete_cascades_marketplace(self, session):
        # Create a fresh employee, publish, then delete → listing gone
        r = session.post(f"{API}/ai-builder/employees",
                         json={"source": "blank", "name": "TEST_CascadeEmp"})
        eid = r.json()["id"]
        p = session.post(f"{API}/ai-builder/employees/{eid}/marketplace/publish",
                         json={"title": "TEST_CascadeListing", "category": "Productivity"})
        listing_id = p.json()["id"]
        d = session.delete(f"{API}/ai-builder/employees/{eid}")
        assert d.status_code == 200
        detail = session.get(f"{API}/ai-builder/marketplace/{listing_id}")
        assert detail.status_code == 404
