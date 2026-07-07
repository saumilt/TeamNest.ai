"""Iteration 9 — Find Your Friends (Invites) backend tests.

Covers:
- /api/invites/link (GET, POST rotate, DELETE)
- /api/public/invite/{token} (no-auth preview)
- /api/public/invite/redeem (no-auth user creation)
- /api/invites/bulk (record + mailto)
- /api/invites (pending list w/ auto-refresh)
- /api/invites/{id} (cancel)
- /api/invites/suggestions (domain-based; generic skip)
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://nest-app-prep.preview.emergentagent.com",
).rstrip("/")


# ---------- helpers / fixtures ----------

@pytest.fixture(scope="module")
def demo_owner_token():
    r = requests.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def demo_owner_headers(demo_owner_token):
    return {"Authorization": f"Bearer {demo_owner_token}", "Content-Type": "application/json"}


DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "Demo@2026")


def _login(email, password=None):
    if password is None:
        password = DEMO_PASSWORD
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    return r


@pytest.fixture(scope="module")
def viewer_headers():
    r = _login("sara@demo.team")
    if r.status_code != 200:
        pytest.skip(f"sara@demo.team login failed: {r.status_code} {r.text}")
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


# ---------- TestInviteLink ----------

class TestInviteLink:
    """Magic invite link CRUD (rotate / get / delete)."""

    def test_rotate_link_creates_new(self, demo_owner_headers):
        r = requests.post(
            f"{BASE_URL}/api/invites/link/rotate",
            json={"role": "member", "expires_in_days": 30, "max_uses": None},
            headers=demo_owner_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        link = r.json()["link"]
        for k in ("id", "token", "role", "use_count", "expires_at", "created_at", "join_path", "revoked"):
            assert k in link, f"missing {k} in {link}"
        assert link["role"] == "member"
        assert link["use_count"] == 0
        assert link["join_path"] == f"/join/{link['token']}"
        assert link["revoked"] is False

    def test_get_link_returns_active(self, demo_owner_headers):
        # ensure active link exists
        requests.post(
            f"{BASE_URL}/api/invites/link/rotate",
            json={"role": "member", "expires_in_days": 30},
            headers=demo_owner_headers,
        )
        r = requests.get(f"{BASE_URL}/api/invites/link", headers=demo_owner_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["link"] is not None
        assert body["link"]["revoked"] is False

    def test_rotate_revokes_prior_link(self, demo_owner_headers):
        r1 = requests.post(
            f"{BASE_URL}/api/invites/link/rotate",
            json={"role": "member", "expires_in_days": 30},
            headers=demo_owner_headers,
        )
        token_old = r1.json()["link"]["token"]
        r2 = requests.post(
            f"{BASE_URL}/api/invites/link/rotate",
            json={"role": "admin", "expires_in_days": 7},
            headers=demo_owner_headers,
        )
        token_new = r2.json()["link"]["token"]
        assert token_old != token_new
        # old token should be revoked
        r3 = requests.get(f"{BASE_URL}/api/public/invite/{token_old}", timeout=30)
        assert r3.status_code == 404, f"old token should be 404, got {r3.status_code}"
        # new token returns role admin
        assert r2.json()["link"]["role"] == "admin"

    def test_rotate_forbidden_for_viewer(self, viewer_headers):
        r = requests.post(
            f"{BASE_URL}/api/invites/link/rotate",
            json={"role": "member", "expires_in_days": 30},
            headers=viewer_headers,
        )
        assert r.status_code == 403, r.text

    def test_delete_link_revokes(self, demo_owner_headers):
        # create a fresh link to delete
        r1 = requests.post(
            f"{BASE_URL}/api/invites/link/rotate",
            json={"role": "member", "expires_in_days": 30},
            headers=demo_owner_headers,
        )
        token = r1.json()["link"]["token"]
        rd = requests.delete(
            f"{BASE_URL}/api/invites/link/{token}", headers=demo_owner_headers, timeout=30
        )
        assert rd.status_code == 200, rd.text
        # confirm revoked
        rp = requests.get(f"{BASE_URL}/api/public/invite/{token}", timeout=30)
        assert rp.status_code == 404

    def test_delete_forbidden_for_viewer(self, viewer_headers, demo_owner_headers):
        r1 = requests.post(
            f"{BASE_URL}/api/invites/link/rotate",
            json={"role": "member", "expires_in_days": 30},
            headers=demo_owner_headers,
        )
        token = r1.json()["link"]["token"]
        rd = requests.delete(f"{BASE_URL}/api/invites/link/{token}", headers=viewer_headers)
        assert rd.status_code == 403


# ---------- TestPublicInvite ----------

class TestPublicInvite:
    def test_preview_works_no_auth(self, demo_owner_headers):
        r1 = requests.post(
            f"{BASE_URL}/api/invites/link/rotate",
            json={"role": "member", "expires_in_days": 30},
            headers=demo_owner_headers,
        )
        token = r1.json()["link"]["token"]
        # NO auth header
        r = requests.get(f"{BASE_URL}/api/public/invite/{token}", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("workspace_name", "inviter_name", "role", "member_count", "expires_at"):
            assert k in body
        assert body["role"] == "member"
        assert isinstance(body["member_count"], int)
        assert body["member_count"] >= 1

    def test_preview_invalid_token_404(self):
        r = requests.get(f"{BASE_URL}/api/public/invite/zzz_not_real_{uuid.uuid4().hex[:6]}", timeout=30)
        assert r.status_code == 404

    def test_redeem_creates_user(self, demo_owner_headers):
        r1 = requests.post(
            f"{BASE_URL}/api/invites/link/rotate",
            json={"role": "member", "expires_in_days": 30},
            headers=demo_owner_headers,
        )
        token = r1.json()["link"]["token"]
        unique = uuid.uuid4().hex[:8]
        email = f"test_join_{unique}@acmebrand.co"
        payload = {"token": token, "name": "Test Join User", "email": email, "password": "Hello@123"}
        r = requests.post(f"{BASE_URL}/api/public/invite/redeem", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and "user" in body
        assert body["user"]["email"] == email
        assert body["user"]["role"] == "member"

        # use_count incremented on link
        rl = requests.get(f"{BASE_URL}/api/invites/link", headers=demo_owner_headers)
        link = rl.json()["link"]
        if link and link["token"] == token:
            assert link["use_count"] >= 1

    def test_redeem_duplicate_email_400(self, demo_owner_headers):
        r1 = requests.post(
            f"{BASE_URL}/api/invites/link/rotate",
            json={"role": "member", "expires_in_days": 30},
            headers=demo_owner_headers,
        )
        token = r1.json()["link"]["token"]
        payload = {"token": token, "name": "Dup", "email": "amit@demo.team", "password": "Hello@123"}
        r = requests.post(f"{BASE_URL}/api/public/invite/redeem", json=payload, timeout=30)
        assert r.status_code == 400, r.text

    def test_redeem_invalid_token_404(self):
        payload = {
            "token": f"bad_token_{uuid.uuid4().hex[:6]}",
            "name": "X",
            "email": f"x_{uuid.uuid4().hex[:6]}@acmebrand.co",
            "password": "Hello@123",
        }
        r = requests.post(f"{BASE_URL}/api/public/invite/redeem", json=payload, timeout=30)
        assert r.status_code == 404


# ---------- TestBulkInvite ----------

class TestBulkInvite:
    def test_bulk_invite_records_and_returns_mailto(self, demo_owner_headers):
        unique = uuid.uuid4().hex[:8]
        emails = [
            f"bulk_a_{unique}@acmebrand.co",
            f"bulk_b_{unique}@acmebrand.co",
        ]
        payload = {
            "emails": emails,
            "note": "Join us!",
            "share_url_base": "https://teamnest.example",
        }
        r = requests.post(f"{BASE_URL}/api/invites/bulk", json=payload, headers=demo_owner_headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("recorded", "share_url", "mailto_url", "subject", "body"):
            assert k in body
        assert len(body["recorded"]) == 2
        assert body["share_url"].startswith("https://teamnest.example/join/")
        # mailto encoded
        assert body["mailto_url"].startswith("mailto:?bcc=")
        assert "subject=" in body["mailto_url"]
        assert "body=" in body["mailto_url"]
        assert "Join%20us%21" in body["mailto_url"] or "Join+us" in body["mailto_url"] or "Join%20us" in body["mailto_url"]

    def test_bulk_invite_dedupes(self, demo_owner_headers):
        unique = uuid.uuid4().hex[:8]
        email = f"bulk_dup_{unique}@acmebrand.co"
        payload = {"emails": [email], "share_url_base": "https://x.test"}
        r1 = requests.post(f"{BASE_URL}/api/invites/bulk", json=payload, headers=demo_owner_headers)
        assert r1.status_code == 200
        assert r1.json()["recorded"][0]["duplicate"] is False
        # second call → duplicate=True
        r2 = requests.post(f"{BASE_URL}/api/invites/bulk", json=payload, headers=demo_owner_headers)
        assert r2.status_code == 200
        assert r2.json()["recorded"][0]["duplicate"] is True

    def test_bulk_invite_empty_400(self, demo_owner_headers):
        r = requests.post(f"{BASE_URL}/api/invites/bulk", json={"emails": []}, headers=demo_owner_headers)
        assert r.status_code == 400, r.text

    def test_bulk_invite_over_200_400(self, demo_owner_headers):
        emails = [f"x{i}_{uuid.uuid4().hex[:4]}@acmebrand.co" for i in range(201)]
        r = requests.post(f"{BASE_URL}/api/invites/bulk", json={"emails": emails}, headers=demo_owner_headers)
        assert r.status_code == 400

    def test_bulk_invite_forbidden_for_viewer(self, viewer_headers):
        r = requests.post(
            f"{BASE_URL}/api/invites/bulk",
            json={"emails": [f"viewer_test_{uuid.uuid4().hex[:4]}@acmebrand.co"]},
            headers=viewer_headers,
        )
        assert r.status_code == 403


# ---------- TestPendingList ----------

class TestPendingList:
    def test_list_pending_and_cancel(self, demo_owner_headers):
        unique = uuid.uuid4().hex[:8]
        email = f"pending_{unique}@acmebrand.co"
        # create one pending
        rb = requests.post(
            f"{BASE_URL}/api/invites/bulk",
            json={"emails": [email], "share_url_base": "https://x.test"},
            headers=demo_owner_headers,
        )
        assert rb.status_code == 200
        # list and find
        rl = requests.get(f"{BASE_URL}/api/invites", headers=demo_owner_headers)
        assert rl.status_code == 200
        items = rl.json()
        match = [i for i in items if i["email"] == email]
        assert match, f"pending invite {email} not in list"
        invite_id = match[0]["id"]
        # cancel
        rc = requests.delete(f"{BASE_URL}/api/invites/{invite_id}", headers=demo_owner_headers)
        assert rc.status_code == 200
        # confirm gone
        rl2 = requests.get(f"{BASE_URL}/api/invites", headers=demo_owner_headers)
        assert not [i for i in rl2.json() if i["id"] == invite_id]

    def test_list_auto_marks_accepted(self, demo_owner_headers):
        """Create a bulk invite for an email, then create a user with that email via redeem,
        then verify GET /invites flips the row to accepted."""
        unique = uuid.uuid4().hex[:8]
        email = f"auto_acc_{unique}@acmebrand.co"
        # 1) record pending invite
        rb = requests.post(
            f"{BASE_URL}/api/invites/bulk",
            json={"emails": [email], "share_url_base": "https://x.test"},
            headers=demo_owner_headers,
        )
        assert rb.status_code == 200
        # 2) get current active link, redeem to create user
        rl = requests.get(f"{BASE_URL}/api/invites/link", headers=demo_owner_headers)
        token = rl.json()["link"]["token"]
        rr = requests.post(
            f"{BASE_URL}/api/public/invite/redeem",
            json={"token": token, "name": "Auto Acc", "email": email, "password": "Hello@123"},
        )
        assert rr.status_code == 200, rr.text
        # 3) list and ensure that invite is accepted
        rlist = requests.get(f"{BASE_URL}/api/invites", headers=demo_owner_headers)
        match = [i for i in rlist.json() if i["email"] == email]
        assert match
        assert match[0]["status"] == "accepted"


# ---------- TestSuggestions ----------

class TestSuggestions:
    def test_generic_domain_skipped(self, demo_owner_headers):
        # amit@demo.team — demo.team is in the GENERIC set
        r = requests.get(f"{BASE_URL}/api/invites/suggestions", headers=demo_owner_headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["suggestions"] == []
        assert body.get("skipped_reason") == "generic_domain"
        assert body["domain"] == "demo.team"

    def test_corporate_domain_returns_suggestions(self, demo_owner_headers):
        """Create two users on a corporate (non-generic) domain in DIFFERENT workspaces,
        then login as user A and verify user B is suggested."""
        unique = uuid.uuid4().hex[:6]
        domain = f"acme{unique}.com"
        # User A — owner of new workspace via signup
        a_email = f"alice_{unique}@{domain}"
        b_email = f"bob_{unique}@{domain}"
        ra = requests.post(
            f"{BASE_URL}/api/auth/signup",
            json={"name": "Alice", "email": a_email, "password": "Hello@123"},
        )
        rb = requests.post(
            f"{BASE_URL}/api/auth/signup",
            json={"name": "Bob", "email": b_email, "password": "Hello@123"},
        )
        if ra.status_code != 200 or rb.status_code != 200:
            pytest.skip(f"signup failed: {ra.status_code}/{rb.status_code}")
        a_token = ra.json()["token"]
        # login as A → suggestions should include bob
        rs = requests.get(
            f"{BASE_URL}/api/invites/suggestions",
            headers={"Authorization": f"Bearer {a_token}"},
        )
        assert rs.status_code == 200, rs.text
        body = rs.json()
        assert body["domain"] == domain
        emails = [s["real_email"] for s in body["suggestions"]]
        assert b_email in emails, f"expected {b_email} in {emails}"
        bob = [s for s in body["suggestions"] if s["real_email"] == b_email][0]
        assert bob["first_name"] == "Bob"
        assert bob["masked_email"].endswith(domain)
        assert bob["workspace_name"] == "Bob's Workspace"
