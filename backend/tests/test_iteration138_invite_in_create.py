"""Iteration 138: verify POST /workspace/invite used by NewChatDialog's
"Invite someone new" row. Covers new-email invite, existing-email add,
and non-admin 403.
"""
import os
import time
import requests

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


def test_invite_new_email_returns_public_fields():
    s = _login("sam@funasia.net", os.environ.get("SUPERADMIN_TEST_PASSWORD", ""))
    ts = int(time.time())
    email = f"qa+{ts}@example.com"
    r = s.post(f"{BASE_URL}/workspace/invite",
               json={"name": "QA New", "email": email, "role": "member"})
    assert r.status_code == 200, r.text
    data = r.json()
    # Public fields expected by NewChatDialog
    assert data.get("id"), data
    assert data.get("email") == email
    assert data.get("name") == "QA New"
    # Should NOT expose password_hash / _id
    assert "password_hash" not in data
    assert "_id" not in data
    # Verify the invitee now appears in workspace/members
    r2 = s.get(f"{BASE_URL}/workspace/members")
    assert r2.status_code == 200
    assert any(m["id"] == data["id"] for m in r2.json()), "invited user missing from members list"


def test_invite_existing_email_flags_added_to_existing_user():
    s = _login("sam@funasia.net", os.environ.get("SUPERADMIN_TEST_PASSWORD", ""))
    # priya@demo.team belongs to a different workspace (demo). Inviting her should
    # attach her to sam's workspace with added_to_existing_user=True (or if she
    # is already in sam's workspace, we accept a 400 as valid state).
    r = s.post(f"{BASE_URL}/workspace/invite",
               json={"name": "Priya", "email": "priya@demo.team", "role": "member"})
    if r.status_code == 400 and "already a member" in r.text.lower():
        return  # already added from a prior run — that's fine
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("added_to_existing_user") is True
    assert data.get("email") == "priya@demo.team"


def test_invite_forbidden_for_member_role():
    s = _login("raj@demo.team", "Demo@2026")
    r = s.post(f"{BASE_URL}/workspace/invite",
               json={"name": "X", "email": f"blocked+{int(time.time())}@example.com",
                     "role": "member"})
    assert r.status_code == 403, r.text
