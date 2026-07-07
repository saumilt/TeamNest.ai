"""Phase 2c iteration 15: live-transcription chunk upload + segments + broadcast.

Verifies POST /api/calls/{id}/transcribe-chunk, GET /api/calls/{id}/transcript-segments,
and that summary picks up the live-built transcript.
"""
import io
import os
import math
import struct
import time
import wave
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"


# ---------- helpers ----------
def _silent_wav_bytes(seconds: float = 1.0, sample_rate: int = 16000) -> bytes:
    """Return a small mono 16-bit PCM WAV. ~32KB for 1s @ 16kHz."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        n = int(seconds * sample_rate)
        # Faint sine wave so Whisper won't always shortcut as 'silent'
        frames = b"".join(
            struct.pack("<h", int(80 * math.sin(2 * math.pi * 220 * (i / sample_rate))))
            for i in range(n)
        )
        w.writeframes(frames)
    return buf.getvalue()


def _tiny_bytes() -> bytes:
    return b"RIFF\x24\x00\x00\x00WAVE" + b"\x00" * 16  # < 1KB


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def auth():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    user = r.json()["user"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return {"session": s, "user": user, "token": tok}


@pytest.fixture(scope="module")
def active_call(auth):
    s: requests.Session = auth["session"]
    # find any chat
    chats = s.get(f"{BASE_URL}/api/chats", timeout=30).json()
    assert isinstance(chats, list) and chats, "no chats seeded"
    chat = next((c for c in chats if c.get("name") == "Q2 Product Launch"), chats[0])
    # start a new audio call
    r = s.post(f"{BASE_URL}/api/calls/start", json={"chat_id": chat["id"], "mode": "audio"}, timeout=30)
    if r.status_code == 503:
        pytest.skip("Calls not configured (LiveKit). Skipping live-transcription tests.")
    assert r.status_code == 200, r.text
    call = r.json()["call"]
    yield call
    # cleanup: end the call
    try:
        s.post(f"{BASE_URL}/api/calls/{call['id']}/end", json={}, timeout=15)
    except Exception:
        pass


# ---------- tests ----------
# Module: transcribe-chunk happy path with audio
def test_transcribe_chunk_with_audio(auth, active_call):
    s = auth["session"]
    wav = _silent_wav_bytes(seconds=2.0)
    files = {"file": ("chunk.wav", wav, "audio/wav")}
    # NOTE: must NOT send Content-Type: application/json header
    r = requests.post(
        f"{BASE_URL}/api/calls/{active_call['id']}/transcribe-chunk",
        headers={"Authorization": s.headers["Authorization"]},
        data={"seq": "0"},
        files=files,
        timeout=60,
    )
    assert r.status_code == 200, f"status={r.status_code} body={r.text}"
    body = r.json()
    assert body.get("ok") is True
    # Whisper on quasi-silent low-amp sine commonly returns either '' or hallucinated 'you'/'.'.
    # If text is non-empty, segment must be present and well-formed.
    if body.get("text"):
        seg = body.get("segment")
        assert seg, "segment missing on non-empty text"
        for k in ("id", "speaker_id", "speaker_name", "text", "seq", "at"):
            assert k in seg, f"segment missing {k}"
        assert seg["speaker_id"] == auth["user"]["id"]
        assert seg["seq"] == 0
        # Persistence check via GET /api/calls/{id}
        gr = s.get(f"{BASE_URL}/api/calls/{active_call['id']}", timeout=15)
        assert gr.status_code == 200, gr.text
        full = gr.json()
        segs = full.get("transcript_segments") or []
        assert any(x["id"] == seg["id"] for x in segs), "segment not persisted in transcript_segments"
        transcript = full.get("transcript") or {}
        assert transcript.get("source") == "live_chunks"
        assert seg["text"] in (transcript.get("text") or "")
        expected_line = f"{seg['speaker_name']}: {seg['text']}"
        assert expected_line in (transcript.get("text") or ""), "running transcript.text missing speaker line"


# Module: transcribe-chunk silent / empty payload
def test_transcribe_chunk_tiny_payload_returns_empty(auth, active_call):
    s = auth["session"]
    files = {"file": ("tiny.webm", _tiny_bytes(), "audio/webm")}
    r = requests.post(
        f"{BASE_URL}/api/calls/{active_call['id']}/transcribe-chunk",
        headers={"Authorization": s.headers["Authorization"]},
        data={"seq": "99"},
        files=files,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body == {"ok": True, "text": ""} or body.get("text") == ""


# Module: transcribe-chunk on a corrupted/undecodable chunk should not 500
def test_transcribe_chunk_bad_audio_no_500(auth, active_call):
    s = auth["session"]
    bogus = os.urandom(8192)  # > 1KB so we pass the early empty filter
    files = {"file": ("bad.webm", bogus, "audio/webm")}
    r = requests.post(
        f"{BASE_URL}/api/calls/{active_call['id']}/transcribe-chunk",
        headers={"Authorization": s.headers["Authorization"]},
        data={"seq": "100"},
        files=files,
        timeout=60,
    )
    # accepted outcomes: 200 with text='' (handled gracefully), or 200 with text
    assert r.status_code == 200, f"500 on bad audio: {r.status_code} {r.text}"


# Module: GET /transcript-segments
def test_get_transcript_segments(auth, active_call):
    s = auth["session"]
    r = s.get(f"{BASE_URL}/api/calls/{active_call['id']}/transcript-segments", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "segments" in body
    assert isinstance(body["segments"], list)


def test_get_transcript_segments_unknown_call_404(auth):
    s = auth["session"]
    r = s.get(f"{BASE_URL}/api/calls/does-not-exist/transcript-segments", timeout=15)
    assert r.status_code == 404


def test_get_transcript_segments_unauth(active_call):
    r = requests.get(f"{BASE_URL}/api/calls/{active_call['id']}/transcript-segments", timeout=15)
    assert r.status_code in (401, 403)


# Module: summary picks up live transcript when source=live_chunks
def test_summary_uses_live_transcript(auth, active_call):
    s = auth["session"]
    # First seed at least one chunk so transcript has text
    wav = _silent_wav_bytes(seconds=2.0)
    requests.post(
        f"{BASE_URL}/api/calls/{active_call['id']}/transcribe-chunk",
        headers={"Authorization": s.headers["Authorization"]},
        data={"seq": "1"},
        files={"file": ("c.wav", wav, "audio/wav")},
        timeout=60,
    )
    # Confirm transcript.text now has something OR there is at least one segment
    full = s.get(f"{BASE_URL}/api/calls/{active_call['id']}", timeout=15).json()
    has_text = bool((full.get("transcript") or {}).get("text"))
    has_segments = bool(full.get("transcript_segments"))
    if not (has_text or has_segments):
        pytest.skip("Whisper returned empty for both chunks — cannot test summary live path")
    # Force regenerate
    r = s.post(
        f"{BASE_URL}/api/calls/{active_call['id']}/summary",
        json={"regenerate": True},
        timeout=120,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    summary = body.get("summary") or body
    src = summary.get("source") or body.get("source")
    # Should now be transcript-driven (live_chunks builds transcript.text → source=transcript)
    assert src in ("transcript", "live_chunks"), f"unexpected source={src}; body={body}"


# Module: ended call rejection
def test_transcribe_chunk_after_call_ended(auth):
    s = auth["session"]
    chats = s.get(f"{BASE_URL}/api/chats", timeout=15).json()
    chat = chats[0]
    r = s.post(f"{BASE_URL}/api/calls/start", json={"chat_id": chat["id"], "mode": "audio"}, timeout=30)
    if r.status_code == 503:
        pytest.skip("Calls not configured")
    assert r.status_code == 200, r.text
    call = r.json()["call"]
    # end the call
    end = s.post(f"{BASE_URL}/api/calls/{call['id']}/end", json={}, timeout=15)
    assert end.status_code == 200
    # Backdate ended_at >30s into the past by waiting? Too slow. Use admin route?
    # We don't have a backdating endpoint, so we simulate by directly using the >30s rule:
    # Since the rule needs >30s, we can't easily test 'Call has ended' without sleeping.
    # Sleep 32s only if env var ENABLE_SLOW_TESTS=1.
    if os.environ.get("ENABLE_SLOW_TESTS") != "1":
        pytest.skip("Skipping 32s sleep — set ENABLE_SLOW_TESTS=1 to run")
    time.sleep(32)
    wav = _silent_wav_bytes(1.0)
    rr = requests.post(
        f"{BASE_URL}/api/calls/{call['id']}/transcribe-chunk",
        headers={"Authorization": s.headers["Authorization"]},
        data={"seq": "0"},
        files={"file": ("c.wav", wav, "audio/wav")},
        timeout=30,
    )
    assert rr.status_code == 400
    assert "ended" in rr.text.lower()


# Module: unknown call returns 404
def test_transcribe_chunk_unknown_call_404(auth):
    s = auth["session"]
    wav = _silent_wav_bytes(1.0)
    r = requests.post(
        f"{BASE_URL}/api/calls/does-not-exist/transcribe-chunk",
        headers={"Authorization": s.headers["Authorization"]},
        data={"seq": "0"},
        files={"file": ("c.wav", wav, "audio/wav")},
        timeout=30,
    )
    assert r.status_code == 404
