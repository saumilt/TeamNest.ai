"""Iteration 136 — IAP variable/one-time consumables (PENDING-ORDER pattern).

Covers:
- GET /api/billing/iap/config -> storage_products + marketplace_tiers + credit_packs + entitlements
- POST /api/billing/iap/order kind=storage_pack (pack-10/50/100 -> storage_10/50/100)
- POST /api/billing/iap/order kind=marketplace_install variable-priced -> nearest tier
  validations: unknown listing 404, free listing 400, already installed 400
- POST /api/billing/iap/order invalid kind -> 400, missing ref_id -> 400
- GET /api/billing/iap/order/{id} 200 for owner; 404 for others
- POST /api/webhooks/revenuecat NON_RENEWING_PURCHASE storage -> fulfills, idempotent on dup event id
- POST /api/webhooks/revenuecat NON_RENEWING_PURCHASE marketplace -> installs employee, install_count++
- Existing web paths: /api/enterprise/storage/packs/purchase and /api/ai-builder/marketplace/{id}/install (free)
"""
import os
import uuid
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL must be set")

RC_AUTH = os.environ.get("RC_WEBHOOK_AUTH", "")
OWNER_EMAIL = "amit@demo.team"
OWNER_PASSWORD = os.environ.get("DEMO_PASSWORD", "DemoPass123!")
MEMBER_EMAIL = "raj@demo.team"
MEMBER_PASSWORD = os.environ.get("DEMO_PASSWORD", "DemoPass123!")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text[:200]}")
    return r.json()


@pytest.fixture(scope="module")
def owner_client():
    data = _login(OWNER_EMAIL, OWNER_PASSWORD)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"})
    s.user_id = data.get("user", {}).get("id") or data.get("id")
    me = s.get(f"{BASE_URL}/api/auth/me", timeout=10).json()
    s.user_id = me.get("id")
    s.workspace_id = me.get("workspace_id")
    return s


@pytest.fixture(scope="module")
def member_client():
    data = _login(MEMBER_EMAIL, MEMBER_PASSWORD)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"})
    me = s.get(f"{BASE_URL}/api/auth/me", timeout=10).json()
    s.user_id = me.get("id")
    return s


def _wh(event):
    return requests.post(
        f"{BASE_URL}/api/webhooks/revenuecat",
        json={"event": event},
        headers={"Authorization": RC_AUTH, "Content-Type": "application/json"},
        timeout=15,
    )


# ---------- CONFIG ----------
class TestConfig:
    def test_config_has_storage_and_marketplace_and_credits(self, owner_client):
        r = owner_client.get(f"{BASE_URL}/api/billing/iap/config", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("configured") is True
        assert d["storage_products"] == {
            "storage_10": "pack-10", "storage_50": "pack-50", "storage_100": "pack-100"}
        tiers = d["marketplace_tiers"]
        # returned as list-of-lists (json-serialized tuples)
        assert [t[0] for t in tiers] == [
            "marketplace_5", "marketplace_10", "marketplace_25", "marketplace_50", "marketplace_100"]
        assert [t[1] for t in tiers] == [4.99, 9.99, 24.99, 49.99, 99.99]
        assert d["credit_packs"]["credits_1000"] == 1000
        assert set(d["entitlements"]) >= {"student", "pro", "team"}


# ---------- STORAGE PACK ORDER ----------
class TestStoragePackOrder:
    @pytest.mark.parametrize("pack,prod", [
        ("pack-10", "storage_10"), ("pack-50", "storage_50"), ("pack-100", "storage_100")])
    def test_create_storage_order(self, owner_client, pack, prod):
        r = owner_client.post(f"{BASE_URL}/api/billing/iap/order",
                              json={"kind": "storage_pack", "ref_id": pack}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["product_id"] == prod
        assert d["status"] == "pending"
        assert d["order_id"]
        # GET back
        g = owner_client.get(f"{BASE_URL}/api/billing/iap/order/{d['order_id']}", timeout=10)
        assert g.status_code == 200
        assert g.json()["kind"] == "storage_pack"
        assert g.json()["ref_id"] == pack

    def test_get_order_not_owner_returns_404(self, owner_client, member_client):
        r = owner_client.post(f"{BASE_URL}/api/billing/iap/order",
                              json={"kind": "storage_pack", "ref_id": "pack-10"}, timeout=10)
        oid = r.json()["order_id"]
        # different user should not see it
        g = member_client.get(f"{BASE_URL}/api/billing/iap/order/{oid}", timeout=10)
        assert g.status_code == 404

    def test_get_unknown_order_404(self, owner_client):
        g = owner_client.get(f"{BASE_URL}/api/billing/iap/order/does-not-exist", timeout=10)
        assert g.status_code == 404

    def test_invalid_kind_400(self, owner_client):
        r = owner_client.post(f"{BASE_URL}/api/billing/iap/order",
                              json={"kind": "bogus", "ref_id": "x"}, timeout=10)
        assert r.status_code == 400

    def test_missing_ref_id_400(self, owner_client):
        r = owner_client.post(f"{BASE_URL}/api/billing/iap/order",
                              json={"kind": "storage_pack"}, timeout=10)
        assert r.status_code == 400

    def test_unknown_storage_pack_404(self, owner_client):
        r = owner_client.post(f"{BASE_URL}/api/billing/iap/order",
                              json={"kind": "storage_pack", "ref_id": "pack-999"}, timeout=10)
        assert r.status_code == 404


# ---------- STORAGE WEBHOOK FULFILLMENT ----------
class TestStorageWebhookFulfillment:
    def test_webhook_fulfills_pending_storage_order_idempotent(self, owner_client):
        # Read current included_gb
        s0 = owner_client.get(f"{BASE_URL}/api/enterprise/storage", timeout=15)
        assert s0.status_code == 200, s0.text
        inc0 = s0.json()["pricing"]["included_gb"]

        # Create pending order pack-10 (storage_10)
        o = owner_client.post(f"{BASE_URL}/api/billing/iap/order",
                              json={"kind": "storage_pack", "ref_id": "pack-10"}, timeout=10)
        oid = o.json()["order_id"]

        eid = f"iter136-store-{uuid.uuid4()}"
        tid = f"iter136-storetxn-{uuid.uuid4()}"
        r = _wh({
            "id": eid, "type": "NON_RENEWING_PURCHASE",
            "app_user_id": owner_client.user_id,
            "product_id": "storage_10", "transaction_id": tid,
            "store": "APP_STORE", "environment": "PRODUCTION",
        })
        assert r.status_code == 200, r.text

        # included_gb increased by 10 (webhook fulfilled the OLDEST pending
        # storage_10 order for this user — may be our fresh one or an older
        # pending from earlier in this run; either is correct behavior)
        s1 = owner_client.get(f"{BASE_URL}/api/enterprise/storage", timeout=15)
        inc1 = s1.json()["pricing"]["included_gb"]
        assert round(inc1 - inc0, 2) == 10.0, (inc0, inc1)
        # Our oid is either fulfilled or still pending (if an older one was
        # picked). Just assert it's a valid status.
        g = owner_client.get(f"{BASE_URL}/api/billing/iap/order/{oid}", timeout=10)
        assert g.status_code == 200
        assert g.json()["status"] in ("fulfilled", "pending")

        # Duplicate event id -> no double fulfillment
        r2 = _wh({
            "id": eid, "type": "NON_RENEWING_PURCHASE",
            "app_user_id": owner_client.user_id,
            "product_id": "storage_10", "transaction_id": tid,
            "store": "APP_STORE", "environment": "PRODUCTION",
        })
        assert r2.status_code == 200
        assert r2.json().get("duplicate") is True
        s2 = owner_client.get(f"{BASE_URL}/api/enterprise/storage", timeout=15)
        assert s2.json()["pricing"]["included_gb"] == inc1


# ---------- MARKETPLACE: create paid listing + order + webhook ----------
class TestMarketplaceOrderAndWebhook:
    @pytest.fixture(scope="class")
    def paid_listing(self, owner_client):
        # Create AI employee
        emp_res = owner_client.post(
            f"{BASE_URL}/api/ai-builder/employees",
            json={"name": "TEST IAP Emp", "job_title": "Sales Rep",
                  "department": "Sales", "description": "Test iter136"},
            timeout=15,
        )
        if emp_res.status_code not in (200, 201):
            pytest.skip(f"cannot create AI employee: {emp_res.status_code} {emp_res.text[:200]}")
        eid = emp_res.json().get("id") or emp_res.json().get("employee", {}).get("id")
        assert eid, emp_res.text
        # publish with price 15 -> should map to marketplace_25 (nearest tier >= 15)
        pub = owner_client.post(
            f"{BASE_URL}/api/ai-builder/employees/{eid}/marketplace/publish",
            json={"title": f"TEST IAP Listing {uuid.uuid4().hex[:6]}",
                  "tagline": "iter136", "description": "iter136 paid",
                  "category": "Sales", "price_usd": 15.0, "share_knowledge": False},
            timeout=20,
        )
        assert pub.status_code == 200, pub.text
        listing_id = pub.json()["id"]
        # Also make a free listing for validation
        emp2 = owner_client.post(
            f"{BASE_URL}/api/ai-builder/employees",
            json={"name": "TEST IAP FreeEmp", "job_title": "Rep2",
                  "department": "Sales", "description": "free"}, timeout=15).json()
        eid2 = emp2.get("id") or emp2.get("employee", {}).get("id")
        pub2 = owner_client.post(
            f"{BASE_URL}/api/ai-builder/employees/{eid2}/marketplace/publish",
            json={"title": f"TEST IAP Free {uuid.uuid4().hex[:6]}",
                  "category": "Sales", "price_usd": 0.0, "share_knowledge": False},
            timeout=20)
        assert pub2.status_code == 200, pub2.text
        free_id = pub2.json()["id"]
        return {"eid": eid, "listing_id": listing_id, "free_id": free_id}

    def test_order_maps_to_nearest_tier(self, owner_client, paid_listing):
        r = owner_client.post(f"{BASE_URL}/api/billing/iap/order",
                              json={"kind": "marketplace_install",
                                    "ref_id": paid_listing["listing_id"]}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["product_id"] == "marketplace_25", r.json()
        assert r.json()["status"] == "pending"

    def test_free_listing_rejected(self, owner_client, paid_listing):
        r = owner_client.post(f"{BASE_URL}/api/billing/iap/order",
                              json={"kind": "marketplace_install",
                                    "ref_id": paid_listing["free_id"]}, timeout=10)
        assert r.status_code == 400, r.text

    def test_unknown_listing_404(self, owner_client):
        r = owner_client.post(f"{BASE_URL}/api/billing/iap/order",
                              json={"kind": "marketplace_install",
                                    "ref_id": "nonexistent-listing"}, timeout=10)
        assert r.status_code == 404

    def test_webhook_fulfills_marketplace_install(self, owner_client, paid_listing):
        listing_id = paid_listing["listing_id"]
        # baseline install_count
        det0 = owner_client.get(f"{BASE_URL}/api/ai-builder/marketplace/{listing_id}", timeout=10).json()
        installs_before = det0.get("install_count", 0)

        # Create fresh pending order (previous test in this class may already have one)
        o = owner_client.post(f"{BASE_URL}/api/billing/iap/order",
                              json={"kind": "marketplace_install", "ref_id": listing_id},
                              timeout=10)
        # If already have a pending order this may be OK; else 400 "already installed"
        # We just need at least one pending. Grab id from response or from an existing pending.
        assert o.status_code in (200, 400), o.text
        # Send webhook
        eid = f"iter136-mkt-{uuid.uuid4()}"
        tid = f"iter136-mkttxn-{uuid.uuid4()}"
        r = _wh({
            "id": eid, "type": "NON_RENEWING_PURCHASE",
            "app_user_id": owner_client.user_id,
            "product_id": "marketplace_25", "transaction_id": tid,
            "store": "APP_STORE", "environment": "PRODUCTION",
        })
        assert r.status_code == 200, r.text
        time.sleep(1)

        det1 = owner_client.get(f"{BASE_URL}/api/ai-builder/marketplace/{listing_id}", timeout=10).json()
        assert det1.get("install_count", 0) == installs_before + 1, (installs_before, det1)
        assert det1.get("installed") is True

    def test_already_installed_rejected(self, owner_client, paid_listing):
        # After the webhook fulfillment above, workspace has the license -> new order should 400
        r = owner_client.post(f"{BASE_URL}/api/billing/iap/order",
                              json={"kind": "marketplace_install",
                                    "ref_id": paid_listing["listing_id"]}, timeout=10)
        assert r.status_code == 400, r.text


# ---------- EXISTING WEB PATHS STILL WORK ----------
class TestExistingWebPaths:
    def test_web_storage_pack_purchase(self, owner_client):
        s0 = owner_client.get(f"{BASE_URL}/api/enterprise/storage", timeout=15).json()
        inc0 = s0["pricing"]["included_gb"]
        r = owner_client.post(f"{BASE_URL}/api/enterprise/storage/packs/purchase",
                              json={"pack_id": "pack-10"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["pack"]["gb"] == 10
        s1 = owner_client.get(f"{BASE_URL}/api/enterprise/storage", timeout=15).json()
        assert round(s1["pricing"]["included_gb"] - inc0, 2) == 10.0

    def test_web_free_install_still_works(self, owner_client):
        # Create a fresh free listing
        emp = owner_client.post(
            f"{BASE_URL}/api/ai-builder/employees",
            json={"name": "TEST IAP WebFree", "job_title": "R",
                  "department": "Sales", "description": "webfree"}, timeout=15).json()
        eid = emp.get("id") or emp.get("employee", {}).get("id")
        pub = owner_client.post(
            f"{BASE_URL}/api/ai-builder/employees/{eid}/marketplace/publish",
            json={"title": f"TEST WebFree {uuid.uuid4().hex[:6]}",
                  "category": "Sales", "price_usd": 0.0, "share_knowledge": False},
            timeout=20)
        assert pub.status_code == 200, pub.text
        listing_id = pub.json()["id"]
        r = owner_client.post(f"{BASE_URL}/api/ai-builder/marketplace/{listing_id}/install",
                              timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        assert r.json().get("employee_id")
