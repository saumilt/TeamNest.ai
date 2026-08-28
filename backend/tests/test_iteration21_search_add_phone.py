"""Iteration 21: Phone at signup, user search, add-existing-member.

Covers:
- Signup with optional phone (stored + normalized + surfaced)
- Duplicate phone rejection
- GET /api/users/search (auth, role, query length, masking, phone variants, already_in_workspace)
- POST /api/workspace/add-existing-member (member role downgrade, duplicate add)
- Invite redeem with phone
- Migration backfill (phone_normalized) — covered indirectly via signup path
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend/.env at runtime
    from pathlib import Path
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"


def _ts():
    return int(time.time() * 1000)


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{API}/auth/demo-login")
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def owner_headers(owner_token):
    return {"Authorization": f"Bearer {owner_token}"}


@pytest.fixture(scope="module")
def new_user_with_phone():
    """Create an ephemeral signup with a phone number we can search for."""
    ts = _ts()
    last4 = str(ts % 10000).zfill(4)
    phone = f"+1-303-555-{last4}"
    email = f"frank.test+{ts}@acme.com"
    r = requests.post(f"{API}/auth/signup", json={
        "name": "Frank Test",
        "email": email,
        "password": "Frank@2026",
        "phone": phone,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    user = body["user"]
    assert user["email"] == email
    assert user.get("phone") == phone, f"phone surfaced wrong: {user.get('phone')}"
    return {
        "token": body["token"],
        "user": user,
        "email": email,
        "phone": phone,
        "phone_digits": f"1303555{last4}",
        "last7": f"555{last4}",
    }


class TestSignupPhone:
    def test_signup_phone_persisted(self, new_user_with_phone):
        headers = {"Authorization": f"Bearer {new_user_with_phone['token']}"}
        r = requests.get(f"{API}/auth/me", headers=headers)
        assert r.status_code == 200
        me = r.json()
        assert me.get("phone") == new_user_with_phone["phone"]

    def test_signup_duplicate_phone_rejected(self, new_user_with_phone):
        ts = _ts()
        r = requests.post(f"{API}/auth/signup", json={
            "name": "Dup Phone",
            "email": f"dup.phone+{ts}@acme.com",
            "password": "Dup@2026",
            "phone": new_user_with_phone["phone"],  # same phone
        })
        assert r.status_code == 400, r.text
        assert "phone" in r.text.lower()


class TestUserSearch:
    def test_search_requires_auth(self):
        r = requests.get(f"{API}/users/search", params={"q": "amit@demo.team"})
        assert r.status_code in (401, 403)

    def test_search_short_query(self, owner_headers):
        r = requests.get(f"{API}/users/search", params={"q": "ab"}, headers=owner_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["results"] == []
        assert data.get("reason") == "query too short"

    def test_search_by_exact_email(self, owner_headers, new_user_with_phone):
        r = requests.get(f"{API}/users/search",
                         params={"q": new_user_with_phone["email"]},
                         headers=owner_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["results"]) >= 1
        found = data["results"][0]
        assert found["id"] == new_user_with_phone["user"]["id"]
        # masked email like f***@acme.com
        assert "@" in found["masked_email"]
        assert "*" in found["masked_email"]
        # masked_phone shows last 4
        assert found["masked_phone"].endswith(new_user_with_phone["phone"][-4:])
        assert found.get("already_in_workspace") is False

    @pytest.mark.parametrize("variant_key", ["phone", "phone_digits", "last7"])
    def test_search_by_phone_variants(self, owner_headers, new_user_with_phone, variant_key):
        q = new_user_with_phone[variant_key]
        r = requests.get(f"{API}/users/search",
                         params={"q": q}, headers=owner_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        ids = [x["id"] for x in data["results"]]
        assert new_user_with_phone["user"]["id"] in ids, f"phone variant '{q}' did not match (got {ids})"

    def test_search_viewer_forbidden(self):
        """Viewer cannot use the search endpoint."""
        r = requests.post(f"{API}/auth/login",
                         json={"email": "sara@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")})
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        r2 = requests.get(f"{API}/users/search", params={"q": "amit@demo.team"}, headers=h)
        assert r2.status_code == 403


class TestAddExistingMember:
    def test_owner_can_add_existing(self, owner_headers, new_user_with_phone):
        target_id = new_user_with_phone["user"]["id"]
        r = requests.post(f"{API}/workspace/add-existing-member",
                          json={"user_id": target_id, "role": "member"},
                          headers=owner_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("added_to_existing_user") is True
        assert body["id"] == target_id

    def test_duplicate_add_rejected(self, owner_headers, new_user_with_phone):
        target_id = new_user_with_phone["user"]["id"]
        r = requests.post(f"{API}/workspace/add-existing-member",
                          json={"user_id": target_id, "role": "member"},
                          headers=owner_headers)
        assert r.status_code == 400

    def test_already_in_workspace_flag(self, owner_headers, new_user_with_phone):
        r = requests.get(f"{API}/users/search",
                         params={"q": new_user_with_phone["email"]},
                         headers=owner_headers)
        assert r.status_code == 200
        results = r.json()["results"]
        assert any(x["id"] == new_user_with_phone["user"]["id"]
                   and x.get("already_in_workspace") is True for x in results)

    def test_member_role_downgrade(self):
        """A member-role caller adding with role='admin' should be silently downgraded to member."""
        # Login as Raj (member)
        r = requests.post(f"{API}/auth/login",
                         json={"email": "raj@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")})
        assert r.status_code == 200, r.text
        member_token = r.json()["token"]
        member_headers = {"Authorization": f"Bearer {member_token}"}

        # Create a fresh user to add
        ts = _ts()
        signup = requests.post(f"{API}/auth/signup", json={
            "name": "Downgrade Target",
            "email": f"dg.target+{ts}@acme.com",
            "password": "Dg@2026",
        })
        assert signup.status_code == 200, signup.text
        target_id = signup.json()["user"]["id"]

        # Try to add as admin
        r2 = requests.post(f"{API}/workspace/add-existing-member",
                          json={"user_id": target_id, "role": "admin"},
                          headers=member_headers)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body.get("role") == "member", f"expected silent downgrade to 'member', got {body.get('role')}"


class TestInviteRedeemPhone:
    def test_redeem_with_phone_for_new_account(self, owner_headers):
        # Rotate to get a fresh invite link
        r = requests.post(f"{API}/invites/link/rotate",
                          json={"role": "member", "expires_in_days": 1},
                          headers=owner_headers)
        assert r.status_code == 200, r.text
        token = r.json()["link"]["token"]

        ts = _ts()
        last4 = str((ts + 1) % 10000).zfill(4)
        phone = f"+1-415-555-{last4}"
        email = f"redeem.phone+{ts}@acme.com"
        r2 = requests.post(f"{API}/public/invite/redeem", json={
            "token": token,
            "name": "Redeem Phone",
            "email": email,
            "password": "Redeem@2026",
            "phone": phone,
        })
        assert r2.status_code == 200, r2.text
        new_token = r2.json()["token"]
        me = requests.get(f"{API}/auth/me",
                          headers={"Authorization": f"Bearer {new_token}"}).json()
        assert me.get("phone") == phone
