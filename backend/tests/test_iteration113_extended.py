"""Iteration 113 EXTENDED — member 403 checks + DELETE cap + pre-verify checkout gate."""
import os
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://nest-app-prep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MEMBER_EMAIL, MEMBER_PWD = "raj@demo.team", os.environ.get("DEMO_PASSWORD", "DemoPass123!")
OWNER_EMAIL, OWNER_PWD = "amit@demo.team", os.environ.get("DEMO_PASSWORD", "DemoPass123!")
FREE_EMAIL, FREE_PWD = "mate1@test.io", os.environ.get("TEST_PASSWORD", "TestPass123!")


def _login(email, pwd):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.text}"
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


# credit-governance: member 403 (list + set)
def test_member_cannot_access_governance():
    s = _login(MEMBER_EMAIL, MEMBER_PWD)
    r = s.get(f"{API}/credit-governance/caps", timeout=30)
    assert r.status_code == 403, f"expected 403 for member, got {r.status_code}: {r.text}"
    r = s.put(f"{API}/credit-governance/caps",
              json={"scope": "workspace", "limit_credits": 5}, timeout=30)
    assert r.status_code == 403


# credit-governance: owner/admin (demo super admin) can list + set + delete
def test_owner_can_crud_caps_including_delete():
    s = _login(OWNER_EMAIL, OWNER_PWD)
    # Set user-scope cap on self
    me = s.get(f"{API}/auth/me", timeout=30).json()
    uid = me["user"]["id"] if "user" in me else me["id"]
    ws = me["user"]["workspace_id"] if "user" in me else me["workspace_id"]
    r = s.put(f"{API}/credit-governance/caps",
              json={"scope": "user", "scope_id": uid, "limit_credits": 100}, timeout=30)
    assert r.status_code == 200
    # List
    r = s.get(f"{API}/credit-governance/caps", timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert "caps" in body and "members" in body and "chats" in body and "scopes" in body
    assert any(c["scope"] == "user" and c["scope_id"] == uid for c in body["caps"])
    # DELETE endpoint
    r = s.delete(f"{API}/credit-governance/caps/user/{uid}", timeout=30)
    assert r.status_code == 200 and r.json().get("removed") is True
    # Verify gone
    caps = s.get(f"{API}/credit-governance/caps", timeout=30).json()["caps"]
    assert not any(c["scope"] == "user" and c["scope_id"] == uid for c in caps)


# Student checkout gated BEFORE .edu verification for a user with no edu_verified
def test_student_checkout_blocked_before_edu_for_fresh_user():
    """Use a signup with a random new user to test the pre-verify block."""
    import uuid
    email = f"stud_{uuid.uuid4().hex[:8]}@test.io"
    pwd = "Secret$2026"
    s = requests.Session()
    r = s.post(f"{API}/auth/signup",
               json={"email": email, "password": pwd, "name": "Stud Test", "workspace_name": "StudWS"},
               timeout=30)
    if r.status_code not in (200, 201):
        import pytest
        pytest.skip(f"signup unavailable: {r.status_code} {r.text[:200]}")
    tok = r.json().get("token")
    if not tok:
        # login instead
        r2 = s.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=30)
        tok = r2.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    # Attempt checkout — should be 403 edu_verification_required
    r = s.post(f"{API}/billing/checkout",
               json={"plan_id": "student", "origin_url": "https://x.co", "billing_cycle": "monthly"},
               timeout=30)
    assert r.status_code == 403, f"expected 403 pre-verify, got {r.status_code}: {r.text}"
    assert "edu_verification_required" in (r.json().get("detail") or "").lower() or \
           "edu" in (r.json().get("detail") or "").lower()
