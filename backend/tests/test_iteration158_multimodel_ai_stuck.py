"""Iteration 158 — verify inline @ai runs (single, multi-model, multi with
perplexity) all resolve to an ai_answer message within a reasonable budget and
never leave the chat stuck on 'thinking'."""
import os, time, requests, pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE}/api"

# Poll budget — multi-model + synthesis can legitimately take a while.
POLL_TIMEOUT_S = 180
POLL_INTERVAL_S = 4


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/demo-login", json={}, timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def group_chat_id(session):
    r = session.get(f"{API}/chats", timeout=30)
    assert r.status_code == 200
    chats = r.json()
    for c in chats:
        if c.get("type") == "group":
            return c["id"]
    pytest.skip("No group chat available on demo workspace")


def _post_ai(session, chat_id, models, body_prefix="@ai "):
    payload = {
        "message_type": "text",
        "body": f"{body_prefix}Give me a one-line answer: what is 2+2?",
        "metadata": {"selected_models": models, "remember_models": False},
    }
    r = session.post(f"{API}/chats/{chat_id}/messages", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"post failed: {r.status_code} {r.text[:400]}"
    data = r.json()
    return data


def _wait_for_ai_answer(session, chat_id, after_iso, thread_id=None):
    """Poll GET /chats/{id}/messages until an ai_answer surfaces for our thread
    (or any ai_answer newer than after_iso if we don't have the thread id).
    Returns (found_msg, elapsed_seconds)."""
    start = time.time()
    while time.time() - start < POLL_TIMEOUT_S:
        r = session.get(f"{API}/chats/{chat_id}/messages", timeout=30)
        if r.status_code == 200:
            msgs = r.json()
            for m in msgs:
                if m.get("message_type") != "ai_answer":
                    continue
                if m.get("created_at", "") <= after_iso:
                    continue
                if thread_id and (m.get("metadata") or {}).get("thread_id") != thread_id:
                    continue
                return m, time.time() - start
        time.sleep(POLL_INTERVAL_S)
    return None, time.time() - start


def _kick(session, chat_id, models):
    """Post an @ai message, extract thread_id from the placeholder ai_question."""
    before = session.get(f"{API}/chats/{chat_id}/messages", timeout=30).json()
    latest = before[-1]["created_at"] if before else "1970-01-01T00:00:00Z"
    _post_ai(session, chat_id, models)
    # Find the ai_question placeholder for our new thread (posted just after).
    thread_id = None
    for _ in range(10):
        time.sleep(1)
        msgs = session.get(f"{API}/chats/{chat_id}/messages", timeout=30).json()
        for m in reversed(msgs):
            if m.get("message_type") == "ai_question" and m.get("created_at", "") > latest:
                thread_id = (m.get("metadata") or {}).get("thread_id")
                break
        if thread_id:
            break
    return latest, thread_id


# ── Single-model sanity ────────────────────────────────────────────────
def test_single_model_ai_returns_answer(session, group_chat_id):
    after, thread_id = _kick(session, group_chat_id, ["chatgpt"])
    msg, elapsed = _wait_for_ai_answer(session, group_chat_id, after, thread_id)
    assert msg is not None, f"Single-model @ai did not return an ai_answer within {POLL_TIMEOUT_S}s"
    assert msg.get("body"), "ai_answer has empty body"
    print(f"[single] answered in {elapsed:.1f}s, ai_error={((msg.get('metadata') or {}).get('ai_error'))}")


# ── CRITICAL: multi-model must not hang ────────────────────────────────
def test_multi_model_ai_returns_answer(session, group_chat_id):
    after, thread_id = _kick(session, group_chat_id, ["chatgpt", "claude", "gemini"])
    msg, elapsed = _wait_for_ai_answer(session, group_chat_id, after, thread_id)
    assert msg is not None, (
        f"Multi-model @ai (chatgpt+claude+gemini) did not return an ai_answer "
        f"within {POLL_TIMEOUT_S}s — likely stuck-on-thinking regression."
    )
    meta = msg.get("metadata") or {}
    assert msg.get("body"), "ai_answer has empty body"
    print(f"[multi] answered in {elapsed:.1f}s, models={meta.get('models')}, "
          f"response_count={meta.get('response_count')}, ai_error={meta.get('ai_error')}")


# ── Multi-model INCLUDING perplexity must still resolve gracefully ─────
def test_multi_model_with_perplexity_returns_answer(session, group_chat_id):
    after, thread_id = _kick(session, group_chat_id, ["chatgpt", "perplexity"])
    msg, elapsed = _wait_for_ai_answer(session, group_chat_id, after, thread_id)
    assert msg is not None, (
        f"Multi-model @ai including perplexity did not return an ai_answer "
        f"within {POLL_TIMEOUT_S}s — perplexity should degrade gracefully."
    )
    meta = msg.get("metadata") or {}
    print(f"[perplexity] answered in {elapsed:.1f}s, response_count={meta.get('response_count')}, "
          f"ai_error={meta.get('ai_error')}")
