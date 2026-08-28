"""Iteration 116 — Super Admin user edit/reset-password/reset-link, create-workspace
(free + paid), and rename gating (owner vs member).

All requests use /api prefix and hit the shared FastAPI backend.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")

SAM_EMAIL = "sam@funasia.net"
SAM_PASSWORD = os.environ.get("SUPERADMIN_TEST_PASSWORD", "")
MATE_EMAIL = "mate1@test.io"
MATE_PASSWORD = os.environ.get("TEST_PASSWORD", "TestPass123!")
RAJ_EMAIL = "raj@demo.team"
RAJ_PASSWORD = os.environ.get("DEMO_PASSWORD", "DemoPass123!")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


@pytest.fixture(scope="module")
def sam_auth():
    tok, user = _login(SAM_EMAIL, SAM_PASSWORD)
    return {"headers": {"Authorization": f"Bearer {tok}"}, "user": user}


@pytest.fixture(scope="module")
def mate_auth():
    tok, user = _login(MATE_EMAIL, MATE_PASSWORD)
    return {"headers": {"Authorization": f"Bearer {tok}"}, "user": user}


@pytest.fixture(scope="module")
def raj_auth():
    tok, user = _login(RAJ_EMAIL, RAJ_PASSWORD)
    return {"headers": {"Authorization": f"Bearer {tok}"}, "user": user}


# --------------------------------------------------------------------------
# Super Admin — provision a throwaway user for edit/reset tests
# --------------------------------------------------------------------------
@pytest.fixture(scope="module")
def throwaway_user(sam_auth):
    """Create a throwaway TEST_ user via superadmin so we can safely
    edit/reset its password without breaking documented credentials."""
    email = f"TEST_iter116_{uuid.uuid4().hex[:8]}@test.io".lower()
    body = {
        "name": "Iter116 Throwaway",
        "email": email,
        "password": "Throw@2026x",
        "role": "owner",
        "must_change_password": False,
        "send_credentials": False,
    }
    r = requests.post(f"{BASE_URL}/api/superadmin/users",
                      json=body, headers=sam_auth["headers"], timeout=30)
    assert r.status_code == 200, f"create throwaway failed: {r.status_code} {r.text}"
    data = r.json()
    uid = data["id"]
    yield {"id": uid, "email": email}
    # Cleanup
    try:
        requests.delete(f"{BASE_URL}/api/superadmin/users/{uid}",
                        headers=sam_auth["headers"], timeout=30)
    except Exception:
        pass


class TestSuperAdminUserDetail:
    def test_user_detail_returns_expected_fields(self, sam_auth, throwaway_user):
        r = requests.get(f"{BASE_URL}/api/superadmin/users/{throwaway_user['id']}",
                         headers=sam_auth["headers"], timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # Required fields per acceptance criteria
        for k in ("id", "name", "email", "role", "status", "workspace_id",
                  "workspace_name", "edu_verified", "plan"):
            assert k in d, f"missing field {k} in detail response: {d}"
        assert d["email"] == throwaway_user["email"]
        assert d["plan"] is not None, "plan must be included when workspace_id present"
        assert "plan_id" in d["plan"] and "plan_name" in d["plan"]


class TestSuperAdminEditUser:
    def test_edit_name_role_status_email_persists(self, sam_auth, throwaway_user):
        new_name = "Iter116 Renamed"
        new_email = f"TEST_iter116_renamed_{uuid.uuid4().hex[:6]}@test.io".lower()
        r = requests.patch(
            f"{BASE_URL}/api/superadmin/users/{throwaway_user['id']}",
            json={"name": new_name, "email": new_email, "role": "admin", "status": "active"},
            headers=sam_auth["headers"], timeout=30,
        )
        assert r.status_code == 200, r.text

        # Verify via GET
        r2 = requests.get(f"{BASE_URL}/api/superadmin/users/{throwaway_user['id']}",
                          headers=sam_auth["headers"], timeout=30)
        assert r2.status_code == 200
        d = r2.json()
        assert d["name"] == new_name
        assert d["email"] == new_email
        assert d["role"] == "admin"
        assert d["status"] == "active"
        # keep updated email for later login test
        throwaway_user["email"] = new_email


class TestSuperAdminResetPassword:
    def test_reset_password_generates_and_reports_email_sent(self, sam_auth, throwaway_user):
        r = requests.post(
            f"{BASE_URL}/api/superadmin/users/{throwaway_user['id']}/reset-password",
            json={"send_email": True},
            headers=sam_auth["headers"], timeout=60,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        # Must return the new password and email_sent flag per spec
        assert d.get("ok") is True
        assert "password" in d and isinstance(d["password"], str) and len(d["password"]) >= 8
        assert "email_sent" in d and isinstance(d["email_sent"], bool)
        assert d.get("email") == throwaway_user["email"]

        # Verify the new password actually works
        login = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": throwaway_user["email"], "password": d["password"]},
                              timeout=30)
        assert login.status_code == 200, f"login with reset password failed: {login.text}"


class TestSuperAdminResetLink:
    def test_reset_link_returns_single_use_link(self, sam_auth, throwaway_user):
        r = requests.post(
            f"{BASE_URL}/api/superadmin/users/reset-link",
            json={"uid": throwaway_user["id"], "send_email": False},
            headers=sam_auth["headers"], timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert "reset_link" in d and "/reset-password?token=" in d["reset_link"]
        assert d.get("email") == throwaway_user["email"]
        assert d.get("expires_in_minutes") == 60


# --------------------------------------------------------------------------
# Workspace create (free vs paid) — use throwaway user session so we don't
# switch mate1's active workspace permanently.
# --------------------------------------------------------------------------
@pytest.fixture(scope="module")
def throwaway_login(throwaway_user):
    """After reset-password, login with new creds is not stable across tests
    (password changes). Instead create a NEW throwaway user for workspace
    creation tests."""
    email = f"TEST_iter116_ws_{uuid.uuid4().hex[:8]}@test.io".lower()
    pw = "Ws@Throw2026"
    # need sam to create it
    tok, _ = _login(SAM_EMAIL, SAM_PASSWORD)
    r = requests.post(f"{BASE_URL}/api/superadmin/users",
                      json={"name": "WS Throw", "email": email, "password": pw,
                            "role": "owner", "must_change_password": False,
                            "send_credentials": False},
                      headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    # login as this user
    r2 = requests.post(f"{BASE_URL}/api/auth/login",
                       json={"email": email, "password": pw}, timeout=30)
    assert r2.status_code == 200, r2.text
    token = r2.json()["token"]
    yield {"id": uid, "email": email, "headers": {"Authorization": f"Bearer {token}"}}
    # Cleanup
    try:
        requests.delete(f"{BASE_URL}/api/superadmin/users/{uid}",
                        headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    except Exception:
        pass


class TestCreateWorkspace:
    def test_create_free_workspace_no_checkout(self, throwaway_login):
        name = f"TEST_free_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/workspace/create",
                          json={"name": name, "plan_id": "free"},
                          headers=throwaway_login["headers"], timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert d.get("needs_checkout") is False
        assert d.get("chosen_plan_id") == "free"
        assert d.get("workspace_id")
        # workspaces list should contain it (tolerate different id key names)
        ws_list = d.get("workspaces", [])
        assert isinstance(ws_list, list) and len(ws_list) > 0
        ws_ids = [w.get("id") or w.get("workspace_id") for w in ws_list]
        assert d["workspace_id"] in ws_ids

    def test_create_paid_workspace_needs_checkout(self, throwaway_login):
        name = f"TEST_pro_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/workspace/create",
                          json={"name": name, "plan_id": "pro"},
                          headers=throwaway_login["headers"], timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert d.get("needs_checkout") is True
        assert d.get("chosen_plan_id") == "pro"

    def test_create_workspace_short_name_rejected(self, throwaway_login):
        r = requests.post(f"{BASE_URL}/api/workspace/create",
                          json={"name": "a", "plan_id": "free"},
                          headers=throwaway_login["headers"], timeout=30)
        assert r.status_code == 400


# --------------------------------------------------------------------------
# Rename gating on PATCH /api/workspace
# --------------------------------------------------------------------------
class TestWorkspaceRenameGating:
    def test_owner_can_rename(self, mate_auth):
        # mate1 owns their workspace. Save original name and restore.
        r0 = requests.get(f"{BASE_URL}/api/workspace",
                          headers=mate_auth["headers"], timeout=30)
        assert r0.status_code == 200
        original = r0.json().get("name")

        new_name = f"TEST_rename_{uuid.uuid4().hex[:5]}"
        r = requests.patch(f"{BASE_URL}/api/workspace",
                           json={"name": new_name},
                           headers=mate_auth["headers"], timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("name") == new_name
        # restore
        if original:
            requests.patch(f"{BASE_URL}/api/workspace",
                           json={"name": original},
                           headers=mate_auth["headers"], timeout=30)

    def test_non_owner_forbidden(self, raj_auth):
        # raj is a member in demo workspace — should get 403
        r = requests.patch(f"{BASE_URL}/api/workspace",
                           json={"name": "TEST_raj_rename_attempt"},
                           headers=raj_auth["headers"], timeout=30)
        assert r.status_code == 403, f"expected 403 for non-owner rename, got {r.status_code}: {r.text}"
