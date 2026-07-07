"""Iteration 44 — Per-chat AI Billing & Permissions settings."""
import os
import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://teamnest.ai")
API = f"{BASE_URL}/api"

OWNER = {"email": "amit@demo.team", "password": "Demo@2026"}


@pytest.fixture(scope="module")
def session():
    c = httpx.Client(timeout=30, follow_redirects=True)
    r = c.post(f"{API}/auth/login", json=OWNER)
    assert r.status_code == 200, r.text
    return c


@pytest.fixture(scope="module")
def chat_id(session):
    r = session.get(f"{API}/chats")
    assert r.status_code == 200
    chats = r.json()
    groups = [c for c in chats if c.get("type") == "group"]
    assert groups, "Expected at least one group chat in demo workspace"
    return groups[0]["id"]


def test_default_settings_are_workspace_pays(session, chat_id):
    r = session.get(f"{API}/chats/{chat_id}/ai-settings")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ai_enabled"] is True
    assert body["billing_mode"] == "workspace_pays"
    assert body["billed_to_label"]
    assert "owner" in body["who_can_ask_ai_roles"]
    assert body["guest_ai_enabled"] is False
    assert body["sms_guest_ai_enabled"] is False
    assert body["role"] == "owner"
    assert body["usage_this_month"] >= 0


def test_preflight_owner_allowed(session, chat_id):
    r = session.get(f"{API}/chats/{chat_id}/ai-preflight?estimated_credits=10")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["allowed"] is True
    assert body["billed_to_label"]


def test_set_per_question_cap_blocks_in_preflight(session, chat_id):
    # Set a low cap.
    r = session.put(
        f"{API}/chats/{chat_id}/ai-settings",
        json={"per_question_credit_limit": 5},
    )
    assert r.status_code == 200, r.text

    r2 = session.get(f"{API}/chats/{chat_id}/ai-preflight?estimated_credits=50")
    assert r2.status_code == 200
    body = r2.json()
    assert body["allowed"] is False
    assert "per-question" in body["reason"].lower()

    # Clear cap.
    r = session.put(
        f"{API}/chats/{chat_id}/ai-settings",
        json={"per_question_credit_limit": None},
    )
    assert r.status_code == 200


def test_disable_ai_blocks(session, chat_id):
    session.put(f"{API}/chats/{chat_id}/ai-settings", json={"ai_enabled": False})
    r = session.get(f"{API}/chats/{chat_id}/ai-preflight")
    body = r.json()
    assert body["allowed"] is False
    assert "disabled" in body["reason"].lower()
    # Re-enable
    session.put(f"{API}/chats/{chat_id}/ai-settings", json={"ai_enabled": True})


def test_sponsor_mode_requires_sponsor_id(session, chat_id):
    r = session.put(
        f"{API}/chats/{chat_id}/ai-settings",
        json={"billing_mode": "sponsor_pays"},
    )
    assert r.status_code == 400, r.text


def test_switch_to_requester_pays(session, chat_id):
    r = session.put(
        f"{API}/chats/{chat_id}/ai-settings",
        json={"billing_mode": "requester_pays"},
    )
    assert r.status_code == 200
    assert r.json()["billing_mode"] == "requester_pays"
    assert "your" in r.json()["billed_to_label"].lower() or "user" in r.json()["billed_to_label"].lower()
    # Reset
    session.put(f"{API}/chats/{chat_id}/ai-settings", json={"billing_mode": "workspace_pays"})


def test_usage_report_returns_shape(session, chat_id):
    r = session.get(f"{API}/chats/{chat_id}/ai-usage")
    assert r.status_code == 200, r.text
    body = r.json()
    for key in ("month", "total_credits", "by_user", "by_employee", "by_model", "by_workflow", "by_project"):
        assert key in body, body
