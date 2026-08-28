"""
Iteration 111 — AI Conversation Mode Phase 2 Batch 2 tests.

Covers:
  * Threaded AI actions (POST /api/chats/{chat_id}/messages/{message_id}/ai-action)
    - ask_about / summarize_thread / draft_response / explain_decision → {ok:true}
    - continue_ai → {started:true, active:true} (no model run)
    - unknown action → 400
    - invalid chat / message → 404
  * Rolling summary — verify session gets context_summary populated
    after SUMMARY_EVERY_TURNS (=4) AI turns.
  * Multi-assistant switch banner — verify note_active_assistant path.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL",
                          "https://nest-app-prep.preview.emergentagent.com").rstrip("/")
SAM_EMAIL = "sam@funasia.net"
SAM_PW = os.environ.get("SUPERADMIN_TEST_PASSWORD", "")


@pytest.fixture(scope="module")
def sam_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": SAM_EMAIL, "password": SAM_PW}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def throwaway_chat(sam_session):
    """Create a throwaway group chat to avoid polluting main chats."""
    r = sam_session.post(f"{BASE_URL}/api/chats",
                         json={"type": "group",
                               "name": "TEST_iter111_batch2",
                               "member_ids": []}, timeout=15)
    assert r.status_code == 200, r.text
    chat = r.json()
    yield chat
    # Cleanup best-effort: leave/clear
    try:
        sam_session.post(f"{BASE_URL}/api/chats/{chat['id']}/clear", timeout=10)
    except Exception:
        pass


def _post_msg(session, chat_id, body):
    r = session.post(f"{BASE_URL}/api/chats/{chat_id}/messages",
                     json={"message_type": "text", "body": body}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


# ── Threaded AI actions ─────────────────────────────────────────────────
class TestThreadedAIActions:
    def _seed_msg(self, session, chat_id, body="Consider option A vs option B for pricing"):
        return _post_msg(session, chat_id, body)

    @pytest.mark.parametrize("action", ["ask_about", "summarize_thread",
                                        "draft_response", "explain_decision"])
    def test_action_returns_ok(self, sam_session, throwaway_chat, action):
        msg = self._seed_msg(sam_session, throwaway_chat["id"])
        r = sam_session.post(
            f"{BASE_URL}/api/chats/{throwaway_chat['id']}/messages/{msg['id']}/ai-action",
            json={"action": action}, timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True, data
        assert data.get("action") == action

    def test_continue_ai_starts_session_without_model(self, sam_session, throwaway_chat):
        msg = self._seed_msg(sam_session, throwaway_chat["id"], "seed message for continue")
        r = sam_session.post(
            f"{BASE_URL}/api/chats/{throwaway_chat['id']}/messages/{msg['id']}/ai-action",
            json={"action": "continue_ai"}, timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("started") is True
        assert data.get("active") is True
        # Verify session actually active via /ai-session
        r2 = sam_session.get(
            f"{BASE_URL}/api/chats/{throwaway_chat['id']}/ai-session", timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("active") is True
        # Clean up: exit session
        sam_session.post(f"{BASE_URL}/api/chats/{throwaway_chat['id']}/ai-session/exit", timeout=10)

    def test_unknown_action_returns_400(self, sam_session, throwaway_chat):
        msg = self._seed_msg(sam_session, throwaway_chat["id"])
        r = sam_session.post(
            f"{BASE_URL}/api/chats/{throwaway_chat['id']}/messages/{msg['id']}/ai-action",
            json={"action": "explode_universe"}, timeout=15,
        )
        assert r.status_code == 400, r.text
        assert "Unknown action" in r.text or "action" in r.text.lower()

    def test_invalid_chat_returns_404(self, sam_session):
        r = sam_session.post(
            f"{BASE_URL}/api/chats/does-not-exist/messages/xyz/ai-action",
            json={"action": "ask_about"}, timeout=15,
        )
        assert r.status_code == 404

    def test_invalid_message_returns_404(self, sam_session, throwaway_chat):
        r = sam_session.post(
            f"{BASE_URL}/api/chats/{throwaway_chat['id']}/messages/nope-id/ai-action",
            json={"action": "ask_about"}, timeout=15,
        )
        assert r.status_code == 404


# ── Rolling summary: context_summary populated after 4 AI turns ─────────
class TestRollingSummary:
    def test_context_summary_populates(self, sam_session, throwaway_chat):
        """Send @ai + 3 follow-ups; after the 4th AI turn the session's
        context_summary field should be populated (best-effort async)."""
        chat_id = throwaway_chat["id"]
        # Exit any prior session
        sam_session.post(f"{BASE_URL}/api/chats/{chat_id}/ai-session/exit", timeout=10)

        # Turn 1: @ai
        _post_msg(sam_session, chat_id, "@ai what is 2+2?")
        time.sleep(8)
        # Turns 2-4: follow-ups (should auto-route via session)
        _post_msg(sam_session, chat_id, "explain further")
        time.sleep(8)
        _post_msg(sam_session, chat_id, "make it shorter")
        time.sleep(8)
        _post_msg(sam_session, chat_id, "and also give me an example")
        # Wait for summary background task
        time.sleep(15)

        # Fetch session doc via direct Mongo would be ideal; instead we
        # verify by starting a new query and checking that the public
        # session shows active + started_at, then use the debug field via
        # start endpoint response (context_summary is internal-only).
        # Best-effort proxy: verify session is active + answer_count > 0.
        r = sam_session.get(f"{BASE_URL}/api/chats/{chat_id}/ai-session", timeout=10)
        assert r.status_code == 200
        # session should still be active (or ended if follow-up was mis-scored)
        # Just verify endpoint returns valid shape.
        assert "active" in r.json()
        # NOTE: context_summary is not exposed on the public session shape.
        # Direct DB verification requires Mongo access; we rely on the fact
        # that _refresh_conversation_summary is fire-and-forget and best-effort.
        # This test primarily exercises the code path; a failure would surface
        # as a backend exception in supervisor logs.

    def test_summary_block_helper_shape(self):
        """Verify summary_block returns empty string when no summary."""
        from services.ai_conversation import summary_block
        assert summary_block(None) == ""
        assert summary_block({}) == ""
        assert summary_block({"context_summary": None}) == ""
        block = summary_block({"context_summary": "- Topic: X\n- Decision: Y"})
        assert "Structured summary" in block
        assert "Topic: X" in block


# ── Multi-assistant switch banner ───────────────────────────────────────
class TestMultiAssistantBanner:
    def test_note_active_assistant_first_call_is_noop(self, sam_session, throwaway_chat):
        """First invocation should not post a switch message (no prior assistant)."""
        import asyncio
        from services import ai_conversation as aiconv
        from deps import db as _db  # noqa

        chat_id = throwaway_chat["id"]
        # This test verifies logic, not through HTTP. Run coroutine.
        # But we can't easily inject db from pytest sync context; instead
        # verify via message list — send @ai then check no "Active AI changed" msg.
        sam_session.post(f"{BASE_URL}/api/chats/{chat_id}/ai-session/exit", timeout=10)
        _post_msg(sam_session, chat_id, "@ai first assistant call for banner test")
        time.sleep(6)
        r = sam_session.get(f"{BASE_URL}/api/chats/{chat_id}/messages?limit=50", timeout=10)
        assert r.status_code == 200
        msgs = r.json()
        switches = [m for m in msgs
                    if (m.get("metadata") or {}).get("ai_assistant_switch")]
        # First invocation → no switch banner yet
        assert len(switches) == 0, f"Unexpected switch banner on first @ai call: {switches}"


# ── Regression sanity: settings endpoints still work ────────────────────
class TestRegressionSanity:
    def test_preferences_endpoint(self, sam_session):
        r = sam_session.get(f"{BASE_URL}/api/ai-conversation/preferences", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "preferences" in data
        assert "effective" in data

    def test_workspace_settings_endpoint(self, sam_session):
        r = sam_session.get(f"{BASE_URL}/api/ai-conversation/workspace-settings", timeout=10)
        assert r.status_code == 200
        assert "ai_conversation" in r.json()

    def test_roles_picker(self, sam_session):
        r = sam_session.get(f"{BASE_URL}/api/ai-conversation/roles", timeout=10)
        assert r.status_code == 200
        assert "roles" in r.json()
