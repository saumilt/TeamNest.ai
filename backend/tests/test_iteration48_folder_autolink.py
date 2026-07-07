"""Iteration 48 — Project-folder auto-linking from chat uploads."""
import io
import os

import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://teamnest.ai")
API = f"{BASE_URL}/api"
OWNER = {"email": "amit@demo.team", "password": "Demo@2026"}


@pytest.fixture(scope="module")
def session():
    c = httpx.Client(timeout=30, follow_redirects=True)
    r = c.post(f"{API}/auth/login", json=OWNER)
    assert r.status_code == 200
    return c


@pytest.fixture(scope="module")
def folder(session):
    r = session.post(f"{API}/folders", json={"name": "Pytest folder iter48", "member_ids": []})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def chat(session, folder):
    r = session.post(f"{API}/chats", json={
        "type": "group",
        "name": "Pytest chat iter48",
        "description": "",
        "member_ids": [],
        "project_folder_id": folder["id"],
        "default_models": ["chatgpt"],
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["project_folder_id"] == folder["id"]
    return body


def test_upload_with_chat_id_stamps_folder(session, chat, folder):
    files = {"file": ("doc.txt", io.BytesIO(b"hello"), "text/plain")}
    data = {"chat_id": chat["id"]}
    r = session.post(f"{API}/uploads", files=files, data=data)
    assert r.status_code == 200, r.text
    assert r.json()["project_folder_id"] == folder["id"]


def test_folder_get_lists_files(session, folder):
    r = session.get(f"{API}/folders/{folder['id']}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "files" in body
    filenames = [f["original_filename"] for f in body["files"]]
    assert "doc.txt" in filenames


def test_explicit_project_folder_id_wins(session, folder):
    """Caller can override the chat's folder by passing project_folder_id."""
    files = {"file": ("forced.txt", io.BytesIO(b"x"), "text/plain")}
    data = {"project_folder_id": folder["id"]}
    r = session.post(f"{API}/uploads", files=files, data=data)
    assert r.status_code == 200, r.text
    assert r.json()["project_folder_id"] == folder["id"]


def test_upload_without_chat_or_folder_leaves_unlinked(session):
    files = {"file": ("orphan.txt", io.BytesIO(b"y"), "text/plain")}
    r = session.post(f"{API}/uploads", files=files)
    assert r.status_code == 200, r.text
    assert r.json()["project_folder_id"] is None
