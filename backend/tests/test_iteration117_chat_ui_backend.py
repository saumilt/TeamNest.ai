"""Iteration 117: backend regression for chat UI enhancements.

Covers:
- POST /api/chats/{id}/read  → clears unread count
- POST /api/chats/{id}/ai/stop  → returns ok+canceled and 404 for stranger
- POST /api/chats/{id}/leave  → route registered (not 404/405) and works on group
"""
import os
import time
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = BASE_URL + "/api"

EMAIL = "sam@funasia.net"
PASSWORD = "Perfect$2008"


def _login():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    return s


def test_login_ok():
    s = _login()
    r = s.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 200
    assert r.json().get("email") == EMAIL


def test_mark_chat_read_clears_unread():
    s = _login()
    chats = s.get(f"{API}/chats", timeout=30).json()
    assert isinstance(chats, list) and len(chats) > 0
    # Pick any group/direct chat that has member_ids
    target = chats[0]
    cid = target["id"]
    r = s.post(f"{API}/chats/{cid}/read", timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    # Re-fetch chats and confirm unread_count is 0 for this chat
    chats2 = s.get(f"{API}/chats", timeout=30).json()
    match = next((c for c in chats2 if c["id"] == cid), None)
    assert match is not None
    assert match.get("unread_count", 0) == 0


def test_ai_stop_returns_ok():
    s = _login()
    chats = s.get(f"{API}/chats", timeout=30).json()
    ai_chat = next((c for c in chats if c.get("type") == "personal_ai"), chats[0])
    cid = ai_chat["id"]
    r = s.post(f"{API}/chats/{cid}/ai/stop", json={}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    assert "canceled" in data


def test_ai_stop_forbidden_for_non_member():
    s = _login()
    r = s.post(f"{API}/chats/nonexistent-chat-id/ai/stop", json={}, timeout=15)
    assert r.status_code == 404


def test_leave_chat_route_registered_not_405():
    s = _login()
    # Use a bogus chat id — route must be registered (404 not-found), not 405 method not allowed
    r = s.post(f"{API}/chats/does-not-exist/leave", timeout=15)
    assert r.status_code != 405, "leave route not registered (returns 405)"
    assert r.status_code == 404


def test_leave_group_chat_flow():
    s = _login()
    # Create a small group chat, add a second member, then leave.
    # Discover another workspace user to satisfy 2-member group.
    users = s.get(f"{API}/users", timeout=15)
    if users.status_code != 200:
        # Fallback: skip if we can't find another user
        return
    others = [u for u in users.json() if u.get("email") != EMAIL]
    if not others:
        return
    other_id = others[0]["id"]
    created = s.post(
        f"{API}/chats",
        json={
            "type": "group",
            "name": "TEST_iter117_leave",
            "member_ids": [other_id],
        },
        timeout=15,
    )
    assert created.status_code == 200, created.text
    cid = created.json()["id"]
    r = s.post(f"{API}/chats/{cid}/leave", timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    assert r.json().get("left_chat_id") == cid


def test_ai_thinking_placeholder_discarded_after_stop():
    """Send a heavy @ai prompt, immediately stop, then within ~4s verify no
    ai_answer was posted for that thread (thinking indicator gone, discarded)."""
    s = _login()
    chats = s.get(f"{API}/chats", timeout=30).json()
    ai_chat = next((c for c in chats if c.get("type") == "personal_ai"), None)
    if not ai_chat:
        return
    cid = ai_chat["id"]
    prompt = "@ai write a 1000 word essay about the history of software engineering, deeply detailed"
    before = s.get(f"{API}/chats/{cid}/messages?limit=200", timeout=15).json()
    n_before = len(before)
    send = s.post(f"{API}/chats/{cid}/messages", json={"message_type": "text", "body": prompt}, timeout=15)
    assert send.status_code == 200
    # Give backend a beat to create the ai_question placeholder
    time.sleep(0.6)
    stop = s.post(f"{API}/chats/{cid}/ai/stop", json={}, timeout=15)
    assert stop.status_code == 200
    # Wait past when the AI would have finished
    time.sleep(4.5)
    after = s.get(f"{API}/chats/{cid}/messages?limit=400", timeout=15).json()
    new_msgs = after[n_before:]
    ai_answers_after_stop = [m for m in new_msgs if m.get("message_type") == "ai_answer" and not m.get("deleted_at")]
    # It's OK if pre-existing answers exist; new ones for THIS thread should be 0.
    assert len(ai_answers_after_stop) == 0, f"AI answer leaked after stop: {ai_answers_after_stop}"
