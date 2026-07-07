"""Iteration 35 — Phase 6 Session 1: AI Employees + Bookkeeper foundation."""
import io
import os

import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://teamnest.ai")
API = f"{BASE_URL}/api"

OWNER = {"email": "amit@demo.team", "password": "Demo@2026"}


@pytest.fixture(scope="module")
def session():
    c = httpx.Client(timeout=60, follow_redirects=True)
    r = c.post(f"{API}/auth/login", json=OWNER)
    assert r.status_code == 200, r.text
    return c


def test_catalog_lists_active_and_coming_soon(session):
    r = session.get(f"{API}/ai-employees")
    assert r.status_code == 200
    body = r.json()
    assert body["active_count"] == 2
    assert body["coming_soon_count"] == 5
    keys = {e["key"] for e in body["employees"]}
    assert "cmo" in keys and "bookkeeper" in keys
    assert "sales" in keys and "paralegal" in keys
    assert "restaurant_orders" in keys and "bill_pay" in keys
    # Coming soon employees must NOT include private system_prompt.
    for emp in body["employees"]:
        assert "system_prompt" not in emp, f"{emp['key']} leaked system_prompt"


def test_join_waitlist_for_coming_soon(session):
    r = session.post(f"{API}/ai-employees/sales/waitlist", json={})
    assert r.status_code == 200, r.text


def test_cannot_trial_coming_soon(session):
    r = session.post(f"{API}/ai-employees/paralegal/trial", json={})
    assert r.status_code == 400


def test_employee_profile_endpoint(session):
    r = session.get(f"{API}/ai-employees/cmo")
    assert r.status_code == 200
    body = r.json()
    assert body["key"] == "cmo"
    assert body["monthly_price"] == 149


def test_bookkeeper_dashboard(session):
    r = session.get(f"{API}/bookkeeper/dashboard")
    assert r.status_code == 200
    body = r.json()
    # Statement uploaded during smoke test should still be there or zero is OK
    assert "statements_count" in body
    assert "auto_matched" in body


def test_bookkeeper_upload_categorize_approve(session):
    csv = (
        b"Posting Date,Description,Amount,Balance\n"
        b"05/15/2026,GOOGLE ADS BILLING,-100.00,1000.00\n"
        b"05/16/2026,ADOBE CREATIVE CLOUD,-54.99,945.01\n"
    )
    files = {"file": ("test_chase.csv", io.BytesIO(csv), "text/csv")}
    r = session.post(
        f"{API}/bookkeeper/statements?account_name=Chase%20Test&statement_type=bank",
        files=files,
    )
    assert r.status_code == 200, r.text
    stmt_id = r.json()["statement"]["id"]

    r = session.post(
        f"{API}/bookkeeper/statements/{stmt_id}/categorize",
        json={"statement_id": stmt_id},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["auto_matched"] + body["suggested"] + body["suspense"] == 2
    assert body["credits_used"] >= 20

    # Approve sync on one tx
    r = session.get(f"{API}/bookkeeper/statements/{stmt_id}")
    txs = r.json()["transactions"]
    # Force-approve the first transaction so we can test sync queue.
    first_id = txs[0]["id"]
    r = session.patch(
        f"{API}/bookkeeper/transactions/{first_id}",
        json={"category": "Advertising & Marketing", "create_rule": False},
    )
    assert r.status_code == 200
    r = session.post(
        f"{API}/bookkeeper/transactions/approve-sync",
        json={"transaction_ids": [first_id]},
    )
    assert r.status_code == 200
    assert r.json()["approved"] == 1


def test_pause_and_resume_employee(session):
    r = session.post(f"{API}/ai-employees/cmo/pause", json={})
    assert r.status_code == 200
    assert r.json()["status"] == "paused"
    r = session.post(f"{API}/ai-employees/cmo/resume", json={})
    assert r.status_code == 200
    # Resumed back to trial_active because phase is still "trial"
    assert r.json()["status"] in ("trial_active", "active")
