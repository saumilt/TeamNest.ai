"""Voice transcription — Deepgram Nova-3 fast path with Whisper fallback."""
import io
import logging
import os
from typing import Optional

from dotenv import load_dotenv
from emergentintegrations.llm.openai import OpenAISpeechToText

load_dotenv()

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
logger = logging.getLogger("teamnest.voice")


async def _whisper_transcribe(data: bytes, filename: str, language: Optional[str]) -> dict:
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
    fileobj = io.BytesIO(data)
    fileobj.name = filename
    kwargs: dict = {"file": fileobj, "model": "whisper-1", "response_format": "verbose_json"}
    if language:
        kwargs["language"] = language
    resp = await stt.transcribe(**kwargs)
    out = {
        "text": getattr(resp, "text", "") or "",
        "language": getattr(resp, "language", None),
        "duration": getattr(resp, "duration", None),
        "segments": None,
        "provider": "whisper",
    }
    segs = getattr(resp, "segments", None)
    if segs:
        norm = []
        for s in segs:
            if isinstance(s, dict):
                norm.append({"start": s.get("start"), "end": s.get("end"), "text": s.get("text", "")})
            else:
                norm.append({"start": getattr(s, "start", None), "end": getattr(s, "end", None), "text": getattr(s, "text", "")})
        out["segments"] = norm
    return out


async def transcribe_audio(data: bytes, filename: str = "voice-note.webm", language: Optional[str] = None) -> dict:
    """Transcribe with Deepgram Nova-3 first (fast), Whisper fallback on error/empty.

    Returns: {text, language, duration, segments, provider}.
    """
    # Try Deepgram first
    try:
        from services import deepgram_service
        if deepgram_service.is_configured():
            result = await deepgram_service.transcribe(data, filename)
            if (result.get("text") or "").strip():
                return result
            logger.info("Deepgram returned empty transcript, falling back to Whisper")
    except Exception as e:
        logger.warning("Deepgram path failed (%s); falling back to Whisper", e)
    return await _whisper_transcribe(data, filename, language)
