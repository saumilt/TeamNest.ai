"""Iteration 49 — Per-chat invite links."""
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


@pytest.fixture(scope="module")
def chat_id(session):
    r = session.get(f"{API}/chats")
    grp = next(c for c in r.json() if c.get("type") == "group")
    return grp["id"]


def test_get_or_create_link_is_idempotent(session, chat_id):
    r1 = session.get(f"{API}/chats/{chat_id}/invite-link")
    r2 = session.get(f"{API}/chats/{chat_id}/invite-link")
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["link"]["token"] == r2.json()["link"]["token"]
    assert r1.json()["link"]["chat_id"] == chat_id
    assert r1.json()["link"]["join_path"].startswith("/join/")


def test_public_preview_returns_chat_context(session, chat_id):
    link = session.get(f"{API}/chats/{chat_id}/invite-link").json()["link"]
    r = httpx.get(f"{API}/public/invite/{link['token']}")
    assert r.status_code == 200
    body = r.json()
    assert body["chat_id"] == chat_id
    assert body["chat_name"]
    assert body["workspace_name"]


def test_rotate_invalidates_old_link(session, chat_id):
    old = session.get(f"{API}/chats/{chat_id}/invite-link").json()["link"]
    r = session.post(f"{API}/chats/{chat_id}/invite-link/rotate")
    assert r.status_code == 200
    new = r.json()["link"]
    assert new["token"] != old["token"]
    # Old preview must now 404
    r2 = httpx.get(f"{API}/public/invite/{old['token']}")
    assert r2.status_code == 404


def test_unauthorized_chat_returns_404(session):
    r = session.get(f"{API}/chats/fakeid12345/invite-link")
    assert r.status_code == 404
