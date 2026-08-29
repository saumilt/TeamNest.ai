"""Phase 3 — Automation Engine (Triggers, Approvals, Suggestions, Rate limits, Policy).

Covers new endpoints:
- GET  /api/automations/suggestions
- GET  /api/automations/policy
- PUT  /api/automations/policy   (owner/admin only)
- GET  /api/automations/pending
- POST /api/automations/{id}/run  (approval gate + rate limit)
- POST /api/automations/runs/{id}/approve
- POST /api/automations/runs/{id}/reject
Regression: parse / list / stats / templates / CRUD / runs.
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")

OWNER = {"email": "amit@demo.team", "password": "Demo@2026"}
MEMBER = {"email": "raj@demo.team", "password": "Demo@2026"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER)


@pytest.fixture(scope="module")
def member_token():
    return _login(MEMBER)


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# ---------- Policy ----------
class TestPolicy:
    def test_get_default_policy(self, owner_token):
        r = requests.get(f"{BASE_URL}/api/automations/policy", headers=_h(owner_token), timeout=30)
        assert r.status_code == 200
        p = r.json()["policy"]
        assert set(p.keys()) == {"low", "medium", "high"}
        # default: only high requires approval
        assert p["high"] is True

    def test_put_policy_owner(self, owner_token):
        r = requests.put(f"{BASE_URL}/api/automations/policy",
                         headers=_h(owner_token), json={"medium": False, "high": True}, timeout=30)
        assert r.status_code == 200
        assert r.json()["policy"]["high"] is True

    def test_put_policy_member_forbidden(self, member_token):
        r = requests.put(f"{BASE_URL}/api/automations/policy",
                         headers=_h(member_token), json={"high": False}, timeout=30)
        assert r.status_code == 403


# ---------- Suggestions ----------
class TestSuggestions:
    def test_suggestions_shape(self, owner_token):
        r = requests.get(f"{BASE_URL}/api/automations/suggestions", headers=_h(owner_token), timeout=30)
        assert r.status_code == 200
        items = r.json().get("suggestions", [])
        assert isinstance(items, list)
        for s in items:
            assert {"key", "title", "reason", "prompt", "risk"}.issubset(s.keys())
            assert s["risk"] in ("low", "medium", "high")


# ---------- Pending list + Stats ----------
class TestPendingAndStats:
    def test_pending_list_owner(self, owner_token):
        r = requests.get(f"{BASE_URL}/api/automations/pending", headers=_h(owner_token), timeout=30)
        assert r.status_code == 200
        items = r.json().get("items", [])
        assert isinstance(items, list)
        for it in items:
            assert it["status"] == "pending_approval"
            assert "automation_name" in it
            assert "risk" in it

    def test_stats_has_needs_approval(self, owner_token):
        r = requests.get(f"{BASE_URL}/api/automations/stats", headers=_h(owner_token), timeout=30)
        assert r.status_code == 200
        s = r.json()
        assert "needs_approval" in s
        assert isinstance(s["needs_approval"], int)


# ---------- Approval Gate + Approve/Reject flow ----------
@pytest.fixture(scope="module")
def high_risk_automation(owner_token):
    """Create a HIGH-risk automation to test approval gate. Cleanup at end."""
    payload = {
        "name": "TEST_it147_high_risk",
        "description": "high risk test",
        "nl_prompt": "TEST high risk",
        "trigger": {"type": "manual", "label": "Manual", "config": {}},
        "steps": [{"kind": "app", "label": "Delete stuff", "config": {"action": "delete"}}],
        "risk": "high",
        "status": "active",
    }
    r = requests.post(f"{BASE_URL}/api/automations", headers=_h(owner_token), json=payload, timeout=30)
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    yield aid
    # cleanup
    requests.delete(f"{BASE_URL}/api/automations/{aid}", headers=_h(owner_token), timeout=30)


class TestApprovalGate:
    def test_member_high_risk_creates_pending(self, high_risk_automation, member_token, owner_token):
        r = requests.post(f"{BASE_URL}/api/automations/{high_risk_automation}/run",
                          headers=_h(member_token), timeout=60)
        assert r.status_code == 200, r.text
        run = r.json()
        assert run["status"] == "pending_approval", run
        assert run["trigger_source"] == "manual"
        run_id = run["id"]

        # Owner sees it in pending list
        pend = requests.get(f"{BASE_URL}/api/automations/pending",
                            headers=_h(owner_token), timeout=30).json()["items"]
        assert any(p["id"] == run_id for p in pend), "pending list should contain the new run"

        # Member cannot approve/reject
        rj = requests.post(f"{BASE_URL}/api/automations/runs/{run_id}/reject",
                           headers=_h(member_token), timeout=30)
        assert rj.status_code == 403

        # Owner rejects
        rj2 = requests.post(f"{BASE_URL}/api/automations/runs/{run_id}/reject",
                            headers=_h(owner_token), timeout=30)
        assert rj2.status_code == 200
        assert rj2.json()["status"] == "rejected"

    def test_owner_high_risk_runs_directly(self, high_risk_automation, owner_token):
        r = requests.post(f"{BASE_URL}/api/automations/{high_risk_automation}/run",
                          headers=_h(owner_token), timeout=60)
        assert r.status_code == 200, r.text
        run = r.json()
        # owner can approve => runs immediately, status != pending_approval
        assert run["status"] != "pending_approval"
        assert run["status"] in ("success", "partial", "simulated", "failed")

    def test_approve_flow(self, high_risk_automation, member_token, owner_token):
        # Member creates pending
        r = requests.post(f"{BASE_URL}/api/automations/{high_risk_automation}/run",
                          headers=_h(member_token), timeout=60)
        assert r.status_code == 200
        run_id = r.json()["id"]
        assert r.json()["status"] == "pending_approval"

        # Member cannot approve
        m = requests.post(f"{BASE_URL}/api/automations/runs/{run_id}/approve",
                          headers=_h(member_token), timeout=30)
        assert m.status_code == 403

        # Owner approves => run executes in place
        ap = requests.post(f"{BASE_URL}/api/automations/runs/{run_id}/approve",
                           headers=_h(owner_token), timeout=60)
        assert ap.status_code == 200, ap.text
        data = ap.json()
        assert data["id"] == run_id
        assert data["status"] != "pending_approval"
        assert data.get("approved_by")

        # Re-approving should fail (no longer pending)
        again = requests.post(f"{BASE_URL}/api/automations/runs/{run_id}/approve",
                              headers=_h(owner_token), timeout=30)
        assert again.status_code == 400


# ---------- Scheduled trigger → next_run_at ----------
class TestScheduledNextRun:
    def test_scheduled_sets_next_run_at(self, owner_token):
        payload = {
            "name": "TEST_it147_scheduled",
            "trigger": {"type": "scheduled", "label": "Daily at 08:00",
                        "config": {"schedule": {"freq": "daily", "time": "08:00"}}},
            "steps": [{"kind": "ai", "label": "summarize", "config": {"op": "summarize"}}],
            "risk": "low",
        }
        r = requests.post(f"{BASE_URL}/api/automations", headers=_h(owner_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        try:
            assert doc.get("next_run_at"), "scheduled automation must have next_run_at"
            assert doc.get("trigger", {}).get("type") == "scheduled"
        finally:
            requests.delete(f"{BASE_URL}/api/automations/{doc['id']}", headers=_h(owner_token), timeout=30)


# ---------- Regression: parse / templates / list / stats ----------
class TestRegression:
    def test_templates(self, owner_token):
        r = requests.get(f"{BASE_URL}/api/automations/templates", headers=_h(owner_token), timeout=30)
        assert r.status_code == 200
        assert len(r.json()["templates"]) >= 5

    def test_list(self, owner_token):
        r = requests.get(f"{BASE_URL}/api/automations", headers=_h(owner_token), timeout=30)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_stats(self, owner_token):
        r = requests.get(f"{BASE_URL}/api/automations/stats", headers=_h(owner_token), timeout=30)
        assert r.status_code == 200
        for k in ("running", "needs_approval", "failed", "saved_hours", "credits_used"):
            assert k in r.json()

    def test_parse_empty_400(self, owner_token):
        r = requests.post(f"{BASE_URL}/api/automations/parse", headers=_h(owner_token),
                          json={"prompt": ""}, timeout=30)
        assert r.status_code == 400

    def test_low_risk_manual_run_executes(self, owner_token):
        # low-risk should not gate — runs immediately
        payload = {
            "name": "TEST_it147_low",
            "trigger": {"type": "manual", "label": "Manual", "config": {}},
            "steps": [{"kind": "get", "label": "Get overdue", "config": {"source": "overdue_tasks"}},
                      {"kind": "ai", "label": "summarize", "config": {"op": "summarize"}}],
            "risk": "low",
        }
        r = requests.post(f"{BASE_URL}/api/automations", headers=_h(owner_token), json=payload, timeout=30)
        assert r.status_code == 200
        aid = r.json()["id"]
        try:
            run = requests.post(f"{BASE_URL}/api/automations/{aid}/run",
                                headers=_h(owner_token), timeout=90)
            assert run.status_code == 200, run.text
            assert run.json()["status"] in ("success", "partial", "simulated")
        finally:
            requests.delete(f"{BASE_URL}/api/automations/{aid}", headers=_h(owner_token), timeout=30)


# ---------- Rate limit ----------
class TestRateLimit:
    def test_rate_limit_returns_429(self, owner_token):
        """Create a manual low-risk automation and hammer it > AUTOMATION_MAX_RUNS_PER_HOUR times."""
        limit = int(os.environ.get("AUTOMATION_MAX_RUNS_PER_HOUR", "30"))
        payload = {
            "name": "TEST_it147_rl",
            "trigger": {"type": "manual", "label": "Manual", "config": {}},
            # no get/post steps → runs return 'simulated' fast (no AI, no chat post)
            "steps": [{"kind": "app", "label": "noop", "config": {"action": "noop"}}],
            "risk": "low",
        }
        r = requests.post(f"{BASE_URL}/api/automations", headers=_h(owner_token), json=payload, timeout=30)
        assert r.status_code == 200
        aid = r.json()["id"]
        try:
            hit_429 = False
            for i in range(limit + 3):
                rr = requests.post(f"{BASE_URL}/api/automations/{aid}/run",
                                   headers=_h(owner_token), timeout=30)
                if rr.status_code == 429:
                    hit_429 = True
                    break
                assert rr.status_code == 200, f"run #{i} unexpected: {rr.status_code} {rr.text}"
            assert hit_429, f"expected 429 after {limit} runs"
        finally:
            requests.delete(f"{BASE_URL}/api/automations/{aid}", headers=_h(owner_token), timeout=30)
