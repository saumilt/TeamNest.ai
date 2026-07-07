"""Iteration 20: Multi-workspace support tests.

Covers:
- Direct invite of existing email (bug fix)
- Magic-link redeem for existing email
- /public/invite/check-email
- /me/workspaces
- /workspace/switch
- workspaces array in auth responses
"""
import os
import secrets as _secrets
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TS = int(time.time())
BOB_EMAIL = f"bob.test+{TS}@acme.com"
# Generated per-run; never committed. Real demo creds live in
# /app/memory/test_credentials.md (gitignored in production deploys).
BOB_PASSWORD = os.environ.get("TEST_BOB_PASSWORD") or f"Bob_{_secrets.token_urlsafe(12)}"
BOB_NAME = "Bob Test"


@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(f"{API}/auth/demo-login")
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def bob_signup():
    """Bob signs up and creates his own workspace."""
    r = requests.post(f"{API}/auth/signup", json={
        "name": BOB_NAME,
        "email": BOB_EMAIL,
        "password": BOB_PASSWORD,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert "workspaces" in data
    assert len(data["workspaces"]) == 1
    assert data["workspaces"][0]["role"] == "owner"
    return data


class TestAuthWorkspacesArray:
    def test_demo_login_has_workspaces(self, demo_token):
        r = requests.post(f"{API}/auth/demo-login")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("workspaces"), list)
        assert len(data["workspaces"]) >= 1

    def test_me_has_workspaces(self, demo_headers):
        r = requests.get(f"{API}/auth/me", headers=demo_headers)
        assert r.status_code == 200
        assert isinstance(r.json().get("workspaces"), list)

    def test_signup_has_workspaces(self, bob_signup):
        assert "workspaces" in bob_signup


class TestDirectInviteExistingEmail:
    """Customer-reported bug: invite existing email used to 400."""

    def test_invite_existing_email_returns_200_with_flag(self, demo_headers, bob_signup):
        r = requests.post(f"{API}/workspace/invite", headers=demo_headers, json={
            "name": BOB_NAME,
            "email": BOB_EMAIL,
            "role": "member",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("added_to_existing_user") is True
        assert data.get("email") == BOB_EMAIL.lower()

    def test_no_duplicate_user_created(self, demo_headers):
        # Bob can still login with his own credentials
        r = requests.post(f"{API}/auth/login", json={
            "email": BOB_EMAIL,
            "password": BOB_PASSWORD,
        })
        assert r.status_code == 200, r.text
        ws = r.json()["workspaces"]
        # Bob should now be in 2 workspaces
        assert len(ws) >= 2, f"Expected >=2 workspaces, got {len(ws)}: {ws}"
        roles = sorted([w["role"] for w in ws])
        assert "owner" in roles
        assert "member" in roles

    def test_invite_same_user_twice_returns_400(self, demo_headers):
        r = requests.post(f"{API}/workspace/invite", headers=demo_headers, json={
            "name": BOB_NAME,
            "email": BOB_EMAIL,
            "role": "member",
        })
        assert r.status_code == 400


class TestMeWorkspaces:
    def test_bob_sees_both_workspaces(self):
        login = requests.post(f"{API}/auth/login", json={
            "email": BOB_EMAIL, "password": BOB_PASSWORD,
        })
        assert login.status_code == 200
        token = login.json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{API}/me/workspaces", headers=h)
        assert r.status_code == 200
        ws = r.json()
        assert len(ws) >= 2
        names = [w["name"] for w in ws]
        assert any("Bob" in n for n in names)


class TestWorkspaceSwitch:
    def test_switch_to_demo_workspace(self):
        login = requests.post(f"{API}/auth/login", json={
            "email": BOB_EMAIL, "password": BOB_PASSWORD,
        })
        token = login.json()["token"]
        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # Get bob's workspaces
        wsr = requests.get(f"{API}/me/workspaces", headers=h)
        workspaces = wsr.json()
        demo_ws = [w for w in workspaces if w["role"] == "member"][0]
        own_ws = [w for w in workspaces if w["role"] == "owner"][0]

        # Switch to demo workspace
        r = requests.post(f"{API}/workspace/switch", headers=h,
                          json={"workspace_id": demo_ws["workspace_id"]})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["workspace_id"] == demo_ws["workspace_id"]
        assert data["user"]["role"] == "member"
        assert "workspaces" in data

        # Verify /auth/me reflects switch
        me = requests.get(f"{API}/auth/me", headers=h).json()
        assert me["workspace_id"] == demo_ws["workspace_id"]
        assert me["role"] == "member"

        # Members list should reflect demo workspace (has multiple members)
        members = requests.get(f"{API}/workspace/members", headers=h).json()
        assert len(members) > 1

        # Switch back to own workspace
        r2 = requests.post(f"{API}/workspace/switch", headers=h,
                           json={"workspace_id": own_ws["workspace_id"]})
        assert r2.status_code == 200
        assert r2.json()["user"]["role"] == "owner"

    def test_switch_to_non_member_workspace_forbidden(self):
        login = requests.post(f"{API}/auth/login", json={
            "email": BOB_EMAIL, "password": BOB_PASSWORD,
        })
        token = login.json()["token"]
        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        r = requests.post(f"{API}/workspace/switch", headers=h,
                          json={"workspace_id": "non-existent-ws-id"})
        assert r.status_code == 403


class TestMagicLinkExistingEmail:
    def test_check_email_new_user(self, demo_headers):
        # rotate link
        link = requests.post(f"{API}/invites/link/rotate", headers=demo_headers,
                             json={"role": "member"}).json()["link"]
        token = link["token"]
        r = requests.post(f"{API}/public/invite/check-email", json={
            "token": token, "email": f"never.exists+{TS}@nowhere.test"
        })
        assert r.status_code == 200
        assert r.json()["existing_user"] is False

    def test_check_email_existing_user(self, demo_headers):
        link = requests.post(f"{API}/invites/link/rotate", headers=demo_headers,
                             json={"role": "member"}).json()["link"]
        r = requests.post(f"{API}/public/invite/check-email", json={
            "token": link["token"], "email": BOB_EMAIL
        })
        assert r.status_code == 200
        data = r.json()
        assert data["existing_user"] is True
        assert data.get("name") == BOB_NAME
        # Bob is already a member from the direct invite earlier
        assert data.get("already_member") is True

    def test_redeem_existing_email_wrong_password_401(self, demo_headers):
        # create a separate new user, then test wrong-password
        ts2 = TS + 1
        email = f"charlie.test+{ts2}@acme.com"
        pwd = "Charlie@2026"
        requests.post(f"{API}/auth/signup", json={
            "name": "Charlie", "email": email, "password": pwd,
        })
        link = requests.post(f"{API}/invites/link/rotate", headers=demo_headers,
                             json={"role": "member"}).json()["link"]
        r = requests.post(f"{API}/public/invite/redeem", json={
            "token": link["token"], "email": email, "password": "WRONG_PWD",
        })
        assert r.status_code == 401

    def test_redeem_existing_email_correct_password(self, demo_headers):
        ts3 = TS + 2
        email = f"dave.test+{ts3}@acme.com"
        pwd = "Dave@2026"
        requests.post(f"{API}/auth/signup", json={
            "name": "Dave", "email": email, "password": pwd,
        })
        link = requests.post(f"{API}/invites/link/rotate", headers=demo_headers,
                             json={"role": "member"}).json()["link"]
        r = requests.post(f"{API}/public/invite/redeem", json={
            "token": link["token"], "email": email, "password": pwd,
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("joined_existing_account") is True
        assert isinstance(data.get("workspaces"), list)
        assert len(data["workspaces"]) == 2

    def test_redeem_new_email(self, demo_headers):
        ts4 = TS + 3
        email = f"eve.test+{ts4}@acme.com"
        link = requests.post(f"{API}/invites/link/rotate", headers=demo_headers,
                             json={"role": "member"}).json()["link"]
        r = requests.post(f"{API}/public/invite/redeem", json={
            "token": link["token"], "email": email,
            "password": "Eve@2026", "name": "Eve",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("joined_existing_account") is False


class TestRegressions:
    def test_workspace_members(self, demo_headers):
        r = requests.get(f"{API}/workspace/members", headers=demo_headers)
        assert r.status_code == 200
        members = r.json()
        # Should include bob since he was invited
        emails = [m["email"] for m in members]
        assert BOB_EMAIL in emails

    def test_admin_overview(self, demo_headers):
        r = requests.get(f"{API}/admin/overview", headers=demo_headers)
        assert r.status_code == 200

    def test_admin_users(self, demo_headers):
        r = requests.get(f"{API}/admin/users", headers=demo_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_dashboard(self, demo_headers):
        r = requests.get(f"{API}/dashboard", headers=demo_headers)
        assert r.status_code == 200

    def test_chats(self, demo_headers):
        r = requests.get(f"{API}/chats", headers=demo_headers)
        assert r.status_code == 200

    def test_tasks(self, demo_headers):
        r = requests.get(f"{API}/tasks", headers=demo_headers)
        assert r.status_code == 200

    def test_invites_suggestions(self, demo_headers):
        r = requests.get(f"{API}/invites/suggestions", headers=demo_headers)
        assert r.status_code == 200

    def test_invites_list(self, demo_headers):
        r = requests.get(f"{API}/invites", headers=demo_headers)
        assert r.status_code == 200
