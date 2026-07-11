"""Iteration 97 — AI Employee Builder DEVELOPER PROGRAM (Beta).

Covers:
  * Non-approved builder (buildertest@example.com) is gated → GET
    /builder-program/me returns builder_access=false, POST
    /ai-builder/employees returns 403.
  * POST /builder-program/apply creates a pending app; duplicate apply → 400.
  * Super admin (amit@demo.team) can GET
    /builder-program/applications?status=pending & counts; non-super → 403.
  * decide {approve} → user.builder_approved=true, status=approved.
  * After approval, buildertest builder_access=true reason=approved, can
    POST /ai-builder/employees (cleanup created employee).
  * Super admin builder_access=true reason=super_admin, can create.
  * Team-plan perks list includes 'AI Employee Builder access (Beta)'.
  * Super admin gets unlimited credits in every workspace they belong to
    (verified via /api/billing/usage → unlimited=true).
"""
import os
import pytest
import requests

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

AMIT_EMAIL = "amit@demo.team"
AMIT_PASSWORD = "Demo@2026"
BUILDER_EMAIL = "buildertest@example.com"
BUILDER_PASSWORD = "Demo@2026"


# ── auth helpers ─────────────────────────────────────────────────────────
def login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in response for {email}: {r.json()}"
    return tok


def hdrs(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def builder_token():
    return login(BUILDER_EMAIL, BUILDER_PASSWORD)


@pytest.fixture(scope="module")
def amit_token():
    # demo-login gives us the super-admin JWT
    r = requests.post(f"{BASE_URL}/api/auth/demo-login", timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module", autouse=True)
def _reset_state(builder_token):
    """Ensure buildertest starts un-approved & has no lingering app; cleanup after."""
    # Reset via API: revoke any prior approval by deleting apps & flipping bit
    # requires super admin — use amit demo-login
    r = requests.post(f"{BASE_URL}/api/auth/demo-login", timeout=20)
    amit_tok = r.json().get("token")
    # If any existing application for buildertest, delete via DB direct is not exposed
    # So rely on state being reset by main agent. Attempt reset via a
    # graceful path: list apps then reject any pending/approved.
    lst = requests.get(f"{BASE_URL}/api/builder-program/applications?status=all",
                       headers=hdrs(amit_tok), timeout=20)
    if lst.status_code == 200:
        for a in lst.json().get("applications", []):
            if a.get("user_email") == BUILDER_EMAIL and a.get("status") in ("pending", "approved"):
                requests.post(f"{BASE_URL}/api/builder-program/applications/{a['id']}/decide",
                              headers=hdrs(amit_tok), json={"decision": "reject", "note": "reset"}, timeout=20)
    yield
    # Post-test cleanup: revert to un-approved state.
    lst = requests.get(f"{BASE_URL}/api/builder-program/applications?status=all",
                       headers=hdrs(amit_tok), timeout=20)
    if lst.status_code == 200:
        for a in lst.json().get("applications", []):
            if a.get("user_email") == BUILDER_EMAIL:
                requests.post(f"{BASE_URL}/api/builder-program/applications/{a['id']}/decide",
                              headers=hdrs(amit_tok), json={"decision": "reject", "note": "cleanup"}, timeout=20)


# ── 1) BUILDER GATE ──────────────────────────────────────────────────────
class TestBuilderGate:
    def test_me_not_approved(self, builder_token):
        r = requests.get(f"{BASE_URL}/api/builder-program/me", headers=hdrs(builder_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["builder_access"] is False
        assert data["reason"] is None

    def test_create_employee_forbidden(self, builder_token):
        r = requests.post(f"{BASE_URL}/api/ai-builder/employees",
                          headers=hdrs(builder_token),
                          json={"source": "blank", "name": "TEST_ShouldFail"}, timeout=20)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


# ── 2) APPLY ─────────────────────────────────────────────────────────────
class TestApply:
    APP_PAYLOAD = {
        "full_name": "Builder Test",
        "company": "TEST Co",
        "website": "https://example.com",
        "motivation": "I want to build custom AI employees for my SMB clients.",
        "value_prop": "Deep operations know-how and 10 years of RPA design.",
        "agent_ideas": "AI HR Assistant, AI Bookkeeper, AI Concierge for hotels.",
    }

    def test_apply_success(self, builder_token):
        r = requests.post(f"{BASE_URL}/api/builder-program/apply",
                          headers=hdrs(builder_token), json=self.APP_PAYLOAD, timeout=20)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "pending"
        assert doc["full_name"] == "Builder Test"
        assert doc["user_email"] == BUILDER_EMAIL

    def test_apply_duplicate_400(self, builder_token):
        r = requests.post(f"{BASE_URL}/api/builder-program/apply",
                          headers=hdrs(builder_token), json=self.APP_PAYLOAD, timeout=20)
        assert r.status_code == 400, f"expected 400 duplicate, got {r.status_code}"


# ── 3) SUPER ADMIN REVIEW ────────────────────────────────────────────────
class TestReview:
    def test_non_super_forbidden(self, builder_token):
        r = requests.get(f"{BASE_URL}/api/builder-program/applications?status=pending",
                         headers=hdrs(builder_token), timeout=20)
        assert r.status_code == 403

    def test_super_lists_with_counts(self, amit_token):
        r = requests.get(f"{BASE_URL}/api/builder-program/applications?status=pending",
                         headers=hdrs(amit_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "applications" in body and "counts" in body
        assert isinstance(body["counts"], dict)
        for k in ("pending", "approved", "rejected"):
            assert k in body["counts"]
        # Our new app must appear
        pending_emails = [a["user_email"] for a in body["applications"]]
        assert BUILDER_EMAIL in pending_emails, f"pending list missing buildertest: {pending_emails}"

    def test_decide_approve(self, amit_token, builder_token):
        # find the app id
        r = requests.get(f"{BASE_URL}/api/builder-program/applications?status=pending",
                         headers=hdrs(amit_token), timeout=20)
        app_id = next(a["id"] for a in r.json()["applications"] if a["user_email"] == BUILDER_EMAIL)
        d = requests.post(f"{BASE_URL}/api/builder-program/applications/{app_id}/decide",
                          headers=hdrs(amit_token),
                          json={"decision": "approve", "note": "TEST approval"}, timeout=20)
        assert d.status_code == 200, d.text
        assert d.json()["status"] == "approved"

        # verify builder_access flipped
        me = requests.get(f"{BASE_URL}/api/builder-program/me",
                          headers=hdrs(builder_token), timeout=20)
        assert me.status_code == 200
        assert me.json()["builder_access"] is True
        assert me.json()["reason"] == "approved"


# ── 4) AFTER APPROVAL: creation works ────────────────────────────────────
class TestAfterApproval:
    def test_create_employee_now_ok(self, builder_token):
        r = requests.post(f"{BASE_URL}/api/ai-builder/employees",
                          headers=hdrs(builder_token),
                          json={"source": "blank", "name": "TEST_BuilderApproved"}, timeout=30)
        assert r.status_code == 200, r.text
        emp = r.json()
        assert emp["name"] == "TEST_BuilderApproved"
        # cleanup
        eid = emp["id"]
        d = requests.delete(f"{BASE_URL}/api/ai-builder/employees/{eid}",
                            headers=hdrs(builder_token), timeout=20)
        assert d.status_code == 200


# ── 5) SUPER ADMIN CAN CREATE (reason=super_admin) ──────────────────────
class TestSuperAdminAccess:
    def test_me_super_admin(self, amit_token):
        r = requests.get(f"{BASE_URL}/api/builder-program/me",
                         headers=hdrs(amit_token), timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["builder_access"] is True
        assert body["reason"] == "super_admin"

    def test_super_admin_can_create(self, amit_token):
        r = requests.post(f"{BASE_URL}/api/ai-builder/employees",
                          headers=hdrs(amit_token),
                          json={"source": "blank", "name": "TEST_SuperAdminEmp"}, timeout=30)
        assert r.status_code == 200, r.text
        eid = r.json()["id"]
        # cleanup
        requests.delete(f"{BASE_URL}/api/ai-builder/employees/{eid}",
                        headers=hdrs(amit_token), timeout=20)


# ── 6) CREDIT FIX + team plan perks ──────────────────────────────────────
class TestCreditsAndPerks:
    def test_super_admin_unlimited_credits(self, amit_token):
        r = requests.get(f"{BASE_URL}/api/billing/usage",
                         headers=hdrs(amit_token), timeout=20)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u.get("unlimited") is True, f"amit workspace not unlimited: {u}"
        assert u["credits_remaining"] > 100_000_000

    def test_team_plan_perks_include_builder(self):
        r = requests.get(f"{BASE_URL}/api/billing/plans", timeout=20)
        assert r.status_code == 200, r.text
        plans = r.json().get("plans") or r.json()
        team = next(p for p in plans if p["id"] == "team")
        perks = team.get("perks", [])
        assert any("AI Employee Builder" in p for p in perks), f"team perks: {perks}"
