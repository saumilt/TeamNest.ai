"""Iteration 120: Phase 1 dual Human | Combined | AI views — backend piece.

Verifies GET /api/chats/{chat_id}/ai-discussions:
  - 200 for a chat member, returns discussions[] with expected fields
  - 404 for non-members
  - Human message sends don't consume AI credits
"""
import os
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
CHAT_ID = "d77a7d2a-b6e9-4923-89cd-54a21880c6a6"  # AIConv Test - Sam is a member
SAM = ("sam@funasia.net", "Perfect$2008")
RAJ = ("raj@demo.team", "Demo@2026")  # different workspace / non-member


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def sam():
    return _login(*SAM)


@pytest.fixture(scope="module")
def raj():
    return _login(*RAJ)


def test_ai_discussions_member_200_and_shape(sam):
    r = sam.get(f"{BASE_URL}/api/chats/{CHAT_ID}/ai-discussions", timeout=20)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert "discussions" in body and isinstance(body["discussions"], list)
    ds = body["discussions"]
    assert len(ds) >= 1, "expected at least 1 discussion on AIConv Test"
    d = ds[0]
    for k in [
        "id", "title", "created_by", "creator_name", "models",
        "question_count", "answer_count", "credits_used", "status",
        "visibility", "updated_at",
    ]:
        assert k in d, f"missing field {k}"
    assert d["visibility"] in ("chat", "private", "workspace")
    assert isinstance(d["models"], list)
    assert isinstance(d["question_count"], int) and d["question_count"] >= 1
    assert isinstance(d["credits_used"], int)


def test_ai_discussions_non_member_404(raj):
    r = raj.get(f"{BASE_URL}/api/chats/{CHAT_ID}/ai-discussions", timeout=15)
    assert r.status_code == 404, f"expected 404 for non-member, got {r.status_code}"


def test_human_message_no_ai_credit_charge(sam):
    """Send a plain human text message and ensure no new AI discussion is
    created and workspace credit balance is unchanged (best-effort)."""
    # Baseline discussions + credit balance
    before = sam.get(f"{BASE_URL}/api/chats/{CHAT_ID}/ai-discussions", timeout=15).json()["discussions"]
    bill_before = sam.get(f"{BASE_URL}/api/billing/me", timeout=15)
    bal_before = None
    if bill_before.status_code == 200:
        j = bill_before.json()
        # Various shapes across iterations — pick whichever is present.
        bal_before = (j.get("usage") or {}).get("credit_balance")
        if bal_before is None:
            bal_before = j.get("credit_balance")

    r = sam.post(
        f"{BASE_URL}/api/chats/{CHAT_ID}/messages",
        json={"message_type": "text", "body": "TEST_HUMAN_PING_iter120", "metadata": {}},
        timeout=20,
    )
    assert r.status_code in (200, 201), r.text[:200]

    after = sam.get(f"{BASE_URL}/api/chats/{CHAT_ID}/ai-discussions", timeout=15).json()["discussions"]
    assert len(after) == len(before), "human message must NOT create an AI discussion"

    if bal_before is not None:
        bill_after = sam.get(f"{BASE_URL}/api/billing/me", timeout=15).json()
        bal_after = (bill_after.get("usage") or {}).get("credit_balance", bill_after.get("credit_balance"))
        if bal_after is not None:
            assert bal_after == bal_before, f"credits should be unchanged (was {bal_before}, now {bal_after})"


def test_ai_discussions_404_for_bogus_chat(sam):
    r = sam.get(f"{BASE_URL}/api/chats/does-not-exist-xyz/ai-discussions", timeout=15)
    assert r.status_code == 404
