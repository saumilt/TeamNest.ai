"""Iteration 37 — MFA passkey + recovery code + QBO production regression."""
import os

import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://teamnest.ai")
API = f"{BASE_URL}/api"

OWNER = {"email": "amit@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")}


@pytest.fixture(scope="module")
def session():
    c = httpx.Client(timeout=30, follow_redirects=False)
    r = c.post(f"{API}/auth/login", json=OWNER)
    assert r.status_code == 200, r.text
    assert not r.json().get("mfa_required"), "Demo user should not have MFA enabled"
    return c


def test_mfa_status_off_by_default(session):
    r = session.get(f"{API}/mfa/status")
    assert r.status_code == 200
    body = r.json()
    assert body["mfa_enabled"] is False
    assert body["passkey_count"] == 0
    assert body["passkeys"] == []
    assert body["recovery_codes_remaining"] == 0


def test_passkey_register_begin_shape(session):
    r = session.post(f"{API}/mfa/passkey/register/begin", json={"device_name": "Pytest device"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "challenge_id" in body
    assert body["pending_device_name"] == "Pytest device"
    opts = body["options"]
    assert opts["rp"]["name"] == "TeamNest.ai"
    assert opts["rp"]["id"]
    assert opts["user"]["name"]  # email
    assert opts["challenge"]
    assert opts["pubKeyCredParams"]
    algs = {p["alg"] for p in opts["pubKeyCredParams"]}
    assert -7 in algs  # ES256


def test_register_complete_rejects_invalid_attestation(session):
    begin = session.post(f"{API}/mfa/passkey/register/begin", json={"device_name": "Fake"})
    assert begin.status_code == 200
    bad = session.post(
        f"{API}/mfa/passkey/register/complete",
        json={
            "challenge_id": begin.json()["challenge_id"],
            "credential": {"id": "abc", "rawId": "abc", "response": {}, "type": "public-key"},
        },
    )
    assert bad.status_code == 400


def test_login_returns_session_when_no_mfa():
    c = httpx.Client(timeout=30)
    r = c.post(f"{API}/auth/login", json=OWNER)
    assert r.status_code == 200
    body = r.json()
    assert not body.get("mfa_required")
    assert body.get("token")
    assert body["user"]["email"] == OWNER["email"]


def test_mfa_endpoints_require_auth():
    c = httpx.Client(timeout=30)
    r = c.get(f"{API}/mfa/status")
    assert r.status_code == 401
    r = c.post(f"{API}/mfa/passkey/register/begin", json={"device_name": "x"})
    assert r.status_code == 401


def test_recovery_use_rejects_bad_mfa_token():
    c = httpx.Client(timeout=30)
    r = c.post(f"{API}/mfa/recovery/use", json={"code": "any", "mfa_token": "not.a.real.jwt"})
    assert r.status_code == 401


def test_passkey_auth_begin_rejects_missing_token():
    c = httpx.Client(timeout=30)
    r = c.post(f"{API}/mfa/passkey/auth/begin", json={})
    assert r.status_code == 400


def test_qbo_status_exposes_server_environment(session):
    r = session.get(f"{API}/qbo/status")
    assert r.status_code == 200
    body = r.json()
    assert body["server_environment"] in ("sandbox", "production")
    # We just flipped to production, so confirm it's reflected.
    assert body["server_environment"] == "production"
