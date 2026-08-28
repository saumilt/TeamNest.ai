"""
Iteration 33 — Camera/Vision AI in chat.

Tests:
- POST /api/uploads of an image returns is_image=True
- POST /api/ai/research with image_file_ids returns final_answer including
  the model's analysis (real=True at least once for vision-capable emergent model).
- AIResearchCreate accepts empty question when image_file_ids provided
  (route fills in a default prompt).
"""
import base64  # noqa: F401
import os
import io

import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://teamnest.ai")
API = f"{BASE_URL}/api"

# 256x256 red JPEG (large enough for OpenAI vision API minimum dimensions)
import struct
import zlib


def _make_png(w=256, h=256, r=200, g=50, b=50):
    """Generate a solid-color PNG without external deps."""
    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    raw = b""
    for _ in range(h):
        raw += b"\x00" + bytes([r, g, b]) * w
    idat = zlib.compress(raw, 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


RED_PIXEL_PNG = _make_png()

LOGIN = {"email": "amit@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")}


@pytest.fixture(scope="module")
def session():
    c = httpx.Client(timeout=60, follow_redirects=True)
    r = c.post(f"{API}/auth/login", json=LOGIN)
    assert r.status_code == 200, r.text
    return c


@pytest.fixture(scope="module")
def workspace_chat(session):
    r = session.get(f"{API}/chats")
    r.raise_for_status()
    chats = r.json()
    # Prefer a personal_ai chat if it exists (vision still works on group chats too).
    return chats[0]["id"]


def test_upload_image_marks_is_image(session):
    files = {"file": ("red.png", io.BytesIO(RED_PIXEL_PNG), "image/png")}
    r = session.post(f"{API}/uploads", files=files)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["is_image"] is True
    assert "id" in data


def test_ai_research_with_image_returns_answer(session, workspace_chat):
    # Upload image first
    files = {"file": ("red.png", io.BytesIO(RED_PIXEL_PNG), "image/png")}
    up = session.post(f"{API}/uploads", files=files)
    assert up.status_code == 200, up.text
    file_id = up.json()["id"]

    # Empty question; route should provide a default vision prompt.
    payload = {
        "chat_id": workspace_chat,
        "question": "",
        "selected_models": ["gpt-4o-mini"],
        "memory_mode": "none",
        "image_file_ids": [file_id],
    }
    r = session.post(f"{API}/ai/research", json=payload, timeout=90)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "thread" in body and "responses" in body
    # final_answer may be None if synthesis was skipped (single-model mode),
    # but the response answer itself must be non-empty.
    answers = [x.get("answer", "") for x in body["responses"]]
    assert any(answers), body
    # Ensure at least one response is real (i.e. not an error path)
    real_count = sum(1 for x in body["responses"] if x.get("real"))
    assert real_count >= 1, body
