"""
Iteration 78 — Builders Hub API tests.

Tests the /api/dev-projects/{id}/builders endpoints:
- GET  returns saved specs
- PUT  saves a spec for a valid key
- PUT  unknown key returns 400
- Unauthenticated returns 401
- Cross-workspace project returns 404
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://nest-app-prep.preview.emergentagent.com",
).rstrip("/")

TEST_PROJECT_ID = "40391fb0-f562-45d8-a7bf-0b10e0c1b49d"  # AP Ledger project fixture was gone; using the only project in amit@demo.team's workspace
CROSS_WORKSPACE_PROJECT_ID = "fd6c40f6-f1ce-480b-9251-8059a61ce27b"  # belongs to workspace 97a5fe3c... — should 404 for amit

VALID_KEYS = ["data", "roles", "logic", "workflow", "form", "report", "integration"]


@pytest.fixture(scope="module")
def cookie_session():
    """Use cookie auth (tn_session) — same as the browser."""
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text[:200]}"
    assert s.cookies.get("tn_session"), "expected tn_session cookie set by /demo-login"
    return s


class TestUnauthenticated:
    def test_get_builders_no_auth_401(self):
        r = requests.get(
            f"{BASE_URL}/api/dev-projects/{TEST_PROJECT_ID}/builders", timeout=15,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"

    def test_put_builders_no_auth_401(self):
        r = requests.put(
            f"{BASE_URL}/api/dev-projects/{TEST_PROJECT_ID}/builders/data",
            json={"spec": {"entities": []}},
            timeout=15,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"


class TestGetBuilders:
    def test_get_returns_specs_dict(self, cookie_session):
        r = cookie_session.get(
            f"{BASE_URL}/api/dev-projects/{TEST_PROJECT_ID}/builders", timeout=15,
        )
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "specs" in data, f"missing 'specs' key: {data}"
        assert isinstance(data["specs"], dict)


class TestPutBuilders:
    @pytest.mark.parametrize("key", VALID_KEYS)
    def test_put_valid_key_persists(self, cookie_session, key):
        marker = f"TEST_iter78_{uuid.uuid4().hex[:6]}"
        # A minimal-but-shaped spec per key so it round-trips cleanly.
        specs_per_key = {
            "data": {"entities": [{"name": marker, "fields": [{"name": "x", "type": "text"}], "relations": ""}]},
            "roles": {"roles": [{"name": marker, "perms": {"view": True}, "notes": ""}]},
            "logic": {"rules": [{"when": marker, "then": "log it"}]},
            "workflow": {"flows": [{"trigger": marker, "steps": ["notify"]}]},
            "form": {"forms": [{"name": marker, "where": "nav", "fields": [{"label": "x", "type": "text"}]}]},
            "report": {"reports": [{"measure": marker, "group": "", "chart": "bar chart"}]},
            "integration": {"integrations": [{"service": "Stripe", "what": marker}]},
        }
        spec = specs_per_key[key]

        r = cookie_session.put(
            f"{BASE_URL}/api/dev-projects/{TEST_PROJECT_ID}/builders/{key}",
            json={"spec": spec},
            timeout=15,
        )
        assert r.status_code == 200, f"PUT {key} failed: {r.status_code} {r.text[:200]}"
        body = r.json()
        assert body.get("ok") is True
        assert body.get("builder") == key

        # GET round-trip: verify the marker is present in the saved spec.
        rg = cookie_session.get(
            f"{BASE_URL}/api/dev-projects/{TEST_PROJECT_ID}/builders", timeout=15,
        )
        assert rg.status_code == 200
        specs = rg.json()["specs"]
        assert key in specs, f"expected key '{key}' in specs after PUT, got {list(specs)}"
        # Marker string appears somewhere in the returned spec's JSON.
        assert marker in str(specs[key]), f"marker not persisted for {key}: {specs[key]}"

    def test_put_unknown_key_returns_400(self, cookie_session):
        r = cookie_session.put(
            f"{BASE_URL}/api/dev-projects/{TEST_PROJECT_ID}/builders/bogus",
            json={"spec": {"anything": True}},
            timeout=15,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"

    def test_put_nonexistent_project_returns_404(self, cookie_session):
        fake_id = str(uuid.uuid4())
        r = cookie_session.put(
            f"{BASE_URL}/api/dev-projects/{fake_id}/builders/data",
            json={"spec": {"entities": []}},
            timeout=15,
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"

    def test_get_nonexistent_project_returns_404(self, cookie_session):
        fake_id = str(uuid.uuid4())
        r = cookie_session.get(
            f"{BASE_URL}/api/dev-projects/{fake_id}/builders", timeout=15,
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"

    def test_cross_workspace_project_returns_404(self, cookie_session):
        # Project exists but is owned by a different workspace than amit's demo login.
        r = cookie_session.get(
            f"{BASE_URL}/api/dev-projects/{CROSS_WORKSPACE_PROJECT_ID}/builders",
            timeout=15,
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"

        r2 = cookie_session.put(
            f"{BASE_URL}/api/dev-projects/{CROSS_WORKSPACE_PROJECT_ID}/builders/data",
            json={"spec": {"entities": []}},
            timeout=15,
        )
        assert r2.status_code == 404, f"expected 404, got {r2.status_code}: {r2.text[:200]}"
