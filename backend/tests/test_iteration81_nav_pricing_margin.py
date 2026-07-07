"""Iteration 81 — nav restructure + pricing employees + admin margin + Stripe webhook fallback / reconciler.

Test coverage:
- Public credit pricing reflects live margin (40%)
- Admin margin round-trip via PATCH /api/admin/billing-settings (40 -> 45 -> 40)
- Admin billing-settings guard: workspace 'member' is forbidden (raj)
- Market admin queue guard: raj (member, not PLATFORM_ADMIN) forbidden
- Market admin queue accessible to amit (PLATFORM_ADMIN)
- Regression: GET /api/billing/plans still 200 with plans list
- Regression: /api/market/templates lists templates and has_screenshot true for paid template
- Reconciler function importable & callable without crashing
- Webhook accepts unsigned in emergent proxy mode (POST /api/webhook/stripe with valid JSON, no signature)
"""
import os
import pathlib
import pytest
import requests


def _base_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        env_file = pathlib.Path("/app/frontend/.env")
        for line in env_file.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                url = line.split("=", 1)[1].strip()
                break
    return url.rstrip("/")


BASE_URL = _base_url()
API = f"{BASE_URL}/api"


def _login(email: str, password: str = "Demo@2026") -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def amit_token():
    return _login("amit@demo.team")


@pytest.fixture(scope="module")
def raj_token():
    return _login("raj@demo.team")


@pytest.fixture(scope="module")
def priya_token():
    return _login("priya@demo.team")


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


# ─── Public credit pricing ─────────────────────────────────────────────
class TestPublicCreditPricing:
    def test_endpoint_returns_margin_and_note(self):
        r = requests.get(f"{API}/public/credit-pricing", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "credit_margin_pct" in data
        assert 0.0 <= data["credit_margin_pct"] <= 2.0
        assert "note" in data
        assert isinstance(data.get("rows"), list) and len(data["rows"]) > 0
        assert isinstance(data.get("packs"), list) and len(data["packs"]) > 0

    def test_current_margin_is_40_percent(self):
        """Main agent has set margin to 40% for this iteration."""
        r = requests.get(f"{API}/public/credit-pricing", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert abs(data["credit_margin_pct"] - 0.40) < 1e-6, f"Expected 0.40, got {data['credit_margin_pct']}"
        assert "credits" in data["note"].lower()


# ─── Admin billing-settings guard + round-trip ─────────────────────────
class TestAdminBillingSettingsGuard:
    def test_get_billing_settings_admin_ok(self, amit_token):
        r = requests.get(f"{API}/admin/billing-settings", headers=_auth(amit_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "credit_margin_pct" in data
        assert "provider_rates" in data

    def test_get_billing_settings_forbidden_for_member(self, raj_token):
        r = requests.get(f"{API}/admin/billing-settings", headers=_auth(raj_token), timeout=15)
        assert r.status_code == 403

    def test_priya_admin_role_can_read_billing_settings(self, priya_token):
        """priya has role 'admin' in the workspace so /admin/billing-settings should allow her."""
        r = requests.get(f"{API}/admin/billing-settings", headers=_auth(priya_token), timeout=15)
        assert r.status_code == 200


class TestMarginRoundTrip:
    def test_patch_margin_45_then_restore_40(self, amit_token):
        # Snapshot current margin
        r = requests.get(f"{API}/admin/billing-settings", headers=_auth(amit_token), timeout=15)
        assert r.status_code == 200
        original = r.json()["credit_margin_pct"]

        try:
            # Set to 0.45
            r = requests.patch(
                f"{API}/admin/billing-settings",
                headers=_auth(amit_token),
                json={"credit_margin_pct": 0.45},
                timeout=15,
            )
            assert r.status_code == 200
            assert abs(r.json()["credit_margin_pct"] - 0.45) < 1e-6

            # Public endpoint reflects new margin
            r = requests.get(f"{API}/public/credit-pricing", timeout=15)
            assert r.status_code == 200
            data = r.json()
            assert abs(data["credit_margin_pct"] - 0.45) < 1e-6
            assert "credits" in data["note"].lower()
        finally:
            # Restore original
            r = requests.patch(
                f"{API}/admin/billing-settings",
                headers=_auth(amit_token),
                json={"credit_margin_pct": float(original)},
                timeout=15,
            )
            assert r.status_code == 200
            assert abs(r.json()["credit_margin_pct"] - float(original)) < 1e-6

    def test_margin_clamps_to_valid_range(self, amit_token):
        # Get original
        original = requests.get(f"{API}/admin/billing-settings", headers=_auth(amit_token), timeout=15).json()["credit_margin_pct"]
        try:
            r = requests.patch(
                f"{API}/admin/billing-settings",
                headers=_auth(amit_token),
                json={"credit_margin_pct": 5.0},  # over 2.0 max
                timeout=15,
            )
            assert r.status_code == 200
            # Should be clamped
            assert r.json()["credit_margin_pct"] <= 2.0
        finally:
            requests.patch(
                f"{API}/admin/billing-settings",
                headers=_auth(amit_token),
                json={"credit_margin_pct": float(original)},
                timeout=15,
            )


# ─── Market admin queue guard ──────────────────────────────────────────
class TestMarketAdminGuard:
    def test_amit_platform_admin_ok(self, amit_token):
        r = requests.get(f"{API}/market/admin/queue", headers=_auth(amit_token), timeout=15)
        assert r.status_code == 200
        assert "templates" in r.json()

    def test_raj_member_forbidden(self, raj_token):
        r = requests.get(f"{API}/market/admin/queue", headers=_auth(raj_token), timeout=15)
        assert r.status_code == 403

    def test_priya_admin_role_but_not_platform_admin_forbidden(self, priya_token):
        """PLATFORM_ADMIN_EMAILS only includes amit — priya's workspace 'admin' role is separate."""
        r = requests.get(f"{API}/market/admin/queue", headers=_auth(priya_token), timeout=15)
        assert r.status_code == 403


# ─── Regression: billing plans and market templates ────────────────────
class TestRegression:
    def test_billing_plans_200(self, amit_token):
        # Existing billing plans endpoint should still work (webhook fallback change should not have broken it)
        r = requests.get(f"{API}/billing/plans", headers=_auth(amit_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Response can be list or object with plans
        if isinstance(data, dict):
            assert "plans" in data or "monthly" in data or len(data) > 0
        else:
            assert isinstance(data, list) and len(data) > 0

    def test_public_market_templates_list(self):
        r = requests.get(f"{API}/market/templates", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("templates"), list)
        assert len(data["templates"]) >= 1

    def test_helpdesk_pro_paid_template_has_screenshot(self):
        """Iteration 81 change: paid template now has a screenshot seeded."""
        r = requests.get(f"{API}/market/templates", timeout=15)
        assert r.status_code == 200
        templates = r.json()["templates"]
        # Paid Helpdesk Pro id is 49645b24-b14d-417f-bdc6-31ecbbc3ed95
        paid = [t for t in templates if t.get("pricing", {}).get("model") != "free"]
        assert len(paid) >= 1, "Expected at least one paid template"
        helpdesk = next((t for t in paid if "helpdesk" in t.get("name", "").lower()), paid[0])
        assert helpdesk.get("has_screenshot") is True, f"Paid template {helpdesk.get('name')} missing screenshot"

    def test_market_templates_showcase_still_direct_loadable(self):
        """Public endpoint returns approved templates."""
        r = requests.get(f"{API}/market/templates", timeout=15)
        assert r.status_code == 200


# ─── Webhook / reconciler code path ────────────────────────────────────
class TestWebhookAndReconciler:
    def test_reconciler_importable(self):
        """The reconciler function is defined in template_market and used by server.py startup."""
        from routes.template_market import reconcile_pending_market_payments
        assert callable(reconcile_pending_market_payments)

    def test_parse_webhook_event_emergent_fallback_defined(self):
        """billing.py must have the emergent-proxy unsigned webhook fallback."""
        from routes import billing
        assert hasattr(billing, "_parse_webhook_event")

    def test_webhook_endpoint_reachable(self):
        """POST /api/webhook/stripe without payload -> non-500 (should reject cleanly)."""
        r = requests.post(f"{API}/webhook/stripe", data=b"", timeout=15)
        # Any 4xx is acceptable; 500 would indicate an unhandled crash.
        assert r.status_code < 500, f"Webhook 500'd on empty body: {r.status_code} {r.text[:200]}"

    def test_webhook_unsigned_wellformed_json_accepted(self):
        """With STRIPE_WEBHOOK_SECRET unset (emergent-proxy mode), a well-formed unsigned
        Stripe event JSON should be accepted (200) — validates the webhook signature fallback.
        Uses a benign event type (payment_intent.created) to avoid touching real DB state.

        NOTE: This test exposes a CRITICAL bug in the webhook handler — the parsed StripeObject
        does not have a `.get()` method in this stripe-python version, so `obj.get("id")` at
        billing.py:463 raises AttributeError → 500. See critical_code_review_comments."""
        payload = (
            b'{"id":"evt_test_iter81","type":"payment_intent.created",'
            b'"data":{"object":{"id":"pi_test_iter81_nonexistent"}}}'
        )
        r = requests.post(
            f"{API}/webhook/stripe",
            data=payload,
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        assert r.status_code < 500, f"Webhook 500'd on unsigned well-formed JSON (StripeObject.get bug): {r.status_code} {r.text[:200]}"
        assert r.status_code == 200, f"Expected 200 for unsigned well-formed event: {r.status_code} {r.text[:200]}"

    def test_stripe_session_object_attribute_access_available(self):
        """Reconciler + status endpoint read Session fields via attribute access
        (session.payment_status / session.status) because StripeObject in this
        stripe-python version shadows dict-style `.get(...)`. Guard that the
        attribute path the production code relies on keeps working."""
        import stripe as _s
        obj = _s.checkout.Session.construct_from(
            {"id": "cs_test_ok", "status": "complete", "payment_status": "paid"},
            "sk_test_dummy",
        )
        assert obj.status == "complete"
        assert obj.payment_status == "paid"


# ─── Market checkout still works (no full Stripe run) ──────────────────
class TestMarketCheckoutInitiation:
    def test_paid_template_checkout_creates_session_url(self, priya_token):
        # find the paid template
        pubs = requests.get(f"{API}/market/templates", timeout=15).json()["templates"]
        paid = [t for t in pubs if t.get("pricing", {}).get("model") != "free"]
        if not paid:
            pytest.skip("no paid template available")
        tid = paid[0]["id"]
        r = requests.post(
            f"{API}/market/templates/{tid}/checkout",
            headers=_auth(priya_token),
            json={"origin_url": BASE_URL},
            timeout=20,
        )
        # Priya may already own the template (previous iterations); that path returns 402 or ok
        if r.status_code == 400:
            # E.g., "already own" — acceptable
            return
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert data.get("url", "").startswith("https://")
        assert data.get("session_id", "").startswith("cs_")

    def test_checkout_status_endpoint_reachable(self, raj_token):
        # Use a bogus session id — expect 404 (unknown to this user), never 500
        r = requests.get(
            f"{API}/market/checkout/status/cs_test_does_not_exist_xyz",
            headers=_auth(raj_token),
            timeout=15,
        )
        assert r.status_code in (404, 200), f"Unexpected status: {r.status_code} {r.text[:200]}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
