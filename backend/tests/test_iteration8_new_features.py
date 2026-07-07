"""Iteration 8 — Tests for user preferences, AI suggest-tasks,
single-model fast-path, favorite-bias auto-best.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed {r.status_code} {r.text}"
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def workspace(client):
    r = client.get(f"{BASE_URL}/api/workspace", timeout=30)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def members(client):
    r = client.get(f"{BASE_URL}/api/workspace/members", timeout=30)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def chat(client):
    # Find any chat
    r = client.get(f"{BASE_URL}/api/chats", timeout=30)
    assert r.status_code == 200
    chats = r.json()
    assert chats, "No chats available in demo workspace"
    # Prefer a non-DM chat
    for c in chats:
        if c.get("chat_type") != "dm":
            return c
    return chats[0]


# ===== USER PREFERENCES =====
class TestUserPreferences:
    def test_get_preferences(self, client):
        r = client.get(f"{BASE_URL}/api/user/preferences", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "favorite_ai_model" in data
        assert "favorite_models" in data
        assert isinstance(data["favorite_models"], list)

    def test_patch_preferences_valid(self, client):
        r = client.patch(
            f"{BASE_URL}/api/user/preferences",
            json={"favorite_ai_model": "claude", "favorite_models": ["claude", "chatgpt"]},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["favorite_ai_model"] == "claude"
        assert set(d["favorite_models"]) == {"claude", "chatgpt"}

        # Verify persistence
        r2 = client.get(f"{BASE_URL}/api/user/preferences", timeout=30)
        d2 = r2.json()
        assert d2["favorite_ai_model"] == "claude"
        assert set(d2["favorite_models"]) == {"claude", "chatgpt"}

    def test_patch_preferences_unknown_model_rejected(self, client):
        r = client.patch(
            f"{BASE_URL}/api/user/preferences",
            json={"favorite_ai_model": "not-a-real-model"},
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400 for unknown model, got {r.status_code} {r.text}"

    def test_patch_preferences_filters_unknown_models_list(self, client):
        r = client.patch(
            f"{BASE_URL}/api/user/preferences",
            json={"favorite_ai_model": "claude", "favorite_models": ["claude", "made-up", "chatgpt"]},
            timeout=30,
        )
        assert r.status_code == 200
        favs = r.json()["favorite_models"]
        assert "made-up" not in favs
        assert "claude" in favs and "chatgpt" in favs


# ===== AI SUGGEST TASKS =====
class TestAISuggestTasks:
    def test_suggest_tasks_multiple(self, client, chat):
        msg = (
            "We need to launch the new menu by Friday. Priya should design the "
            "print menu, Raj must update the website with photos, and someone "
            "needs to call the printer for a quote."
        )
        r = client.post(
            f"{BASE_URL}/api/ai/suggest-tasks",
            json={"message_body": msg, "chat_id": chat["id"], "max_tasks": 6},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "tasks" in data
        tasks = data["tasks"]
        assert isinstance(tasks, list)
        assert len(tasks) >= 1, f"expected ≥1 tasks, got 0. payload={data}"
        # Validate each task shape
        valid_priorities = {"low", "medium", "high", "urgent"}
        for t in tasks:
            assert "title" in t and t["title"]
            assert "description" in t
            assert "priority" in t and t["priority"] in valid_priorities, f"bad priority {t.get('priority')}"
            # suggested_assignee_id either None or a member id (validated server-side)
            assert "suggested_assignee_id" in t
            assert "suggested_due_date" in t
            # due date is ISO or None
            sd = t["suggested_due_date"]
            assert sd is None or isinstance(sd, str)
        # Soft-log
        print(f"\n[suggest-tasks] Returned {len(tasks)} tasks: {[t['title'] for t in tasks]}")

    def test_suggest_tasks_single_simple(self, client, chat):
        msg = "Please call the supplier tomorrow."
        r = client.post(
            f"{BASE_URL}/api/ai/suggest-tasks",
            json={"message_body": msg, "chat_id": chat["id"], "max_tasks": 4},
            timeout=120,
        )
        assert r.status_code == 200
        tasks = r.json()["tasks"]
        assert len(tasks) >= 1


# ===== SINGLE-MODEL FAST PATH =====
class TestSingleModelResearch:
    def test_single_model_no_synthesis(self, client, chat):
        r = client.post(
            f"{BASE_URL}/api/ai/research",
            json={
                "chat_id": chat["id"],
                "question": "What is 12 * 7? Give a one-line answer.",
                "selected_models": ["claude"],
            },
            timeout=180,
        )
        assert r.status_code == 200, r.text
        thread_resp = r.json()
        thread = thread_resp["thread"]
        assert thread.get("single_model") is True
        assert thread.get("auto_synthesized") is False
        # final_answer should be claude's direct answer
        assert thread.get("final_answer")

        # Now check the posted ai_answer message metadata
        time.sleep(0.5)
        m = client.get(f"{BASE_URL}/api/chats/{chat['id']}/messages?limit=500", timeout=30)
        assert m.status_code == 200
        msgs = m.json()
        # Find latest ai_answer linked to this thread
        ai_msgs = [x for x in msgs if x.get("message_type") == "ai_answer" and (x.get("metadata") or {}).get("thread_id") == thread["id"]]
        assert ai_msgs, "No ai_answer message posted for the thread"
        meta = ai_msgs[0]["metadata"]
        assert meta.get("single_model") is True
        assert meta.get("synthesized") is False
        assert meta.get("response_count") == 1


# ===== MULTI MODEL + FAVORITE BIAS =====
class TestMultiModelFavoriteBias:
    def test_multi_synthesizes(self, client, chat):
        r = client.post(
            f"{BASE_URL}/api/ai/research",
            json={
                "chat_id": chat["id"],
                "question": "Name three colors in a rainbow.",
                "selected_models": ["chatgpt", "claude", "gemini"],
            },
            timeout=240,
        )
        assert r.status_code == 200, r.text
        thread = r.json()["thread"]
        assert thread.get("single_model") is False
        assert thread.get("auto_synthesized") is True
        # check posted message
        m = client.get(f"{BASE_URL}/api/chats/{chat['id']}/messages?limit=500", timeout=30)
        ai_msgs = [x for x in m.json() if x.get("message_type") == "ai_answer" and (x.get("metadata") or {}).get("thread_id") == thread["id"]]
        assert ai_msgs
        meta = ai_msgs[0]["metadata"]
        assert meta.get("synthesized") is True
        assert meta.get("response_count") == 3

    def test_favorite_bias_soft(self, client, chat):
        # Set favorite to gemini
        client.patch(f"{BASE_URL}/api/user/preferences", json={"favorite_ai_model": "gemini"}, timeout=30)

        r = client.post(
            f"{BASE_URL}/api/ai/research",
            json={
                "chat_id": chat["id"],
                "question": "What is the capital of France?",
                "selected_models": ["chatgpt", "claude", "gemini"],
            },
            timeout=240,
        )
        assert r.status_code == 200
        thread = r.json()["thread"]
        m = client.get(f"{BASE_URL}/api/chats/{chat['id']}/messages?limit=500", timeout=30)
        ai_msgs = [x for x in m.json() if x.get("message_type") == "ai_answer" and (x.get("metadata") or {}).get("thread_id") == thread["id"]]
        assert ai_msgs
        meta = ai_msgs[0]["metadata"]
        best_key = meta.get("best_model_key")
        # Soft check: log result. Confidence randomized so favorite may not always win.
        print(f"\n[favorite-bias] favorite=gemini, chosen best_model_key={best_key} (confidence-based, soft)")
        assert best_key in {"chatgpt", "claude", "gemini"}

        # Restore favorite to claude
        client.patch(f"{BASE_URL}/api/user/preferences", json={"favorite_ai_model": "claude"}, timeout=30)


# ===== EXISTING REGRESSION =====
class TestRegression:
    def test_extract_task_still_works(self, client, chat):
        r = client.post(
            f"{BASE_URL}/api/ai/extract-task",
            json={"message_body": "Raj, please update the homepage by Monday.", "chat_id": chat["id"]},
            timeout=120,
        )
        assert r.status_code == 200
        d = r.json()
        assert "title" in d

    def test_ai_models_list(self, client):
        r = client.get(f"{BASE_URL}/api/ai/models", timeout=30)
        assert r.status_code == 200
        models = r.json()
        keys = {m["key"] for m in models}
        assert {"claude", "chatgpt", "gemini"}.issubset(keys)

    def test_auth_me_includes_preferences(self, client):
        r = client.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code == 200
        u = r.json()
        assert "preferences" in u
        assert "favorite_ai_model" in u["preferences"]
