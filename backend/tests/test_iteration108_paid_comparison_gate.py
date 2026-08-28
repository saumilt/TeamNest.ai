"""Iteration 108: verify multi-model AI comparison is a PAID feature.

Gates under test:
  * GET /api/billing/usage and /api/billing/me include comparison_allowed
    (True for unlimited/paid, False for free non-unlimited).
  * POST /api/ai/research by a FREE user with N>1 selected_models must CAP
    to a single model (thread.selected_models length == 1) but STILL return
    a synthesized answer.
  * POST /api/ai/research/{thread_id}/run-models by a FREE user must return
    HTTP 402 with detail.code == "comparison_paid_only".
  * The same run-models call by an UNLIMITED user must succeed (200) and add
    the extra model(s) to thread.selected_models.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com"
).rstrip("/")

# Credentials from /app/memory/test_credentials.md
FREE_EMAIL = "mate1@test.io"
FREE_PASSWORD = "secret123"
UNLIMITED_EMAIL = "sam@funasia.net"
UNLIMITED_PASSWORD = os.environ.get("SUPERADMIN_TEST_PASSWORD", "")


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
    # token may come as cookie (tn_session) or in json; capture both.
    data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def free_session():
    return _login(FREE_EMAIL, FREE_PASSWORD)


@pytest.fixture(scope="module")
def unlimited_session():
    return _login(UNLIMITED_EMAIL, UNLIMITED_PASSWORD)


def _get_or_create_chat(session: requests.Session, tag: str) -> str:
    """Create a temporary DM/group chat to exercise /ai/research within."""
    # Prefer to reuse an existing chat this user is a member of.
    r = session.get(f"{BASE_URL}/api/chats", timeout=20)
    if r.status_code == 200:
        for c in r.json():
            if c.get("id"):
                return c["id"]
    # Fallback: create a solo group chat
    r = session.post(
        f"{BASE_URL}/api/chats",
        json={
            "name": f"TEST_iter108_{tag}_{uuid.uuid4().hex[:6]}",
            "type": "group",
            "member_ids": [],
        },
        timeout=20,
    )
    assert r.status_code in (200, 201), f"create chat failed: {r.status_code} {r.text[:200]}"
    return r.json()["id"]


# ---------------------------------------------------------------------------
# 1) comparison_allowed exposed on /billing endpoints
# ---------------------------------------------------------------------------
class TestBillingComparisonAllowedFlag:
    def test_free_user_comparison_allowed_false(self, free_session):
        r_usage = free_session.get(f"{BASE_URL}/api/billing/usage", timeout=20)
        assert r_usage.status_code == 200, r_usage.text[:200]
        u = r_usage.json()
        assert "comparison_allowed" in u, f"comparison_allowed missing: keys={list(u)}"
        assert u["comparison_allowed"] is False, f"free user should be blocked: {u}"
        assert u.get("unlimited") is False
        assert u.get("plan_id") == "free"

        r_me = free_session.get(f"{BASE_URL}/api/billing/me", timeout=20)
        assert r_me.status_code == 200, r_me.text[:200]
        me = r_me.json()
        # /billing/me embeds usage → check flag propagates
        payload = me.get("usage") or me
        assert payload.get("comparison_allowed") is False, f"/billing/me: {me}"

    def test_unlimited_user_comparison_allowed_true(self, unlimited_session):
        r = unlimited_session.get(f"{BASE_URL}/api/billing/usage", timeout=20)
        assert r.status_code == 200, r.text[:200]
        u = r.json()
        assert u.get("comparison_allowed") is True, f"unlimited user should allow: {u}"


# ---------------------------------------------------------------------------
# 2) POST /ai/research: FREE user is capped to a single model silently
# ---------------------------------------------------------------------------
class TestAIResearchFreeCap:
    def test_free_multi_model_is_capped_to_one(self, free_session):
        chat_id = _get_or_create_chat(free_session, "free")
        payload = {
            "chat_id": chat_id,
            "question": "TEST_iter108 What is 2+2? Answer in one sentence.",
            "selected_models": ["chatgpt", "claude", "gemini"],
        }
        r = free_session.post(f"{BASE_URL}/api/ai/research", json=payload, timeout=90)
        assert r.status_code == 200, f"free research should still work: {r.status_code} {r.text[:300]}"
        data = r.json()
        thread = data.get("thread") or {}
        selected = thread.get("selected_models") or []
        assert len(selected) == 1, (
            f"FREE user multi-model research should be capped to 1, got {selected}"
        )
        # Single synthesized answer still returned
        assert thread.get("final_answer"), f"final_answer missing on free single-model run: {thread}"


# ---------------------------------------------------------------------------
# 3) POST /ai/research/{id}/run-models — 402 for FREE, 200 for UNLIMITED
# ---------------------------------------------------------------------------
class TestRunModelsGate:
    def _create_seed_thread(self, session: requests.Session, chat_id: str) -> str:
        payload = {
            "chat_id": chat_id,
            "question": "TEST_iter108 seed thread. Say hi in <=6 words.",
            "selected_models": ["chatgpt"],
        }
        r = session.post(f"{BASE_URL}/api/ai/research", json=payload, timeout=90)
        assert r.status_code == 200, f"seed research failed: {r.status_code} {r.text[:200]}"
        return r.json()["thread"]["id"]

    def test_free_user_run_models_returns_402(self, free_session):
        chat_id = _get_or_create_chat(free_session, "free_runmodels")
        thread_id = self._create_seed_thread(free_session, chat_id)
        r = free_session.post(
            f"{BASE_URL}/api/ai/research/{thread_id}/run-models",
            json={"selected_models": ["claude", "gemini"]},
            timeout=30,
        )
        assert r.status_code == 402, (
            f"free run-models should 402, got {r.status_code} {r.text[:300]}"
        )
        body = r.json()
        detail = body.get("detail") if isinstance(body, dict) else None
        # detail may be a dict or wrapped; accept either shape
        if isinstance(detail, dict):
            assert detail.get("code") == "comparison_paid_only", f"detail={detail}"
        else:
            # fall back: at minimum the message should mention Pro/Team
            assert "Pro" in (r.text or "") or "comparison" in (r.text or "").lower(), r.text[:300]

    def test_unlimited_user_run_models_succeeds(self, unlimited_session):
        chat_id = _get_or_create_chat(unlimited_session, "unlim_runmodels")
        thread_id = self._create_seed_thread(unlimited_session, chat_id)
        r = unlimited_session.post(
            f"{BASE_URL}/api/ai/research/{thread_id}/run-models",
            json={"selected_models": ["gemini"]},
            timeout=30,
        )
        assert r.status_code == 200, (
            f"unlimited run-models should 200, got {r.status_code} {r.text[:300]}"
        )
        # poll for the extra model to appear
        found = False
        for _ in range(10):
            g = unlimited_session.get(
                f"{BASE_URL}/api/ai/research/{thread_id}", timeout=20
            )
            assert g.status_code == 200
            sel = (g.json().get("thread") or {}).get("selected_models") or []
            if "gemini" in sel and len(sel) >= 2:
                found = True
                break
            time.sleep(1)
        assert found, "unlimited user should be able to add another model to selected_models"
