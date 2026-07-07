"""Iteration 41 — Cancel grace period + Savings dashboard + Use-in-chat routing."""
import os

import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://teamnest.ai")
API = f"{BASE_URL}/api"
OWNER = {"email": "amit@demo.team", "password": "Demo@2026"}


@pytest.fixture(scope="module")
def session():
    c = httpx.Client(timeout=30)
    r = c.post(f"{API}/auth/login", json=OWNER)
    assert r.status_code == 200
    return c


def test_cancel_marks_pending_not_immediate(session):
    r = session.post(f"{API}/ai-employees/cmo/cancel", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cancel_at_period_end"] is True
    assert body.get("access_ends_at"), "access_ends_at must be set"
    # While inside grace window, status is 'cancelling' (not 'cancelled')
    assert body["status"] in ("cancelling", "trial_active"), body["status"]


def test_uncancel_clears_pending(session):
    # Ensure it's currently cancelling, then uncancel.
    session.post(f"{API}/ai-employees/cmo/cancel", json={})
    r = session.post(f"{API}/ai-employees/cmo/uncancel")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("cancel_at_period_end") in (None, False)
    assert body["status"] in ("active", "trial_active", "trial_ending_soon", "trial_ending_today")


def test_uncancel_requires_pending(session):
    """If nothing is pending, uncancel 400s."""
    # We've just uncancelled; calling again should 400.
    r = session.post(f"{API}/ai-employees/cmo/uncancel")
    assert r.status_code == 400


def test_savings_dashboard_shape(session):
    r = session.get(f"{API}/api-employees/_/savings".replace("api-employees", "ai-employees"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert "employees" in body
    assert "totals" in body
    for e in body["employees"]:
        assert "market_billable_rate_usd" in e
        assert "hours_saved" in e
        assert "dollar_savings" in e
        assert "monthly_dollar_savings" in e
    t = body["totals"]
    assert {"tasks_completed", "hours_saved", "dollar_savings", "monthly_dollar_savings"} <= t.keys()


def test_savings_requires_auth():
    c = httpx.Client(timeout=15)
    r = c.get(f"{API}/ai-employees/_/savings")
    assert r.status_code == 401


def test_market_rates_per_role(session):
    """The catalog should expose plausible market rates per role."""
    r = session.get(f"{API}/ai-employees/_/savings")
    assert r.status_code == 200
    rates = {e["employee_key"]: e["market_billable_rate_usd"] for e in r.json()["employees"]}
    # Paralegal > CMO > Bookkeeper > Sales is the realistic order in the US.
    if "paralegal" in rates:
        assert rates["paralegal"] >= 200
    if "cmo" in rates:
        assert rates["cmo"] >= 100
