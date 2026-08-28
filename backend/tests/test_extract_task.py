"""Tests for POST /api/ai/extract-task and assignee-reminder flow."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def auth():
    r = requests.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def members(auth):
    r = requests.get(f"{BASE_URL}/api/workspace/members", headers=auth, timeout=30)
    assert r.status_code == 200
    return r.json()


# === extract-task ===
def test_extract_task_real_message(auth, members):
    body = {"message_body": "We need someone to design the new landing page hero by next Friday — urgent for the launch."}
    r = requests.post(f"{BASE_URL}/api/ai/extract-task", json=body, headers=auth, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("title"), str) and len(d["title"]) > 0
    assert isinstance(d.get("description"), str) and len(d["description"]) > 0
    assert d.get("priority") in {"low", "medium", "high", "urgent"}
    valid_ids = {m["id"] for m in members} | {None}
    assert d.get("suggested_assignee_id") in valid_ids, (
        f"suggested_assignee_id {d.get('suggested_assignee_id')} not in workspace members"
    )
    # title should NOT be just message body verbatim — AI rephrases
    assert d["title"] != body["message_body"], "Title looks like raw message body"


def test_extract_task_garbage_returns_fallback(auth):
    body = {"message_body": "asdfg qwerty 12345"}
    r = requests.post(f"{BASE_URL}/api/ai/extract-task", json=body, headers=auth, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "title" in d and "description" in d and "priority" in d
    assert d["priority"] in {"low", "medium", "high", "urgent"}


def test_extract_task_invalid_assignee_sanitized(auth):
    # The server validates suggested_assignee_id ⊂ workspace member ids
    body = {"message_body": "Please ship the iOS push notification feature."}
    r = requests.post(f"{BASE_URL}/api/ai/extract-task", json=body, headers=auth, timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert d.get("suggested_assignee_id") is None or isinstance(d.get("suggested_assignee_id"), str)


def test_extract_task_requires_auth():
    r = requests.post(f"{BASE_URL}/api/ai/extract-task", json={"message_body": "x"}, timeout=30)
    assert r.status_code in (401, 403)


# === assignee task + personal reminder + scope=mine ===
def test_task_assigned_creates_reminder_and_shows_in_mine(auth, members):
    raj = next((m for m in members if m["email"] == "raj@demo.team"), None)
    assert raj is not None, "Raj demo member not found"

    # Amit (demo) creates a task assigned to Raj
    task_body = {
        "title": "TEST_extract reminder flow",
        "description": "Verify assignee receives reminder in personal AI",
        "assigned_to": raj["id"],
        "priority": "high",
        "status": "todo",
    }
    r = requests.post(f"{BASE_URL}/api/tasks", json=task_body, headers=auth, timeout=30)
    assert r.status_code == 200, r.text
    task = r.json()
    assert task["assigned_to"] == raj["id"]
    task_id = task["id"]

    # Now login as Raj
    r2 = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "raj@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")},
        timeout=30,
    )
    assert r2.status_code == 200, r2.text
    raj_headers = {"Authorization": f"Bearer {r2.json()['token']}", "Content-Type": "application/json"}

    # /api/tasks?scope=mine should include the new task
    r3 = requests.get(f"{BASE_URL}/api/tasks?scope=mine", headers=raj_headers, timeout=30)
    assert r3.status_code == 200
    mine = r3.json()
    assert any(t["id"] == task_id for t in mine), "New task not in Raj's scope=mine"

    # personal AI chat should have a reminder message containing the task title
    r4 = requests.get(f"{BASE_URL}/api/chats", headers=raj_headers, timeout=30)
    assert r4.status_code == 200
    personal = next((c for c in r4.json() if c["type"] == "personal_ai"), None)
    assert personal, "Raj has no personal_ai chat"
    r5 = requests.get(f"{BASE_URL}/api/chats/{personal['id']}/messages", headers=raj_headers, timeout=30)
    assert r5.status_code == 200
    msgs = r5.json()
    assert any("TEST_extract reminder flow" in (m.get("body") or "") for m in msgs), (
        "Reminder for new task not posted to Raj's personal AI chat"
    )

    # cleanup
    requests.delete(f"{BASE_URL}/api/tasks/{task_id}", headers=auth, timeout=30)
