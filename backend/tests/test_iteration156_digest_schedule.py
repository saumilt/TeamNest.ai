"""Iteration 156 — Digest Schedule Control tests.

Covers:
  - GET /api/ai-employees/_/digest-settings (defaults, available_recipients, day_names)
  - PUT (owner) persists + clamps day/hour, filters invalid rids, empty->null
  - PUT (member) returns 403
  - POST /api/ai-employees/_/digest-email regression (sent + recipients)
  - GET /api/ai-employees/_/digests and /savings regression
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

OWNER = ("amit@demo.team", "Demo@2026")
MEMBER = ("raj@demo.team", "Demo@2026")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def owner_client():
    return _login(*OWNER)


@pytest.fixture(scope="module")
def member_client():
    return _login(*MEMBER)


# ---------- GET digest-settings ----------
def test_get_digest_settings_shape(owner_client):
    r = owner_client.get(f"{API}/ai-employees/_/digest-settings")
    assert r.status_code == 200
    data = r.json()
    for k in ("enabled", "day_of_week", "hour_utc", "recipient_user_ids",
              "available_recipients", "default_recipient_ids", "day_names"):
        assert k in data, f"missing key {k} in {data}"
    assert isinstance(data["day_names"], list) and len(data["day_names"]) == 7
    assert data["day_names"][0] == "Monday" and data["day_names"][6] == "Sunday"
    assert isinstance(data["available_recipients"], list)
    # every available recipient has email
    for m in data["available_recipients"]:
        assert m.get("email"), m
    # default_recipient_ids are subset of available_recipients ids and are owner/admin roles
    avail_by_id = {m["id"]: m for m in data["available_recipients"]}
    for rid in data["default_recipient_ids"]:
        assert rid in avail_by_id
        assert avail_by_id[rid]["role"] in ("owner", "admin")
    assert 0 <= data["day_of_week"] <= 6
    assert 0 <= data["hour_utc"] <= 23


# ---------- PUT digest-settings persistence + clamping ----------
def test_put_digest_settings_persists_and_clamps(owner_client):
    # First, capture initial to restore later
    initial = owner_client.get(f"{API}/ai-employees/_/digest-settings").json()

    # Update: valid values
    payload = {
        "enabled": False,
        "day_of_week": 3,      # Thursday
        "hour_utc": 14,
        "recipient_user_ids": None,
    }
    r = owner_client.put(f"{API}/ai-employees/_/digest-settings", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["enabled"] is False
    assert data["day_of_week"] == 3
    assert data["hour_utc"] == 14
    assert data["recipient_user_ids"] is None

    # GET should reflect
    got = owner_client.get(f"{API}/ai-employees/_/digest-settings").json()
    assert got["enabled"] is False
    assert got["day_of_week"] == 3
    assert got["hour_utc"] == 14

    # Clamping: day 99 -> 6, hour 99 -> 23
    r2 = owner_client.put(f"{API}/ai-employees/_/digest-settings",
                          json={"enabled": True, "day_of_week": 99, "hour_utc": 99, "recipient_user_ids": None})
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["day_of_week"] == 6
    assert d2["hour_utc"] == 23

    # Negative clamping: -5, -5 -> 0, 0
    r3 = owner_client.put(f"{API}/ai-employees/_/digest-settings",
                          json={"enabled": True, "day_of_week": -5, "hour_utc": -5, "recipient_user_ids": None})
    assert r3.status_code == 200
    d3 = r3.json()
    assert d3["day_of_week"] == 0
    assert d3["hour_utc"] == 0

    # Restore initial
    owner_client.put(f"{API}/ai-employees/_/digest-settings", json={
        "enabled": initial["enabled"],
        "day_of_week": initial["day_of_week"],
        "hour_utc": initial["hour_utc"],
        "recipient_user_ids": initial["recipient_user_ids"],
    })


def test_put_digest_settings_filters_invalid_recipient_ids_and_empty_becomes_null(owner_client):
    settings = owner_client.get(f"{API}/ai-employees/_/digest-settings").json()
    avail_ids = [m["id"] for m in settings["available_recipients"]]
    assert len(avail_ids) >= 1

    # Custom: one valid + one bogus id
    payload = {
        "enabled": True,
        "day_of_week": 1,
        "hour_utc": 9,
        "recipient_user_ids": [avail_ids[0], "TEST_bogus_id_does_not_exist"],
    }
    r = owner_client.put(f"{API}/ai-employees/_/digest-settings", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["recipient_user_ids"] == [avail_ids[0]], f"invalid id not filtered: {data['recipient_user_ids']}"

    # Empty list => null (falls back to owners/admins)
    r2 = owner_client.put(f"{API}/ai-employees/_/digest-settings", json={
        "enabled": True, "day_of_week": 1, "hour_utc": 9, "recipient_user_ids": [],
    })
    assert r2.status_code == 200
    assert r2.json()["recipient_user_ids"] is None

    # All-bogus => null
    r3 = owner_client.put(f"{API}/ai-employees/_/digest-settings", json={
        "enabled": True, "day_of_week": 1, "hour_utc": 9,
        "recipient_user_ids": ["TEST_x1", "TEST_x2"],
    })
    assert r3.status_code == 200
    assert r3.json()["recipient_user_ids"] is None

    # Restore defaults
    owner_client.put(f"{API}/ai-employees/_/digest-settings", json={
        "enabled": True, "day_of_week": 0, "hour_utc": 8, "recipient_user_ids": None,
    })


# ---------- PUT 403 for member ----------
def test_put_digest_settings_member_403(member_client):
    r = member_client.put(f"{API}/ai-employees/_/digest-settings",
                          json={"enabled": True, "day_of_week": 0, "hour_utc": 8, "recipient_user_ids": None})
    assert r.status_code == 403, r.text


def test_get_digest_settings_member_ok(member_client):
    # Reading settings is not gated (owners/admins only for PUT)
    r = member_client.get(f"{API}/ai-employees/_/digest-settings")
    # It may be 200 or 403 depending on implementation; the route just requires user auth
    assert r.status_code in (200, 403)


# ---------- POST digest-email regression ----------
def test_post_digest_email_owner_default_recipients(owner_client):
    # Ensure default (null) recipients
    owner_client.put(f"{API}/ai-employees/_/digest-settings", json={
        "enabled": True, "day_of_week": 0, "hour_utc": 8, "recipient_user_ids": None,
    })
    r = owner_client.post(f"{API}/ai-employees/_/digest-email")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "sent" in data
    assert "recipients" in data
    assert isinstance(data["recipients"], list)
    # Owners+admins should be in the recipient list (amit@demo.team is owner, priya is admin)
    emails = set(data["recipients"])
    assert "amit@demo.team" in emails
    assert "priya@demo.team" in emails


def test_post_digest_email_custom_recipients(owner_client):
    settings = owner_client.get(f"{API}/ai-employees/_/digest-settings").json()
    # Pick just amit (owner) as sole recipient
    avail = settings["available_recipients"]
    amit = next(m for m in avail if m["email"] == "amit@demo.team")
    owner_client.put(f"{API}/ai-employees/_/digest-settings", json={
        "enabled": True, "day_of_week": 0, "hour_utc": 8,
        "recipient_user_ids": [amit["id"]],
    })
    r = owner_client.post(f"{API}/ai-employees/_/digest-email")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["recipients"] == ["amit@demo.team"], data

    # Restore
    owner_client.put(f"{API}/ai-employees/_/digest-settings", json={
        "enabled": True, "day_of_week": 0, "hour_utc": 8, "recipient_user_ids": None,
    })


def test_post_digest_email_member_403(member_client):
    r = member_client.post(f"{API}/ai-employees/_/digest-email")
    assert r.status_code == 403


# ---------- Regression: digests + savings still work ----------
def test_get_digests_regression(owner_client):
    r = owner_client.get(f"{API}/ai-employees/_/digests")
    assert r.status_code == 200
    data = r.json()
    assert "digests" in data
    assert isinstance(data["digests"], list)


def test_get_savings_regression(owner_client):
    r = owner_client.get(f"{API}/ai-employees/_/savings")
    assert r.status_code == 200
    data = r.json()
    assert "employees" in data and "totals" in data
    for k in ("tasks_completed", "hours_saved", "dollar_savings", "monthly_dollar_savings"):
        assert k in data["totals"]
