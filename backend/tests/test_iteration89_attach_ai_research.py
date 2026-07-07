"""Iteration 89: File attachments -> AI can research contents.

Focused backend regression:
- /api/uploads accepts newly added office/text formats (docx/xlsx/pptx/md).
- 30 MB cap works (small negative check on unsupported ext still 400).
- personal_ai chat auto-triggers AI when a file is attached with a normal
  message (no @ai needed) and the AI answer references the file's contents.
"""
from __future__ import annotations

import io
import os
import time
import uuid

import pytest
import requests
from docx import Document
from openpyxl import Workbook
from pptx import Presentation
from pptx.util import Inches

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or \
    os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    return s


def _docx_bytes(text: str) -> bytes:
    d = Document()
    d.add_paragraph(text)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def _xlsx_bytes(rows):
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _pptx_bytes(text: str) -> bytes:
    prs = Presentation()
    prs.slide_width = Inches(10)
    prs.slide_height = Inches(7)
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    tx = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(8), Inches(2))
    tx.text_frame.text = text
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


def _upload(session, name, data, mime):
    return session.post(
        f"{BASE_URL}/api/uploads",
        files={"file": (name, data, mime)},
        timeout=60,
    )


# ---- Upload accepts newly added extensions ------------------------------- #
class TestUploadTypes:
    def test_upload_docx(self, session):
        r = _upload(
            session,
            "TEST_report.docx",
            _docx_bytes("Q2 revenue was 123456 dollars."),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["filename"].endswith(".docx")
        assert body["is_image"] is False
        assert body["id"]

    def test_upload_xlsx(self, session):
        r = _upload(
            session,
            "TEST_sheet.xlsx",
            _xlsx_bytes([["Metric", "Value"], ["Revenue", 999888]]),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        assert r.status_code == 200, r.text
        assert r.json()["is_image"] is False

    def test_upload_pptx(self, session):
        r = _upload(
            session,
            "TEST_deck.pptx",
            _pptx_bytes("Our Q2 launch went great."),
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )
        assert r.status_code == 200, r.text
        assert r.json()["is_image"] is False

    def test_upload_md(self, session):
        r = _upload(
            session,
            "TEST_notes.md",
            b"# Team Notes\n\n- Hire two engineers.\n- Ship on Friday.\n",
            "text/markdown",
        )
        assert r.status_code == 200, r.text

    def test_upload_rejects_exe(self, session):
        r = _upload(session, "TEST_bad.exe", b"MZ\x00\x00", "application/octet-stream")
        assert r.status_code == 400

    def test_upload_rejects_too_large(self, session):
        # 30 MB + 1 byte plaintext
        big = b"A" * (30 * 1024 * 1024 + 1)
        r = _upload(session, "TEST_big.txt", big, "text/plain")
        assert r.status_code == 413


# ---- personal_ai auto-triggers AI on attachments ------------------------- #
class TestPersonalAIAttachmentAutoTrigger:
    def test_csv_auto_triggers_ai_no_at_ai(self, session):
        # 1. Find (or create) personal_ai chat
        chats = session.get(f"{BASE_URL}/api/chats", timeout=30).json()
        personal = None
        for c in chats:
            if c.get("type") == "personal_ai":
                personal = c
                break
        if not personal:
            pytest.skip("No personal_ai chat exists for demo user")
        chat_id = personal["id"]

        # 2. Upload a CSV with a distinctive number
        marker = f"773311{int(time.time()) % 1000}"
        csv = f"metric,value\nTotal Revenue,{marker}\n".encode()
        up = session.post(
            f"{BASE_URL}/api/uploads",
            files={"file": (f"TEST_rev_{uuid.uuid4().hex[:6]}.csv", csv, "text/csv")},
            data={"chat_id": chat_id},
            timeout=60,
        )
        assert up.status_code == 200, up.text
        attachment = up.json()

        # 3. Send a plain message (NO @ai) with the file attached.
        send = session.post(
            f"{BASE_URL}/api/chats/{chat_id}/messages",
            json={
                "body": "What number is in this file?",
                "message_type": "text",
                "metadata": {"attachments": [attachment]},
            },
            timeout=30,
        )
        assert send.status_code == 200, send.text

        # 4. Poll for an ai_answer that references the marker.
        found = False
        deadline = time.time() + 45
        while time.time() < deadline:
            msgs = session.get(
                f"{BASE_URL}/api/chats/{chat_id}/messages?limit=20",
                timeout=20,
            ).json()
            for m in reversed(msgs):
                if m.get("message_type") == "ai_answer" and marker in (m.get("body") or ""):
                    found = True
                    break
            if found:
                break
            time.sleep(2.5)
        assert found, (
            f"AI answer did not reference marker {marker}; personal_ai auto-trigger broken"
        )
