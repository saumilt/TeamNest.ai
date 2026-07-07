"""Iteration 10 — Referral incentive on top of Find-Your-Friends v1.

Covers:
  - public_user() exposes referral_count, referral_badge, pro_boost_until, pro_boost_active
  - POST /api/public/invite/redeem sets joiner pro_boost + inviter referral_count increment
  - GET /api/auth/me reflects changes for BOTH inviter and joiner
  - GET /api/me/referrals (count/badge/progress/boost/referrals list)
  - Progress next_badge boundaries: 0→bronze, 1→silver, 5→gold, 15→platinum, 50→null
  - GET /api/leaderboard/referrals scope=workspace / scope=global
  - Inviter does NOT get Pro Boost (only joiner does)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# --- helpers / fixtures ----------------------------------------------------
@pytest.fixture(scope="module")
def amit_token():
    r = requests.post(f"{API}/auth/demo-login", timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def amit_me(amit_token):
    r = requests.get(f"{API}/auth/me", headers=_auth(amit_token), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def active_link(amit_token):
    """Owner generates / fetches an active invite link."""
    r = requests.get(f"{API}/invites/link", headers=_auth(amit_token), timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    link = body.get("link")
    if not link or not link.get("token"):
        # rotate to create one
        r2 = requests.post(
            f"{API}/invites/link/rotate",
            headers=_auth(amit_token),
            json={"role": "member"},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        link = r2.json()["link"]
    assert link and "token" in link, link
    return link


def _unique_email(prefix="test_ref10"):
    return f"{prefix}_{uuid.uuid4().hex[:10]}@acmebrand.co"


# --- public_user fields ----------------------------------------------------
class TestPublicUserFields:
    def test_me_has_referral_fields(self, amit_me):
        for k in ("referral_count", "referral_badge", "pro_boost_until", "pro_boost_active"):
            assert k in amit_me, f"public_user missing {k}"
        assert isinstance(amit_me["referral_count"], int)
        assert isinstance(amit_me["pro_boost_active"], bool)
        # Owner who didn't join via referral should not have pro boost
        assert amit_me["pro_boost_active"] is False


# --- redeem flow (joiner + inviter side-effects) ---------------------------
class TestRedeemFlow:
    def test_redeem_grants_boost_and_increments_inviter(self, amit_token, amit_me, active_link):
        before_count = int(amit_me.get("referral_count") or 0)

        joiner_email = _unique_email("joiner")
        payload = {
            "token": active_link["token"],
            "name": "Iter10 Joiner",
            "email": joiner_email,
            "password": "JoinPass@2026",
        }
        r = requests.post(
            f"{API}/public/invite/redeem",
            json=payload,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and "user" in body
        joiner_pub = body["user"]

        # Joiner side: 14-day pro boost active, referral_count == 0
        assert joiner_pub["pro_boost_active"] is True, joiner_pub
        assert joiner_pub["pro_boost_until"], joiner_pub
        assert joiner_pub["referral_count"] == 0
        assert joiner_pub["referral_badge"] is None

        # GET /auth/me for joiner — re-fetch from DB
        joiner_tok = body["token"]
        r2 = requests.get(f"{API}/auth/me", headers=_auth(joiner_tok), timeout=15)
        assert r2.status_code == 200
        jme = r2.json()
        assert jme["pro_boost_active"] is True
        assert jme["referral_count"] == 0

        # Save joiner email for next test (workspace match)
        TestRedeemFlow.joiner_email = joiner_email
        TestRedeemFlow.joiner_tok = joiner_tok
        TestRedeemFlow.before_count = before_count

        # GET /auth/me for inviter — referral_count increased by exactly 1
        r3 = requests.get(f"{API}/auth/me", headers=_auth(amit_token), timeout=15)
        assert r3.status_code == 200
        ime = r3.json()
        assert ime["referral_count"] == before_count + 1, (before_count, ime["referral_count"])
        # Inviter should NOT have pro boost (only joiner does)
        assert ime["pro_boost_active"] is False
        # Badge should reflect new count
        expected_badge = (
            "platinum" if ime["referral_count"] >= 50
            else "gold" if ime["referral_count"] >= 15
            else "silver" if ime["referral_count"] >= 5
            else "bronze" if ime["referral_count"] >= 1
            else None
        )
        assert ime["referral_badge"] == expected_badge


# --- /api/me/referrals -----------------------------------------------------
class TestMyReferrals:
    def test_inviter_referrals_payload(self, amit_token):
        r = requests.get(f"{API}/me/referrals", headers=_auth(amit_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # shape
        for k in ("referral_count", "badge", "progress", "pro_boost_until",
                  "pro_boost_active", "pro_boost_source", "referrals"):
            assert k in data, f"missing {k}"
        # progress shape
        for k in ("next_badge", "remaining", "threshold"):
            assert k in data["progress"]
        # referrals contains recent joiner
        emails = [r_["email"] for r_ in data["referrals"]]
        assert TestRedeemFlow.joiner_email in emails, emails
        # each referral row has required keys
        row = next(x for x in data["referrals"] if x["email"] == TestRedeemFlow.joiner_email)
        for k in ("id", "name", "email", "joined_at"):
            assert k in row
        # inviter has NO boost
        assert data["pro_boost_active"] is False

    def test_joiner_referrals_payload_shows_boost(self):
        tok = TestRedeemFlow.joiner_tok
        r = requests.get(f"{API}/me/referrals", headers=_auth(tok), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["pro_boost_active"] is True
        assert data["pro_boost_source"] == "referral"
        assert data["referral_count"] == 0
        assert data["referrals"] == []  # joiner hasn't invited anyone
        # progress: count=0 → next bronze, remaining=1
        assert data["progress"]["next_badge"] == "bronze"
        assert data["progress"]["remaining"] == 1


# --- progress boundary unit tests via helper ------------------------------
class TestProgressBoundaries:
    """Hit boundaries via the same code path used by the endpoint."""

    @pytest.mark.parametrize("count,expected_next,expected_remaining", [
        (0, "bronze", 1),
        (1, "silver", 4),
        (4, "silver", 1),
        (5, "gold", 10),
        (14, "gold", 1),
        (15, "platinum", 35),
        (49, "platinum", 1),
        (50, None, 0),
        (100, None, 0),
    ])
    def test_next_badge_boundaries(self, count, expected_next, expected_remaining):
        # import the helper directly
        import sys
        sys.path.insert(0, "/app/backend")
        from server import _next_badge
        prog = _next_badge(count)
        assert prog["next_badge"] == expected_next, (count, prog)
        assert prog["remaining"] == expected_remaining, (count, prog)

    @pytest.mark.parametrize("count,badge", [
        (0, None), (1, "bronze"), (4, "bronze"),
        (5, "silver"), (14, "silver"),
        (15, "gold"), (49, "gold"),
        (50, "platinum"), (500, "platinum"),
    ])
    def test_badge_tiers(self, count, badge):
        import sys
        sys.path.insert(0, "/app/backend")
        from server import _referral_badge
        assert _referral_badge(count) == badge


# --- /api/leaderboard/referrals -------------------------------------------
class TestLeaderboard:
    def test_workspace_scope(self, amit_token, amit_me):
        r = requests.get(
            f"{API}/leaderboard/referrals",
            params={"scope": "workspace"},
            headers=_auth(amit_token),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["scope"] == "workspace"
        leaders = data["leaders"]
        assert isinstance(leaders, list)
        assert len(leaders) >= 1, "Amit should appear since he just got +1"
        # rows shape
        for L in leaders:
            for k in ("id", "name", "avatar", "referral_count", "badge", "is_me"):
                assert k in L
        # Amit shows is_me=True
        me_rows = [L for L in leaders if L["is_me"]]
        assert len(me_rows) == 1
        assert me_rows[0]["id"] == amit_me["id"]
        # Sorted descending
        counts = [L["referral_count"] for L in leaders]
        assert counts == sorted(counts, reverse=True), counts

    def test_global_scope(self, amit_token):
        r = requests.get(
            f"{API}/leaderboard/referrals",
            params={"scope": "global"},
            headers=_auth(amit_token),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["scope"] == "global"
        assert isinstance(data["leaders"], list)
        # global must be >= workspace
        rw = requests.get(
            f"{API}/leaderboard/referrals",
            params={"scope": "workspace"},
            headers=_auth(amit_token),
            timeout=15,
        ).json()
        assert len(data["leaders"]) >= len(rw["leaders"])

    def test_limit_cap(self, amit_token):
        r = requests.get(
            f"{API}/leaderboard/referrals",
            params={"scope": "global", "limit": 9999},
            headers=_auth(amit_token),
            timeout=15,
        )
        assert r.status_code == 200
        assert len(r.json()["leaders"]) <= 50

    def test_default_limit_is_10(self, amit_token):
        r = requests.get(
            f"{API}/leaderboard/referrals",
            params={"scope": "global"},
            headers=_auth(amit_token),
            timeout=15,
        )
        assert r.status_code == 200
        assert len(r.json()["leaders"]) <= 10


# --- regression: link redeem still works for users without referral fields
class TestNoRegression:
    def test_invite_link_still_returns_token(self, active_link):
        assert active_link["token"]
        # share_url is part of /invite-link spec from iter9
        # don't fail if absent, just ensure token exists
