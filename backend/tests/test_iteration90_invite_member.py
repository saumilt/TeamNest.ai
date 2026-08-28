"""Iteration 90 - Group chat 'Add member' upgrade + free plan 300 credits.

Tests:
- POST /api/chats/{chat_id}/invite-member (admin gating, existing user_id, new email → member acct with OTP, duplicate 400)
- GET /api/billing/plans free plan monthly credits = 300
- Regression: existing POST /api/chats/{chat_id}/invite-guest still works
"""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, r.json()["user"]


@pytest.fixture(scope="module")
def owner_client():
    s, u = _login("amit@demo.team", os.environ.get("DEMO_PASSWORD", "DemoPass123!"))
    return s, u


@pytest.fixture(scope="module")
def member_client():
    s, u = _login("raj@demo.team", os.environ.get("DEMO_PASSWORD", "DemoPass123!"))
    return s, u


@pytest.fixture(scope="module")
def group_chat_id(owner_client):
    """Find a group chat where amit is chat admin (creator).

    /api/chats list is minimal; we fetch each detail until we find one with
    admin_ids containing current user and multiple members (i.e. group)."""
    s, u = owner_client
    r = s.get(f"{BASE}/api/chats", timeout=20)
    assert r.status_code == 200, r.text
    listing = r.json()
    chats = listing if isinstance(listing, list) else listing.get("chats", [])
    for c in chats:
        rd = s.get(f"{BASE}/api/chats/{c['id']}", timeout=15)
        if rd.status_code != 200:
            continue
        detail = rd.json()
        if (
            u["id"] in (detail.get("admin_ids") or [])
            and len(detail.get("member_ids") or []) >= 2
        ):
            return c["id"], detail
    pytest.skip("No admin group chat found for amit")


# ---------- free plan credits regression ----------
class TestFreePlanCredits:
    def test_free_plan_300_credits(self, owner_client):
        s, _ = owner_client
        r = s.get(f"{BASE}/api/billing/plans", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        plans = body.get("plans") if isinstance(body, dict) else body
        assert isinstance(plans, list), f"unexpected plans shape: {body}"
        free = next((p for p in plans if p.get("id") == "free"), None)
        assert free is not None, f"Free plan not found in: {plans}"
        credits = free.get("monthly_credits") or free.get("credits")
        assert credits == 300, f"expected free plan credits=300, got {credits} in {free}"


# ---------- invite-member endpoint ----------
class TestInviteMember:
    def test_permission_gating_non_admin_forbidden(self, owner_client, member_client, group_chat_id):
        """A non-admin chat member calling invite-member should get 403."""
        chat_id, chat = group_chat_id
        s_owner, _ = owner_client
        s_member, member_user = member_client

        # Ensure raj is a member of the chat but NOT admin
        if member_user["id"] not in (chat.get("member_ids") or []):
            # add him as member using the endpoint we're testing (as admin) — do this once
            r_add = s_owner.post(
                f"{BASE}/api/chats/{chat_id}/invite-member",
                json={"user_id": member_user["id"]},
                timeout=20,
            )
            # 200 if added; 400 if already there — either is fine
            assert r_add.status_code in (200, 400), r_add.text

        # If raj happens to be a chat admin, demote him
        r_chat = s_owner.get(f"{BASE}/api/chats/{chat_id}", timeout=15)
        c = r_chat.json()
        if member_user["id"] in (c.get("admin_ids") or []):
            s_owner.post(
                f"{BASE}/api/chats/{chat_id}/admins",
                json={"user_id": member_user["id"], "make_admin": False},
                timeout=15,
            )

        # Now try to invite as non-admin
        r = s_member.post(
            f"{BASE}/api/chats/{chat_id}/invite-member",
            json={"email": f"TEST_perm_{int(time.time())}@example.com"},
            timeout=20,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"

    def test_invite_new_email_creates_member_account(self, owner_client, group_chat_id):
        """Brand-new email should create a workspace MEMBER with one-time password."""
        s, _ = owner_client
        chat_id, _ = group_chat_id
        email = f"TEST_newmem_{int(time.time())}@example.com"
        r = s.post(
            f"{BASE}/api/chats/{chat_id}/invite-member",
            json={"email": email, "name": "TEST New Member"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("created_new_account") is True, d
        assert d.get("role") == "member", d
        otp = d.get("one_time_password")
        assert otp and isinstance(otp, str) and len(otp) >= 6, d
        assert d.get("email") == email.lower()
        # Verify user is now in the chat
        r2 = s.get(f"{BASE}/api/chats/{chat_id}", timeout=15)
        assert r2.status_code == 200
        assert d["id"] in (r2.json().get("member_ids") or []), "new member not added to chat"

        # Duplicate → 400
        r3 = s.post(
            f"{BASE}/api/chats/{chat_id}/invite-member",
            json={"email": email},
            timeout=20,
        )
        assert r3.status_code == 400, f"expected 400 duplicate, got {r3.status_code}: {r3.text}"
        assert "already" in (r3.json().get("detail") or "").lower()

        # Verify new account can log in with OTP
        r4 = requests.post(
            f"{BASE}/api/auth/login",
            json={"email": email, "password": otp},
            timeout=20,
        )
        assert r4.status_code == 200, f"OTP login failed: {r4.text}"

    def test_invite_existing_user_by_id(self, owner_client, group_chat_id):
        """Inviting existing user by user_id should add them as member (not guest)."""
        s, _ = owner_client
        chat_id, _ = group_chat_id
        # Create a fresh user first via invite-member
        email = f"TEST_existing_{int(time.time())}@example.com"
        r0 = s.post(
            f"{BASE}/api/chats/{chat_id}/invite-member",
            json={"email": email},
            timeout=20,
        )
        assert r0.status_code == 200, r0.text
        new_user_id = r0.json()["id"]

        # Remove them from the chat
        r_rm = s.delete(f"{BASE}/api/chats/{chat_id}/members/{new_user_id}", timeout=15)
        assert r_rm.status_code in (200, 204), r_rm.text

        # Re-add via user_id path
        r = s.post(
            f"{BASE}/api/chats/{chat_id}/invite-member",
            json={"user_id": new_user_id},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("role") == "member"
        # Should NOT return one_time_password when adding existing user
        assert d.get("created_new_account") in (None, False)
        assert d.get("id") == new_user_id


# ---------- regression: invite-guest still works ----------
class TestInviteGuestRegression:
    def test_invite_guest_new_email(self, owner_client, group_chat_id):
        s, _ = owner_client
        chat_id, _ = group_chat_id
        email = f"TEST_guest_{int(time.time())}@example.com"
        r = s.post(
            f"{BASE}/api/chats/{chat_id}/invite-guest",
            json={"email": email, "name": "TEST Guest"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("role") == "guest", d
        assert d.get("created_new_account") is True
        assert d.get("one_time_password")
