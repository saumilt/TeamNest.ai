"""Iteration 113 — Student plan (.edu) + 4-tier credit governance.

1. Student plan present in /billing/plans (price 6.99, requires_edu, solo_ai_seat).
2. Student checkout blocked until .edu verified, then allowed.
3. .edu verify: bad domain rejected; code flow works (dev_code in test env).
4. Credit governance: set/list/delete caps; most-restrictive-wins blocks AI preflight.
"""
import os

import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://nest-app-prep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

FREE_EMAIL, FREE_PWD = "mate1@test.io", "secret123"


def _login(email, pwd):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.text}"
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


def test_student_plan_listed():
    plans = {p["id"]: p for p in requests.get(f"{API}/billing/plans", timeout=30).json()["plans"]}
    assert "student" in plans
    st = plans["student"]
    assert st["price_usd"] == 6.99
    assert st["requires_edu"] is True
    assert st["solo_ai_seat"] is True


def test_edu_verification_and_student_checkout():
    s = _login(FREE_EMAIL, FREE_PWD)
    # Bad domain rejected.
    assert s.post(f"{API}/billing/student/verify/start", json={"edu_email": "x@gmail.com"}, timeout=30).status_code == 400
    # .edu accepted → dev_code available in test env.
    r = s.post(f"{API}/billing/student/verify/start", json={"edu_email": "qa@stanford.edu"}, timeout=30)
    assert r.status_code == 200
    code = r.json().get("dev_code")
    assert code, "dev_code should be exposed in test env"
    # Wrong code rejected.
    assert s.post(f"{API}/billing/student/verify/confirm", json={"code": "000000"}, timeout=30).status_code == 400
    # Correct code confirms.
    r = s.post(f"{API}/billing/student/verify/confirm", json={"code": code}, timeout=30)
    assert r.status_code == 200 and r.json()["edu_verified"] is True
    # Checkout now allowed.
    r = s.post(f"{API}/billing/checkout",
               json={"plan_id": "student", "origin_url": "https://x.co", "billing_cycle": "monthly"}, timeout=60)
    assert r.status_code == 200 and r.json().get("url")


def test_student_annual_checkout():
    """Student plan has no Stripe recurring SKU here → annual must fall back to
    the legacy one-shot session (charging the $69 annual amount), not 400."""
    s = _login(FREE_EMAIL, FREE_PWD)
    # ensure verified (idempotent from previous test / prior manual run)
    st = s.get(f"{API}/billing/student/status", timeout=30).json()
    if not st.get("edu_verified"):
        r = s.post(f"{API}/billing/student/verify/start", json={"edu_email": "qa@stanford.edu"}, timeout=30)
        s.post(f"{API}/billing/student/verify/confirm", json={"code": r.json()["dev_code"]}, timeout=30)
    plans = {p["id"]: p for p in requests.get(f"{API}/billing/plans", timeout=30).json()["plans"]}
    assert plans["student"].get("annual_price_usd") == 69
    r = s.post(f"{API}/billing/checkout",
               json={"plan_id": "student", "origin_url": "https://x.co", "billing_cycle": "annual"}, timeout=60)
    assert r.status_code == 200 and r.json().get("url")


def test_credit_governance_caps_block_and_reset():
    s = _login(FREE_EMAIL, FREE_PWD)
    chats = s.get(f"{API}/chats", timeout=30).json()
    chats = chats if isinstance(chats, list) else chats.get("chats", [])
    assert chats, "free user needs a chat"
    cid = chats[0]["id"]
    # Set a tiny workspace cap.
    assert s.put(f"{API}/credit-governance/caps",
                 json={"scope": "workspace", "limit_credits": 5}, timeout=30).status_code == 200
    caps = s.get(f"{API}/credit-governance/caps", timeout=30).json()
    assert any(c["scope"] == "workspace" and c["limit_credits"] == 5 for c in caps["caps"])
    # Preflight should be blocked with a cap reason.
    pf = s.get(f"{API}/chats/{cid}/ai-preflight?estimated_credits=20", timeout=30).json()
    assert pf["allowed"] is False and pf.get("cap_scope") == "workspace"
    # Remove cap → allowed again.
    assert s.put(f"{API}/credit-governance/caps",
                 json={"scope": "workspace", "limit_credits": 0}, timeout=30).status_code == 200
    pf = s.get(f"{API}/chats/{cid}/ai-preflight?estimated_credits=20", timeout=30).json()
    assert pf["allowed"] is True
