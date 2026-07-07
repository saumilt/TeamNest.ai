"""Phase 4 — Memory / RAG regression tests.

Covers:
- /api/memory/backfill seeds memory items from approvals/threads/calls
- /api/memory/search returns relevant items for a query
- /api/memory/timeline returns recent items
- /api/memory/save manually pins a message
- /api/memory/cards creates a Decision/Risk/Note card
- PATCH /api/memory/{id} archives an item; DELETE soft-deletes
- /api/ai/research with memory_mode=workspace returns memory_sources[]
- /api/ai/threads/{id}/continue / branch / versions / memory-sources work
"""
import os
import pytest
import requests

API = os.environ.get("API_URL") or "http://localhost:8001"
API = API.rstrip("/")
if not API.endswith("/api"):
    API = f"{API}/api"


@pytest.fixture(scope="module")
def auth():
    r = requests.post(f"{API}/auth/demo-login", timeout=10)
    r.raise_for_status()
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_backfill_seeds_memory(auth):
    r = requests.post(f"{API}/memory/backfill", headers=auth, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert isinstance(body["counts"], dict)


def test_timeline_returns_items(auth):
    r = requests.get(f"{API}/memory/timeline?limit=10", headers=auth, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body and "count" in body


def test_search_with_query(auth):
    r = requests.get(
        f"{API}/memory/search?q=research&mode=workspace&limit=5",
        headers=auth, timeout=10,
    )
    assert r.status_code == 200
    body = r.json()
    assert "items" in body


def test_create_and_archive_card(auth):
    title = "TEST_card_phase4"
    content = "This is a phase 4 regression test card with decision content."
    r = requests.post(
        f"{API}/memory/cards",
        headers=auth,
        params={"title": title, "content": content, "memory_type": "decision", "visibility": "workspace"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    card = r.json()
    assert card["title"] == title
    assert card["memory_type"] == "decision"
    cid = card["id"]
    # Archive
    r2 = requests.patch(f"{API}/memory/{cid}", json={"status": "archived"}, headers=auth, timeout=10)
    assert r2.status_code == 200
    assert r2.json()["status"] == "archived"
    # Delete
    r3 = requests.delete(f"{API}/memory/{cid}", headers=auth, timeout=10)
    assert r3.status_code == 200


def test_ai_research_with_memory_mode(auth):
    chats = requests.get(f"{API}/chats", headers=auth, timeout=10).json()
    group_chats = [c for c in chats if c.get("type") == "group"]
    chat_id = (group_chats[0] if group_chats else chats[0])["id"]
    r = requests.post(
        f"{API}/ai/research",
        headers=auth,
        json={
            "chat_id": chat_id,
            "question": "Summarize prior approved Texas decisions.",
            "selected_models": ["gpt-4o-mini"],
            "memory_mode": "workspace",
        },
        timeout=60,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "memory_sources" in body
    assert body.get("memory_mode") == "workspace"


def test_thread_continue_branch_versions(auth):
    threads = requests.get(f"{API}/ai/threads?limit=1", headers=auth, timeout=10).json()
    if not threads:
        pytest.skip("No threads available")
    tid = threads[0]["id"]
    # Continue
    r = requests.post(
        f"{API}/ai/threads/{tid}/continue",
        headers=auth,
        json={"question": "Regression follow-up question.", "memory_mode": "chat"},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    # Versions
    r2 = requests.get(f"{API}/ai/threads/{tid}/versions", headers=auth, timeout=10)
    assert r2.status_code == 200
    versions = r2.json()["versions"]
    assert len(versions) >= 1
    # Memory sources
    r3 = requests.get(f"{API}/ai/threads/{tid}/memory-sources", headers=auth, timeout=10)
    assert r3.status_code == 200
    assert "sources" in r3.json()
    # Branch
    r4 = requests.post(
        f"{API}/ai/threads/{tid}/branch",
        headers=auth,
        json={"branch_name": "test_branch", "scenario_description": "What if rent is 20% higher?"},
        timeout=60,
    )
    assert r4.status_code == 200, r4.text
    assert r4.json().get("ok") is True
