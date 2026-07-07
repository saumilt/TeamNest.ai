"""Iteration 38 — Plaid Statements integration regression."""
import os

import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://teamnest.ai")
API = f"{BASE_URL}/api"
OWNER = {"email": "amit@demo.team", "password": "Demo@2026"}


@pytest.fixture(scope="module")
def session():
    c = httpx.Client(timeout=60, follow_redirects=False)
    r = c.post(f"{API}/auth/login", json=OWNER)
    assert r.status_code == 200
    return c


def test_plaid_config(session):
    r = session.get(f"{API}/plaid/config")
    assert r.status_code == 200
    body = r.json()
    assert body["configured"] is True
    assert body["env"] in ("sandbox", "production")
    assert body["price_per_statement_usd"] == 1.0
    assert body["price_per_page_usd"] == 2.0
    assert "statements" in body["products"]


def test_plaid_link_token(session):
    r = session.post(f"{API}/plaid/link-token", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["link_token"].startswith("link-")


def test_plaid_items_empty(session):
    r = session.get(f"{API}/plaid/items")
    assert r.status_code == 200
    assert isinstance(r.json()["items"], list)


def test_plaid_usage_current_month_zero(session):
    r = session.get(f"{API}/plaid/usage")
    assert r.status_code == 200
    body = r.json()
    assert "current_month" in body
    assert body["rates"]["per_statement_usd"] == 1.0
    assert body["rates"]["per_page_usd"] == 2.0


def test_plaid_exchange_rejects_bad_token(session):
    r = session.post(f"{API}/plaid/exchange", json={"public_token": "not-a-real-token"})
    assert r.status_code in (400, 502)


def test_plaid_endpoints_require_auth():
    c = httpx.Client(timeout=30)
    r = c.get(f"{API}/plaid/items")
    assert r.status_code == 401
    r = c.post(f"{API}/plaid/link-token", json={})
    assert r.status_code == 401


def test_plaid_webhook_accepts_unknown_item():
    c = httpx.Client(timeout=30)
    r = c.post(
        f"{API}/plaid/webhook",
        json={"webhook_type": "STATEMENTS", "webhook_code": "STATEMENTS_AVAILABLE", "item_id": "unknown-xyz"},
    )
    assert r.status_code == 200
    assert r.json()["status"] in ("unknown_item", "ok", "ignored")
