"""Iteration 106 backend tests — password complexity policy, SuperAdmin
provision (credits + email), forgot/reset password flow, dynamic connector
folders + M365 train with folder/date scoping.

Uses REACT_APP_BACKEND_URL (shared backend for web + mobile).
"""
import os
import secrets
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

SUPER_ADMIN_EMAIL = "sam@funasia.net"
SUPER_ADMIN_PASSWORD = os.environ.get("SUPERADMIN_TEST_PASSWORD", "")
DEMO_ADMIN_EMAIL = "amit@demo.team"
DEMO_ADMIN_PASSWORD = "Demo@2026"


# ─── Fixtures ──────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def super_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # Try funasia first, fall back to demo admin (both are super).
    r = s.post(f"{API}/auth/login", json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD})
    if r.status_code != 200:
        r = s.post(f"{API}/auth/demo-login")
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="session")
def demo_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/demo-login")
    assert r.status_code == 200
    tok = r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


# ─── 1. Password complexity ────────────────────────────────────────────
WEAK_PWS = [
    ("short", "Ab1$"),                # too short
    ("no_upper", "abcdefg1$"),
    ("no_lower", "ABCDEFG1$"),
    ("no_digit", "Abcdefg$$"),
    ("no_special", "Abcdefg1"),
]


@pytest.mark.parametrize("label,pw", WEAK_PWS)
def test_signup_rejects_weak_password_or_invite_required(label, pw):
    # /auth/signup is invite-gated (403 invite_required); password check happens
    # AFTER the gate. If gate is closed the endpoint returns 403 — that's ok.
    r = requests.post(f"{API}/auth/signup", json={
        "name": "T", "email": f"TEST_{uuid.uuid4().hex[:8]}@example.com", "password": pw,
    })
    assert r.status_code in (400, 403), f"{label}: {r.status_code} {r.text[:200]}"


@pytest.mark.parametrize("label,pw", WEAK_PWS)
def test_reset_password_rejects_weak(label, pw):
    r = requests.post(f"{API}/auth/reset-password", json={"token": "fake-token", "password": pw})
    assert r.status_code == 400
    assert "Password must" in r.text or "at least" in r.text.lower() or "include" in r.text.lower()


@pytest.mark.parametrize("label,pw", WEAK_PWS)
def test_superadmin_create_user_rejects_weak(super_session, label, pw):
    email = f"TEST_weak_{uuid.uuid4().hex[:6]}@example.com"
    r = super_session.post(f"{API}/superadmin/users", json={
        "name": "Weak", "email": email, "password": pw,
    })
    assert r.status_code == 400, f"{label}: {r.status_code} {r.text[:200]}"
    assert "Password" in r.text or "password" in r.text


@pytest.mark.parametrize("label,pw", WEAK_PWS)
def test_superadmin_reset_password_rejects_weak(super_session, label, pw):
    # Find any existing user id (use amit).
    users = super_session.get(f"{API}/superadmin/users?search=amit@demo.team").json()["users"]
    assert users, "no demo admin user found"
    uid = users[0]["id"]
    r = super_session.post(f"{API}/superadmin/users/{uid}/reset-password", json={"new_password": pw})
    assert r.status_code == 400


@pytest.mark.parametrize("label,pw", WEAK_PWS)
def test_self_change_password_rejects_weak(demo_session, label, pw):
    r = demo_session.post(f"{API}/me/password", json={
        "current_password": DEMO_ADMIN_PASSWORD, "new_password": pw,
    })
    assert r.status_code == 400, f"{label}: {r.status_code} {r.text[:200]}"


def test_self_change_password_accepts_strong(demo_session):
    # Use rotation: change to a new strong pw then change back.
    new_pw = "Str0ng$Passw0rd!"
    r = demo_session.post(f"{API}/me/password", json={
        "current_password": DEMO_ADMIN_PASSWORD, "new_password": new_pw,
    })
    assert r.status_code == 200, r.text
    # Change back.
    r2 = demo_session.post(f"{API}/me/password", json={
        "current_password": new_pw, "new_password": DEMO_ADMIN_PASSWORD,
    })
    assert r2.status_code == 200, r2.text


# ─── 2. SuperAdmin provision with credits + email ──────────────────────
def test_superadmin_create_user_with_credits_and_email(super_session):
    email = f"TEST_provision_{uuid.uuid4().hex[:6]}@example.com"
    strong = "Provision$2026A"
    r = super_session.post(f"{API}/superadmin/users", json={
        "name": "TEST Provision", "email": email, "password": strong,
        "credits": 500, "send_credentials": True, "cc": ["sam@funasia.net"],
        "must_change_password": True,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["credits_added"] == 500
    # credentials_emailed can be True (mailgun ok) or False (mailgun down); both are acceptable
    assert "credentials_emailed" in body
    ws_id = body["workspace_id"]
    uid = body["id"]

    # Verify workspace credits via /superadmin/workspaces/{ws_id}
    r2 = super_session.get(f"{API}/superadmin/workspaces/{ws_id}")
    assert r2.status_code == 200
    ws = r2.json()
    # Should have credits_remaining ≥ 500 (plan may add more too).
    assert ws["credits_remaining"] >= 500, ws

    # Cleanup
    super_session.delete(f"{API}/superadmin/users/{uid}")


# ─── 3. Forgot / reset backend ─────────────────────────────────────────
def test_forgot_password_generic_200_unknown_email():
    r = requests.post(f"{API}/auth/forgot-password", json={"email": f"nobody_{uuid.uuid4().hex[:6]}@nowhere.io"})
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    assert "reset link" in (body.get("message") or "").lower()


def test_forgot_password_generic_200_known_email():
    r = requests.post(f"{API}/auth/forgot-password", json={"email": DEMO_ADMIN_EMAIL})
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True


def test_reset_password_invalid_token_after_complexity():
    strong = "Fresh$Passw0rd1"
    r = requests.post(f"{API}/auth/reset-password", json={"token": "garbage-token-xyz", "password": strong})
    assert r.status_code == 400
    assert "invalid" in r.text.lower() or "expired" in r.text.lower()


# ─── 4. Connectors: dynamic folders + M365 train scoping ────────────────
def test_m365_folders_endpoint(super_session):
    # There should be a connected m365 account somewhere. Find one via
    # /connectors (as super, we see our own accounts). We first try amit's session
    # since the M365 account is likely on the demo workspace.
    r = super_session.get(f"{API}/connectors")
    if r.status_code != 200:
        pytest.skip(f"/connectors not accessible: {r.status_code}")
    accounts = r.json().get("accounts", [])
    m365_accts = [a for a in accounts if a.get("provider") == "m365" and a.get("connection_status") == "connected"]
    if not m365_accts:
        pytest.skip("No connected M365 account for the super admin session")
    acc_id = m365_accts[0]["id"]
    r2 = super_session.get(f"{API}/connectors/m365/folders", params={"account_id": acc_id})
    assert r2.status_code == 200, r2.text
    folders = r2.json().get("folders", [])
    assert isinstance(folders, list) and len(folders) > 0
    # Must at minimum include Inbox / Sent Items either from Graph or fallback.
    values = {(f.get("value") or "").lower() for f in folders}
    labels = {(f.get("label") or "").lower() for f in folders}
    assert ("inbox" in values or any("inbox" in lb for lb in labels))
    assert ("sentitems" in values or "sent items" in labels or any("sent" in lb for lb in labels))


def test_folders_wrong_provider_400(super_session):
    r = super_session.get(f"{API}/connectors/xyz/folders", params={"account_id": "irrelevant"})
    assert r.status_code == 400


def test_folders_unknown_account_404(super_session):
    r = super_session.get(f"{API}/connectors/m365/folders", params={"account_id": "does-not-exist"})
    assert r.status_code == 404
