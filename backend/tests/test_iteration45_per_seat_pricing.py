"""Iteration 45 — Per-seat pricing model + transcription gating."""
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


def test_public_plans_use_new_pricing(session):
    r = session.get(f"{API}/billing/plans")
    assert r.status_code == 200
    plans = {p["id"]: p for p in r.json()["plans"]}
    # Pro: $9.99 / seat / month, 3000 credits
    assert plans["pro"]["price_usd"] == 9.99
    assert plans["pro"]["monthly_credits"] == 3000
    assert plans["pro"]["annual_price_usd"] == 99
    assert plans["pro"]["per_seat"] is True
    assert plans["pro"]["live_transcription"] is False
    assert plans["pro"]["unlimited_transcription"] is False
    # Team: $19.99 / seat / month, 9000 credits
    assert plans["team"]["price_usd"] == 19.99
    assert plans["team"]["monthly_credits"] == 9000
    assert plans["team"]["annual_price_usd"] == 199
    assert plans["team"]["per_seat"] is True
    assert plans["team"]["live_transcription"] is True
    assert plans["team"]["unlimited_transcription"] is True
    # Free retains workspace-level model
    assert plans["free"]["per_seat"] is False


def test_usage_reports_seat_count_and_features(session):
    r = session.get(f"{API}/billing/usage")
    assert r.status_code == 200
    body = r.json()
    assert "seats" in body
    assert body["seats"] >= 1
    assert "features" in body
    # All three feature flags present
    for k in ("live_transcription", "unlimited_transcription", "screen_sharing"):
        assert k in body["features"]
    # Credits-total is monthly_credits × seats when per_seat is true
    if body["per_seat"]:
        assert body["monthly_credits_total"] == body["monthly_credits"] * body["seats"]
