"""Iteration 148 — Phase 4: Apps Marketplace + Zapier (keyless webhook partner).

Covers:
  • GET /apps catalogue shape (10 apps incl. Zapier, categories, kind, permissions, live/connected)
  • Search (?q=) and category filter (?category=)
  • GET /apps/zapier state
  • POST /apps/zapier/connect — owner/admin only, member 403, invalid non-https catch_hook_url → 400
  • POST /apps/zapier/test — 400 when no outbound_url set; graceful 200/502 when set
  • POST /apps/zapier/disconnect — owner/admin only
  • POST /apps/webhooks/zapier/{token}?secret=... — valid secret drops msg + increments events_received;
    missing/bad secret → 401; unknown token → 404
  • Regression: /connectors registry endpoint still works
"""
import os
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_backend_url()


def _login(email: str, password: str = "Demo@2026") -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def owner_headers():
    return {"Authorization": f"Bearer {_login('amit@demo.team')}"}


@pytest.fixture(scope="module")
def member_headers():
    return {"Authorization": f"Bearer {_login('raj@demo.team')}"}


@pytest.fixture(scope="module", autouse=True)
def cleanup_after(owner_headers):
    yield
    # Ensure the demo workspace's Zapier connection is disconnected after the run
    requests.post(f"{BASE_URL}/api/apps/zapier/disconnect", headers=owner_headers, timeout=10)


# ── Catalogue ────────────────────────────────────────────────────────────
class TestCatalogue:
    def test_list_apps_shape(self, owner_headers):
        r = requests.get(f"{BASE_URL}/api/apps", headers=owner_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "apps" in data and "categories" in data
        assert data["categories"] == ["Email", "CRM", "Chat", "Files", "Automation"]
        apps = data["apps"]
        # 9 native providers (incl. gmail+gworkspace and outlook+m365 duplicates) + Zapier = 10
        assert len(apps) == 10, f"expected 10 apps, got {len(apps)}"
        keys = {a["key"] for a in apps}
        assert {"gmail", "gworkspace", "outlook", "m365", "hubspot", "salesforce", "slack", "teams", "gdrive", "zapier"} <= keys
        # Field-level assertions
        for a in apps:
            for k in ("key", "name", "category", "kind", "permissions", "live", "connected", "connect_via"):
                assert k in a, f"missing {k} in {a.get('key')}"
            assert a["kind"] in ("native", "partner")
            assert isinstance(a["permissions"], list) and len(a["permissions"]) >= 1
            for p in a["permissions"]:
                assert p["type"] in ("read", "act")
                assert p["title"] and p["plain"]

    def test_zapier_entry(self, owner_headers):
        r = requests.get(f"{BASE_URL}/api/apps", headers=owner_headers, timeout=15).json()
        zap = next(a for a in r["apps"] if a["key"] == "zapier")
        assert zap["kind"] == "partner"
        assert zap["live"] is True
        assert zap["connect_via"] == "webhook"
        perm_types = {p["type"] for p in zap["permissions"]}
        assert perm_types == {"read", "act"}

    def test_search_query(self, owner_headers):
        r = requests.get(f"{BASE_URL}/api/apps", params={"q": "zapier"}, headers=owner_headers, timeout=15)
        assert r.status_code == 200
        apps = r.json()["apps"]
        assert len(apps) >= 1
        assert all("zapier" in (a["name"] + a["description"] + a["category"]).lower() for a in apps)

    def test_category_filter(self, owner_headers):
        r = requests.get(f"{BASE_URL}/api/apps", params={"category": "Automation"}, headers=owner_headers, timeout=15)
        assert r.status_code == 200
        apps = r.json()["apps"]
        assert len(apps) >= 1
        assert all(a["category"] == "Automation" for a in apps)


# ── Zapier connect / disconnect / permissions ────────────────────────────
class TestZapierConnection:
    def test_initial_state_disconnected(self, owner_headers):
        # Ensure clean state
        requests.post(f"{BASE_URL}/api/apps/zapier/disconnect", headers=owner_headers, timeout=10)
        r = requests.get(f"{BASE_URL}/api/apps/zapier", headers=owner_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["connected"] is False

    def test_member_cannot_connect(self, member_headers):
        r = requests.post(f"{BASE_URL}/api/apps/zapier/connect", json={}, headers=member_headers, timeout=10)
        assert r.status_code == 403

    def test_invalid_catch_hook_url_rejected(self, owner_headers):
        r = requests.post(f"{BASE_URL}/api/apps/zapier/connect",
                          json={"catch_hook_url": "http://not-https.example.com/hook"},
                          headers=owner_headers, timeout=10)
        assert r.status_code == 400

    def test_owner_connect_no_url(self, owner_headers):
        r = requests.post(f"{BASE_URL}/api/apps/zapier/connect", json={}, headers=owner_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["connected"] is True
        assert data["has_outbound"] is False
        assert data["inbound_path"] and data["inbound_path"].startswith("/api/apps/webhooks/zapier/")
        assert "secret=" in data["inbound_path"]
        # GET verifies persistence
        g = requests.get(f"{BASE_URL}/api/apps/zapier", headers=owner_headers, timeout=10).json()
        assert g["connected"] is True
        assert g["inbound_path"] == data["inbound_path"]

    def test_test_endpoint_400_without_outbound(self, owner_headers):
        # After no-url connect above, /test should 400
        r = requests.post(f"{BASE_URL}/api/apps/zapier/test", headers=owner_headers, timeout=10)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_update_with_valid_https_url_and_test(self, owner_headers):
        # Use httpbin as a reachable https endpoint that accepts POST
        r = requests.post(f"{BASE_URL}/api/apps/zapier/connect",
                          json={"catch_hook_url": "https://httpbin.org/status/200"},
                          headers=owner_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["has_outbound"] is True
        assert data["outbound_url"] == "https://httpbin.org/status/200"

        # /test should succeed OR gracefully 502 if httpbin is unreachable
        t = requests.post(f"{BASE_URL}/api/apps/zapier/test", headers=owner_headers, timeout=20)
        assert t.status_code in (200, 502), f"unexpected /test status {t.status_code}: {t.text}"

    def test_member_cannot_disconnect(self, member_headers):
        r = requests.post(f"{BASE_URL}/api/apps/zapier/disconnect", headers=member_headers, timeout=10)
        assert r.status_code == 403

    def test_owner_can_disconnect(self, owner_headers):
        r = requests.post(f"{BASE_URL}/api/apps/zapier/disconnect", headers=owner_headers, timeout=10)
        assert r.status_code == 200
        # GET verifies removal
        g = requests.get(f"{BASE_URL}/api/apps/zapier", headers=owner_headers, timeout=10).json()
        assert g["connected"] is False


# ── Public inbound webhook ────────────────────────────────────────────────
class TestZapierInbound:
    @pytest.fixture(scope="class")
    def inbound(self, owner_headers):
        # Ensure clean, then connect fresh to get a known token+secret
        requests.post(f"{BASE_URL}/api/apps/zapier/disconnect", headers=owner_headers, timeout=10)
        r = requests.post(f"{BASE_URL}/api/apps/zapier/connect", json={}, headers=owner_headers, timeout=10).json()
        # Parse token + secret from inbound_path
        path = r["inbound_path"]
        # /api/apps/webhooks/zapier/<token>?secret=<secret>
        token = path.split("/api/apps/webhooks/zapier/")[1].split("?")[0]
        secret = path.split("secret=")[1]
        yield {"token": token, "secret": secret}
        requests.post(f"{BASE_URL}/api/apps/zapier/disconnect", headers=owner_headers, timeout=10)

    def test_unknown_token_404(self):
        r = requests.post(f"{BASE_URL}/api/apps/webhooks/zapier/does-not-exist",
                          params={"secret": "whatever"},
                          json={"title": "x", "text": "y"}, timeout=10)
        assert r.status_code == 404

    def test_missing_secret_401(self, inbound):
        r = requests.post(f"{BASE_URL}/api/apps/webhooks/zapier/{inbound['token']}",
                          json={"title": "x", "text": "y"}, timeout=10)
        assert r.status_code == 401

    def test_bad_secret_401(self, inbound):
        r = requests.post(f"{BASE_URL}/api/apps/webhooks/zapier/{inbound['token']}",
                          params={"secret": "wrong-secret"},
                          json={"title": "x", "text": "y"}, timeout=10)
        assert r.status_code == 401

    def test_valid_inbound_increments_and_posts(self, inbound, owner_headers):
        # Snapshot events_received before
        before = requests.get(f"{BASE_URL}/api/apps/zapier", headers=owner_headers, timeout=10).json()
        r = requests.post(f"{BASE_URL}/api/apps/webhooks/zapier/{inbound['token']}",
                          params={"secret": inbound["secret"]},
                          json={"title": "TEST_it148 inbound",
                                "text": "hello from pytest"}, timeout=15)
        assert r.status_code == 200, f"inbound failed: {r.status_code} {r.text}"
        body = r.json()
        assert body["ok"] is True
        assert "message_id" in body and isinstance(body["message_id"], str)

        # GET verifies events_received incremented
        after = requests.get(f"{BASE_URL}/api/apps/zapier", headers=owner_headers, timeout=10).json()
        assert after["events_received"] == before["events_received"] + 1


# ── Regression: native connector registry still works ────────────────────
class TestConnectorsRegression:
    def test_connectors_endpoint_lists_providers(self, owner_headers):
        r = requests.get(f"{BASE_URL}/api/connectors", headers=owner_headers, timeout=10)
        # Endpoint should exist and respond 200 with a provider list
        assert r.status_code == 200, f"/api/connectors failed: {r.status_code}"
        data = r.json()
        # Response is either a list or an object with providers/accounts
        if isinstance(data, dict):
            provs = data.get("registry") or data.get("providers") or data.get("connectors") or []
        else:
            provs = data
        assert isinstance(provs, list) and len(provs) > 0
        # Verify gmail + m365 OAuth start endpoints exist in registry (regression)
        provider_keys = {p["provider"] for p in provs}
        assert "gmail" in provider_keys and "m365" in provider_keys
