"""Iteration 46 — SIP dial-in + push notifications scaffold."""
import os
import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://teamnest.ai")
API = f"{BASE_URL}/api"
OWNER = {"email": "amit@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")}


@pytest.fixture(scope="module")
def session():
    c = httpx.Client(timeout=30, follow_redirects=True)
    r = c.post(f"{API}/auth/login", json=OWNER)
    assert r.status_code == 200
    return c


@pytest.fixture(scope="module")
def call(session):
    chats = session.get(f"{API}/chats").json()
    grp = next(c for c in chats if c.get("type") == "group")
    r = session.post(f"{API}/calls/start", json={"chat_id": grp["id"], "mode": "audio"})
    assert r.status_code == 200, r.text
    return r.json()["call"]


def test_call_includes_dial_in_pin(call):
    assert "dial_in_pin" in call
    assert len(call["dial_in_pin"]) == 6
    assert call["dial_in_pin"].isdigit()


def test_dial_in_info_returns_phone_and_pin(session, call):
    r = session.get(f"{API}/calls/{call['id']}/dial-in-info")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pin"] == call["dial_in_pin"]
    assert body["phone_number"]  # FROM number resolved
    assert "configured" in body  # may be False until LIVEKIT_SIP_URI is set


def test_twilio_incoming_returns_twiml():
    r = httpx.post(f"{API}/twilio/voice/incoming", data={"From": "+12148509750"})
    assert r.status_code == 200
    assert "Gather" in r.text
    assert "TeamNest" in r.text


def test_twilio_pin_unknown_pin_says_no_match():
    r = httpx.post(f"{API}/twilio/voice/pin", data={"Digits": "000000", "From": "+1"})
    assert r.status_code == 200
    assert "No matching meeting" in r.text


def test_twilio_pin_valid_returns_dial_or_unconfigured(session, call):
    r = httpx.post(f"{API}/twilio/voice/pin", data={"Digits": call["dial_in_pin"], "From": "+1"})
    assert r.status_code == 200
    # Either "Connecting you now" (configured) or "not yet configured" (no LIVEKIT_SIP_URI yet).
    body = r.text
    assert ("Connecting you now" in body) or ("not yet configured" in body)


def test_device_register_endpoint_still_works(session):
    r = session.post(
        f"{API}/devices/register",
        json={"token": "test-token-iter46", "platform": "ios", "app_version": "1.0.0"},
    )
    assert r.status_code == 200, r.text
    devices = session.get(f"{API}/devices").json()
    assert any(d["token"] == "test-token-iter46" for d in devices)
