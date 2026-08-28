"""Iteration 40 — Named AI Employees + chat memory."""
import os

import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://teamnest.ai")
API = f"{BASE_URL}/api"
OWNER = {"email": "amit@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")}


@pytest.fixture(scope="module")
def session():
    c = httpx.Client(timeout=30)
    r = c.post(f"{API}/auth/login", json=OWNER)
    assert r.status_code == 200
    return c


def test_rename_cmo_sets_display_name(session):
    r = session.post(
        f"{API}/ai-employees/cmo/rename",
        json={"display_first_name": "Priya"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["display_first_name"] == "Priya"
    assert body["display_full_name"] == "Priya AI"


def test_rename_sanitizes_input(session):
    """Special chars stripped, length capped, capitalised."""
    r = session.post(
        f"{API}/ai-employees/cmo/rename",
        json={"display_first_name": "  alice123 !@#  "},
    )
    assert r.status_code == 200
    assert r.json()["display_first_name"] == "Alice"


def test_rename_uses_default_when_empty(session):
    r = session.post(
        f"{API}/ai-employees/cmo/rename",
        json={"display_first_name": "###"},
    )
    assert r.status_code == 200
    # Falls back to per-role default "Priya" for cmo.
    assert r.json()["display_first_name"] == "Priya"


def test_listing_includes_display_name(session):
    # Ensure CMO is named Priya before listing.
    session.post(f"{API}/ai-employees/cmo/rename", json={"display_first_name": "Priya"})
    r = session.get(f"{API}/ai-employees")
    assert r.status_code == 200
    employees = r.json().get("employees", [])
    cmo = next((e for e in employees if e.get("key") == "cmo"), None)
    assert cmo is not None
    sub = cmo.get("subscription") or {}
    if sub:
        assert sub.get("display_full_name", "").endswith("AI")
        assert sub.get("display_first_name")


def test_rename_requires_active_subscription():
    """Workspace with no subscription on a key can't rename it."""
    c = httpx.Client(timeout=15)
    r = c.post(
        f"{API}/auth/signup",
        json={
            "email": f"rename_t_{os.urandom(3).hex()}@example.com",
            "password": "Test1234!",
            "name": "Rename Tester",
        },
    )
    if r.status_code not in (200, 201):
        pytest.skip("Signup unavailable in this environment")
    # No subscription yet; rename should 404.
    r2 = c.post(
        f"{API}/ai-employees/cmo/rename",
        json={"display_first_name": "Test"},
    )
    assert r2.status_code in (403, 404)
