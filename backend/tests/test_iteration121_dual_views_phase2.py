"""Iteration 121 — Phase 1 tail + Phase 2 Dual Human/AI Views (backend).

Covers:
- POST /api/ai/research with linked_message_id → visibility=='private',
  no ai_answer message posted for that thread_id.
- GET /api/ai/research/{threadId}: 200 for creator, 403 for another user on
  a PRIVATE thread. GET /api/chats/{id}/ai-discussions must NOT list another
  user's private discussions.
- PATCH /api/ai/threads/{id}/visibility persists; only creator can change
  (403 otherwise).
- POST /api/ai/threads/{id}/publish posts a text message with
  metadata.ai_publication for each of 6 types (custom uses custom_text).
- POST /api/ai/threads/{id}/save-knowledge → {ok: true}.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com"
).rstrip("/")

CHAT_ID = "d77a7d2a-b6e9-4923-89cd-54a21880c6a6"  # AIConv Test (Sam)
KNOWN_HUMAN_MSG = "5b7c243e-f579-49ca-88a0-811a4b744d97"
KNOWN_PRIVATE_THREAD = "b46053b5-1d3c-47d5-ac2f-ee1facbe00e5"  # creator=Sam


def _login(email: str, password: str) -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, f"login {email} → {r.status_code}: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def sam_headers():
    tok = _login("sam@funasia.net", "Perfect$2008")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def os_headers():
    tok = _login("os@radciti.com", "Summer$123")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- ACCESS: known private thread (fast, no LLM) ----------

class TestAccessOnKnownPrivateThread:
    """Uses the pre-existing PRIVATE thread supplied by main agent (Sam's).
    Fast checks that don't require running the LLM pipeline."""

    def test_creator_can_get_thread(self, sam_headers):
        r = requests.get(
            f"{BASE_URL}/api/ai/research/{KNOWN_PRIVATE_THREAD}",
            headers=sam_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["thread"]["id"] == KNOWN_PRIVATE_THREAD
        assert body["thread"]["visibility"] == "private"
        assert body["thread"]["created_by"]  # sanity: has a creator

    def test_other_user_forbidden_on_private(self, os_headers):
        r = requests.get(
            f"{BASE_URL}/api/ai/research/{KNOWN_PRIVATE_THREAD}",
            headers=os_headers, timeout=30,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"

    def test_ai_dashboard_hides_others_private(self, os_headers):
        """os (non-member of AIConv Test) hitting the chat dashboard should
        get 404 for chat access (or, if it returned 200 for some reason,
        must NOT include Sam's private thread)."""
        r = requests.get(
            f"{BASE_URL}/api/chats/{CHAT_ID}/ai-discussions",
            headers=os_headers, timeout=30,
        )
        # os is not a chat member → 404 expected
        if r.status_code == 200:
            ids = [t["id"] for t in r.json().get("discussions", r.json())]
            assert KNOWN_PRIVATE_THREAD not in ids, (
                "Private thread leaked to non-member in ai-discussions"
            )
        else:
            assert r.status_code in (403, 404), r.status_code

    def test_non_creator_cannot_change_visibility(self, os_headers):
        r = requests.patch(
            f"{BASE_URL}/api/ai/threads/{KNOWN_PRIVATE_THREAD}/visibility",
            headers=os_headers,
            json={"visibility": "chat"},
            timeout=30,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


# ---------- PUBLISH + SAVE-KNOWLEDGE on the known private thread ----------

class TestPublishAndSaveKnowledge:
    def _fetch_msg(self, headers, chat_id, msg_id):
        r = requests.get(
            f"{BASE_URL}/api/chats/{chat_id}/messages?limit=200",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        for m in r.json():
            if m["id"] == msg_id:
                return m
        return None

    @pytest.mark.parametrize("ptype", [
        "executive_summary",
        "recommendation",
        "key_findings",
        "action_items",
        "risks",
    ])
    def test_publish_each_type_creates_text_msg_with_metadata(
        self, sam_headers, ptype
    ):
        r = requests.post(
            f"{BASE_URL}/api/ai/threads/{KNOWN_PRIVATE_THREAD}/publish",
            headers=sam_headers,
            json={"publication_type": ptype},
            timeout=60,
        )
        assert r.status_code == 200, f"{ptype} publish → {r.status_code}: {r.text}"
        msg = r.json()
        assert msg["message_type"] == "text"
        assert msg["chat_id"] == CHAT_ID
        pub = (msg.get("metadata") or {}).get("ai_publication") or {}
        assert pub.get("thread_id") == KNOWN_PRIVATE_THREAD
        assert pub.get("type") == ptype
        # header should be present in body
        assert "AI Research" in msg["body"], msg["body"][:120]
        # Confirm it landed in the messages endpoint (persisted)
        seen = self._fetch_msg(sam_headers, CHAT_ID, msg["id"])
        assert seen is not None, "published message not found in chat messages"
        assert (seen.get("metadata") or {}).get("ai_publication", {}).get(
            "thread_id"
        ) == KNOWN_PRIVATE_THREAD

    def test_publish_custom_uses_provided_text(self, sam_headers):
        marker = "TEST_ITER121_CUSTOM_PUBLISH_XYZ"
        r = requests.post(
            f"{BASE_URL}/api/ai/threads/{KNOWN_PRIVATE_THREAD}/publish",
            headers=sam_headers,
            json={"publication_type": "custom", "custom_text": marker},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        msg = r.json()
        assert marker in msg["body"]
        assert (msg["metadata"]["ai_publication"]["type"]) == "custom"

    def test_publish_forbidden_for_non_creator_private(self, os_headers):
        r = requests.post(
            f"{BASE_URL}/api/ai/threads/{KNOWN_PRIVATE_THREAD}/publish",
            headers=os_headers,
            json={"publication_type": "executive_summary"},
            timeout=30,
        )
        assert r.status_code == 403, r.status_code

    def test_save_knowledge_ok(self, sam_headers):
        r = requests.post(
            f"{BASE_URL}/api/ai/threads/{KNOWN_PRIVATE_THREAD}/save-knowledge",
            headers=sam_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True

    def test_save_knowledge_forbidden_non_creator(self, os_headers):
        r = requests.post(
            f"{BASE_URL}/api/ai/threads/{KNOWN_PRIVATE_THREAD}/save-knowledge",
            headers=os_headers, timeout=30,
        )
        assert r.status_code == 403, r.status_code


# ---------- VISIBILITY PATCH round-trip on the known thread ----------

class TestVisibilityRoundTrip:
    def test_creator_can_flip_and_restore(self, sam_headers):
        # Read current
        r = requests.get(
            f"{BASE_URL}/api/ai/research/{KNOWN_PRIVATE_THREAD}",
            headers=sam_headers, timeout=30,
        )
        original_vis = r.json()["thread"]["visibility"]
        try:
            # flip to shared with empty list
            r = requests.patch(
                f"{BASE_URL}/api/ai/threads/{KNOWN_PRIVATE_THREAD}/visibility",
                headers=sam_headers,
                json={"visibility": "shared", "shared_user_ids": []},
                timeout=30,
            )
            assert r.status_code == 200, r.text
            assert r.json()["visibility"] == "shared"

            r = requests.get(
                f"{BASE_URL}/api/ai/research/{KNOWN_PRIVATE_THREAD}",
                headers=sam_headers, timeout=30,
            )
            assert r.json()["thread"]["visibility"] == "shared"
        finally:
            # restore
            r = requests.patch(
                f"{BASE_URL}/api/ai/threads/{KNOWN_PRIVATE_THREAD}/visibility",
                headers=sam_headers,
                json={"visibility": original_vis},
                timeout=30,
            )
            assert r.status_code == 200


# ---------- PHASE 1 TAIL: create a NEW linked private discussion (LLM) ----------

class TestCreateLinkedPrivateDiscussion:
    """Actually calls /api/ai/research with linked_message_id — this hits real
    LLMs and can take 15–40s. Uses a single cheap model to stay fast."""

    def test_linked_message_creates_private_no_chat_post(self, sam_headers):
        # Pre-count ai_answer msgs to make sure the new one doesn't add any.
        pre = requests.get(
            f"{BASE_URL}/api/chats/{CHAT_ID}/messages?limit=500",
            headers=sam_headers, timeout=30,
        )
        assert pre.status_code == 200
        pre_ai_ids = {m["id"] for m in pre.json() if m.get("message_type") == "ai_answer"}

        payload = {
            "chat_id": CHAT_ID,
            "question": "TEST_ITER121: In one sentence, what does this mean?",
            "selected_models": ["gpt-4o-mini"],
            "linked_message_id": KNOWN_HUMAN_MSG,
            "title": "TEST_ITER121 linked",
        }
        r = requests.post(
            f"{BASE_URL}/api/ai/research", headers=sam_headers,
            json=payload, timeout=180,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        out = r.json()
        thread = out["thread"]
        assert thread["visibility"] == "private", thread
        assert thread.get("linked_human_message_id") == KNOWN_HUMAN_MSG
        tid = thread["id"]

        # give the finalize step a moment (it's awaited, but be safe)
        time.sleep(1)

        post = requests.get(
            f"{BASE_URL}/api/chats/{CHAT_ID}/messages?limit=500",
            headers=sam_headers, timeout=30,
        )
        assert post.status_code == 200
        # No new ai_answer message associated with this thread_id
        for m in post.json():
            if m.get("message_type") != "ai_answer":
                continue
            if m["id"] in pre_ai_ids:
                continue
            meta = m.get("metadata") or {}
            assert meta.get("thread_id") != tid, (
                f"Private linked thread posted an ai_answer to chat: {m}"
            )

        # Second user gets 403 on this brand-new private thread
        os_tok = _login("os@radciti.com", "Summer$123")
        r2 = requests.get(
            f"{BASE_URL}/api/ai/research/{tid}",
            headers={"Authorization": f"Bearer {os_tok}"}, timeout=30,
        )
        assert r2.status_code == 403, r2.status_code
