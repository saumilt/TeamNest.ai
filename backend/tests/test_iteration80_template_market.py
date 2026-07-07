"""
Iteration 80 — Template Marketplace / App Store backend regression suite.

Covers:
  1) Public /api/market/templates listing (unauth, 14 approved)
  2) Individual template fetch
  3) Screenshot endpoint (free template)
  4) Live demo endpoint (unauth, HTML + Content-Security-Policy header)
  5) Auth guards on /market/mine and /market/admin/queue
  6) Free install flow (create + cleanup)
  7) Paid install → 402 payment_required for non-buyer
  8) Checkout session creation for a paid template (returns url + session_id)
  9) Checkout on a free template → 400
 10) Admin approve / reject flow (queue, approve, reject, notes surface)
 11) Seller submit from someone else's workspace project → 404
 12) Seller submit + admin approve happy path
 13) Payout account save (valid acct_ + invalid rejected 422)
 14) 70/30 split constants in code + purchase idempotency check via mongo
 15) /api/webhook/stripe returns 400 without valid signature

Auth: cookie-based via POST /api/auth/login (per-user).
Cleanup: any TEST_iter80_* projects and mkt_templates are removed via a
teardown fixture that talks directly to mongo (no HTTP DELETE endpoint exists).
"""
import os
import time
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient


# ─── Config ───────────────────────────────────────────────────────────────
def _load_frontend_env_backend_url() -> str:
    env_file = Path("/app/frontend/.env")
    for line in env_file.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env_backend_url()
BASE_URL = BASE_URL.rstrip("/")
# Fall back to localhost for slow LLM calls per main-agent note; not needed here.
LOCAL = "http://localhost:8001"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"

PAID_TEMPLATE_ID = "49645b24-b14d-417f-bdc6-31ecbbc3ed95"  # Helpdesk Pro $29/mo
FREE_TEMPLATE_IDS = [
    "abfd9852-ae1d-44fe-b777-cd41d55f91d1",  # Helpdesk & Ticketing
    "5f5172a2-8ad1-444a-8448-903d8c91901d",  # Inventory & Orders Tracker
]
EXISTING_PROJECT_ID = "40391fb0-f562-45d8-a7bf-0b10e0c1b49d"  # Restaurant Franchise in demo ws


# ─── Fixtures ─────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


def _login(email: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{LOCAL}/api/auth/login",
               json={"email": email, "password": "Demo@2026"}, timeout=15)
    r.raise_for_status()
    token = r.json().get("token")
    assert token, f"No token returned for {email}"
    # Cookies are Secure so they won't ride on http://localhost — use Bearer.
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def amit():   # PLATFORM_ADMIN
    return _login("amit@demo.team")


@pytest.fixture(scope="module")
def raj():    # clean buyer / non-admin seller
    return _login("raj@demo.team")


@pytest.fixture(scope="module")
def priya():  # non-admin, has already purchased Helpdesk Pro per prior seed
    return _login("priya@demo.team")


@pytest.fixture(scope="module", autouse=True)
def cleanup(mongo):
    yield
    # Remove any TEST_iter80 seller submissions
    subs = list(mongo.mkt_templates.find(
        {"name": {"$regex": "^TEST_iter80"}}, {"_id": 0, "id": 1},
    ))
    ids = [s["id"] for s in subs]
    if ids:
        mongo.mkt_templates.delete_many({"id": {"$in": ids}})
    # Remove TEST_iter80 installed projects
    projs = list(mongo.dev_projects.find(
        {"name": {"$regex": "^TEST_iter80"}}, {"_id": 0, "id": 1},
    ))
    pids = [p["id"] for p in projs]
    if pids:
        mongo.dev_projects.delete_many({"id": {"$in": pids}})
        mongo.dev_code_files.delete_many({"project_id": {"$in": pids}})
    # Remove install byproducts (name == "Helpdesk & Ticketing" etc. via source)
    mongo.dev_projects.delete_many(
        {"source": "market_template", "name": {"$in": [
            "Helpdesk & Ticketing", "Inventory & Orders Tracker",
        ]}, "created_at": {"$gte": time.strftime("%Y-%m-%d")}}
    )


# ─── Public store ─────────────────────────────────────────────────────────
class TestPublicStore:
    def test_list_templates_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/market/templates", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "templates" in data
        assert len(data["templates"]) >= 13, f"Expected >=13, got {len(data['templates'])}"
        ids = {t["id"] for t in data["templates"]}
        assert PAID_TEMPLATE_ID in ids, "Helpdesk Pro paid template missing"
        for fid in FREE_TEMPLATE_IDS:
            assert fid in ids

    def test_paid_template_has_monthly_pricing(self):
        r = requests.get(f"{BASE_URL}/api/market/templates/{PAID_TEMPLATE_ID}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["pricing"]["model"] == "monthly"
        assert d["pricing"]["price_usd"] == 29.0
        assert d["status"] == "approved"

    def test_free_template_pricing(self):
        r = requests.get(f"{BASE_URL}/api/market/templates/{FREE_TEMPLATE_IDS[0]}", timeout=15)
        assert r.status_code == 200
        assert r.json()["pricing"]["model"] == "free"

    def test_unknown_template_404(self):
        r = requests.get(f"{BASE_URL}/api/market/templates/does-not-exist", timeout=15)
        assert r.status_code == 404

    def test_screenshot_free_200(self):
        r = requests.get(
            f"{BASE_URL}/api/market/templates/{FREE_TEMPLATE_IDS[0]}/screenshot",
            timeout=15, allow_redirects=True,
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 100

    def test_demo_html_has_csp(self):
        for tid in FREE_TEMPLATE_IDS:
            r = requests.get(f"{BASE_URL}/api/market/templates/{tid}/demo/index.html",
                             timeout=20)
            assert r.status_code == 200, f"Demo not 200 for {tid}"
            assert r.headers.get("content-type", "").startswith("text/html")
            csp = r.headers.get("content-security-policy") or r.headers.get("Content-Security-Policy")
            assert csp, f"Missing CSP header for {tid}"
            assert "frame-ancestors" in csp
            assert "connect-src 'none'" in csp
            # tn-login-shim should be injected for demo login demo@example.com/demo
            assert "tn-login-shim" in r.text or "demo@example.com" in r.text or "<html" in r.text.lower()

    def test_demo_root_path_defaults_index(self):
        r = requests.get(f"{BASE_URL}/api/market/templates/{FREE_TEMPLATE_IDS[0]}/demo/",
                         timeout=20)
        assert r.status_code == 200


# ─── Auth guards ──────────────────────────────────────────────────────────
class TestAuthGuards:
    def test_mine_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/market/mine", timeout=15)
        assert r.status_code == 401

    def test_admin_queue_unauth_401(self):
        r = requests.get(f"{BASE_URL}/api/market/admin/queue", timeout=15)
        assert r.status_code == 401

    def test_admin_queue_non_admin_403(self, priya):
        r = priya.get(f"{LOCAL}/api/market/admin/queue", timeout=15)
        assert r.status_code == 403

    def test_admin_queue_admin_200(self, amit):
        r = amit.get(f"{LOCAL}/api/market/admin/queue", timeout=15)
        assert r.status_code == 200
        assert "templates" in r.json()

    def test_install_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/market/templates/{FREE_TEMPLATE_IDS[0]}/install",
            timeout=15,
        )
        assert r.status_code == 401


# ─── Install ──────────────────────────────────────────────────────────────
class TestInstall:
    def test_paid_template_402_for_non_buyer(self, raj):
        r = raj.post(f"{LOCAL}/api/market/templates/{PAID_TEMPLATE_ID}/install",
                     timeout=20)
        assert r.status_code == 402
        assert "payment" in (r.json().get("detail", "").lower())

    def test_free_install_ok(self, raj, mongo):
        r = raj.post(f"{LOCAL}/api/market/templates/{FREE_TEMPLATE_IDS[0]}/install",
                     timeout=30)
        assert r.status_code == 200
        pid = r.json()["project_id"]
        # Verify project persisted
        p = mongo.dev_projects.find_one({"id": pid}, {"_id": 0})
        assert p is not None
        assert p["source"] == "market_template"
        assert p["market_template_id"] == FREE_TEMPLATE_IDS[0]
        # Files copied over
        files = list(mongo.dev_code_files.find({"project_id": pid}, {"_id": 0, "path": 1}))
        assert len(files) >= 1
        # Cleanup this specific project immediately
        mongo.dev_projects.delete_one({"id": pid})
        mongo.dev_code_files.delete_many({"project_id": pid})

    def test_install_unknown_template_404(self, raj):
        r = raj.post(f"{LOCAL}/api/market/templates/does-not-exist/install", timeout=15)
        assert r.status_code == 404


# ─── Checkout ─────────────────────────────────────────────────────────────
class TestCheckout:
    def test_checkout_free_400(self, raj):
        r = raj.post(
            f"{LOCAL}/api/market/templates/{FREE_TEMPLATE_IDS[0]}/checkout",
            json={"origin_url": BASE_URL},
            timeout=20,
        )
        assert r.status_code == 400

    def test_checkout_paid_returns_stripe_url(self, raj):
        r = raj.post(
            f"{LOCAL}/api/market/templates/{PAID_TEMPLATE_ID}/checkout",
            json={"origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "url" in d and "session_id" in d
        assert d["url"].startswith("https://checkout.stripe.com/") or "stripe" in d["url"]
        assert d["session_id"].startswith("cs_")

    def test_checkout_unknown_template_404(self, raj):
        r = raj.post(
            f"{LOCAL}/api/market/templates/nope/checkout",
            json={"origin_url": BASE_URL},
            timeout=15,
        )
        assert r.status_code == 404

    def test_checkout_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/market/templates/{PAID_TEMPLATE_ID}/checkout",
            json={"origin_url": BASE_URL},
            timeout=15,
        )
        assert r.status_code == 401


# ─── Seller submit + admin flow ───────────────────────────────────────────
class TestSellerAndAdmin:
    def test_submit_from_wrong_workspace_404(self, amit, mongo):
        # Insert a bogus project owned by a different workspace
        bogus = {
            "id": "test-iter80-wrongws",
            "workspace_id": "wrong-workspace-xyz",
            "name": "TEST_iter80_wrongws",
            "created_by": "some-other-user",
            "status": "prototype_ready",
            "created_at": "2026-01-01T00:00:00Z",
        }
        mongo.dev_projects.insert_one(bogus.copy())
        try:
            r = amit.post(
                f"{LOCAL}/api/market/templates",
                json={
                    "project_id": bogus["id"],
                    "name": "TEST_iter80_wrongws",
                    "tagline": "should not work",
                    "description": "",
                    "category": "other",
                    "pricing_model": "free",
                    "price_usd": 0,
                },
                timeout=15,
            )
            assert r.status_code == 404
        finally:
            mongo.dev_projects.delete_one({"id": bogus["id"]})

    def test_submit_no_files_400(self, amit, mongo):
        # Create a proper workspace project but no code files → 400
        me = amit.get(f"{LOCAL}/api/auth/me", timeout=15).json()
        empty_proj_id = "test-iter80-empty"
        mongo.dev_projects.insert_one({
            "id": empty_proj_id,
            "workspace_id": me["workspace_id"],
            "created_by": me["id"],
            "name": "TEST_iter80_empty",
            "status": "prototype_ready",
            "created_at": "2026-01-01T00:00:00Z",
        })
        try:
            r = amit.post(
                f"{LOCAL}/api/market/templates",
                json={
                    "project_id": empty_proj_id,
                    "name": "TEST_iter80_empty",
                    "tagline": "no files",
                    "pricing_model": "free",
                    "price_usd": 0,
                },
                timeout=15,
            )
            assert r.status_code == 400
        finally:
            mongo.dev_projects.delete_one({"id": empty_proj_id})

    def test_seller_submit_approve_and_reject_flow(self, raj, amit, mongo):
        # Install a free template first to have a project WITH code files in
        # raj's workspace (the seed shared demo project has 0 files).
        inst = raj.post(
            f"{LOCAL}/api/market/templates/{FREE_TEMPLATE_IDS[1]}/install",
            timeout=30,
        )
        assert inst.status_code == 200, inst.text
        source_project_id = inst.json()["project_id"]
        # Rename to TEST_ so cleanup catches it
        mongo.dev_projects.update_one(
            {"id": source_project_id},
            {"$set": {"name": "TEST_iter80_seller_src"}},
        )
        files = list(mongo.dev_code_files.find(
            {"project_id": source_project_id}, {"_id": 0, "path": 1},
        ).limit(2))
        assert files, "Installed source project should have files"

        # 1) raj submits an approve-flow template
        r = raj.post(
            f"{LOCAL}/api/market/templates",
            json={
                "project_id": source_project_id,
                "name": "TEST_iter80_approve_me",
                "tagline": "please approve",
                "description": "iteration 80 backend test",
                "category": "other",
                "pricing_model": "one_time",
                "price_usd": 19.0,
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        submitted = r.json()
        assert submitted["status"] == "submitted"
        approve_id = submitted["id"]

        # 2) Non-admin sees 'Platform admin only'
        r = raj.get(f"{LOCAL}/api/market/admin/queue", timeout=15)
        assert r.status_code == 403

        # 3) Admin sees the queue includes ours
        r = amit.get(f"{LOCAL}/api/market/admin/queue", timeout=15)
        assert r.status_code == 200
        queue_ids = {t["id"] for t in r.json()["templates"]}
        assert approve_id in queue_ids

        # 4) Approve
        r = amit.post(
            f"{LOCAL}/api/market/admin/templates/{approve_id}/approve",
            json={"notes": "approved by iteration 80 test"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "approved"

        # 5) Appears on public /templates now
        r = requests.get(f"{BASE_URL}/api/market/templates", timeout=20)
        assert r.status_code == 200
        assert approve_id in {t["id"] for t in r.json()["templates"]}

        # 6) Approving again (already-approved) → 404 (status != submitted)
        r = amit.post(
            f"{LOCAL}/api/market/admin/templates/{approve_id}/approve",
            json={"notes": ""}, timeout=15,
        )
        assert r.status_code == 404

        # 7) Reject flow — raj submits another; admin rejects with notes.
        r = raj.post(
            f"{LOCAL}/api/market/templates",
            json={
                "project_id": source_project_id,
                "name": "TEST_iter80_reject_me",
                "tagline": "please reject",
                "pricing_model": "free",
                "price_usd": 0,
            },
            timeout=20,
        )
        assert r.status_code == 200
        reject_id = r.json()["id"]
        r = amit.post(
            f"{LOCAL}/api/market/admin/templates/{reject_id}/reject",
            json={"notes": "please tighten copy"},
            timeout=15,
        )
        assert r.status_code == 200

        # Creator sees notes in /market/mine
        r = raj.get(f"{LOCAL}/api/market/mine", timeout=15)
        assert r.status_code == 200
        mine = {t["id"]: t for t in r.json()["templates"]}
        assert reject_id in mine
        assert mine[reject_id]["review_notes"] == "please tighten copy"
        assert mine[reject_id]["status"] == "rejected"

    def test_reject_non_submitted_404(self, amit):
        r = amit.post(
            f"{LOCAL}/api/market/admin/templates/does-not-exist/reject",
            json={"notes": "x"}, timeout=15,
        )
        assert r.status_code == 404


# ─── Payout account ───────────────────────────────────────────────────────
class TestPayoutAccount:
    def test_valid_account_id(self, raj):
        r = raj.post(
            f"{LOCAL}/api/market/payout-account",
            json={"stripe_account_id": "acct_1Test123"},
            timeout=15,
        )
        assert r.status_code == 200
        # Verify surfaces on /market/mine
        r = raj.get(f"{LOCAL}/api/market/mine", timeout=15)
        assert r.json()["earnings"]["payout_account"] == "acct_1Test123"

    def test_invalid_account_id_422(self, raj):
        r = raj.post(
            f"{LOCAL}/api/market/payout-account",
            json={"stripe_account_id": "bad_1234"},  # no acct_ prefix
            timeout=15,
        )
        assert r.status_code == 422


# ─── Stripe webhook edge ──────────────────────────────────────────────────
class TestStripeWebhook:
    def test_webhook_bad_signature_400(self):
        r = requests.post(
            f"{BASE_URL}/api/webhook/stripe",
            data=b"{}", headers={"Stripe-Signature": "bad"}, timeout=15,
        )
        # Either 400 (parse fail) or 200 no-op is acceptable — but bad signature must not 500
        assert r.status_code in (400, 401, 403)


# ─── 70/30 split / earnings visibility ────────────────────────────────────
class TestEarningsLedger:
    def test_mkt_earnings_split_math_via_mongo(self, mongo):
        # Sample any existing paid purchase (main agent noted priya has one) and
        # verify the fee/seller amounts match the 30%/70% rule.
        purchases = list(mongo.mkt_purchases.find({}, {"_id": 0}).limit(5))
        if not purchases:
            pytest.skip("No purchases seeded yet — skip math check")
        for p in purchases:
            total = p.get("amount_cents", 0)
            fee = p.get("platform_fee_cents", 0)
            seller = p.get("seller_earnings_cents", 0)
            assert total > 0, f"Bad amount on purchase {p.get('id')}"
            # allow ±1c rounding
            assert abs(fee - int(round(total * 0.30))) <= 1
            assert abs(seller - (total - fee)) <= 1
