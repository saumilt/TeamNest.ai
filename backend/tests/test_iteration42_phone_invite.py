"""Iteration 42 — WhatsApp-style phone invite endpoint."""
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


def test_phone_invite_whatsapp_returns_wa_me_link(session):
    r = session.post(
        f"{API}/invites/phone",
        json={"phone": "+14155551234", "name": "Sarah", "method": "whatsapp", "share_url_base": "https://teamnest.ai"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["method"] == "whatsapp"
    assert body["open_url"].startswith("https://wa.me/14155551234")
    assert "share_url" in body
    assert "/join/" in body["share_url"]
    assert "Sarah" in body["body"]


def test_phone_invite_sms_uses_twilio(session):
    r = session.post(
        f"{API}/invites/phone",
        json={"phone": "+14155551234", "name": "Test", "method": "sms"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # Either Twilio path or local-sms fallback if Twilio is not configured.
    assert body["method"] in ("sms", "local_sms")
    if body["method"] == "sms":
        assert "twilio_status" in body
    else:
        assert body["open_url"].startswith("sms:")


def test_phone_invite_rejects_short_phone(session):
    r = session.post(
        f"{API}/invites/phone",
        json={"phone": "123", "name": "Bad", "method": "whatsapp"},
    )
    assert r.status_code == 400


def test_phone_invite_lists_recent(session):
    # Send one first to ensure there's at least one row.
    session.post(
        f"{API}/invites/phone",
        json={"phone": "+14155557777", "method": "whatsapp"},
    )
    r = session.get(f"{API}/invites/phone")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["invites"], list)
    assert len(body["invites"]) >= 1
    latest = body["invites"][0]
    assert "phone" in latest
    assert "method" in latest
    assert "status" in latest


def test_phone_invite_requires_auth():
    c = httpx.Client(timeout=15)
    r = c.post(f"{API}/invites/phone", json={"phone": "+14155551234", "method": "whatsapp"})
    assert r.status_code == 401
