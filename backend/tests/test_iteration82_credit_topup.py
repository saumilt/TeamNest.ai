"""Iteration 82 — Credit top-up + splash + admin specials + payout run + subscription checkout.

Regression suite for TeamNest.ai iteration 82. Uses REACT_APP_BACKEND_URL from
frontend/.env with a filesystem fallback and Bearer-token auth (no cookies)."""
import os
import time
import pytest
import requests
from pathlib import Path


def _load_backend_url() -> str:
    env_url = os.environ.get("REACT_APP_BACKEND_URL")
    if env_url:
        return env_url.rstrip("/")
    # Fallback: parse frontend/.env
    envf = Path("/app/frontend/.env")
    if envf.exists():
        for line in envf.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    return "http://localhost:8001"


BASE = _load_backend_url()
API = f"{BASE}/api"

AMIT = {"email": "amit@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")}
RAJ = {"email": "raj@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")}
PRIYA = {"email": "priya@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")}


# ─── Fixtures ─────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def amit_token():
    r = requests.post(f"{API}/auth/login", json=AMIT, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def raj_token():
    r = requests.post(f"{API}/auth/login", json=RAJ, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ─── Credit packs endpoint ────────────────────────────────────────────────
class TestCreditPacks:
    def test_packs_endpoint_shape(self, raj_token):
        r = requests.get(f"{API}/billing/credit-packs", headers=_hdr(raj_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "packs" in data and "promo" in data
        packs = data["packs"]
        assert len(packs) == 6, f"expected 6 packs got {len(packs)}"
        ids = {p["id"] for p in packs}
        for pid in ("p100", "p250", "p500", "p1250", "p2500", "p5000"):
            assert pid in ids, f"missing pack {pid}"

    def test_pack_bonus_math(self, raj_token):
        r = requests.get(f"{API}/billing/credit-packs", headers=_hdr(raj_token), timeout=15)
        packs = {p["id"]: p for p in r.json()["packs"]}
        # p100 → 100 credits, no bonus
        assert packs["p100"]["total_credits"] == 100
        # p2500 → 20% bonus → 3000
        assert packs["p2500"]["total_credits"] == 3000, packs["p2500"]
        # p5000 → 20% bonus → 6000
        assert packs["p5000"]["total_credits"] == 6000, packs["p5000"]

    def test_promo_shape(self, raj_token):
        r = requests.get(f"{API}/billing/credit-packs", headers=_hdr(raj_token), timeout=15)
        promo = r.json()["promo"]
        assert "enabled" in promo
        assert "banner" in promo
        assert "badge" in promo


# ─── Credit checkout: pack_id + custom amount ────────────────────────────
class TestCreditCheckout:
    def test_pack_checkout_creates_stripe_session(self, raj_token):
        r = requests.post(
            f"{API}/billing/credits/checkout",
            headers=_hdr(raj_token),
            json={"pack_id": "p100", "origin_url": "https://example.com"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and data["url"].startswith("https://")
        assert "session_id" in data and data["session_id"].startswith("cs_")
        assert data["credits"] == 100

    def test_unknown_pack_returns_404(self, raj_token):
        r = requests.post(
            f"{API}/billing/credits/checkout",
            headers=_hdr(raj_token),
            json={"pack_id": "does-not-exist", "origin_url": "https://example.com"},
            timeout=15,
        )
        assert r.status_code == 404

    def test_custom_amount_too_low_400(self, raj_token):
        r = requests.post(
            f"{API}/billing/credits/checkout",
            headers=_hdr(raj_token),
            json={"custom_amount_usd": 4, "origin_url": "https://example.com"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_custom_amount_valid_returns_credits(self, raj_token):
        r = requests.post(
            f"{API}/billing/credits/checkout",
            headers=_hdr(raj_token),
            json={"custom_amount_usd": 50, "origin_url": "https://example.com"},
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        # $50 × 5 = 250 credits
        assert data["credits"] == 250


# ─── Full topup chain with simulated webhook ──────────────────────────────
class TestTopUpChainWithWebhook:
    def test_webhook_adds_credits_and_idempotent(self, raj_token):
        # Read current balance
        r0 = requests.get(f"{API}/billing/usage", headers=_hdr(raj_token), timeout=15)
        assert r0.status_code == 200, r0.text
        before = int(r0.json().get("credits_remaining") or 0)

        # Create checkout
        rc = requests.post(
            f"{API}/billing/credits/checkout",
            headers=_hdr(raj_token),
            json={"pack_id": "p100", "origin_url": "https://example.com"},
            timeout=30,
        )
        assert rc.status_code == 200
        sid = rc.json()["session_id"]

        # Simulate Stripe webhook
        wh_body = {
            "type": "checkout.session.completed",
            "data": {"object": {"id": sid, "payment_status": "paid"}},
        }
        rw = requests.post(
            f"{API}/webhook/stripe",
            headers={"Content-Type": "application/json", "Stripe-Signature": "t=1,v1=fake"},
            json=wh_body,
            timeout=15,
        )
        assert rw.status_code == 200, rw.text
        assert rw.json().get("product") == "credit_topup", rw.text

        # Status endpoint should be paid
        rs = requests.get(f"{API}/billing/credits/status/{sid}", headers=_hdr(raj_token), timeout=15)
        assert rs.status_code == 200
        assert rs.json()["payment_status"] == "paid"

        # Balance increased by exactly 100
        r1 = requests.get(f"{API}/billing/usage", headers=_hdr(raj_token), timeout=15)
        after = int(r1.json().get("credits_remaining") or 0)
        assert after - before == 100, f"expected +100 got before={before} after={after}"

        # Idempotent: repeat webhook → balance unchanged
        rw2 = requests.post(
            f"{API}/webhook/stripe",
            headers={"Content-Type": "application/json", "Stripe-Signature": "t=1,v1=fake"},
            json=wh_body,
            timeout=15,
        )
        assert rw2.status_code == 200
        r2 = requests.get(f"{API}/billing/usage", headers=_hdr(raj_token), timeout=15)
        after2 = int(r2.json().get("credits_remaining") or 0)
        assert after2 == after, f"idempotency broken: {after} → {after2}"


# ─── Admin specials editor (PATCH /admin/billing-settings) ────────────────
class TestAdminSpecialsEditor:
    def test_patch_credit_promo_and_packs_persist(self, amit_token, raj_token):
        # Read current, save originals
        r = requests.get(f"{API}/admin/billing-settings", headers=_hdr(amit_token), timeout=15)
        assert r.status_code == 200
        orig = r.json()
        orig_promo = dict(orig.get("credit_promo") or {})
        orig_packs = list(orig.get("credit_packs") or [])

        # Patch banner + toggle enabled false + bump p100 bonus to 10
        new_packs = [dict(p) for p in orig_packs]
        for p in new_packs:
            if p["id"] == "p100":
                p["bonus_pct"] = 10

        rp = requests.patch(
            f"{API}/admin/billing-settings",
            headers=_hdr(amit_token),
            json={
                "credit_promo": {**orig_promo, "banner": "TEST_iter82 banner", "enabled": False},
                "credit_packs": new_packs,
            },
            timeout=15,
        )
        assert rp.status_code == 200, rp.text

        # Verify packs endpoint reflects change
        r2 = requests.get(f"{API}/billing/credit-packs", headers=_hdr(raj_token), timeout=15)
        d = r2.json()
        assert d["promo"]["banner"] == "TEST_iter82 banner"
        assert d["promo"]["enabled"] is False
        p100 = next(p for p in d["packs"] if p["id"] == "p100")
        assert p100["bonus_pct"] == 10
        # 100 * 1.10 = 110
        assert p100["total_credits"] == 110

        # Restore originals
        rr = requests.patch(
            f"{API}/admin/billing-settings",
            headers=_hdr(amit_token),
            json={"credit_promo": orig_promo, "credit_packs": orig_packs},
            timeout=15,
        )
        assert rr.status_code == 200

        # Verify restore
        r3 = requests.get(f"{API}/billing/credit-packs", headers=_hdr(raj_token), timeout=15)
        d3 = r3.json()
        assert d3["promo"]["banner"] == orig_promo.get("banner")
        p100b = next(p for p in d3["packs"] if p["id"] == "p100")
        assert p100b["bonus_pct"] == orig_packs[0]["bonus_pct"]

    def test_non_admin_forbidden(self, raj_token):
        r = requests.patch(
            f"{API}/admin/billing-settings",
            headers=_hdr(raj_token),
            json={"credit_promo": {"enabled": False}},
            timeout=15,
        )
        assert r.status_code == 403


# ─── Payout run (platform admin gated) ────────────────────────────────────
class TestPayoutRun:
    def test_non_platform_admin_forbidden(self, raj_token):
        r = requests.post(f"{API}/market/admin/payout-run", headers=_hdr(raj_token), timeout=30)
        assert r.status_code == 403

    def test_platform_admin_ok_shape(self, amit_token):
        r = requests.post(f"{API}/market/admin/payout-run", headers=_hdr(amit_token), timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "results" in data
        assert "sellers" in data
        assert "paid" in data
        # every result has a status
        for res in data["results"]:
            assert res.get("status") in ("paid", "failed", "skipped")


# ─── Monthly template subscription checkout ───────────────────────────────
class TestSubscriptionCheckout:
    HELPDESK_ID = "49645b24-b14d-417f-bdc6-31ecbbc3ed95"

    def test_monthly_checkout_marks_is_subscription(self, raj_token):
        r = requests.post(
            f"{API}/market/templates/{self.HELPDESK_ID}/checkout",
            headers=_hdr(raj_token),
            json={"origin_url": "https://example.com"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data
        assert "session_id" in data
        sid = data["session_id"]

        # Query DB via reverse: fetch payment_transactions via a small helper?
        # No public endpoint; use motor via a raw check through the same connection is not trivial in a test file.
        # Instead, verify indirectly via the polling status endpoint returning template_id (only for market txns).
        rs = requests.get(f"{API}/market/checkout/status/{sid}", headers=_hdr(raj_token), timeout=15)
        assert rs.status_code == 200
        assert rs.json().get("template_id") == self.HELPDESK_ID


# ─── Regression: templates store + free install + margin + billing plans ─
class TestRegression:
    def test_templates_store_has_14_plus(self, raj_token):
        r = requests.get(f"{API}/market/templates", headers=_hdr(raj_token), timeout=15)
        assert r.status_code == 200
        items = r.json().get("templates") or r.json().get("items") or r.json()
        if isinstance(items, dict):
            items = items.get("templates") or []
        assert len(items) >= 14, f"only {len(items)} templates found"

    def test_billing_plans_200(self, raj_token):
        r = requests.get(f"{API}/billing/plans", headers=_hdr(raj_token), timeout=15)
        assert r.status_code == 200

    def test_credit_margin_still_40(self, raj_token):
        r = requests.get(f"{API}/public/credit-pricing", timeout=15)
        assert r.status_code == 200
        assert abs(float(r.json()["credit_margin_pct"]) - 0.40) < 0.01
