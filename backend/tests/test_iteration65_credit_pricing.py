"""Iteration 65 — Backend-configurable credit margin / pricing.

Covers:
  - GET /api/public/credit-pricing (no auth) returns expected shape + math
  - GET/PATCH /api/admin/billing-settings (owner ok, member 403)
  - PATCH clamps invalid values, drops non-numeric, re-computes table
  - Restore margin to 0.25 at end so subsequent test runs see defaults
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
DEFAULT_MARGIN = 0.25
DEFAULT_UPC = 0.001


@pytest.fixture(scope="module")
def owner_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=15)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def member_session():
    """raj@demo.team is the seeded member-role user in the demo workspace."""
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "raj@demo.team", "password": "Demo@2026"},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"member login failed ({r.status_code}): {r.text}")
    return s


@pytest.fixture(scope="module", autouse=True)
def _restore_margin_at_end(owner_session):
    yield
    owner_session.patch(
        f"{BASE_URL}/api/admin/billing-settings",
        json={"credit_margin_pct": DEFAULT_MARGIN, "credit_usd_per_credit": DEFAULT_UPC},
        timeout=10,
    )


# ─── Public endpoint ────────────────────────────────────────────────────────
class TestPublicCreditPricing:

    def test_no_auth_required_and_shape(self):
        r = requests.get(f"{BASE_URL}/api/public/credit-pricing", timeout=10)
        assert r.status_code == 200
        d = r.json()
        for k in ("credit_margin_pct", "credit_usd_per_credit", "rows", "packs", "note", "updated_at"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["rows"], list) and len(d["rows"]) == 7
        assert isinstance(d["packs"], list) and len(d["packs"]) == 3
        # required row keys
        keys = {r["key"] for r in d["rows"]}
        assert keys == {"specialist_reply", "devmgr_round", "dev_fanout", "scan",
                        "github_export", "voice_min", "image"}

    def test_user_usd_equals_base_times_one_plus_margin(self):
        r = requests.get(f"{BASE_URL}/api/public/credit-pricing", timeout=10).json()
        m = r["credit_margin_pct"]
        upc = r["credit_usd_per_credit"]
        for row in r["rows"]:
            # base_usd is rounded to 4dp AFTER user_usd is computed from the
            # unrounded base, so allow a small absolute tolerance.
            expected_user = round(row["base_usd"] * (1 + m), 4)
            assert abs(row["user_usd"] - expected_user) < 5e-4, \
                f"{row['key']} user_usd mismatch: {row['user_usd']} vs {expected_user}"
            # credits is round(unrounded_user_usd / upc) — within ±1 of round(rounded_user_usd / upc)
            expected_credits = max(0, int(round(row["user_usd"] / upc)))
            assert abs(row["credits"] - expected_credits) <= 1, \
                f"{row['key']} credits mismatch: {row['credits']} vs ~{expected_credits}"

    def test_note_mentions_margin_and_unit(self):
        r = requests.get(f"{BASE_URL}/api/public/credit-pricing", timeout=10).json()
        pct = round(r["credit_margin_pct"] * 100)
        assert f"{pct}% margin" in r["note"]
        assert "1 credit" in r["note"]


# ─── Admin endpoints ────────────────────────────────────────────────────────
class TestAdminBillingSettings:

    def test_get_as_owner_ok(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/admin/billing-settings", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "credit_margin_pct" in d
        assert "credit_usd_per_credit" in d
        assert "provider_rates" in d
        assert isinstance(d["provider_rates"], dict)
        # Spot-check expected sub-keys
        for sub in ("gpt_4o_mini_per_1m_in", "whisper_per_min", "nano_banana_per_image"):
            assert sub in d["provider_rates"]

    def test_get_as_non_admin_403(self, member_session):
        r = member_session.get(f"{BASE_URL}/api/admin/billing-settings", timeout=10)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"

    def test_patch_margin_propagates_to_public(self, owner_session):
        # Update to 30%
        r = owner_session.patch(
            f"{BASE_URL}/api/admin/billing-settings",
            json={"credit_margin_pct": 0.30},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert abs(r.json()["credit_margin_pct"] - 0.30) < 1e-6
        # Public endpoint reflects immediately
        pub = requests.get(f"{BASE_URL}/api/public/credit-pricing", timeout=10).json()
        assert abs(pub["credit_margin_pct"] - 0.30) < 1e-6
        assert "30% margin" in pub["note"]
        for row in pub["rows"]:
            expected = round(row["base_usd"] * 1.30, 4)
            assert abs(row["user_usd"] - expected) < 5e-4
        # restore for the next test
        owner_session.patch(
            f"{BASE_URL}/api/admin/billing-settings",
            json={"credit_margin_pct": DEFAULT_MARGIN},
            timeout=10,
        )

    def test_patch_clamps_above_2(self, owner_session):
        r = owner_session.patch(
            f"{BASE_URL}/api/admin/billing-settings",
            json={"credit_margin_pct": 5.0},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["credit_margin_pct"] == 2.0
        # restore
        owner_session.patch(
            f"{BASE_URL}/api/admin/billing-settings",
            json={"credit_margin_pct": DEFAULT_MARGIN}, timeout=10,
        )

    def test_patch_clamps_below_0(self, owner_session):
        r = owner_session.patch(
            f"{BASE_URL}/api/admin/billing-settings",
            json={"credit_margin_pct": -1.0},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["credit_margin_pct"] == 0.0
        owner_session.patch(
            f"{BASE_URL}/api/admin/billing-settings",
            json={"credit_margin_pct": DEFAULT_MARGIN}, timeout=10,
        )

    def test_patch_drops_non_numeric_strings(self, owner_session):
        # Save current
        cur = owner_session.get(f"{BASE_URL}/api/admin/billing-settings", timeout=10).json()
        before = cur["credit_margin_pct"]
        r = owner_session.patch(
            f"{BASE_URL}/api/admin/billing-settings",
            json={"credit_margin_pct": "not-a-number"},
            timeout=10,
        )
        # Pydantic may either reject (422) OR coerce — if 200, margin must be unchanged.
        if r.status_code == 200:
            assert abs(r.json()["credit_margin_pct"] - before) < 1e-6
        else:
            assert r.status_code in (400, 422)

    def test_patch_credit_unit_recomputes_credits(self, owner_session):
        # Make credits 10× more expensive in credit-count by lowering USD/credit.
        r = owner_session.patch(
            f"{BASE_URL}/api/admin/billing-settings",
            json={"credit_usd_per_credit": 0.0001},
            timeout=10,
        )
        assert r.status_code == 200
        assert abs(r.json()["credit_usd_per_credit"] - 0.0001) < 1e-9
        pub = requests.get(f"{BASE_URL}/api/public/credit-pricing", timeout=10).json()
        assert abs(pub["credit_usd_per_credit"] - 0.0001) < 1e-9
        for row in pub["rows"]:
            expected = max(0, int(round(row["user_usd"] / 0.0001)))
            assert abs(row["credits"] - expected) <= 1, f"{row['key']} credits mismatch ({row['credits']} vs ~{expected})"
        # Restore unit price
        owner_session.patch(
            f"{BASE_URL}/api/admin/billing-settings",
            json={"credit_usd_per_credit": DEFAULT_UPC},
            timeout=10,
        )


# ─── Regression: existing routes still work ─────────────────────────────────
class TestRegression:

    def test_public_snapshot_404_for_unknown_token(self):
        r = requests.get(f"{BASE_URL}/api/public/snapshot/__no_such_token__", timeout=10)
        assert r.status_code == 404

    def test_demo_login_still_works(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=15)
        assert r.status_code == 200
        # session cookie set
        assert any("tn_session" in c.name for c in s.cookies)
