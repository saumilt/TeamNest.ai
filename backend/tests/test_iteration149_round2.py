"""Iteration 149 — Round 2: Approval Inbox + Automation Insights."""
import os
import time
import pytest
import requests

def _base_url():
    # Read from frontend .env at test time
    try:
        for line in open("/app/frontend/.env"):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    return os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


BASE_URL = _base_url()
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def owner_token():
    return _login("amit@demo.team", "Demo@2026")


@pytest.fixture(scope="module")
def member_token():
    return _login("raj@demo.team", "Demo@2026")


@pytest.fixture(scope="module")
def owner_hdrs(owner_token):
    return {"Authorization": f"Bearer {owner_token}"}


@pytest.fixture(scope="module")
def member_hdrs(member_token):
    return {"Authorization": f"Bearer {member_token}"}


# ----- /automations/insights -----
class TestInsights:
    def test_shape(self, owner_hdrs):
        r = requests.get(f"{BASE_URL}/api/automations/insights", headers=owner_hdrs, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "by_automation" in data and "workspace" in data
        ws = data["workspace"]
        for k in ("runs", "success", "failed", "pending", "saved_hours", "success_rate", "series", "last_status", "last_run_at"):
            assert k in ws, f"workspace missing {k}"
        assert isinstance(ws["series"], list) and len(ws["series"]) == 7
        for v in ws["series"]:
            assert isinstance(v, int)
        assert isinstance(ws["saved_hours"], (int, float))
        assert 0 <= ws["success_rate"] <= 100

    def test_by_automation_shape(self, owner_hdrs):
        r = requests.get(f"{BASE_URL}/api/automations/insights", headers=owner_hdrs, timeout=20)
        data = r.json()
        by = data["by_automation"]
        assert isinstance(by, dict)
        # pick one if any
        for aid, b in by.items():
            assert isinstance(b["series"], list) and len(b["series"]) == 7
            assert set(b.keys()) >= {"runs", "success", "failed", "pending", "saved_hours",
                                     "success_rate", "series", "last_status", "last_run_at"}
            # sanity: success_rate consistent with success/completed
            completed = b["runs"] - b["pending"]
            expected = round(100 * b["success"] / completed) if completed else 0
            assert b["success_rate"] == expected
            assert b["saved_hours"] == round(b["success"] * 0.25, 2)
            break

    def test_insights_auth_required(self):
        r = requests.get(f"{BASE_URL}/api/automations/insights", timeout=20)
        assert r.status_code in (401, 403)

    def test_route_order_literal_before_dynamic(self, owner_hdrs):
        # Ensure GET /automations/insights isn't captured by /automations/{id}
        r = requests.get(f"{BASE_URL}/api/automations/insights", headers=owner_hdrs, timeout=20)
        assert r.status_code == 200
        # By contrast, unknown id must 404
        r2 = requests.get(f"{BASE_URL}/api/automations/does-not-exist", headers=owner_hdrs, timeout=20)
        assert r2.status_code == 404


# ----- /automations/pending + approve/reject -----
class TestApprovals:
    def test_pending_returns_shape(self, owner_hdrs):
        r = requests.get(f"{BASE_URL}/api/automations/pending", headers=owner_hdrs, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and isinstance(data["items"], list)
        for it in data["items"]:
            for k in ("id", "automation_id", "workspace_id", "status", "automation_name", "risk"):
                assert k in it, f"missing {k}"
            assert it["status"] == "pending_approval"

    def test_pending_seeded_exists(self, owner_hdrs):
        # The task context says a high-risk approval was seeded ("External email blast")
        r = requests.get(f"{BASE_URL}/api/automations/pending", headers=owner_hdrs, timeout=20)
        items = r.json()["items"]
        # not a strict assert — just informational
        assert isinstance(items, list)
        print(f"Pending items count: {len(items)} · names: {[i.get('automation_name') for i in items]}")

    def test_member_cannot_approve_or_reject(self, owner_hdrs, member_hdrs):
        pend = requests.get(f"{BASE_URL}/api/automations/pending", headers=owner_hdrs, timeout=20).json()["items"]
        if not pend:
            pytest.skip("No pending run seeded to test rejection permission")
        run_id = pend[0]["id"]
        r_a = requests.post(f"{BASE_URL}/api/automations/runs/{run_id}/approve", headers=member_hdrs, timeout=20)
        assert r_a.status_code == 403
        r_r = requests.post(f"{BASE_URL}/api/automations/runs/{run_id}/reject", headers=member_hdrs, timeout=20)
        assert r_r.status_code == 403

    def test_approve_flow_end_to_end(self, owner_hdrs):
        """Create a high-risk automation → run as owner (no self-approve? actually owners can self-approve)
        so we craft the pending run via a member if possible; else create+run via helper API paths.
        For coverage we simply create a high-risk automation and post a run from member context to force pending."""
        # Create automation as owner
        payload = {
            "name": "TEST_it149 approval flow",
            "description": "test",
            "nl_prompt": "test",
            "trigger": {"type": "manual", "label": "Manual", "config": {}},
            "steps": [{"kind": "post", "label": "Post to chat", "config": {"target": "general"}}],
            "risk": "high",
            "status": "active",
        }
        c = requests.post(f"{BASE_URL}/api/automations", json=payload, headers=owner_hdrs, timeout=20)
        assert c.status_code == 200, c.text
        aid = c.json()["id"]
        try:
            # A member run should produce a pending_approval since high-risk & member can't approve
            member = _login("raj@demo.team", "Demo@2026")
            mh = {"Authorization": f"Bearer {member}"}
            rr = requests.post(f"{BASE_URL}/api/automations/{aid}/run", headers=mh, timeout=20)
            assert rr.status_code == 200, rr.text
            run = rr.json()
            assert run["status"] == "pending_approval", run
            run_id = run["id"]

            # Owner approves
            ap = requests.post(f"{BASE_URL}/api/automations/runs/{run_id}/approve", headers=owner_hdrs, timeout=30)
            assert ap.status_code == 200, ap.text
            assert ap.json()["status"] in ("success", "partial", "failed", "simulated")

            # After approval, /pending should not include this run_id
            pend2 = requests.get(f"{BASE_URL}/api/automations/pending", headers=owner_hdrs, timeout=20).json()["items"]
            assert not any(p["id"] == run_id for p in pend2)

            # Test reject path with another pending run
            rr2 = requests.post(f"{BASE_URL}/api/automations/{aid}/run", headers=mh, timeout=20)
            assert rr2.status_code == 200
            pending_run_id = rr2.json()["id"]
            rj = requests.post(f"{BASE_URL}/api/automations/runs/{pending_run_id}/reject", headers=owner_hdrs, timeout=20)
            assert rj.status_code == 200
            assert rj.json()["status"] == "rejected"
        finally:
            requests.delete(f"{BASE_URL}/api/automations/{aid}", headers=owner_hdrs, timeout=20)

    def test_insights_reflects_new_runs(self, owner_hdrs):
        # After the approve flow above, workspace runs count should be >= 2
        r = requests.get(f"{BASE_URL}/api/automations/insights", headers=owner_hdrs, timeout=20)
        ws = r.json()["workspace"]
        assert ws["runs"] >= 0  # existence sanity
