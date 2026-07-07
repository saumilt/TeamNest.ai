"""Phase 2c — AI meeting summaries, transcript upload, exports, demo top-up seed."""
import io
import os
import wave

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")


# ---------- shared ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def launch_chat(session):
    chats = session.get(f"{BASE_URL}/api/chats", timeout=30).json()
    chat = next((c for c in chats if c.get("name") == "Q2 Product Launch"), None)
    assert chat, f"Q2 Product Launch chat not seeded. chats={[c.get('name') for c in chats]}"
    return chat


@pytest.fixture(scope="module")
def hiring_chat(session):
    chats = session.get(f"{BASE_URL}/api/chats", timeout=30).json()
    chat = next((c for c in chats if c.get("name") == "Engineering Hiring"), None)
    assert chat, "Engineering Hiring chat not seeded"
    return chat


@pytest.fixture(scope="module")
def launch_call(session, launch_chat):
    r = session.get(f"{BASE_URL}/api/calls/by-chat/{launch_chat['id']}", timeout=30)
    assert r.status_code == 200, r.text
    calls = r.json()
    assert isinstance(calls, list) and len(calls) >= 1
    seeded = next((c for c in calls if c.get("status") == "ended" and (c.get("summary") or {}).get("source") == "demo_seed"), None)
    assert seeded, f"expected demo-seeded launch call. got: {[(c['id'], c.get('status'), (c.get('summary') or {}).get('source')) for c in calls]}"
    return seeded


# ---------- Demo seed top-up ----------
class TestDemoSeed:
    def test_launch_call_seeded(self, launch_call):
        assert launch_call["mode"] == "video"
        assert launch_call["duration_seconds"] == 42 * 60
        assert "Pro tier" in (launch_call.get("transcript") or {}).get("text", "")
        md = (launch_call.get("summary") or {}).get("markdown", "")
        assert "## TL;DR" in md
        assert "US" in md

    def test_hiring_call_seeded(self, session, hiring_chat):
        r = session.get(f"{BASE_URL}/api/calls/by-chat/{hiring_chat['id']}", timeout=30)
        assert r.status_code == 200
        calls = r.json()
        hiring_call = next((c for c in calls if c.get("duration_seconds") == 28 * 60), None)
        assert hiring_call is not None, "Engineering Hiring 28m audio call not found"
        assert hiring_call["mode"] == "audio"
        assert "comp" in (hiring_call.get("transcript") or {}).get("text", "").lower()

    def test_approvals_seeded(self, session):
        r = session.get(f"{BASE_URL}/api/approvals", timeout=30)
        assert r.status_code == 200, r.text
        approvals = r.json()
        statuses = [a.get("status") for a in approvals]
        assert "approved" in statuses, f"no approved approval. statuses={statuses}"
        assert "needs_review" in statuses, f"no needs_review approval. statuses={statuses}"
        # Filter via needs_review tab
        nr = session.get(f"{BASE_URL}/api/approvals?status=needs_review", timeout=30)
        if nr.status_code == 200:
            nr_data = nr.json()
            titles = [a.get("title", "") for a in nr_data]
            assert any("comp band" in t.lower() for t in titles), f"Q2 comp band approval not in needs_review filter: {titles}"

    def test_overdue_task_seeded(self, session):
        r = session.get(f"{BASE_URL}/api/tasks", timeout=30)
        assert r.status_code == 200, r.text
        tasks = r.json()
        overdue = next((t for t in tasks if "Benchmark SaaS pricing tiers" in t.get("title", "")), None)
        assert overdue, f"overdue task not seeded. titles={[t.get('title') for t in tasks]}"
        assert overdue["priority"] == "high"
        # API may compute status as 'overdue' when due_date < now, even though seeded as 'todo'
        assert overdue["status"] in ("todo", "overdue")
        # Check assignee is Raj
        users = session.get(f"{BASE_URL}/api/workspace/members", timeout=30).json()
        raj = next((u for u in users if u.get("name") == "Raj Mehta"), None)
        assert raj and overdue["assigned_to"] == raj["id"]


# ---------- Summary endpoint ----------
class TestSummary:
    def test_summary_cached_returns_true(self, session, launch_call):
        # Already has demo-seeded summary, so first call returns cached=True
        r = session.post(f"{BASE_URL}/api/calls/{launch_call['id']}/summary", json={}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["cached"] is True
        md = data["summary"]["markdown"]
        assert "## TL;DR" in md
        assert ("## Action items" in md or "## Decisions" in md)

    def test_summary_regenerate_forces_fresh(self, session, launch_call):
        r = session.post(f"{BASE_URL}/api/calls/{launch_call['id']}/summary", json={"regenerate": True}, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["cached"] is False
        md = data["summary"]["markdown"]
        assert "## TL;DR" in md
        assert ("## Action items" in md or "## Decisions" in md)
        # Source should be transcript since call has transcript
        assert data["summary"]["source"] == "transcript"

    def test_summary_second_call_cached(self, session, launch_call):
        r2 = session.post(f"{BASE_URL}/api/calls/{launch_call['id']}/summary", json={}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["cached"] is True


# ---------- Edit summary / transcript ----------
class TestEdit:
    def test_patch_summary_markdown(self, session, launch_call):
        new_md = "## TL;DR\nEdited by test\n\n## Action items\n- test action"
        r = session.patch(f"{BASE_URL}/api/calls/{launch_call['id']}/summary",
                          json={"markdown": new_md}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["summary"]["markdown"] == new_md
        # GET to confirm persisted
        c = session.get(f"{BASE_URL}/api/calls/{launch_call['id']}", timeout=30).json()
        assert c["summary"]["markdown"] == new_md

    def test_patch_transcript(self, session, launch_call):
        original = (launch_call.get("transcript") or {}).get("text", "")
        new_text = "TEST_EDITED transcript content."
        r = session.patch(f"{BASE_URL}/api/calls/{launch_call['id']}/transcript",
                          json={"transcript_text": new_text}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["transcript"]["text"] == new_text
        # restore original
        session.patch(f"{BASE_URL}/api/calls/{launch_call['id']}/transcript",
                      json={"transcript_text": original}, timeout=30)


# ---------- Upload recording (silent WAV) ----------
def _silent_wav_bytes(seconds=1, sample_rate=8000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)  # 16-bit
        w.setframerate(sample_rate)
        w.writeframes(b"\x00\x00" * sample_rate * seconds)
    return buf.getvalue()


class TestUploadRecording:
    def test_upload_silent_wav_no_500(self, session, launch_call):
        wav = _silent_wav_bytes(seconds=1)
        # multipart upload — must not send Content-Type: application/json
        headers = {k: v for k, v in session.headers.items() if k.lower() != "content-type"}
        files = {"file": ("silent.wav", wav, "audio/wav")}
        r = requests.post(f"{BASE_URL}/api/calls/{launch_call['id']}/upload-recording",
                          files=files, headers=headers, timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
        data = r.json()
        assert "call" in data and "transcript" in data
        # silent audio → text either empty or some Whisper hallucination; accept either
        assert isinstance(data["transcript"].get("text", ""), str)


# ---------- Export PDF / DOCX ----------
class TestExport:
    def test_export_pdf(self, session, launch_call):
        r = session.get(f"{BASE_URL}/api/export/call/{launch_call['id']}?format=pdf", timeout=60)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 500

    def test_export_docx(self, session, launch_call):
        r = session.get(f"{BASE_URL}/api/export/call/{launch_call['id']}?format=docx", timeout=60)
        assert r.status_code == 200, r.text[:200]
        ct = r.headers.get("content-type", "")
        assert "openxmlformats" in ct or "wordprocessingml" in ct
        assert r.content[:2] == b"PK"
        assert len(r.content) > 500

    def test_export_invalid_format(self, session, launch_call):
        r = session.get(f"{BASE_URL}/api/export/call/{launch_call['id']}?format=txt", timeout=30)
        assert r.status_code == 400


# ---------- 404 guards ----------
class TestGuards:
    def test_summary_404(self, session):
        r = session.post(f"{BASE_URL}/api/calls/does-not-exist/summary", json={}, timeout=30)
        assert r.status_code == 404

    def test_export_404(self, session):
        r = session.get(f"{BASE_URL}/api/export/call/does-not-exist?format=pdf", timeout=30)
        assert r.status_code == 404

    def test_transcript_404(self, session):
        r = session.patch(f"{BASE_URL}/api/calls/does-not-exist/transcript",
                          json={"transcript_text": "x"}, timeout=30)
        assert r.status_code == 404
