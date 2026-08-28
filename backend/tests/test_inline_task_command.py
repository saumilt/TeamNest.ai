"""Tests for inline @task command parsing in chat messages.

Verifies:
- @task creates a task with correct title/assignee/due/priority
- A confirmation message_type='task' is posted in the same chat
- The assignee receives a reminder in their personal_ai chat
- Partial-name prefix match resolves correctly (@Priya)
- Natural language @due tomorrow/Friday/today resolves to ISO dates
- Messages WITHOUT @task do NOT create a task (regression)
- /api/ai/extract-task still returns structured JSON
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
PWD = os.environ.get("DEMO_PASSWORD", "DemoPass123!")


def _login(email, password=PWD):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def amit():
    return _login("amit@demo.team")


@pytest.fixture(scope="module")
def raj():
    return _login("raj@demo.team")


@pytest.fixture(scope="module")
def priya():
    return _login("priya@demo.team")


def _headers(login):
    return {"Authorization": f"Bearer {login['token']}", "Content-Type": "application/json"}


def _get_group_chat_id(login):
    r = requests.get(f"{BASE_URL}/api/chats", headers=_headers(login), timeout=30)
    assert r.status_code == 200
    chats = r.json()
    # Pick first group chat (not personal_ai)
    for c in chats:
        if c.get("type") in ("group", "channel", "direct"):
            return c["id"]
    # fallback to first non-personal
    for c in chats:
        if c.get("type") != "personal_ai":
            return c["id"]
    pytest.skip("No suitable chat found")


def _send_message(login, chat_id, body):
    r = requests.post(
        f"{BASE_URL}/api/chats/{chat_id}/messages",
        json={"message_type": "text", "body": body},
        headers=_headers(login),
        timeout=30,
    )
    assert r.status_code == 200, f"send_message failed: {r.status_code} {r.text}"
    return r.json()


def _list_messages(login, chat_id):
    r = requests.get(f"{BASE_URL}/api/chats/{chat_id}/messages", headers=_headers(login), timeout=30)
    assert r.status_code == 200
    return r.json()


def _list_tasks(login, scope=None):
    url = f"{BASE_URL}/api/tasks"
    if scope:
        url += f"?scope={scope}"
    r = requests.get(url, headers=_headers(login), timeout=30)
    assert r.status_code == 200, f"list_tasks: {r.status_code} {r.text}"
    return r.json()


class TestInlineTaskCommand:
    def test_inline_task_creates_task_with_all_fields(self, amit, raj):
        chat_id = _get_group_chat_id(amit)
        unique_title = f"TEST_inline Benchmark SaaS pricing tiers {int(time.time())}"
        body = f"@task {unique_title} @assign @Raj Mehta @due 2026-05-20 @priority urgent"
        sent = _send_message(amit, chat_id, body)
        assert sent["body"] == body

        # Async handler — wait 2-3 sec
        time.sleep(3)

        # Verify task exists
        tasks = _list_tasks(amit)
        match = [t for t in tasks if t["title"] == unique_title]
        assert match, f"Inline task not created. Looked for title={unique_title!r}"
        task = match[0]
        assert task["priority"] == "urgent"
        assert task["due_date"], "due_date missing"
        assert task["due_date"].startswith("2026-05-20"), f"due_date={task['due_date']}"
        # assigned_to should be Raj's user id
        assert task["assigned_to"] == raj["user"]["id"], f"assigned_to={task['assigned_to']} expected {raj['user']['id']}"
        assert task["source_chat_id"] == chat_id

        # Verify confirmation message in chat
        msgs = _list_messages(amit, chat_id)
        confirm = [m for m in msgs if m.get("message_type") == "task" and m.get("metadata", {}).get("task_id") == task["id"]]
        assert confirm, "No confirmation message of message_type='task' with metadata.task_id found"
        assert confirm[0]["body"].startswith("Task created:"), f"confirm body: {confirm[0]['body']}"

        # Verify reminder in Raj's personal_ai chat
        raj_chats = requests.get(f"{BASE_URL}/api/chats", headers=_headers(raj), timeout=30).json()
        personal = next((c for c in raj_chats if c.get("type") == "personal_ai"), None)
        assert personal, "Raj has no personal_ai chat"
        raj_msgs = _list_messages(raj, personal["id"])
        reminders = [m for m in raj_msgs if m.get("metadata", {}).get("reminder") and m.get("metadata", {}).get("task_id") == task["id"]]
        assert reminders, "No reminder posted to Raj's personal_ai chat"

        # Verify scope=mine for Raj shows this task
        raj_tasks = _list_tasks(raj, scope="mine")
        assert any(t["id"] == task["id"] for t in raj_tasks), "Task not in Raj's scope=mine"

    def test_inline_task_partial_name_priya(self, amit, priya):
        chat_id = _get_group_chat_id(amit)
        unique_title = f"TEST_inline Partial Priya {int(time.time())}"
        body = f"@task {unique_title} @assign @Priya @due 2026-06-10 @priority high"
        _send_message(amit, chat_id, body)
        time.sleep(3)

        tasks = _list_tasks(amit)
        match = [t for t in tasks if t["title"] == unique_title]
        assert match, "Task not created for partial name @Priya"
        assert match[0]["assigned_to"] == priya["user"]["id"], "Partial name did not resolve to Priya"
        assert match[0]["priority"] == "high"

    def test_inline_task_natural_due_tomorrow(self, amit):
        chat_id = _get_group_chat_id(amit)
        unique_title = f"TEST_inline Due Tomorrow {int(time.time())}"
        body = f"@task {unique_title} @due tomorrow @priority medium"
        _send_message(amit, chat_id, body)
        time.sleep(3)

        tasks = _list_tasks(amit)
        match = [t for t in tasks if t["title"] == unique_title]
        assert match, "Task not created with @due tomorrow"
        assert match[0]["due_date"], "tomorrow did not resolve to a date"
        # Should be ISO date 1 day ahead — at least starts with 4-digit year
        assert len(match[0]["due_date"]) >= 10 and match[0]["due_date"][4] == "-"

    def test_inline_task_natural_due_friday(self, amit):
        chat_id = _get_group_chat_id(amit)
        unique_title = f"TEST_inline Due Friday {int(time.time())}"
        body = f"@task {unique_title} @due Friday"
        _send_message(amit, chat_id, body)
        time.sleep(3)

        tasks = _list_tasks(amit)
        match = [t for t in tasks if t["title"] == unique_title]
        assert match, "Task not created with @due Friday"
        assert match[0]["due_date"], "Friday did not resolve to a date"

    def test_inline_task_natural_due_today(self, amit):
        chat_id = _get_group_chat_id(amit)
        unique_title = f"TEST_inline Due Today {int(time.time())}"
        body = f"@task {unique_title} @due today"
        _send_message(amit, chat_id, body)
        time.sleep(3)

        tasks = _list_tasks(amit)
        match = [t for t in tasks if t["title"] == unique_title]
        assert match, "Task not created with @due today"
        assert match[0]["due_date"], "today did not resolve to a date"

    def test_message_without_task_does_not_create(self, amit):
        chat_id = _get_group_chat_id(amit)
        before = len(_list_tasks(amit))
        marker = f"plain message no task keyword {int(time.time())}"
        _send_message(amit, chat_id, marker)
        time.sleep(2)
        after_tasks = _list_tasks(amit)
        # Tasks list should not contain anything with our marker as title
        assert not [t for t in after_tasks if marker in t["title"]], "Plain message should not create a task"
        # Total count should not increase from this one message
        assert len(after_tasks) <= before + 0  # allow for unrelated noise => strict ==
        assert len(after_tasks) == before, f"Task count changed: before={before} after={len(after_tasks)}"

    def test_extract_task_endpoint_still_works(self, amit):
        # POST /api/ai/extract-task with a message body
        r = requests.post(
            f"{BASE_URL}/api/ai/extract-task",
            json={"message_body": "Please benchmark SaaS pricing tiers by next Friday for the Pro tier launch.", "chat_id": None},
            headers=_headers(amit),
            timeout=60,
        )
        assert r.status_code == 200, f"extract-task: {r.status_code} {r.text}"
        data = r.json()
        assert "title" in data and isinstance(data["title"], str) and len(data["title"]) > 0
        assert "description" in data
        assert data.get("priority") in {"low", "medium", "high", "urgent"}
