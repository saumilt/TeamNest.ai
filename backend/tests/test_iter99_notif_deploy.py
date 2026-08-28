"""Iteration 99 — mobile parity smoke tests for notifications feed + AI-employee
deployments directory.

Endpoints under test:
  GET  /api/notifications
  POST /api/notifications/{id}/read
  POST /api/notifications/read-all
  GET  /api/ai-builder/deployments
  POST /api/ai-builder/employees/{eid}/undeploy
"""
import os
import uuid
import datetime
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/demo-login", json={}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def member_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "raj@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"raj login failed: {r.status_code} {r.text[:200]}")
    return r.json()["token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ── Notifications ──────────────────────────────────────────────────────
class TestNotifications:
    def test_get_notifications_shape(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get("items"), list)
        assert isinstance(d.get("unread_count"), int)

    def test_read_all_and_verify_persistence(self, admin_token):
        # Seed via /read-all → then verify unread_count == 0 on GET
        r = requests.post(
            f"{BASE_URL}/api/notifications/read-all",
            headers=auth_headers(admin_token),
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True
        r2 = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers(admin_token), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["unread_count"] == 0

    def test_mark_single_read(self, admin_token):
        # Fetch, if empty just skip — otherwise mark first as read and verify
        r = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers(admin_token), timeout=15)
        items = r.json().get("items", [])
        if not items:
            pytest.skip("no notifications available to mark read")
        nid = items[0]["id"]
        r2 = requests.post(
            f"{BASE_URL}/api/notifications/{nid}/read",
            headers=auth_headers(admin_token),
            timeout=15,
        )
        assert r2.status_code == 200


# ── Deployments directory ─────────────────────────────────────────────
class TestDeployments:
    def test_admin_gets_200(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/ai-builder/deployments",
            headers=auth_headers(admin_token),
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get("deployments"), list)

    def test_member_forbidden(self, member_token):
        r = requests.get(
            f"{BASE_URL}/api/ai-builder/deployments",
            headers=auth_headers(member_token),
            timeout=15,
        )
        assert r.status_code == 403
        # error message should indicate admin gate
        assert "admin" in r.text.lower()

    def test_undeploy_missing_returns_404_or_400(self, admin_token):
        # Undeploy an ID that doesn't exist — should not 500.
        fake_eid = str(uuid.uuid4())
        r = requests.post(
            f"{BASE_URL}/api/ai-builder/employees/{fake_eid}/undeploy",
            headers=auth_headers(admin_token),
            timeout=15,
        )
        assert r.status_code in (400, 404), f"got {r.status_code}: {r.text[:200]}"
