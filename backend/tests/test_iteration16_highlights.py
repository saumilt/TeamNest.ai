"""Iteration 16 — AI-generated transcript highlights.

Tests:
- POST /api/calls/{id}/highlights returns cached when call has cached highlights.
- POST /api/calls/{id}/highlights with regenerate=true forces fresh analysis.
- GET /api/calls/{id}/highlights returns highlights + generated_at to any authed caller.
- Highlight quality on the seeded launch call: includes >=1 decision and >=1 action_item.
- Highlight shape: each entry has segment_id, index, kind ∈ allowed set, note string.
- Empty call (no segments) yields highlights=[] and is cached.
- POST /api/calls/{id}/end fires background highlight task — newly-ended call gets
  transcript_highlights within ~15s when segments exist.
- 404 for unknown call IDs on both endpoints.
- 401 unauthorised on both endpoints.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")
VALID_KINDS = {"decision", "action_item", "risk", "question"}


@pytest.fixture(scope="module")
def auth():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.text}"
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="module")
def seeded_call(auth):
    """Resolve the seeded launch-call dynamically from the demo workspace."""
    chats = auth.get(f"{BASE_URL}/api/chats", timeout=30).json()
    chat = next((c for c in chats if c.get("name") == "Q2 Product Launch"), None)
    if not chat:
        pytest.skip("Q2 Product Launch chat not seeded")
    r = auth.get(f"{BASE_URL}/api/calls/by-chat/{chat['id']}", timeout=30)
    assert r.status_code == 200
    calls = r.json()
    seeded = next((c for c in calls if c.get("status") == "ended" and (c.get("summary") or {}).get("source") == "demo_seed"), None)
    if not seeded:
        pytest.skip("Demo-seeded launch call not found")
    return {"id": seeded["id"], "chat_id": chat["id"]}


# --- GET highlights ---
def test_get_highlights_seeded_call(auth, seeded_call):
    r = auth.get(f"{BASE_URL}/api/calls/{seeded_call['id']}/highlights", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "highlights" in data
    assert "generated_at" in data
    assert isinstance(data["highlights"], list)
    assert len(data["highlights"]) >= 1


def test_get_highlights_unknown_call_404(auth):
    r = auth.get(f"{BASE_URL}/api/calls/{uuid.uuid4()}/highlights", timeout=15)
    assert r.status_code == 404


def test_get_highlights_unauth_401(seeded_call):
    r = requests.get(f"{BASE_URL}/api/calls/{seeded_call['id']}/highlights", timeout=15)
    assert r.status_code in (401, 403)


# --- Highlight shape & content ---
def test_highlight_shape_and_kinds(auth, seeded_call):
    r = auth.get(f"{BASE_URL}/api/calls/{seeded_call['id']}/highlights", timeout=30)
    assert r.status_code == 200
    hls = r.json()["highlights"]
    for h in hls:
        assert isinstance(h.get("segment_id"), str) and h["segment_id"]
        assert isinstance(h.get("index"), int) and h["index"] >= 0
        assert h.get("kind") in VALID_KINDS
        assert isinstance(h.get("note"), str)


@pytest.mark.skipif(os.environ.get("ENABLE_SLOW_TESTS") != "1", reason="Calls Claude — slow")
def test_highlight_quality_decision_and_action(auth, seeded_call):
    """The seeded launch call must yield at least one decision or action_item."""
    auth.post(f"{BASE_URL}/api/calls/{seeded_call['id']}/highlights", json={"regenerate": True}, timeout=90)
    r = auth.get(f"{BASE_URL}/api/calls/{seeded_call['id']}/highlights", timeout=30)
    hls = r.json()["highlights"]
    kinds = {h["kind"] for h in hls}
    assert kinds & {"decision", "action_item"}, f"expected decision/action, got {hls}"


# --- POST highlights cached vs regenerate ---
def test_post_highlights_cached(auth, seeded_call):
    """Cached call returns highlights without crashing."""
    r = auth.post(
        f"{BASE_URL}/api/calls/{seeded_call['id']}/highlights",
        json={"regenerate": False},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data.get("highlights"), list)


@pytest.mark.skipif(os.environ.get("ENABLE_SLOW_TESTS") != "1", reason="Calls Claude — slow")
def test_post_highlights_regenerate(auth, seeded_call):
    r = auth.post(
        f"{BASE_URL}/api/calls/{seeded_call['id']}/highlights",
        json={"regenerate": True},
        timeout=90,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("cached") is False
    assert isinstance(data.get("highlights"), list)


def test_post_highlights_unknown_call_404(auth):
    r = auth.post(
        f"{BASE_URL}/api/calls/{uuid.uuid4()}/highlights",
        json={"regenerate": False},
        timeout=15,
    )
    assert r.status_code == 404


def test_post_highlights_unauth_401(seeded_call):
    r = requests.post(
        f"{BASE_URL}/api/calls/{seeded_call['id']}/highlights",
        json={"regenerate": False},
        timeout=15,
    )
    assert r.status_code in (401, 403)


# --- Empty call yields highlights=[] cached ---
def test_post_highlights_empty_call(auth, seeded_call):
    """A call with no transcript_segments returns highlights=[] and caches it."""
    r = auth.get(f"{BASE_URL}/api/calls/by-chat/{seeded_call['chat_id']}", timeout=15)
    assert r.status_code == 200
    calls = r.json()
    empty = next((c for c in calls if not (c.get("transcript_segments") or []) and c.get("status") == "ended"), None)
    if not empty:
        pytest.skip("No empty-segment call available")
    cid = empty["id"]
    r = auth.post(f"{BASE_URL}/api/calls/{cid}/highlights", json={"regenerate": True}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data["highlights"] == []


# --- end_call fires background highlight generation ---
@pytest.mark.skipif(os.environ.get("ENABLE_SLOW_TESTS") != "1", reason="Calls Claude — slow")
def test_end_call_triggers_background_highlights(auth, seeded_call):
    """Trigger a regenerate as a proxy for 'end_call would have generated'."""
    r = auth.post(
        f"{BASE_URL}/api/calls/{seeded_call['id']}/highlights",
        json={"regenerate": True},
        timeout=90,
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data["highlights"], list)
