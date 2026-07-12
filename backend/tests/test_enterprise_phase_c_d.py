"""Backend tests for Enterprise Role Intelligence Phase C + D.

Phase C: Expertise Map + Knowledge Risk dashboard  (GET /api/enterprise/risk-dashboard)
Phase D: Storage metering + packs + billing         (GET /api/enterprise/storage,
                                                     POST /api/enterprise/storage/packs/purchase,
                                                     GET /api/enterprise/billing)
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

OWNER_EMAIL = "sam@funasia.net"
OWNER_PASS = "Perfect$2008"

_BREAKDOWN_KEYS = {
    "role_description_score", "sop_score", "workflow_score", "recurring_task_score",
    "relationship_score", "decision_score", "communication_score", "expertise_score",
    "successor_score", "review_score",
}


@pytest.fixture(scope="module")
def owner_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": OWNER_EMAIL, "password": OWNER_PASS}, timeout=30)
    assert r.status_code == 200, f"owner login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    # Ensure seed is present.
    s.get(f"{BASE_URL}/api/enterprise/people", timeout=30)
    return s


# ─── Phase C: Risk dashboard ────────────────────────────────────────────────
def test_risk_dashboard_shape(owner_client):
    r = owner_client.get(f"{BASE_URL}/api/enterprise/risk-dashboard", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert set(data.keys()) >= {"summary", "distribution", "roles"}
    s = data["summary"]
    for k in ("roles", "at_risk", "critical", "single_person_deps", "avg_continuity"):
        assert k in s, f"missing summary key: {k}"
        assert isinstance(s[k], int)
    d = data["distribution"]
    assert set(d.keys()) == {"Critical", "High", "Medium", "Low"}
    for k, v in d.items():
        assert isinstance(v, int), f"distribution.{k} must be int"


def test_risk_dashboard_seeded_values(owner_client):
    """The Perfect Restaurant Group seed asserts specific continuity scores."""
    data = owner_client.get(f"{BASE_URL}/api/enterprise/risk-dashboard", timeout=30).json()
    roles = data["roles"]
    assert len(roles) >= 3, "expected at least 3 seeded roles"

    by_name = {r["role_name"]: r for r in roles}
    # Seed asserts: Sales Director=Critical 28%, Finance Manager=High 42%, Operations Manager=Medium 81%
    sales = next((v for k, v in by_name.items() if "Sales" in k), None)
    finance = next((v for k, v in by_name.items() if "Finance" in k), None)
    ops = next((v for k, v in by_name.items() if "Operations" in k), None)
    assert sales and finance and ops, f"missing role in seed: {list(by_name.keys())}"

    assert sales["continuity_score"] == 28, sales
    assert sales["risk_level"] == "Critical"
    assert finance["continuity_score"] == 42, finance
    assert finance["risk_level"] == "High"
    assert ops["continuity_score"] == 81, ops
    assert ops["risk_level"] == "Medium"

    # Summary agrees with roles list.
    s = data["summary"]
    assert s["roles"] == len(roles)
    at_risk = sum(1 for r in roles if r["risk_level"] in ("High", "Critical"))
    assert s["at_risk"] == at_risk
    assert s["critical"] == sum(1 for r in roles if r["risk_level"] == "Critical")


def test_risk_dashboard_sort_and_breakdown(owner_client):
    data = owner_client.get(f"{BASE_URL}/api/enterprise/risk-dashboard", timeout=30).json()
    roles = data["roles"]
    # Sorted ascending by continuity_score.
    scores = [r["continuity_score"] for r in roles]
    assert scores == sorted(scores), f"roles must be sorted asc by continuity_score, got {scores}"

    # Each role has a 10-key breakdown with numeric scores + person link.
    for r in roles:
        assert set(r["breakdown"].keys()) == _BREAKDOWN_KEYS, r
        for k, v in r["breakdown"].items():
            assert isinstance(v, (int, float)), f"{k}={v} not numeric"
        for k in ("role_id", "role_name", "flags", "person_id", "person_name", "headcount"):
            assert k in r
        assert isinstance(r["flags"], list)


# ─── Phase D: Storage metering ──────────────────────────────────────────────
def test_storage_meter_shape_and_pricing(owner_client):
    r = owner_client.get(f"{BASE_URL}/api/enterprise/storage", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert set(data.keys()) >= {"usage", "pricing", "packs_available", "packs_purchased"}

    usage = data["usage"]
    for k in ("total_bytes", "total_mb", "total_gb", "breakdown"):
        assert k in usage
    assert usage["total_bytes"] > 0, "usage should be > 0 after seed"
    assert isinstance(usage["breakdown"], list) and len(usage["breakdown"]) >= 5
    for row in usage["breakdown"]:
        assert set(row.keys()) == {"label", "bytes", "count"}

    p = data["pricing"]
    assert p["base_rate_per_gb"] == 0.015
    assert p["markup_pct"] == 40
    # effective = 0.015 * 1.4 = 0.021
    assert abs(p["effective_rate_per_gb"] - 0.021) < 1e-6, p
    assert p["included_gb"] >= 5.0
    assert p["billable_gb"] >= 0
    assert p["monthly_storage_cost"] >= 0

    # Three packs available with expected shape.
    packs = data["packs_available"]
    assert len(packs) == 3
    ids = {pk["id"] for pk in packs}
    assert ids == {"pack-10", "pack-50", "pack-100"}
    for pk in packs:
        assert pk["gb"] > 0 and pk["price_usd"] > 0


def test_purchase_storage_pack_and_included_gb_increases(owner_client):
    before = owner_client.get(f"{BASE_URL}/api/enterprise/storage", timeout=30).json()
    included_before = before["pricing"]["included_gb"]
    purchased_before = len(before["packs_purchased"])

    r = owner_client.post(f"{BASE_URL}/api/enterprise/storage/packs/purchase",
                          json={"pack_id": "pack-10"}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["pack"]["gb"] == 10
    assert body["pack"]["pack_id"] == "pack-10"

    after = owner_client.get(f"{BASE_URL}/api/enterprise/storage", timeout=30).json()
    assert after["pricing"]["included_gb"] == pytest.approx(included_before + 10, abs=1e-6)
    assert len(after["packs_purchased"]) == purchased_before + 1


def test_purchase_unknown_pack_returns_404(owner_client):
    r = owner_client.post(f"{BASE_URL}/api/enterprise/storage/packs/purchase",
                          json={"pack_id": "pack-does-not-exist"}, timeout=15)
    assert r.status_code == 404


# ─── Phase D: Billing summary ───────────────────────────────────────────────
def test_billing_combines_seats_and_storage(owner_client):
    r = owner_client.get(f"{BASE_URL}/api/enterprise/billing", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert set(data.keys()) >= {"seats", "storage", "total_monthly_estimate"}

    seats = data["seats"]
    for k in ("seats_purchased", "seats_assigned", "price_per_seat", "monthly_seat_cost"):
        assert k in seats
    assert seats["monthly_seat_cost"] == pytest.approx(
        seats["seats_assigned"] * seats["price_per_seat"], abs=0.01)

    storage = data["storage"]
    # Storage nested payload has same pricing block as /enterprise/storage.
    assert storage["pricing"]["base_rate_per_gb"] == 0.015
    assert storage["pricing"]["markup_pct"] == 40

    est = data["total_monthly_estimate"]
    expected = round(seats["monthly_seat_cost"] + storage["pricing"]["monthly_storage_cost"], 2)
    assert est == pytest.approx(expected, abs=0.01), (est, expected)


# ─── Auth guard ─────────────────────────────────────────────────────────────
def test_risk_dashboard_requires_auth():
    r = requests.get(f"{BASE_URL}/api/enterprise/risk-dashboard", timeout=15)
    assert r.status_code in (401, 403)


def test_storage_requires_auth():
    r = requests.get(f"{BASE_URL}/api/enterprise/storage", timeout=15)
    assert r.status_code in (401, 403)


def test_billing_requires_auth():
    r = requests.get(f"{BASE_URL}/api/enterprise/billing", timeout=15)
    assert r.status_code in (401, 403)
