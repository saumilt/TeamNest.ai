"""Iteration 83 — Build Room feature batch: streamed talk-to-build,
build activity polling, builder suggest endpoint, build-ideas, simple app
builder templates flow, /dev-os template slash command.

IMPORTANT: uses POST /api/auth/login with amit@demo.team (NOT /api/auth/demo-login
which RESETS the demo workspace).
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")

# Project with code files, per review request
PROJECT_ID_WITH_CODE = "8aa2fc67-3899-4e36-87a0-1ac35cc6cb42"  # Restaurant Franchise
FREE_TEMPLATE_ID = "abfd9852-ae1d-44fe-b777-cd41d55f91d1"  # Helpdesk & Ticketing


@pytest.fixture(scope="module")
def amit_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "amit@demo.team", "password": "Demo@2026"},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in login response: {data}"
    s.headers["Authorization"] = f"Bearer {tok}"
    return s


# ─── Feature 1: Streamed talk-to-build ─────────────────────────────────
class TestTalkToBuildStreamed:
    def test_project_exists(self, amit_client):
        r = amit_client.get(f"{BASE_URL}/api/dev-projects/{PROJECT_ID_WITH_CODE}", timeout=15)
        assert r.status_code == 200, r.text
        proj = r.json()
        assert proj["id"] == PROJECT_ID_WITH_CODE

    def test_talk_returns_activity_id_immediately(self, amit_client):
        t0 = time.time()
        r = amit_client.post(
            f"{BASE_URL}/api/dev-projects/{PROJECT_ID_WITH_CODE}/talk",
            json={"instruction": "Add a small footer with the text 'Powered by TeamNest'."},
            timeout=15,
        )
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert "activity_id" in data and isinstance(data["activity_id"], str)
        # streamed → should return quickly (< 8s)
        assert elapsed < 10, f"talk did not stream — took {elapsed:.1f}s"
        pytest.talk_activity_id = data["activity_id"]

    def test_activity_polls_running_and_completes(self, amit_client):
        aid = getattr(pytest, "talk_activity_id", None)
        assert aid, "talk_activity_id fixture missing — prior test failed"
        deadline = time.time() + 180  # generous for LLM
        last = None
        while time.time() < deadline:
            try:
                r = amit_client.get(f"{BASE_URL}/api/build-activities/{aid}", timeout=30)
            except requests.exceptions.ReadTimeout:
                time.sleep(2)
                continue
            assert r.status_code == 200, r.text
            last = r.json()
            if last.get("status") in ("done", "error"):
                break
            time.sleep(3)
        assert last is not None
        assert last["status"] in ("done", "error"), f"never terminated: {last.get('status')}"
        # steps should have been added along the way
        steps = last.get("steps") or []
        step_labels = " | ".join([s.get("label", "") for s in steps])
        assert len(steps) >= 1, f"no steps recorded: {last}"
        # Should include expected step labels
        assert any("Reading" in s.get("label", "") for s in steps), step_labels
        pytest.talk_final = last

    def test_activity_has_summary_and_screenshot_if_ok(self, amit_client):
        final = getattr(pytest, "talk_final", None)
        assert final is not None
        # If result_ok, expect screenshot_b64 present (data:image/... base64) and smoke set
        if final.get("result_ok") is True:
            shot = final.get("screenshot_b64")
            assert shot, "expected screenshot_b64 on successful edit"
            assert shot.startswith("data:image/"), f"screenshot not data URI: {shot[:60]}"
            # base64 body should exist
            assert len(shot) > 500, "screenshot too small"
            # smoke object
            assert "smoke" in final
            # files_changed present (may be empty if the edit merged)
            assert "files_changed" in final
        # summary is always populated
        assert (final.get("summary") or "").strip() != ""

    def test_talk_rejects_short_instruction(self, amit_client):
        r = amit_client.post(
            f"{BASE_URL}/api/dev-projects/{PROJECT_ID_WITH_CODE}/talk",
            json={"instruction": "x"}, timeout=10,
        )
        assert r.status_code == 400

    def test_talk_accepts_long_instruction_up_to_4000(self, amit_client):
        long_text = "Add a note that the app is powered by TeamNest. " + ("Please be careful with layout. " * 100)
        assert len(long_text) > 3000 and len(long_text) < 4000
        r = amit_client.post(
            f"{BASE_URL}/api/dev-projects/{PROJECT_ID_WITH_CODE}/talk",
            json={"instruction": long_text}, timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("activity_id")

    def test_build_activities_returns_404_for_bad_id(self, amit_client):
        r = amit_client.get(f"{BASE_URL}/api/build-activities/does-not-exist", timeout=30)
        assert r.status_code == 404


# ─── Feature 5: Builders suggest ────────────────────────────────────────
class TestBuildersSuggest:
    def test_suggest_roles(self, amit_client):
        r = amit_client.post(
            f"{BASE_URL}/api/dev-projects/{PROJECT_ID_WITH_CODE}/builders/roles/suggest",
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("builder") == "roles"
        spec = data.get("spec") or {}
        # 'roles' spec should carry items under some key — check items key populated
        # The items key varies; verify at least one list has entries
        has_items = any(isinstance(v, list) and len(v) > 0 for v in spec.values())
        assert has_items, f"suggest returned empty spec: {spec}"

    def test_suggest_report(self, amit_client):
        r = amit_client.post(
            f"{BASE_URL}/api/dev-projects/{PROJECT_ID_WITH_CODE}/builders/report/suggest",
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("builder") == "report"
        spec = data.get("spec") or {}
        has_items = any(isinstance(v, list) and len(v) > 0 for v in spec.values())
        assert has_items

    def test_suggest_bad_builder_key(self, amit_client):
        r = amit_client.post(
            f"{BASE_URL}/api/dev-projects/{PROJECT_ID_WITH_CODE}/builders/bogus/suggest",
            timeout=15,
        )
        assert r.status_code == 400


# ─── Feature 6: Build-ideas endpoint ────────────────────────────────────
class TestBuildIdeas:
    def test_build_ideas_returns_4(self, amit_client):
        r = amit_client.get(
            f"{BASE_URL}/api/dev-projects/{PROJECT_ID_WITH_CODE}/build-ideas",
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        ideas = data.get("ideas") or []
        assert isinstance(ideas, list)
        assert 3 <= len(ideas) <= 6, f"expected ~4 ideas, got {len(ideas)}"
        for it in ideas:
            assert "label" in it and isinstance(it["label"], str) and it["label"].strip()
            assert "prompt" in it and isinstance(it["prompt"], str) and it["prompt"].strip()


# ─── Feature 7 & 8: Template marketplace list + /dev-os template slash ─
class TestTemplateMarket:
    def test_list_templates(self, amit_client):
        r = amit_client.get(f"{BASE_URL}/api/market/templates", timeout=15)
        assert r.status_code == 200
        tpl = r.json()
        # response could be {templates: [...]} or list
        items = tpl.get("templates") if isinstance(tpl, dict) else tpl
        assert isinstance(items, list) and len(items) > 0
        ids = [t["id"] for t in items if "id" in t]
        assert FREE_TEMPLATE_ID in ids, f"free template not present: {ids[:5]}"
        pytest.templates = items

    def test_paid_template_exists(self):
        items = getattr(pytest, "templates", [])
        paid = [t for t in items if ((t.get("pricing") or {}).get("model") != "free") or ((t.get("pricing") or {}).get("price_usd") or 0) > 0]
        assert len(paid) > 0, f"no paid templates in marketplace (checked {len(items)})"
        pytest.paid_template_id = paid[0]["id"]


# ─── Feature 8: /dev-os template slash command ──────────────────────────
class TestDevOsTemplateSlash:
    def _find_or_create_chat(self, amit_client):
        # find a team chat we can post into
        r = amit_client.get(f"{BASE_URL}/api/chats", timeout=15)
        assert r.status_code == 200
        chats = r.json() if isinstance(r.json(), list) else r.json().get("chats", [])
        # Pick the first non-DM group chat
        for c in chats:
            if c.get("type") in ("group", "channel", "team"):
                return c["id"]
        # fallback to first
        assert chats, "no chats available"
        return chats[0]["id"]

    def test_slash_dev_os_template_lists_ideas(self, amit_client):
        chat_id = self._find_or_create_chat(amit_client)
        pytest.slash_chat_id = chat_id
        r = amit_client.post(
            f"{BASE_URL}/api/chats/{chat_id}/messages",
            json={"body": "/dev-os template", "message_type": "text"},
            timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        # wait briefly and fetch messages
        time.sleep(2.5)
        r = amit_client.get(f"{BASE_URL}/api/chats/{chat_id}/messages?limit=10", timeout=15)
        assert r.status_code == 200
        msgs = r.json() if isinstance(r.json(), list) else r.json().get("messages", [])
        # Find latest ai-system message with idea_chips
        found = None
        for m in msgs:
            meta = m.get("metadata") or {}
            if m.get("sender_id") == "ai-system" and meta.get("idea_chips"):
                found = m
                break
        assert found is not None, f"no ai-system reply with idea_chips: {[m.get('sender_id') for m in msgs[:5]]}"
        chips = (found["metadata"] or {}).get("idea_chips") or []
        assert len(chips) >= 1, f"empty idea_chips: {found['metadata']}"


# ─── Regression: /api/market/templates free install (light) ─────────────
class TestFreeInstallRegression:
    def test_get_templates_has_pricing(self, amit_client):
        r = amit_client.get(f"{BASE_URL}/api/market/templates", timeout=15)
        assert r.status_code == 200
        tpl = r.json()
        items = tpl.get("templates") if isinstance(tpl, dict) else tpl
        assert any(t.get("price_usd", 0) == 0 for t in items), "no free templates"
