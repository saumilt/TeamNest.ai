"""Iteration 85 — Invite-only launch system e2e."""
import os
import time
import uuid

import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://nest-app-prep.preview.emergentagent.com"
API = f"{BASE}/api"

TS = int(time.time())


def _u(prefix="qa"):
    return f"{prefix}-{TS}-{uuid.uuid4().hex[:6]}@test.io"


# ─── Shared admin session ────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "amit@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")})
    assert r.status_code == 200, r.text
    return s


# ─── A. launch/config ────────────────────────────────────────────────────────
def test_launch_config_invite_only():
    r = requests.get(f"{API}/launch/config")
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["mode"] == "invite_only"
    assert j["allow_open_signup"] is False


# ─── B. signup 403 invite_required ───────────────────────────────────────────
def test_signup_gated_invite_required():
    r = requests.post(f"{API}/auth/signup", json={
        "name": "QA New", "email": _u("qa-new"), "password": os.environ.get("TEST_PASSWORD", "TestPass123!")})
    assert r.status_code == 403, r.text
    body = r.json()
    detail = body.get("detail") or body.get("message") or ""
    assert "invite_required" in str(detail).lower() or "invite" in str(detail).lower(), body


# ─── C. Waitlist + referral flow ─────────────────────────────────────────────
def test_waitlist_join_and_referral():
    email_a = _u("wla")
    r = requests.post(f"{API}/launch/waitlist", json={
        "name": "Alice Waitlister", "email": email_a, "company": "Acme",
        "role": "Founder", "company_size": "1-10", "use_case": "demo",
        "interest_area": "dev_os", "build_answer": "x"})
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["already_joined"] is False
    ref_code = a["referral_code"]
    rank_a_initial = a["rank"]
    assert isinstance(rank_a_initial, int) and rank_a_initial >= 1
    assert a["referral_link"].startswith("/waitlist?ref=")
    assert isinstance(a["milestones"], list) and len(a["milestones"]) >= 5

    # duplicate email → already_joined true, same rank
    r2 = requests.post(f"{API}/launch/waitlist", json={
        "name": "Alice Dup", "email": email_a})
    assert r2.status_code == 200
    d = r2.json()
    assert d["already_joined"] is True
    assert d["rank"] == rank_a_initial

    # status endpoint
    r3 = requests.get(f"{API}/launch/waitlist/status", params={"email": email_a})
    assert r3.status_code == 200
    assert r3.json()["referral_code"] == ref_code

    # Referral: user B with ref=A → A should drop by ~50 spots
    email_b = _u("wlb")
    rb = requests.post(f"{API}/launch/waitlist", json={
        "name": "Bob Referred", "email": email_b, "ref": ref_code})
    assert rb.status_code == 200

    r4 = requests.get(f"{API}/launch/waitlist/status", params={"email": email_a})
    assert r4.status_code == 200
    a_after = r4.json()
    assert a_after["referral_count"] == 1
    # Rank should have moved up (numerically lower)
    assert a_after["rank"] < rank_a_initial, f"A rank did not drop: before={rank_a_initial} after={a_after['rank']}"
    assert (rank_a_initial - a_after["rank"]) >= 40  # ~50 spot boost


# ─── D. Code validation states ───────────────────────────────────────────────
def test_code_states():
    # invalid
    r = requests.get(f"{API}/launch/code/BADCODE1")
    assert r.status_code == 200
    assert r.json()["state"] == "invalid"

    # valid (lowercase input should be normalized)
    r = requests.get(f"{API}/launch/code/foundr25")
    assert r.status_code == 200
    j = r.json()
    assert j["state"] == "valid"
    assert j["access_level"] == "founder_beta"


# ─── E. Code redemption + gating check (all-in-one)  ────────────────────────
_redeem_state = {}


def test_redeem_devos100_new_account():
    sess = requests.Session()
    email = _u("qa-redeem")
    r = sess.post(f"{API}/launch/code/redeem", json={
        "code": "devos100",  # lowercase, should normalize
        "name": "QA Redeemer",
        "email": email,
        "password": os.environ.get("TEST_PASSWORD", "TestPass123!"),
        "company": "TestCo",
    })
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("token")
    assert j["access_level"] == "dev_os_demo"
    assert j["invites_granted"] >= 1
    _redeem_state["sess"] = sess
    _redeem_state["email"] = email
    _redeem_state["invites_granted"] = j["invites_granted"]

    # redeem same email again → 400
    r2 = requests.post(f"{API}/launch/code/redeem", json={
        "code": "DEVOS100", "name": "Dup", "email": email, "password": os.environ.get("TEST_PASSWORD", "TestPass123!")})
    assert r2.status_code == 400, r2.text


def test_my_invites_shows_personal_codes():
    sess = _redeem_state.get("sess")
    if not sess:
        pytest.skip("Previous redemption failed")
    r = sess.get(f"{API}/launch/my-invites")
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["remaining"] >= 1
    assert isinstance(j["invites"], list) and len(j["invites"]) >= 1
    personal_code = j["invites"][0]["invite_code"]
    assert personal_code.startswith("TN")
    _redeem_state["personal_code"] = personal_code


def test_personal_code_redeem_and_team_multiplier():
    personal_code = _redeem_state.get("personal_code")
    if not personal_code:
        pytest.skip("Personal code not created")
    friend_sess = requests.Session()
    friend_email = _u("qa-friend")
    r = friend_sess.post(f"{API}/launch/code/redeem", json={
        "code": personal_code, "name": "Friend One", "email": friend_email, "password": os.environ.get("TEST_PASSWORD", "TestPass123!")})
    assert r.status_code == 200, r.text

    # Inviter my-invites → accepted count +1, next_unlock returned
    inv_sess = _redeem_state["sess"]
    r2 = inv_sess.get(f"{API}/launch/my-invites")
    assert r2.status_code == 200
    j = r2.json()
    assert j["accepted"] >= 1
    assert j["next_unlock"] is not None
    assert "joins" in j["next_unlock"] and "unlock" in j["next_unlock"]


# ─── F. Checkout gating ─────────────────────────────────────────────────────
def test_invited_user_checkout_not_launch_gated():
    sess = _redeem_state.get("sess")
    if not sess:
        pytest.skip("Redemption failed")
    r = sess.post(f"{API}/billing/checkout", json={
        "plan_id": "pro", "origin_url": "https://teamnest.ai"})
    # must NOT be 403 launch_gated. Any other error is fine.
    if r.status_code == 403:
        body = str(r.json()).lower()
        assert "launch_gated" not in body, body


def test_waitlist_status_user_checkout_gated():
    """Create a user via redemption then flip their launch_access.status to waitlist."""
    # Redeem another user
    sess = requests.Session()
    email = _u("qa-waited")
    r = sess.post(f"{API}/launch/code/redeem", json={
        "code": "DEVOS100", "name": "QA Wait", "email": email, "password": os.environ.get("TEST_PASSWORD", "TestPass123!")})
    if r.status_code != 200:
        pytest.skip(f"could not create user: {r.text}")

    # Mongo-flip via admin: we can't do it via API; use direct mongo through admin grant-invites? no.
    # Use pymongo directly.
    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    dbn = os.environ.get("DB_NAME", "test_database")
    mc[dbn].users.update_one({"email": email}, {"$set": {"launch_access.status": "waitlist"}})

    r2 = sess.post(f"{API}/billing/checkout", json={
        "plan_id": "pro", "origin_url": "https://teamnest.ai"})
    assert r2.status_code == 403, r2.text
    body = str(r2.json()).lower()
    assert "launch_gated" in body, body


# ─── G. Drop + leaderboard ──────────────────────────────────────────────────
def test_drop_devos100():
    r = requests.get(f"{API}/launch/drop/DEVOS100")
    assert r.status_code == 200
    j = r.json()
    assert j["code"] == "DEVOS100"
    assert "title" in j
    assert "remaining" in j
    assert "expires_at" in j


def test_leaderboard_masks_names():
    r = requests.get(f"{API}/launch/leaderboard")
    assert r.status_code == 200
    leaders = r.json()["leaders"]
    assert isinstance(leaders, list)
    if leaders:
        # first name + initial only
        name = leaders[0]["name"]
        parts = name.split()
        if len(parts) > 1:
            assert parts[1].endswith(".") and len(parts[1]) <= 3, f"name not masked: {name!r}"


# ─── H. Admin endpoints ─────────────────────────────────────────────────────
def test_admin_waitlist_list(admin_sess):
    r = admin_sess.get(f"{API}/launch/admin/waitlist", params={"limit": 50})
    assert r.status_code == 200, r.text
    j = r.json()
    assert "users" in j and "total_waitlist" in j

    # search
    r2 = admin_sess.get(f"{API}/launch/admin/waitlist", params={"q": f"qa-{TS}"})
    assert r2.status_code == 200


_admin_state = {}


def test_admin_approve_waitlist(admin_sess):
    # Create a fresh waitlist entry to approve
    email = _u("qa-approve")
    requests.post(f"{API}/launch/waitlist", json={"name": "Approve Me", "email": email})
    lst = admin_sess.get(f"{API}/launch/admin/waitlist", params={"q": email}).json()
    assert lst["users"], "waitlist user not found"
    wu_id = lst["users"][0]["id"]

    r = admin_sess.post(
        f"{API}/launch/admin/waitlist/{wu_id}/approve",
        json={"access_level": "demo", "invites": 4})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("ok") is True
    assert j.get("code")
    _admin_state["approve_code"] = j["code"]


def test_admin_generate_codes(admin_sess):
    r = admin_sess.post(f"{API}/launch/admin/codes/generate", json={
        "campaign_name": f"TEST_iter85_{TS}",
        "campaign_type": "social_media_drop",
        "code_prefix": "QA",
        "code_length": 8,
        "count": 3,
        "access_level": "demo",
        "invites_granted": 4,
    })
    assert r.status_code == 200, r.text
    j = r.json()
    assert len(j["codes"]) == 3


def test_admin_create_drop(admin_sess):
    code = f"QADROP{TS % 100000}"
    r = admin_sess.post(f"{API}/launch/admin/drops", json={
        "code": code,
        "title": f"TEST drop {TS}",
        "description": "e2e drop test",
        "max_uses": 50,
        "expires_hours": 24,
        "access_level": "dev_os_demo",
    })
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["ok"] is True
    assert j["drop_url"].endswith(code)


def test_admin_grant_invites(admin_sess):
    r = admin_sess.post(f"{API}/launch/admin/users/grant-invites", json={
        "email": "amit@demo.team", "count": 2, "message": "TEST iter85 grant"})
    assert r.status_code == 200


def test_admin_analytics(admin_sess):
    r = admin_sess.get(f"{API}/launch/admin/analytics")
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("waitlist_users", "code_redemptions", "referrals", "active_codes"):
        assert k in j


def test_admin_emails_preview(admin_sess):
    r = admin_sess.get(f"{API}/launch/admin/emails", params={"limit": 20})
    assert r.status_code == 200
    j = r.json()
    assert "emails" in j


def test_admin_waitlist_export_csv(admin_sess):
    r = admin_sess.get(f"{API}/launch/admin/waitlist/export")
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("Content-Type", "").lower()
    assert "email" in r.text.split("\n")[0].lower()


# ─── I. Settings mode switch (invite_only → open → invite_only) ─────────────
def test_admin_settings_mode_switch_and_restore(admin_sess):
    # Get current
    r0 = admin_sess.get(f"{API}/launch/admin/settings")
    assert r0.status_code == 200

    # Switch to open
    r1 = admin_sess.put(f"{API}/launch/admin/settings", json={"mode": "open", "allow_open_signup": True})
    assert r1.status_code == 200, r1.text
    assert r1.json()["mode"] == "open"

    # Now signup should work
    time.sleep(0.3)
    email = _u("qa-open-signup")
    rs = requests.post(f"{API}/auth/signup", json={
        "name": "Open QA", "email": email, "password": os.environ.get("TEST_PASSWORD", "TestPass123!")})
    open_signup_ok = rs.status_code in (200, 201)

    # ALWAYS restore
    r2 = admin_sess.put(f"{API}/launch/admin/settings",
                        json={"mode": "invite_only", "allow_open_signup": False})
    assert r2.status_code == 200
    assert r2.json()["mode"] == "invite_only"

    assert open_signup_ok, f"signup in open mode failed: {rs.status_code} {rs.text}"

    # Confirm gate re-enabled
    time.sleep(0.3)
    rs2 = requests.post(f"{API}/auth/signup", json={
        "name": "gated again", "email": _u("qa-gate2"), "password": os.environ.get("TEST_PASSWORD", "TestPass123!")})
    assert rs2.status_code == 403
