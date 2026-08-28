"""Iteration 50 — Task lifecycle (complete + soft delete + restore + purge)
+ live transcription unblocked on Free plan."""
import io
import os
import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://teamnest.ai")
API = f"{BASE_URL}/api"
OWNER = {"email": "amit@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")}


@pytest.fixture(scope="module")
def session():
    c = httpx.Client(timeout=30, follow_redirects=True)
    r = c.post(f"{API}/auth/login", json=OWNER)
    assert r.status_code == 200
    return c


# ---------- Task lifecycle ----------
def test_task_lifecycle(session):
    # Create
    r = session.post(f"{API}/tasks", json={
        "title": "Pytest iter50 task", "priority": "low", "status": "todo",
    })
    assert r.status_code == 200
    task = r.json()
    tid = task["id"]

    # Active should include it
    ids = [t["id"] for t in session.get(f"{API}/tasks?status_filter=active").json()]
    assert tid in ids

    # Complete it
    r = session.patch(f"{API}/tasks/{tid}", json={"status": "completed"})
    assert r.status_code == 200
    assert r.json()["status"] == "completed"
    assert r.json()["completed_at"] is not None

    # Active should NOT include it now
    ids = [t["id"] for t in session.get(f"{API}/tasks?status_filter=active").json()]
    assert tid not in ids
    # Completed should
    ids = [t["id"] for t in session.get(f"{API}/tasks?status_filter=completed").json()]
    assert tid in ids

    # Soft delete
    r = session.delete(f"{API}/tasks/{tid}")
    assert r.status_code == 200 and r.json()["soft_deleted"] is True
    ids = [t["id"] for t in session.get(f"{API}/tasks?status_filter=deleted").json()]
    assert tid in ids
    ids = [t["id"] for t in session.get(f"{API}/tasks?status_filter=completed").json()]
    assert tid not in ids  # leaves completed list once deleted

    # Restore
    r = session.post(f"{API}/tasks/{tid}/restore")
    assert r.status_code == 200
    assert r.json()["deleted_at"] is None
    ids = [t["id"] for t in session.get(f"{API}/tasks?status_filter=completed").json()]
    assert tid in ids

    # Purge
    session.delete(f"{API}/tasks/{tid}")  # soft delete again
    r = session.delete(f"{API}/tasks/{tid}/purge")
    assert r.status_code == 200 and r.json()["purged"] is True
    ids = [t["id"] for t in session.get(f"{API}/tasks?status_filter=deleted").json()]
    assert tid not in ids


def test_purge_non_deleted_returns_404(session):
    r = session.post(f"{API}/tasks", json={"title": "still here", "priority": "low", "status": "todo"})
    tid = r.json()["id"]
    r = session.delete(f"{API}/tasks/{tid}/purge")
    assert r.status_code == 404
    session.delete(f"{API}/tasks/{tid}")  # cleanup
    session.delete(f"{API}/tasks/{tid}/purge")


def test_restore_non_deleted_returns_404(session):
    r = session.post(f"{API}/tasks", json={"title": "live one", "priority": "low", "status": "todo"})
    tid = r.json()["id"]
    r = session.post(f"{API}/tasks/{tid}/restore")
    assert r.status_code == 404
    session.delete(f"{API}/tasks/{tid}")  # cleanup
    session.delete(f"{API}/tasks/{tid}/purge")


# ---------- Live transcription gating ----------
def test_live_transcription_unblocked_on_free_plan(session):
    chats = session.get(f"{API}/chats").json()
    grp = next(c for c in chats if c.get("type") == "group")
    call = session.post(f"{API}/calls/start", json={"chat_id": grp["id"], "mode": "audio"}).json()["call"]
    files = {"file": ("silent.webm", io.BytesIO(b"xx"), "audio/webm")}
    r = session.post(f"{API}/calls/{call['id']}/transcribe-chunk", files=files, data={"seq": "0"})
    # Free plan used to get a 403. Now it must accept the chunk (text empty is fine).
    assert r.status_code == 200, r.text
    assert "ok" in r.json()
