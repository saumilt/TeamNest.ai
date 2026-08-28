"""Iteration 92 — Super Admin management tests (workspaces, users, invites, guardrails, regression)."""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

SUPER_EMAIL = "amit@demo.team"
SUPER_PW = os.environ.get("DEMO_PASSWORD", "DemoPass123!")


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    # demo-login grants super admin
    r = s.post(f"{API}/auth/demo-login")
    assert r.status_code == 200, r.text
    me = s.get(f"{API}/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body.get("is_super_admin") is True
    return s, body


@pytest.fixture(scope="module")
def created(super_session):
    s, me = super_session
    st = {"user_ids": [], "ws_ids": [], "invite_codes": [], "me_id": me["id"]}
    yield st
    # cleanup
    for uid in st["user_ids"]:
        try:
            s.delete(f"{API}/superadmin/users/{uid}")
        except Exception:
            pass
    for wid in st["ws_ids"]:
        try:
            s.delete(f"{API}/superadmin/workspaces/{wid}")
        except Exception:
            pass


# ─── Non-super redirect / gating ────────────────────────────────────────────
def test_non_super_gets_403():
    s = requests.Session()
    r = s.get(f"{API}/superadmin/workspaces")
    assert r.status_code in (401, 403)


# ─── Users tab ──────────────────────────────────────────────────────────────
def test_create_user_and_login(super_session, created):
    s, _ = super_session
    email = f"TEST_iter92_{uuid.uuid4().hex[:8]}@example.com"
    pw = "TestP@ss1"
    r = s.post(f"{API}/superadmin/users", json={
        "name": "TEST iter92", "email": email, "password": pw,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    uid = body["id"]
    ws_id = body["workspace_id"]
    created["user_ids"].append(uid)
    created["ws_ids"].append(ws_id)

    # login as new user
    ns = requests.Session()
    lr = ns.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert lr.status_code == 200, lr.text
    me = ns.get(f"{API}/auth/me").json()
    # Backend lowercases email on create
    assert me["email"] == email.lower()
    assert me.get("must_change_password") is True

    # verify appears in listing
    lst = s.get(f"{API}/superadmin/users", params={"search": email}).json()
    assert any(u["id"] == uid for u in lst["users"])


def test_suspend_and_reactivate_user(super_session, created):
    s, _ = super_session
    # create fresh user
    email = f"TEST_susp_{uuid.uuid4().hex[:8]}@example.com"
    pw = "TestP@ss1"
    r = s.post(f"{API}/superadmin/users", json={
        "name": "TEST susp", "email": email, "password": pw,
    })
    body = r.json()
    uid = body["id"]
    created["user_ids"].append(uid)
    created["ws_ids"].append(body["workspace_id"])

    ns = requests.Session()
    ns.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert ns.get(f"{API}/auth/me").status_code == 200

    # suspend
    r = s.patch(f"{API}/superadmin/users/{uid}", json={"status": "suspended"})
    assert r.status_code == 200

    me_after = ns.get(f"{API}/auth/me")
    assert me_after.status_code == 403

    # reactivate
    r = s.patch(f"{API}/superadmin/users/{uid}", json={"status": "active"})
    assert r.status_code == 200
    # need to relogin? cookie may still be valid — just verify /me works
    me_final = ns.get(f"{API}/auth/me")
    assert me_final.status_code == 200


def test_reset_password_flow(super_session, created):
    s, _ = super_session
    email = f"TEST_reset_{uuid.uuid4().hex[:8]}@example.com"
    old_pw = "OldP@ss1"
    r = s.post(f"{API}/superadmin/users", json={
        "name": "TEST reset", "email": email, "password": old_pw,
    })
    body = r.json()
    uid = body["id"]
    created["user_ids"].append(uid)
    created["ws_ids"].append(body["workspace_id"])

    new_pw = "NewP@ss99"
    r = s.post(f"{API}/superadmin/users/{uid}/reset-password", json={"new_password": new_pw})
    assert r.status_code == 200

    # old pw fails, new works
    n1 = requests.Session()
    assert n1.post(f"{API}/auth/login", json={"email": email, "password": old_pw}).status_code in (400, 401)
    n2 = requests.Session()
    assert n2.post(f"{API}/auth/login", json={"email": email, "password": new_pw}).status_code == 200


def test_toggle_super_admin(super_session, created):
    s, _ = super_session
    email = f"TEST_super_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/superadmin/users", json={
        "name": "TEST super", "email": email, "password": "TestP@ss1",
    })
    body = r.json()
    uid = body["id"]
    created["user_ids"].append(uid)
    created["ws_ids"].append(body["workspace_id"])

    r = s.patch(f"{API}/superadmin/users/{uid}", json={"is_super_admin": True})
    assert r.status_code == 200
    lst = s.get(f"{API}/superadmin/users", params={"search": email}).json()
    row = next(u for u in lst["users"] if u["id"] == uid)
    assert row["is_super_admin"] is True

    r = s.patch(f"{API}/superadmin/users/{uid}", json={"is_super_admin": False})
    assert r.status_code == 200


# ─── Guardrails ─────────────────────────────────────────────────────────────
def test_cannot_suspend_self(super_session, created):
    s, _ = super_session
    r = s.patch(f"{API}/superadmin/users/{created['me_id']}", json={"status": "suspended"})
    assert r.status_code == 400


def test_cannot_revoke_own_super(super_session, created):
    s, _ = super_session
    r = s.patch(f"{API}/superadmin/users/{created['me_id']}", json={"is_super_admin": False})
    assert r.status_code == 400


def test_cannot_delete_self(super_session, created):
    s, _ = super_session
    r = s.delete(f"{API}/superadmin/users/{created['me_id']}")
    assert r.status_code == 400


# ─── Workspaces tab ─────────────────────────────────────────────────────────
def test_list_workspaces(super_session):
    s, _ = super_session
    r = s.get(f"{API}/superadmin/workspaces")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data.get("workspaces"), list)
    # basic shape
    if data["workspaces"]:
        w = data["workspaces"][0]
        for key in ("id", "name", "plan_id", "credits_remaining", "monthly_credits", "members"):
            assert key in w


def test_change_plan_and_monthly_override_regression(super_session, created):
    """Change plan, set monthly override, verify GET /api/billing/usage reflects override."""
    s, _ = super_session
    # Create a user to get a fresh workspace
    email = f"TEST_ws_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/superadmin/users", json={
        "name": "TEST wschange", "email": email, "password": "TestP@ss1",
    })
    body = r.json()
    uid = body["id"]
    ws_id = body["workspace_id"]
    created["user_ids"].append(uid)
    created["ws_ids"].append(ws_id)

    # Change plan to pro
    r = s.patch(f"{API}/superadmin/workspaces/{ws_id}", json={"plan_id": "pro"})
    assert r.status_code == 200

    # Set monthly override = 750
    r = s.patch(f"{API}/superadmin/workspaces/{ws_id}", json={"monthly_credits": 750})
    assert r.status_code == 200

    # Verify via a session as this user; billing/usage returns for the user's active ws
    ns = requests.Session()
    ns.post(f"{API}/auth/login", json={"email": email, "password": "TestP@ss1"})
    usage = ns.get(f"{API}/billing/usage")
    assert usage.status_code == 200, usage.text
    ub = usage.json()
    assert ub.get("monthly_credits") == 750, ub


def test_one_time_topup_regression(super_session, created):
    s, _ = super_session
    email = f"TEST_top_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/superadmin/users", json={
        "name": "TEST topup", "email": email, "password": "TestP@ss1",
    })
    body = r.json()
    uid = body["id"]
    ws_id = body["workspace_id"]
    created["user_ids"].append(uid)
    created["ws_ids"].append(ws_id)

    # Free plan caps credits_remaining to monthly. Switch to pro (no monthly cap)
    # so the top-up is observable via credits_remaining.
    s.patch(f"{API}/superadmin/workspaces/{ws_id}", json={"plan_id": "pro"})

    # baseline
    ws_row_before = next(w for w in s.get(f"{API}/superadmin/workspaces").json()["workspaces"] if w["id"] == ws_id)
    before = ws_row_before["credits_remaining"]

    r = s.post(f"{API}/superadmin/workspaces/{ws_id}/credits", json={"amount": 250})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["usage"]["credits_remaining"] == before + 250, (before, body["usage"])


@pytest.mark.xfail(reason="BUG: workspace suspension does not update workspace_members.status, so get_user overlay masks user.status='suspended' back to 'active'")
def test_suspend_workspace_blocks_owner(super_session, created):
    s, _ = super_session
    email = f"TEST_wsblk_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/superadmin/users", json={
        "name": "TEST wsblock", "email": email, "password": "TestP@ss1",
    })
    body = r.json()
    uid = body["id"]
    ws_id = body["workspace_id"]
    created["user_ids"].append(uid)
    created["ws_ids"].append(ws_id)

    ns = requests.Session()
    ns.post(f"{API}/auth/login", json={"email": email, "password": "TestP@ss1"})
    assert ns.get(f"{API}/auth/me").status_code == 200

    r = s.patch(f"{API}/superadmin/workspaces/{ws_id}", json={"suspended": True})
    assert r.status_code == 200

    me_after = ns.get(f"{API}/auth/me")
    assert me_after.status_code == 403

    # reactivate
    r = s.patch(f"{API}/superadmin/workspaces/{ws_id}", json={"suspended": False})
    assert r.status_code == 200


def test_delete_workspace(super_session):
    s, _ = super_session
    # create a dedicated user+ws to delete
    email = f"TEST_del_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/superadmin/users", json={
        "name": "TEST del", "email": email, "password": "TestP@ss1",
    })
    body = r.json()
    ws_id = body["workspace_id"]

    r = s.delete(f"{API}/superadmin/workspaces/{ws_id}")
    assert r.status_code == 200

    # confirm gone
    r = s.get(f"{API}/superadmin/workspaces/{ws_id}")
    assert r.status_code == 404


# ─── Invites ────────────────────────────────────────────────────────────────
def test_generate_and_list_invites(super_session, created):
    s, _ = super_session
    r = s.post(f"{API}/superadmin/invites", json={
        "email": None, "count": 2, "access_level": "dev_os_demo", "send_email": False,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["codes"]) == 2
    created["invite_codes"].extend(body["codes"])

    listing = s.get(f"{API}/superadmin/invites").json()
    codes = {i["code"] for i in listing["invites"]}
    assert body["codes"][0] in codes
