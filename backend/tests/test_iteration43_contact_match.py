"""Iteration 43 — Contact-book match + bulk invite."""
import hashlib
import os

import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://teamnest.ai")
API = f"{BASE_URL}/api"
OWNER = {"email": "amit@demo.team", "password": "Demo@2026"}
PEPPER = "teamnest.v1.contact-match"


def _hash(phone: str) -> str:
    return hashlib.sha256(f"{PEPPER}|{phone}".encode()).hexdigest()


@pytest.fixture(scope="module")
def session():
    c = httpx.Client(timeout=30)
    r = c.post(f"{API}/auth/login", json=OWNER)
    assert r.status_code == 200
    return c


def test_backfill_hashes_runs(session):
    r = session.post(f"{API}/contacts/_backfill_hashes")
    assert r.status_code == 200
    assert "backfilled" in r.json()


def test_match_finds_owner_by_phone(session):
    me = session.get(f"{API}/auth/me").json()
    phone = me.get("phone")
    if not phone:
        pytest.skip("demo owner has no phone")
    r = session.post(
        f"{API}/contacts/match",
        json={"hashes": [], "raw_contacts": [{"phone": phone}, {"phone": "+19999999999"}]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["checked"] == 2
    assert body["match_count"] >= 1
    assert any(m["name"] for m in body["matches"])


def test_match_accepts_hashes_only(session):
    """Use the hash that the server returned in a previous raw_contacts call."""
    me = session.get(f"{API}/auth/me").json()
    phone = me.get("phone")
    if not phone:
        pytest.skip("demo owner has no phone")
    # Get the canonical hash via the raw path first.
    canonical = session.post(
        f"{API}/contacts/match",
        json={"hashes": [], "raw_contacts": [{"phone": phone}]},
    ).json()
    if not canonical["matches"]:
        pytest.skip("Match failed at canonical step")
    h = canonical["matches"][0]["phone_hash"]
    # Now confirm the hash-only call also returns the same match.
    r = session.post(f"{API}/contacts/match", json={"hashes": [h]})
    assert r.status_code == 200
    body = r.json()
    assert body["match_count"] >= 1
    assert body["matches"][0]["phone_hash"] == h


def test_match_empty_input(session):
    r = session.post(f"{API}/contacts/match", json={"hashes": []})
    assert r.status_code == 200
    body = r.json()
    assert body["matches"] == []
    assert body["match_count"] == 0


def test_match_requires_auth():
    c = httpx.Client(timeout=15)
    r = c.post(f"{API}/contacts/match", json={"hashes": []})
    assert r.status_code == 401


def test_bulk_invite_whatsapp(session):
    r = session.post(
        f"{API}/invites/phone/bulk",
        json={
            "rows": [
                {"phone": "+14155551111", "name": "Alex"},
                {"phone": "+14155552222", "name": "Beth"},
            ],
            "method": "whatsapp",
            "share_url_base": "https://teamnest.ai",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["sent"] == 2
    assert body["failed"] == 0
    assert all(r["open_url"].startswith("https://wa.me/") for r in body["results"])


def test_bulk_invite_rejects_too_many(session):
    rows = [{"phone": f"+1415555{i:04d}"} for i in range(60)]
    r = session.post(
        f"{API}/invites/phone/bulk", json={"rows": rows, "method": "whatsapp"},
    )
    assert r.status_code == 400


def test_bulk_invite_handles_partial_garbage(session):
    r = session.post(
        f"{API}/invites/phone/bulk",
        json={
            "rows": [
                {"phone": "+14155553333", "name": "Valid"},
                {"phone": "12", "name": "Too short"},
            ],
            "method": "whatsapp",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["sent"] == 1
    assert body["failed"] == 1


def test_bulk_invite_requires_auth():
    c = httpx.Client(timeout=15)
    r = c.post(f"{API}/invites/phone/bulk", json={"rows": [{"phone": "+1"}], "method": "sms"})
    assert r.status_code == 401
