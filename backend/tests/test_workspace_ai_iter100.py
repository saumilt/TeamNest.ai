"""Phase 3 - Workspace AI Licensing & Revenue Share tests (iteration 100).

Tests:
- Auth-based access (owner/admin vs non-privileged 403, super-admin only)
- Billing rules defaults and PUT auto-adjust of creator_revenue_percent
- Consent preview
- Enable / re-enable idempotent / patch / disable
- Workspace/creator/admin ledgers math (base + per_user*active_users, 30% platform)
"""
import os
import time
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def super_admin():
    return _login("amit@demo.team", "Demo@2026")


@pytest.fixture(scope="module")
def sam_admin():
    return _login("sam@funasia.net", "Perfect$2008")


@pytest.fixture(scope="module")
def non_priv():
    # buildertest is owner of their OWN workspace so /workspace-ai/* would 200
    # for owner-only endpoints. Use raj@demo.team who is a plain member.
    return _login("raj@demo.team", "Demo@2026")


@pytest.fixture(scope="module")
def buildertest():
    # For super-admin-only endpoints, buildertest is fine (not super admin).
    return _login("buildertest@example.com", "Demo@2026")


# ── Billing rules defaults ─────────────────────────────────────────────
def test_billing_rules_defaults(super_admin):
    r = super_admin.get(f"{BASE}/workspace-ai/billing-rules", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["min_builder_fee"] == 10.0
    assert d["per_user_fee"] == 3.0
    assert d["platform_fee_percent"] == 30.0
    assert d["creator_revenue_percent"] == 70.0


def test_billing_rules_get_allowed_for_regular_user(non_priv):
    r = non_priv.get(f"{BASE}/workspace-ai/billing-rules", timeout=10)
    assert r.status_code == 200  # any authed user can read defaults


def test_period_endpoint():
    r = requests.get(f"{BASE}/workspace-ai/period", timeout=10)
    assert r.status_code == 200
    assert "period" in r.json()


# ── RBAC on admin-only endpoints ───────────────────────────────────────
def test_admin_ledger_requires_super_admin(non_priv):
    r = non_priv.get(f"{BASE}/workspace-ai/billing/admin", timeout=10)
    assert r.status_code == 403


def test_put_billing_rules_requires_super_admin(non_priv):
    r = non_priv.put(f"{BASE}/workspace-ai/billing-rules",
                     json={"min_builder_fee": 15}, timeout=10)
    assert r.status_code == 403


def test_admin_ledger_ok_for_super_admin(super_admin):
    r = super_admin.get(f"{BASE}/workspace-ai/billing/admin", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "totals" in d and "rules" in d


# ── RBAC on owner/admin endpoints ──────────────────────────────────────
def test_workspace_ledger_forbidden_for_non_priv(non_priv):
    r = non_priv.get(f"{BASE}/workspace-ai/billing/workspace", timeout=10)
    assert r.status_code == 403


def test_list_workspace_employees_forbidden_for_non_priv(non_priv):
    r = non_priv.get(f"{BASE}/workspace-ai/employees", timeout=10)
    assert r.status_code == 403


def test_consent_preview_forbidden_for_non_priv(non_priv, super_admin):
    # find any employee id from super_admin's workspace
    emps = super_admin.get(f"{BASE}/workspace-ai/employees", timeout=10).json()["employees"]
    if not emps:
        pytest.skip("no deployed employee to test consent preview forbidden")
    eid = emps[0]["employee_id"]
    r = non_priv.get(f"{BASE}/workspace-ai/employees/{eid}/consent-preview", timeout=10)
    assert r.status_code == 403


# ── Consent preview shape ──────────────────────────────────────────────
def test_consent_preview_shape(super_admin):
    emps = super_admin.get(f"{BASE}/workspace-ai/employees", timeout=10).json()["employees"]
    if not emps:
        pytest.skip("no deployed employee to preview")
    eid = emps[0]["employee_id"]
    r = super_admin.get(f"{BASE}/workspace-ai/employees/{eid}/consent-preview", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert "pricing" in d and "disclosure" in d
    p = d["pricing"]
    assert set(["base_monthly_fee", "per_user_monthly_fee",
                "platform_fee_percent", "creator_revenue_percent",
                "teamnest_owned", "free_trial_days"]).issubset(p.keys())
    assert p["base_monthly_fee"] == 10.0
    assert p["per_user_monthly_fee"] == 3.0
    assert p["platform_fee_percent"] == 30.0


def test_consent_preview_404(super_admin):
    r = super_admin.get(f"{BASE}/workspace-ai/employees/does-not-exist/consent-preview",
                        timeout=10)
    assert r.status_code == 404


# ── Enable idempotency + patch + disable ───────────────────────────────
@pytest.fixture(scope="module")
def existing_employee_id(super_admin):
    emps = super_admin.get(f"{BASE}/workspace-ai/employees", timeout=10).json()["employees"]
    if emps:
        return emps[0]["employee_id"]
    # fall back to creating one via ai-builder (super admin bypasses builder gate)
    r = super_admin.post(f"{BASE}/ai-builder/employees",
                         json={"name": "TEST_ledger_emp", "job_title": "SDET"},
                         timeout=15)
    if r.status_code not in (200, 201):
        pytest.skip(f"could not create ai employee: {r.status_code} {r.text[:200]}")
    return r.json().get("employee", r.json()).get("id") or r.json().get("id")


def test_enable_idempotent_and_disable(super_admin, existing_employee_id):
    eid = existing_employee_id
    r1 = super_admin.post(f"{BASE}/workspace-ai/employees/{eid}/enable",
                          json={"availability_scope": "workspace"}, timeout=15)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()["deployment"]
    dep_id = d1["id"]
    # Re-enable same employee — should update, NOT create a new row
    r2 = super_admin.post(f"{BASE}/workspace-ai/employees/{eid}/enable",
                          json={"availability_scope": "roles", "enabled_roles": ["sales"]},
                          timeout=15)
    assert r2.status_code == 200
    d2 = r2.json()["deployment"]
    assert d2["id"] == dep_id, "re-enable must be idempotent (same deployment id)"
    assert d2["availability_scope"] == "roles"
    # PATCH
    rp = super_admin.patch(f"{BASE}/workspace-ai/employees/{eid}",
                           json={"availability_scope": "workspace",
                                 "central_learning_allowed": True},
                           timeout=15)
    assert rp.status_code == 200
    # Verify by listing
    listed = super_admin.get(f"{BASE}/workspace-ai/employees", timeout=10).json()["employees"]
    row = [x for x in listed if x["employee_id"] == eid][0]
    assert row["central_learning_allowed"] is True
    # Disable
    rd = super_admin.post(f"{BASE}/workspace-ai/employees/{eid}/disable", timeout=10)
    assert rd.status_code == 200
    listed = super_admin.get(f"{BASE}/workspace-ai/employees", timeout=10).json()["employees"]
    row = [x for x in listed if x["employee_id"] == eid][0]
    assert row["status"] == "disabled"
    # Re-enable for downstream tests
    super_admin.post(f"{BASE}/workspace-ai/employees/{eid}/enable",
                     json={"availability_scope": "workspace"}, timeout=15)


# ── Ledger math ────────────────────────────────────────────────────────
def test_workspace_ledger_math(super_admin):
    r = super_admin.get(f"{BASE}/workspace-ai/billing/workspace", timeout=15)
    assert r.status_code == 200
    d = r.json()
    rows = d["rows"]
    if not rows:
        pytest.skip("no deployments in workspace to compute ledger")
    for row in rows:
        expected_total = round(
            row["base_fee"] + row["per_user_fee_total"] +
            row.get("marketplace_license_fee", 0) + row.get("ai_credit_charges", 0), 2)
        assert abs(row["total_fee"] - expected_total) < 0.01, row
        # per_user_fee_total = per_user_fee_rate * active_users
        assert abs(row["per_user_fee_total"]
                   - round(row["per_user_fee_rate"] * row["active_users"], 2)) < 0.01
        # platform fee = total * pct/100  (or full total for teamnest_owned)
        if row["teamnest_owned"]:
            assert row["platform_fee"] == row["total_fee"]
            assert row["creator_earnings"] == 0.0
        else:
            expected_pf = round(row["total_fee"] * row["platform_fee_percent"] / 100.0, 2)
            assert abs(row["platform_fee"] - expected_pf) < 0.01
            assert abs(row["creator_earnings"]
                       - round(row["total_fee"] - row["platform_fee"], 2)) < 0.01
    # totals sum
    tot = d["totals"]
    assert abs(tot["workspace_total"] - round(sum(r["total_fee"] for r in rows), 2)) < 0.01
    assert abs(tot["platform_fee"] - round(sum(r["platform_fee"] for r in rows), 2)) < 0.01
    assert abs(tot["creator_earnings"]
               - round(sum(r["creator_earnings"] for r in rows), 2)) < 0.01


def test_creator_ledger_own_employee_only(super_admin):
    """Whichever employees amit created — creator ledger should list only those."""
    r = super_admin.get(f"{BASE}/workspace-ai/billing/creator", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "totals" in d
    # For teamnest-owned employees (creator_user_id=None), they should NOT show up
    for row in d["rows"]:
        assert row["teamnest_owned"] is False


def test_creator_ledger_empty_for_non_creator(non_priv):
    """Non-priv user hasn't created AI employees → empty ledger, not 403."""
    r = non_priv.get(f"{BASE}/workspace-ai/billing/creator", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["totals"]["gross_revenue"] == 0
    assert d["rows"] == []


# ── Super admin: PUT rules auto-adjusts creator % ──────────────────────
def test_put_rules_auto_adjust_creator_percent(super_admin):
    # Set to 25%
    r = super_admin.put(f"{BASE}/workspace-ai/billing-rules",
                        json={"platform_fee_percent": 25}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["platform_fee_percent"] == 25.0
    assert d["creator_revenue_percent"] == 75.0
    # Restore defaults
    r2 = super_admin.put(f"{BASE}/workspace-ai/billing-rules",
                         json={"platform_fee_percent": 30,
                               "min_builder_fee": 10,
                               "per_user_fee": 3,
                               "free_trial_days": 14}, timeout=15)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["platform_fee_percent"] == 30.0
    assert d2["creator_revenue_percent"] == 70.0
    assert d2["min_builder_fee"] == 10.0
    assert d2["per_user_fee"] == 3.0
