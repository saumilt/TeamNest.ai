"""
Iteration 84 - Hire @devmanager gates + config + slash commands
Tests for:
  1. GET /api/hire-devmanager/config
  2. @devmanager gating in unhired chat -> hire_prompt card + throttle
  3. Demo bypass hire flow flips dev_team_hired + linked project
  4. Dev project /talk & builders/generate 402 when unhired, 200 after hire
"""

import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": "amit@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    # Cookie also usable
    return s


# ── (1) GET /api/hire-devmanager/config ────────────────────────────────
class TestHireDevManagerConfig:
    def test_config_returns_199_usd(self, client):
        r = client.get(f"{API}/hire-devmanager/config")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("price_usd") == 199.0
        assert data.get("currency") == "usd"


# ── (2) & (3) Hire flow ────────────────────────────────────────────────
class TestHirePromptCard:
    @pytest.fixture(scope="class")
    def fresh_chat(self, client):
        r = client.post(f"{API}/chats", json={
            "name": "TEST_iter84_hireprompt",
            "type": "group",
            "member_ids": [],
        })
        assert r.status_code in (200, 201), r.text
        return r.json()

    def test_send_devmanager_message_posts_hire_prompt(self, client, fresh_chat):
        chat_id = fresh_chat["id"]
        # Post @devmanager mention
        r = client.post(f"{API}/chats/{chat_id}/messages", json={
            "body": "@devmanager build me a todo app",
        })
        assert r.status_code in (200, 201), r.text

        # Iteration 85: first mention triggers a free plan-teaser (LLM, can
        # take ~15s) followed by the hire_prompt card. Poll up to ~30s.
        found = None
        for _ in range(30):
            time.sleep(1)
            msgs_r = client.get(f"{API}/chats/{chat_id}/messages")
            assert msgs_r.status_code == 200
            for m in msgs_r.json():
                if (m.get("metadata") or {}).get("hire_prompt"):
                    found = m
                    break
            if found:
                break
        assert found is not None, "No hire_prompt card posted"
        assert found["metadata"]["hire_prompt"].get("price_usd") == 199.0
        assert found["message_type"] == "ai-agent"

        msgs = msgs_r.json()
        # The one-time plan teaser must also have been posted (no code).
        teasers = [m for m in msgs if (m.get("metadata") or {}).get("plan_teaser")]
        assert len(teasers) == 1, f"expected 1 plan_teaser, got {len(teasers)}"

        # No REAL devmgr build reply — only teaser + hire card are allowed.
        for m in msgs:
            if m.get("message_type") != "ai-agent":
                continue
            md = m.get("metadata") or {}
            assert md.get("hire_prompt") or md.get("plan_teaser"), (
                f"unexpected ai-agent non-hire message: {m.get('body','')[:80]}"
            )

    def test_second_mention_is_throttled(self, client, fresh_chat):
        chat_id = fresh_chat["id"]
        r = client.post(f"{API}/chats/{chat_id}/messages", json={
            "body": "@devmanager please just build it",
        })
        assert r.status_code in (200, 201)
        time.sleep(3)
        msgs = client.get(f"{API}/chats/{chat_id}/messages").json()
        hire_cards = [m for m in msgs if (m.get("metadata") or {}).get("hire_prompt")]
        # Throttled to 1 per 2 minutes
        assert len(hire_cards) == 1, f"Expected 1 hire_prompt (throttle), got {len(hire_cards)}"
        # Teaser is one-time per chat — still exactly 1.
        teasers = [m for m in msgs if (m.get("metadata") or {}).get("plan_teaser")]
        assert len(teasers) == 1, f"Expected 1 plan_teaser (one-time), got {len(teasers)}"


class TestDemoBypassHire:
    @pytest.fixture(scope="class")
    def fresh_chat(self, client):
        r = client.post(f"{API}/chats", json={
            "name": "TEST_iter84_demohire",
            "type": "group",
            "member_ids": [],
        })
        assert r.status_code in (200, 201)
        return r.json()

    def test_demo_bypass_checkout_provisions(self, client, fresh_chat):
        chat_id = fresh_chat["id"]
        r = client.post(f"{API}/chats/{chat_id}/hire-dev-team/checkout", json={
            "origin_url": BASE_URL,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("provisioned") is True
        assert body.get("demo") is True
        assert body.get("project_id"), "no project_id in demo bypass response"
        # store for other tests
        fresh_chat["_hired_project_id"] = body["project_id"]

    def test_chat_dev_team_hired_true_after_provision(self, client, fresh_chat):
        chat_id = fresh_chat["id"]
        # Get chat metadata
        r = client.get(f"{API}/chats/{chat_id}")
        assert r.status_code == 200
        c = r.json()
        assert c.get("dev_team_hired") is True

    def test_devmanager_mention_after_hire_no_hire_prompt(self, client, fresh_chat):
        chat_id = fresh_chat["id"]
        r = client.post(f"{API}/chats/{chat_id}/messages", json={
            "body": "@devmanager say hi (test)",
        })
        assert r.status_code in (200, 201)
        # Wait a few seconds — should NOT get a new hire_prompt card
        time.sleep(5)
        msgs = client.get(f"{API}/chats/{chat_id}/messages").json()
        # zero hire_prompt cards after hire
        hire_cards = [m for m in msgs if (m.get("metadata") or {}).get("hire_prompt")]
        assert len(hire_cards) == 0, (
            f"hire_prompt still posted after hire: {[m.get('body','')[:60] for m in hire_cards]}"
        )
        # A non-hire ai-agent reply may or may not have arrived yet (LLM async).
        # Ok if it's still building — just verify no 402/hire_prompt regression.


# ── (4) Dev project /talk & builders/generate 402 ──────────────────────
class TestDevProjectGates:
    @pytest.fixture(scope="class")
    def unhired_project_id(self, client):
        """Self-contained unhired fixture: fresh chat + minimal project doc
        inserted directly (POST /dev-projects runs a slow LLM plan pass)."""
        r = client.post(f"{API}/chats", json={
            "name": "TEST_iter84_unhired_gate",
            "type": "group",
            "member_ids": [],
        })
        assert r.status_code in (200, 201), r.text
        chat_id = r.json()["id"]

        me = client.get(f"{API}/auth/me").json()
        user = me.get("user") or me
        ws = user.get("workspace_id")
        assert ws, f"no workspace_id in /auth/me: {me}"

        import uuid
        from dotenv import load_dotenv
        from pymongo import MongoClient
        load_dotenv("/app/backend/.env")
        db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        pid = str(uuid.uuid4())
        db.dev_projects.insert_one({
            "id": pid,
            "workspace_id": ws,
            "related_chat_id": chat_id,
            "name": "TEST_iter84_unhired_project",
            "description": "gate-test fixture",
            "status": "draft",
            "health": "stable",
            "version": "v0.1.0",
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        })
        return pid

    def test_get_unhired_project_shows_dev_team_hired_false(self, client, unhired_project_id):
        r = client.get(f"{API}/dev-projects/{unhired_project_id}")
        assert r.status_code == 200, r.text
        p = r.json()
        assert p.get("dev_team_hired") is False, (
            f"expected unhired project, got dev_team_hired={p.get('dev_team_hired')}"
        )

    def test_talk_returns_402_when_unhired(self, client, unhired_project_id):
        r = client.post(
            f"{API}/dev-projects/{unhired_project_id}/talk",
            json={"instruction": "Add a red header to the homepage."},
        )
        assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text}"
        # detail may be str or dict
        detail = r.json().get("detail")
        assert "hire_required" in str(detail), f"unexpected detail: {detail}"

    def test_builders_generate_returns_402_when_unhired(self, client, unhired_project_id):
        # Payload requires `text`; hire gate runs after pydantic validation.
        r = client.post(
            f"{API}/dev-projects/{unhired_project_id}/builders/data/generate",
            json={"text": "add a users table"},
        )
        assert r.status_code == 402, f"got {r.status_code}: {r.text}"
        assert "hire_required" in str(r.json().get("detail"))

    def test_builders_put_returns_402_when_unhired(self, client, unhired_project_id):
        r = client.put(
            f"{API}/dev-projects/{unhired_project_id}/builders/data",
            json={"spec": {"tables": []}},
        )
        assert r.status_code == 402

    def test_builders_suggest_returns_402_when_unhired(self, client, unhired_project_id):
        r = client.post(
            f"{API}/dev-projects/{unhired_project_id}/builders/data/suggest",
            json={},
        )
        assert r.status_code == 402


class TestDevProjectAfterHire:
    """Provision a fresh hired chat + linked project, then verify /talk works."""

    @pytest.fixture(scope="class")
    def hired_project_id(self, client):
        r = client.post(f"{API}/chats", json={
            "name": "TEST_iter84_hired_project_flow",
            "type": "group",
            "member_ids": [],
        })
        assert r.status_code in (200, 201)
        chat_id = r.json()["id"]
        r2 = client.post(f"{API}/chats/{chat_id}/hire-dev-team/checkout", json={
            "origin_url": BASE_URL,
        })
        assert r2.status_code == 200, r2.text
        pid = r2.json().get("project_id")
        assert pid
        return pid

    def test_project_dev_team_hired_true(self, client, hired_project_id):
        r = client.get(f"{API}/dev-projects/{hired_project_id}")
        assert r.status_code == 200
        assert r.json().get("dev_team_hired") is True

    def test_talk_returns_activity_id_after_hire(self, client, hired_project_id):
        r = client.post(
            f"{API}/dev-projects/{hired_project_id}/talk",
            json={"instruction": "Make the homepage header slightly taller."},
        )
        # Should be 200 with activity_id (async build), NOT 402
        assert r.status_code == 200, f"expected 200 after hire, got {r.status_code}: {r.text[:200]}"
        body = r.json()
        assert body.get("ok") is True
        assert body.get("activity_id"), "no activity_id returned"
