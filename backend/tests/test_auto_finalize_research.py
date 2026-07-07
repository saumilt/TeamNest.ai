"""Tests for the new AUTO-FINALIZE AI research feature.

Covers:
- POST /api/ai/research → auto-picks best, auto-synthesizes, posts an ai_answer
  chat message; thread has final_answer & auto_synthesized=true.
- Exactly one response has selected_as_best=true after auto-finalize.
- POST /api/ai/responses/{id}/select-best  (default resynthesize=true) →
  re-runs synth, posts NEW ai_answer with metadata.resynthesized=true.
- POST /api/ai/responses/{id}/select-best?resynthesize=false → only flips flag,
  no new chat message posted.
- GET /api/ai/research/{thread_id} returns thread with final_answer.
- @AI inline command also auto-finalizes (posts synthesized answer, not placeholder).
"""
import os
import time
import uuid

import pytest
import requests

def _load_base_url():
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if not val:
        # read from /app/frontend/.env
        env_path = "/app/frontend/.env"
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.strip().startswith("REACT_APP_BACKEND_URL="):
                        val = line.split("=", 1)[1].strip()
                        break
    assert val, "REACT_APP_BACKEND_URL is not set"
    return val.rstrip("/")


BASE_URL = _load_base_url()


# ---------- module-scope fixtures (single demo login, single chat) ----------

@pytest.fixture(scope="module")
def hdr():
    r = requests.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def chat_id(hdr):
    name = f"TEST_AutoFinalize_{uuid.uuid4().hex[:6]}"
    r = requests.post(
        f"{BASE_URL}/api/chats",
        json={"name": name, "type": "group", "member_ids": []},
        headers=hdr, timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def research_thread(hdr, chat_id):
    """Run a real research call once and reuse the thread + responses."""
    r = requests.post(
        f"{BASE_URL}/api/ai/research",
        json={
            "chat_id": chat_id,
            "question": "What is 2+2? Answer in one short sentence.",
            "selected_models": ["chatgpt", "claude", "gemini"],
        },
        headers=hdr, timeout=120,
    )
    assert r.status_code == 200, r.text
    return r.json()


# ---------- TESTS ----------

class TestAutoFinalize:
    """POST /api/ai/research returns auto-synthesized thread + chat message."""

    def test_thread_marked_complete_and_auto_synthesized(self, research_thread):
        t = research_thread["thread"]
        assert t["status"] == "complete", t
        assert t.get("auto_synthesized") is True
        assert isinstance(t.get("final_answer"), str) and len(t["final_answer"]) > 5

    def test_exactly_one_response_marked_best(self, research_thread):
        resps = research_thread["responses"]
        bests = [r for r in resps if r.get("selected_as_best")]
        assert len(bests) == 1, f"Expected 1 best, got {len(bests)}"

    def test_chat_has_synthesized_ai_answer_message(self, hdr, chat_id, research_thread):
        msgs = requests.get(
            f"{BASE_URL}/api/chats/{chat_id}/messages",
            headers=hdr, timeout=30,
        ).json()
        # Find the most recent ai_answer for this thread
        thread_id = research_thread["thread"]["id"]
        ai_answers = [
            m for m in msgs
            if m.get("message_type") == "ai_answer"
            and (m.get("metadata") or {}).get("thread_id") == thread_id
        ]
        assert ai_answers, "No ai_answer message posted for this thread"
        m = ai_answers[-1]
        meta = m["metadata"]
        assert meta.get("synthesized") is True
        assert meta.get("auto_synthesized") is True
        assert meta.get("best_model"), "best_model missing in metadata"
        # body MUST be the synthesized text, NOT placeholder
        body = m["body"] or ""
        placeholder_snippets = ["research complete", "AI research complete"]
        assert not any(p.lower() in body.lower() for p in placeholder_snippets), \
            f"Looks like a placeholder body: {body[:120]}"
        assert body.strip() == research_thread["thread"]["final_answer"].strip()

    def test_get_research_returns_final_answer(self, hdr, research_thread):
        tid = research_thread["thread"]["id"]
        r = requests.get(f"{BASE_URL}/api/ai/research/{tid}", headers=hdr, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["thread"].get("final_answer"), str)
        assert len(d["thread"]["final_answer"]) > 5


class TestSelectBestResynthesize:
    """POST /api/ai/responses/{id}/select-best default re-synthesizes & posts msg."""

    def test_select_different_best_triggers_resynth(self, hdr, chat_id, research_thread):
        resps = research_thread["responses"]
        current_best = next(r for r in resps if r["selected_as_best"])
        # pick a DIFFERENT response
        other = next(r for r in resps if r["id"] != current_best["id"])

        # baseline message count
        before = requests.get(
            f"{BASE_URL}/api/chats/{chat_id}/messages",
            headers=hdr, timeout=30,
        ).json()
        before_count = len(before)

        r = requests.post(
            f"{BASE_URL}/api/ai/responses/{other['id']}/select-best",
            headers=hdr, timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data == {"ok": True, "resynthesized": True}

        # New ai_answer with metadata.resynthesized = true posted
        time.sleep(1)
        after = requests.get(
            f"{BASE_URL}/api/chats/{chat_id}/messages",
            headers=hdr, timeout=30,
        ).json()
        assert len(after) >= before_count + 1, "No new message posted"

        resynth_msgs = [
            m for m in after
            if m.get("message_type") == "ai_answer"
            and (m.get("metadata") or {}).get("resynthesized") is True
        ]
        assert resynth_msgs, "No message with metadata.resynthesized=true found"
        latest = resynth_msgs[-1]
        assert latest["metadata"]["best_model"] == other["model_name"], \
            f"best_model should be {other['model_name']} got {latest['metadata'].get('best_model')}"
        # body should NOT be placeholder
        assert "complete" not in (latest["body"] or "").lower()[:30]

        # Verify DB state
        d = requests.get(
            f"{BASE_URL}/api/ai/research/{research_thread['thread']['id']}",
            headers=hdr, timeout=30,
        ).json()
        bests = [r for r in d["responses"] if r["selected_as_best"]]
        assert len(bests) == 1
        assert bests[0]["id"] == other["id"]

    def test_select_best_resynthesize_false_skips_msg(self, hdr, chat_id, research_thread):
        resps = research_thread["responses"]
        # pick the response that is currently NOT best
        d = requests.get(
            f"{BASE_URL}/api/ai/research/{research_thread['thread']['id']}",
            headers=hdr, timeout=30,
        ).json()
        cur_best_id = next(r["id"] for r in d["responses"] if r["selected_as_best"])
        target = next(r for r in resps if r["id"] != cur_best_id)

        before = requests.get(
            f"{BASE_URL}/api/chats/{chat_id}/messages",
            headers=hdr, timeout=30,
        ).json()
        before_count = len(before)

        r = requests.post(
            f"{BASE_URL}/api/ai/responses/{target['id']}/select-best?resynthesize=false",
            headers=hdr, timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True, "resynthesized": False}

        # No new chat message
        time.sleep(0.5)
        after = requests.get(
            f"{BASE_URL}/api/chats/{chat_id}/messages",
            headers=hdr, timeout=30,
        ).json()
        assert len(after) == before_count, \
            f"Expected no new message; before={before_count} after={len(after)}"

        # best flag flipped
        d2 = requests.get(
            f"{BASE_URL}/api/ai/research/{research_thread['thread']['id']}",
            headers=hdr, timeout=30,
        ).json()
        bests = [x for x in d2["responses"] if x["selected_as_best"]]
        assert len(bests) == 1 and bests[0]["id"] == target["id"]


class TestInlineAICommandAutoFinalize:
    """Sending '@AI ask <models> about <q>' as a message should post synthesized answer."""

    def test_inline_ai_command_posts_synthesized_answer(self, hdr, chat_id):
        body = "@AI ask chatgpt, claude about What is the capital of France? One short sentence."
        r = requests.post(
            f"{BASE_URL}/api/chats/{chat_id}/messages",
            json={"body": body, "message_type": "text"},
            headers=hdr, timeout=30,
        )
        assert r.status_code == 200, r.text

        # Poll for ai_answer message (auto-synthesized) — up to 80s
        deadline = time.time() + 80
        found = None
        while time.time() < deadline:
            msgs = requests.get(
                f"{BASE_URL}/api/chats/{chat_id}/messages",
                headers=hdr, timeout=30,
            ).json()
            ai_answers = [
                m for m in msgs
                if m.get("message_type") == "ai_answer"
                and (m.get("metadata") or {}).get("auto_synthesized") is True
            ]
            # We want the one created AFTER our inline command
            # (just look for the latest auto_synthesized whose models include chatgpt+claude)
            for m in reversed(ai_answers):
                meta = m["metadata"]
                if set(meta.get("models") or []) >= {"chatgpt", "claude"}:
                    found = m
                    break
            if found:
                break
            time.sleep(3)

        assert found, "No auto-synthesized ai_answer message produced by @AI command in time"
        body_out = found["body"] or ""
        # Not a placeholder
        assert "research complete" not in body_out.lower()[:60], \
            f"Looks like placeholder, got: {body_out[:120]}"
        assert found["metadata"].get("synthesized") is True
        assert found["metadata"].get("best_model")
        assert len(body_out) > 5
