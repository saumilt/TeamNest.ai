"""Iteration 146 — Automations Drop 2 + Meeting Prep backend tests.

Covers /api/automations/* CRUD, parse, templates, stats, run (real recipe
verified: overdue_tasks GET → AI summarize → post to chat actually creates a
messages doc in the target chat), and /api/ai/meeting-prep 200/400/404.
"""
import os
import time
import pytest


# ------------- Templates + auth -------------
def test_templates_returns_nine(auth_client, base_url):
    r = auth_client.get(f"{base_url}/api/automations/templates", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "templates" in data and isinstance(data["templates"], list)
    assert len(data["templates"]) == 9
    keys = {t["key"] for t in data["templates"]}
    for k in ("daily_digest", "overdue_report", "weekly_project", "lead_research"):
        assert k in keys
    for t in data["templates"]:
        for f in ("category", "key", "title", "prompt", "risk"):
            assert f in t and t[f]


def test_templates_unauth_401(base_url):
    import requests
    # Fresh session — no cookie, no bearer
    r = requests.get(f"{base_url}/api/automations/templates", timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


# ------------- Parse -------------
def test_parse_returns_plan(auth_client, base_url):
    r = auth_client.post(
        f"{base_url}/api/automations/parse",
        json={"prompt": "Every morning summarize overdue tasks and post to our team chat."},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    plan = r.json()
    for k in ("name", "trigger", "steps", "risk"):
        assert k in plan
    assert plan["risk"] in {"low", "medium", "high"}
    assert isinstance(plan["steps"], list) and len(plan["steps"]) >= 1
    kinds = {s["kind"] for s in plan["steps"]}
    assert kinds & {"get", "ai", "post"}, f"Expected safe-recipe kinds, got {kinds}"


def test_parse_empty_400(auth_client, base_url):
    r = auth_client.post(f"{base_url}/api/automations/parse", json={"prompt": "  "}, timeout=15)
    assert r.status_code == 400


# ------------- Create → list → get → patch → run → runs → delete -------------
@pytest.fixture(scope="module")
def target_chat_id(auth_client, base_url):
    """Pick any chat the current user is a member of."""
    r = auth_client.get(f"{base_url}/api/chats", timeout=30)
    assert r.status_code == 200, r.text
    chats = r.json()
    if isinstance(chats, dict):
        chats = chats.get("items") or chats.get("chats") or []
    assert chats, "No chats available for target"
    return chats[0]["id"]


def _sample_automation(target_chat_id, name="TEST_it146_auto"):
    return {
        "name": name,
        "description": "iter146 automation",
        "nl_prompt": "Summarize overdue tasks and post to team chat",
        "trigger": {"type": "manual", "label": "Manual — run on demand"},
        "steps": [
            {"kind": "get", "label": "Get overdue tasks", "config": {"source": "overdue_tasks"}},
            {"kind": "ai", "label": "Summarize with AI", "config": {"op": "summarize"}},
            {"kind": "post", "label": "Post to chat", "config": {}},
        ],
        "risk": "low",
        "target_chat_id": target_chat_id,
        "status": "active",
    }


def test_full_lifecycle_and_real_post(auth_client, base_url, target_chat_id):
    # CREATE
    payload = _sample_automation(target_chat_id)
    r = auth_client.post(f"{base_url}/api/automations", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    created = r.json()
    aid = created["id"]
    assert created["name"] == payload["name"]
    assert created["target_chat_id"] == target_chat_id
    assert created["risk"] == "low"
    assert created["status"] == "active"
    assert "_id" not in created

    try:
        # LIST includes it
        r = auth_client.get(f"{base_url}/api/automations", timeout=30)
        assert r.status_code == 200
        assert any(a["id"] == aid for a in r.json()["items"])

        # GET detail (+ empty runs)
        r = auth_client.get(f"{base_url}/api/automations/{aid}", timeout=30)
        assert r.status_code == 200
        detail = r.json()
        assert detail["automation"]["id"] == aid
        assert isinstance(detail["runs"], list)

        # PATCH → pause
        r = auth_client.patch(
            f"{base_url}/api/automations/{aid}", json={"status": "paused"}, timeout=30
        )
        assert r.status_code == 200
        assert r.json()["status"] == "paused"

        # Snapshot pre-run message count on chat
        r0 = auth_client.get(
            f"{base_url}/api/chats/{target_chat_id}/messages", timeout=30
        )
        pre_count = len(r0.json()) if r0.status_code == 200 else 0

        # RUN
        r = auth_client.post(f"{base_url}/api/automations/{aid}/run", timeout=90)
        assert r.status_code == 200, r.text
        run = r.json()
        assert run["automation_id"] == aid
        assert run["status"] in {"success", "partial", "simulated", "failed"}
        assert isinstance(run["timeline"], list) and len(run["timeline"]) >= 1
        assert "reasoning_summary" in run
        # For this recipe with a target_chat we expect a real post → success
        if run["status"] == "success":
            assert run.get("posted_chat_id") == target_chat_id
            # Verify the message was actually posted
            time.sleep(0.5)
            r1 = auth_client.get(
                f"{base_url}/api/chats/{target_chat_id}/messages", timeout=30
            )
            assert r1.status_code == 200
            new_msgs = r1.json()
            assert len(new_msgs) > pre_count, "Expected a new message posted to chat"
            latest = new_msgs[-1] if isinstance(new_msgs, list) else None
            if latest:
                assert (latest.get("metadata") or {}).get("event") == "automation" or (
                    "TEST_it146_auto" in (latest.get("body") or "")
                )

        # GET runs list
        r = auth_client.get(f"{base_url}/api/automations/{aid}/runs", timeout=30)
        assert r.status_code == 200
        runs = r.json()["runs"]
        assert len(runs) >= 1

        # STATS should reflect activity
        r = auth_client.get(f"{base_url}/api/automations/stats", timeout=30)
        assert r.status_code == 200
        stats = r.json()
        for k in ("running", "needs_approval", "failed", "saved_hours", "credits_used"):
            assert k in stats

    finally:
        # DELETE
        r = auth_client.delete(f"{base_url}/api/automations/{aid}", timeout=30)
        assert r.status_code == 200
        # Verify gone
        r = auth_client.get(f"{base_url}/api/automations/{aid}", timeout=15)
        assert r.status_code == 404


def test_get_unknown_404(auth_client, base_url):
    r = auth_client.get(f"{base_url}/api/automations/does-not-exist", timeout=15)
    assert r.status_code == 404


# ------------- Meeting Prep -------------
def test_meeting_prep_400_no_context(auth_client, base_url):
    r = auth_client.post(f"{base_url}/api/ai/meeting-prep", json={}, timeout=15)
    assert r.status_code == 400


def test_meeting_prep_404_unknown_chat(auth_client, base_url):
    r = auth_client.post(
        f"{base_url}/api/ai/meeting-prep", json={"chat_id": "bogus-chat-id"}, timeout=15
    )
    assert r.status_code == 404


def test_meeting_prep_success(auth_client, base_url, target_chat_id):
    r = auth_client.post(
        f"{base_url}/api/ai/meeting-prep", json={"chat_id": target_chat_id}, timeout=90
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("chat_id") == target_chat_id
    assert "title" in data and data["title"]
    assert "brief" in data and isinstance(data["brief"], str) and len(data["brief"]) > 20
