"""Iteration 36 — Phase 6 Session 2 (QB OAuth, Twilio SMS, more employees)."""
import io
import os

import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://teamnest.ai")
API = f"{BASE_URL}/api"

OWNER = {"email": "amit@demo.team", "password": "Demo@2026"}


@pytest.fixture(scope="module")
def session():
    c = httpx.Client(timeout=30, follow_redirects=False)
    r = c.post(f"{API}/auth/login", json=OWNER)
    assert r.status_code == 200, r.text
    return c


def test_employees_promoted_to_active(session):
    r = session.get(f"{API}/ai-employees")
    assert r.status_code == 200
    body = r.json()
    assert body["active_count"] == 4
    assert body["coming_soon_count"] == 3
    active_keys = {e["key"] for e in body["employees"] if e["status"] == "active"}
    assert {"cmo", "sales", "paralegal", "bookkeeper"} == active_keys


def test_qbo_status_and_auth_url(session):
    s = session.get(f"{API}/qbo/status")
    assert s.status_code == 200
    a = session.get(f"{API}/qbo/auth")
    assert a.status_code == 200, a.text
    url = a.json()["authorization_url"]
    # Real Intuit OAuth URL with a non-empty client_id baked in.
    assert "appcenter.intuit.com" in url
    assert "client_id=" in url


def test_sms_config_test_mode(session):
    r = session.get(f"{API}/sms/config")
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "test"
    assert body["from_number"] == "+15005550006"
    assert body["configured"] is True


def test_sms_create_contact_and_send(session):
    # Create contact
    r = session.post(
        f"{API}/sms/contacts",
        json={"name": "Test Vendor", "phone": "+15005550010", "company": "Test Co"},
    )
    assert r.status_code == 200, r.text
    contact_id = r.json()["id"]

    # Send SMS in test mode — Twilio returns a fake SID and doesn't deliver.
    r = session.post(f"{API}/sms/send", json={"contact_id": contact_id, "body": "Hello in test mode"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["direction"] == "outbound"
    assert body["twilio_mode"] == "test"
    assert body["twilio_sid"].startswith("SM")


def test_sms_inbound_webhook_stop_opts_out(session):
    # Get the test contact's phone
    cs = session.get(f"{API}/sms/contacts").json()["contacts"]
    contact = next((c for c in cs if c["phone"] == "+15005550010"), None)
    assert contact

    # POST to /sms/inbound as Twilio would.
    r = session.post(
        f"{API}/sms/inbound",
        data={"From": contact["phone"], "To": "+15005550006", "Body": "STOP"},
    )
    assert r.status_code == 200
    assert "<Response/>" in r.text

    # Verify the contact is now opted out.
    cs2 = session.get(f"{API}/sms/contacts").json()["contacts"]
    updated = next(c for c in cs2 if c["phone"] == "+15005550010")
    assert updated["sms_opted_in"] is False


def test_bookkeeper_csv_still_works(session):
    csv = (
        b"Date,Description,Amount\n"
        b"05/20/2026,GOOGLE ADS BILLING,-100.00\n"
    )
    r = session.post(
        f"{API}/bookkeeper/statements?account_name=Test%20CSV",
        files={"file": ("test.csv", io.BytesIO(csv), "text/csv")},
    )
    assert r.status_code == 200, r.text


def test_bookkeeper_rejects_unknown_format(session):
    r = session.post(
        f"{API}/bookkeeper/statements?account_name=Test",
        files={"file": ("test.xyz", io.BytesIO(b"junk"), "application/octet-stream")},
    )
    assert r.status_code == 400


def test_convert_trial_to_paid(session):
    # CMO trial was started in iter 35. Convert it.
    r = session.post(f"{API}/ai-employees/cmo/convert-to-paid")
    assert r.status_code == 200
    body = r.json()
    assert body["phase"] == "paid"
    assert body["status"] == "active"
