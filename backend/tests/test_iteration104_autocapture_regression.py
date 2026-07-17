"""Iteration 104 regression: approval decision must still return 200 with the
new fire-and-forget auto-capture in place. Auto-capture is best-effort and must
never break the approval flow."""
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")
OWNER_EMAIL = "sam@funasia.net"
OWNER_PW = "Perfect$2008"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PW}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


def _make_thread(sess):
    # Reuse an existing research thread (avoids consuming AI credits).
    r = sess.get(f"{BASE_URL}/api/ai/threads", timeout=15)
    assert r.status_code == 200, r.text[:300]
    items = r.json() if isinstance(r.json(), list) else r.json().get("threads", [])
    assert items, "No existing ai/threads to reuse — seed one manually first"
    return items[0]["id"]


def test_owner_login(sess):
    r = sess.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == OWNER_EMAIL


def test_approval_decision_still_200_with_autocapture(sess):
    tid = _make_thread(sess)
    # Create an approval (draft — no reviewers). Owner may still decide because
    # role owner/admin bypass reviewer_ids check.
    cr = sess.post(f"{BASE_URL}/api/approvals", json={
        "research_thread_id": tid,
        "title": "TEST_autocapture_regression_iter104",
        "final_answer": "This is the approved final answer used to verify the "
                        "approval decision endpoint still returns 200 after adding "
                        "the fire-and-forget auto-capture hook. The process here is: "
                        "when a vendor invoice is disputed, the finance lead files a "
                        "credit-memo request within 3 business days.",
        "reviewer_ids": [],
    }, timeout=20)
    assert cr.status_code == 200, cr.text[:300]
    ap = cr.json()
    aid = ap["id"]

    # Approve. Should return 200. auto-capture is fire-and-forget.
    dec = sess.post(f"{BASE_URL}/api/approvals/{aid}/decision",
                    json={"status": "approved", "comment": "iter104 regression"}, timeout=25)
    assert dec.status_code == 200, dec.text[:300]
    body = dec.json()
    assert body["status"] == "approved"
    assert body["locked"] is True
    assert body["approved_by"] is not None

    # Give the background task a moment (best-effort — should NOT block the response).
    time.sleep(1.0)


def test_approval_decision_reject_still_200(sess):
    tid = _make_thread(sess)
    cr = sess.post(f"{BASE_URL}/api/approvals", json={
        "research_thread_id": tid,
        "title": "TEST_autocapture_reject_iter104",
        "final_answer": "Reject path — auto-capture should not fire on reject.",
        "reviewer_ids": [],
    }, timeout=20)
    assert cr.status_code == 200
    aid = cr.json()["id"]

    dec = sess.post(f"{BASE_URL}/api/approvals/{aid}/decision",
                    json={"status": "rejected", "comment": "no"}, timeout=15)
    assert dec.status_code == 200
    assert dec.json()["status"] == "rejected"


def test_sam_not_enterprise_employee_no_capture(sess):
    """Sam is the owner but not seeded as an enterprise employee, so
    auto-capture should no-op for his approvals. We approve one and then
    confirm no new proposed memory shows up sourced from this approval."""
    tid = _make_thread(sess)
    cr = sess.post(f"{BASE_URL}/api/approvals", json={
        "research_thread_id": tid,
        "title": "TEST_sam_owner_no_capture_iter104",
        "final_answer": "Owner-created approval; sam is not an enterprise employee, "
                        "so auto-capture should be a no-op.",
        "reviewer_ids": [],
    }, timeout=20)
    aid = cr.json()["id"]
    dec = sess.post(f"{BASE_URL}/api/approvals/{aid}/decision",
                    json={"status": "approved"}, timeout=20)
    assert dec.status_code == 200

    time.sleep(1.5)
    # Poll the review queue — no memory should have source_id == aid.
    rv = sess.get(f"{BASE_URL}/api/enterprise/memories/review", timeout=15)
    assert rv.status_code == 200
    memories = rv.json().get("memories", [])
    matched = [m for m in memories if m.get("source_id") == aid]
    assert matched == [], f"Expected no auto-capture for sam, got: {matched}"
