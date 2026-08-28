"""End-to-end backend tests for Emergent AI Teams Phase 1."""
import asyncio
import json
import os
import uuid

import pytest
import requests
import websockets

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com"
).rstrip("/")
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")


# Shared state across tests
STATE = {}


# ===== HEALTH =====
class TestHealth:
    def test_root(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"
        assert data.get("service") in ("teamnest", "emergent-ai-teams")


# ===== AUTH =====
class TestAuth:
    def test_demo_login(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/demo-login")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 20
        assert data["user"]["email"] == "amit@demo.team"
        assert "_id" not in data["user"]
        STATE["amit_token"] = data["token"]
        STATE["amit_id"] = data["user"]["id"]
        STATE["workspace_id"] = data["user"]["workspace_id"]

    def test_login_seeded_user(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "amit@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")},
        )
        assert r.status_code == 200, r.text
        assert "token" in r.json()

    def test_login_invalid(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "amit@demo.team", "password": "wrong"},
        )
        assert r.status_code == 401

    def test_signup_new_user(self, api_client):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = api_client.post(
            f"{BASE_URL}/api/auth/signup",
            json={"name": "Test Signup", "email": email, "password": "Test@1234"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data["user"]["email"] == email
        assert data["user"]["role"] == "owner"
        assert data["user"]["workspace_id"]
        assert "_id" not in data["user"]
        STATE["signup_token"] = data["token"]

    def test_me(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == "amit@demo.team"
        assert "_id" not in u
        assert "password_hash" not in u

    def test_me_no_token(self, api_client):
        s = requests.Session()
        r = s.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code in (401, 403)


# ===== WORKSPACE =====
class TestWorkspace:
    def test_get_workspace(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/workspace")
        assert r.status_code == 200
        ws = r.json()
        assert "id" in ws
        assert "_id" not in ws

    def test_members(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/workspace/members")
        assert r.status_code == 200
        members = r.json()
        assert isinstance(members, list)
        emails = {m["email"] for m in members}
        # Should include seeded users
        assert "amit@demo.team" in emails
        assert "priya@demo.team" in emails
        for m in members:
            assert "_id" not in m
            assert "password_hash" not in m
        STATE["priya_id"] = next(m["id"] for m in members if m["email"] == "priya@demo.team")

    def test_invite(self, auth_client):
        email = f"invited_{uuid.uuid4().hex[:6]}@demo.team"
        r = auth_client.post(
            f"{BASE_URL}/api/workspace/invite",
            json={"name": "Invited User", "email": email, "role": "member"},
        )
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["email"] == email
        assert u["status"] == "invited"


# ===== CHATS =====
class TestChats:
    def test_list_chats(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/chats")
        assert r.status_code == 200
        chats = r.json()
        assert isinstance(chats, list)
        # 4 group + 1 personal_ai = 5 minimum
        types = [c["type"] for c in chats]
        assert "personal_ai" in types
        assert types.count("group") >= 3  # at least a few groups
        assert len(chats) >= 5, f"Expected >=5 chats, got {len(chats)}: {types}"
        for c in chats:
            assert "_id" not in c
        STATE["group_chat_id"] = next(c["id"] for c in chats if c["type"] == "group")
        STATE["personal_ai_id"] = next(c["id"] for c in chats if c["type"] == "personal_ai")

    def test_create_chat(self, auth_client):
        r = auth_client.post(
            f"{BASE_URL}/api/chats",
            json={
                "type": "group",
                "name": "TEST_GroupChat",
                "description": "Test chat",
                "member_ids": [STATE["priya_id"]],
                "default_models": ["chatgpt", "claude"],
            },
        )
        assert r.status_code == 200, r.text
        chat = r.json()
        assert chat["name"] == "TEST_GroupChat"
        assert STATE["amit_id"] in chat["member_ids"]
        assert STATE["priya_id"] in chat["member_ids"]
        STATE["test_chat_id"] = chat["id"]


# ===== MESSAGES =====
class TestMessages:
    def test_send_message(self, auth_client):
        chat_id = STATE["test_chat_id"]
        r = auth_client.post(
            f"{BASE_URL}/api/chats/{chat_id}/messages",
            json={"body": "Hello team!", "message_type": "text"},
        )
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg["body"] == "Hello team!"
        assert msg["sender_id"] == STATE["amit_id"]
        assert "_id" not in msg
        STATE["message_id"] = msg["id"]

    def test_list_messages(self, auth_client):
        chat_id = STATE["test_chat_id"]
        r = auth_client.get(f"{BASE_URL}/api/chats/{chat_id}/messages")
        assert r.status_code == 200
        msgs = r.json()
        assert any(m["id"] == STATE["message_id"] for m in msgs)

    def test_edit_message(self, auth_client):
        mid = STATE["message_id"]
        r = auth_client.patch(
            f"{BASE_URL}/api/messages/{mid}", json={"body": "Hello team! [edited]"}
        )
        assert r.status_code == 200
        assert r.json()["body"] == "Hello team! [edited]"
        assert r.json()["edited_at"]

    def test_react(self, auth_client):
        mid = STATE["message_id"]
        r = auth_client.post(
            f"{BASE_URL}/api/messages/{mid}/react", json={"emoji": "👍"}
        )
        assert r.status_code == 200
        assert STATE["amit_id"] in r.json()["reactions"].get("👍", [])

    def test_pin(self, auth_client):
        mid = STATE["message_id"]
        r = auth_client.post(f"{BASE_URL}/api/messages/{mid}/pin")
        assert r.status_code == 200
        assert mid in r.json()["pinned_message_ids"]

    def test_delete_message(self, auth_client):
        # send a temp message to delete
        chat_id = STATE["test_chat_id"]
        r = auth_client.post(
            f"{BASE_URL}/api/chats/{chat_id}/messages",
            json={"body": "delete me", "message_type": "text"},
        )
        mid = r.json()["id"]
        r2 = auth_client.delete(f"{BASE_URL}/api/messages/{mid}")
        assert r2.status_code == 200


# ===== AI =====
class TestAI:
    def test_ai_research_real_and_simulated(self, auth_client):
        chat_id = STATE["test_chat_id"]
        r = auth_client.post(
            f"{BASE_URL}/api/ai/research",
            json={
                "chat_id": chat_id,
                "question": "What is 2+2? Answer in one short sentence.",
                "selected_models": ["chatgpt", "claude", "gemini", "deepseek"],
            },
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "thread" in data and "responses" in data
        assert len(data["responses"]) == 4
        models_returned = {resp["model_key"] for resp in data["responses"]}
        assert {"chatgpt", "claude", "gemini", "deepseek"}.issubset(models_returned)
        # Each response has answer text
        for resp in data["responses"]:
            assert resp.get("answer"), f"No answer in response: {list(resp.keys())}"
            assert "_id" not in resp
        # Deepseek is real now but key has no credit — accept either simulated, real, or 402 error answer
        deepseek_resp = next(r for r in data["responses"] if r["model_key"] == "deepseek")
        assert isinstance(deepseek_resp.get("answer"), str) and len(deepseek_resp["answer"]) > 0
        STATE["thread_id"] = data["thread"]["id"]
        STATE["response_ids"] = [r["id"] for r in data["responses"]]

    def test_get_research(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/ai/research/{STATE['thread_id']}")
        assert r.status_code == 200
        d = r.json()
        assert d["thread"]["id"] == STATE["thread_id"]
        assert len(d["responses"]) == 4

    def test_vote_categories(self, auth_client):
        rid = STATE["response_ids"][0]
        for cat in ["best", "most_accurate", "best_citations", "most_useful"]:
            r = auth_client.post(
                f"{BASE_URL}/api/ai/responses/{rid}/vote",
                json={"vote_category": cat},
            )
            assert r.status_code == 200, f"{cat}: {r.text}"
            updated = r.json()
            assert STATE["amit_id"] in updated["votes"][cat]
        # toggle off best
        r = auth_client.post(
            f"{BASE_URL}/api/ai/responses/{rid}/vote",
            json={"vote_category": "best"},
        )
        assert STATE["amit_id"] not in r.json()["votes"]["best"]

    def test_select_best(self, auth_client):
        rid = STATE["response_ids"][1]
        r = auth_client.post(f"{BASE_URL}/api/ai/responses/{rid}/select-best")
        assert r.status_code == 200
        # verify
        d = auth_client.get(f"{BASE_URL}/api/ai/research/{STATE['thread_id']}").json()
        best = [r for r in d["responses"] if r["selected_as_best"]]
        assert len(best) == 1
        assert best[0]["id"] == rid

    def test_synthesize(self, auth_client):
        r = auth_client.post(
            f"{BASE_URL}/api/ai/research/{STATE['thread_id']}/synthesize",
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("final_answer"), str)
        assert len(data["final_answer"]) > 0

    def test_improve_message(self, auth_client):
        r = auth_client.post(
            f"{BASE_URL}/api/ai/improve",
            json={"text": "hey can u send report asap thx", "action": "make_professional"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("improved"), str)
        assert len(data["improved"]) > 0


# ===== FOLDERS =====
class TestFolders:
    def test_create_folder(self, auth_client):
        r = auth_client.post(
            f"{BASE_URL}/api/folders",
            json={"name": "TEST_Folder", "description": "Test folder", "member_ids": [STATE["priya_id"]]},
        )
        assert r.status_code == 200
        f = r.json()
        assert f["name"] == "TEST_Folder"
        STATE["folder_id"] = f["id"]

    def test_list_folders(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/folders")
        assert r.status_code == 200
        folders = r.json()
        assert any(f["id"] == STATE["folder_id"] for f in folders)

    def test_save_research(self, auth_client):
        r = auth_client.post(
            f"{BASE_URL}/api/folders/{STATE['folder_id']}/save-research",
            json={
                "research_thread_id": STATE["thread_id"],
                "title": "Saved research test",
                "final_answer": "Synthesis: 2+2=4",
            },
        )
        assert r.status_code == 200
        assert r.json()["title"] == "Saved research test"

    def test_get_folder_details(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/folders/{STATE['folder_id']}")
        assert r.status_code == 200
        d = r.json()
        assert d["folder"]["id"] == STATE["folder_id"]
        assert isinstance(d["saved_research"], list)
        assert len(d["saved_research"]) >= 1
        assert isinstance(d["tasks"], list)
        assert isinstance(d["chats"], list)


# ===== TASKS =====
class TestTasks:
    def test_create_task_with_reminder(self, auth_client):
        # Send to priya so reminder lands in her personal_ai chat (we can verify by listing assignee's tasks)
        r = auth_client.post(
            f"{BASE_URL}/api/tasks",
            json={
                "title": "TEST_Reminder Task",
                "description": "test",
                "assigned_to": STATE["priya_id"],
                "priority": "high",
                "due_date": "2026-12-31T00:00:00Z",
                "project_folder_id": STATE["folder_id"],
            },
        )
        assert r.status_code == 200, r.text
        task = r.json()
        STATE["task_id"] = task["id"]

        # Verify reminder posted in Priya's personal_ai chat
        # Login as priya
        login_r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "priya@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")},
        )
        assert login_r.status_code == 200
        priya_token = login_r.json()["token"]
        h = {"Authorization": f"Bearer {priya_token}"}
        chats = requests.get(f"{BASE_URL}/api/chats", headers=h).json()
        personal = next((c for c in chats if c["type"] == "personal_ai"), None)
        assert personal, "Priya has no personal_ai chat"
        msgs = requests.get(
            f"{BASE_URL}/api/chats/{personal['id']}/messages", headers=h
        ).json()
        reminder = [m for m in msgs if m.get("metadata", {}).get("task_id") == task["id"]]
        assert reminder, "Reminder not posted to assignee's personal_ai chat"
        assert "TEST_Reminder Task" in reminder[0]["body"]

    def test_list_tasks_all(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/tasks?scope=all")
        assert r.status_code == 200
        tasks = r.json()
        assert any(t["id"] == STATE["task_id"] for t in tasks)

    def test_list_tasks_mine(self, auth_client):
        # Amit created task assigned to Priya; "mine" for amit should not include it
        r = auth_client.get(f"{BASE_URL}/api/tasks?scope=mine")
        assert r.status_code == 200
        tasks = r.json()
        assert not any(t["id"] == STATE["task_id"] for t in tasks)

    def test_update_task(self, auth_client):
        r = auth_client.patch(
            f"{BASE_URL}/api/tasks/{STATE['task_id']}",
            json={"status": "completed"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "completed"
        assert r.json()["completed_at"]

    def test_delete_task(self, auth_client):
        # Create and delete
        r = auth_client.post(
            f"{BASE_URL}/api/tasks",
            json={"title": "TEST_DeleteMe", "priority": "low"},
        )
        tid = r.json()["id"]
        d = auth_client.delete(f"{BASE_URL}/api/tasks/{tid}")
        assert d.status_code == 200


# ===== DASHBOARD =====
class TestDashboard:
    def test_dashboard(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/dashboard")
        assert r.status_code == 200
        d = r.json()
        for k in ["open_tasks", "due_today", "recent_chats", "folders", "recent_threads"]:
            assert k in d, f"missing key {k}"
            assert isinstance(d[k], list)


# ===== WEBSOCKET =====
class TestWebSocket:
    def test_ws_broadcast(self, auth_client):
        async def run():
            chat_id = STATE["test_chat_id"]
            token = STATE["amit_token"]
            uri = f"{WS_URL}/api/ws/{chat_id}?token={token}"
            received = []
            async with websockets.connect(uri, open_timeout=15) as ws:
                # ping
                await ws.send(json.dumps({"event": "ping"}))
                pong = await asyncio.wait_for(ws.recv(), timeout=10)
                assert "pong" in pong

                # trigger a REST message in background
                async def send_msg():
                    await asyncio.sleep(0.5)
                    requests.post(
                        f"{BASE_URL}/api/chats/{chat_id}/messages",
                        headers={"Authorization": f"Bearer {token}"},
                        json={"body": "WS broadcast test", "message_type": "text"},
                        timeout=15,
                    )

                send_task = asyncio.create_task(send_msg())
                # wait for message event
                for _ in range(10):
                    try:
                        data = await asyncio.wait_for(ws.recv(), timeout=10)
                    except asyncio.TimeoutError:
                        break
                    received.append(data)
                    obj = json.loads(data)
                    if obj.get("event") == "message" and "WS broadcast test" in (
                        obj.get("data", {}).get("body") or ""
                    ):
                        break
                await send_task
            return received

        results = asyncio.run(run())
        # ensure at least one event was a message broadcast for our text
        matched = False
        for r in results:
            try:
                o = json.loads(r)
                if o.get("event") == "message" and "WS broadcast test" in (
                    o.get("data", {}).get("body") or ""
                ):
                    matched = True
                    break
            except Exception:
                pass
        assert matched, f"WS did not broadcast message. Received: {results}"


# ===== CLEANUP =====
@pytest.fixture(scope="session", autouse=True)
def cleanup_after_session(request, demo_login):
    yield
    # best-effort cleanup of TEST_ items via API
    token = demo_login["token"]
    h = {"Authorization": f"Bearer {token}"}
    try:
        if "folder_id" in STATE:
            requests.delete(f"{BASE_URL}/api/folders/{STATE['folder_id']}", headers=h, timeout=10)
        if "task_id" in STATE:
            requests.delete(f"{BASE_URL}/api/tasks/{STATE['task_id']}", headers=h, timeout=10)
    except Exception:
        pass
