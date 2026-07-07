"""Deepgram Nova-3 prerecorded transcription — fast path for live call chunks.

Falls back gracefully to Whisper if Deepgram fails or returns empty. Designed
to match the existing `transcribe_audio(blob, filename)` return shape so the
caller doesn't care which provider answered.
"""
import asyncio
import os
from typing import Any, Dict

from deps import logger

try:
    from deepgram import DeepgramClient
    _DEEPGRAM_AVAILABLE = True
except Exception as _e:
    _DEEPGRAM_AVAILABLE = False
    logger.warning("deepgram-sdk not importable: %s", _e)

DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY") or ""
_client: Any = None
_disabled_reason: str | None = None  # set to a string once Deepgram is known-bad


def is_configured() -> bool:
    if _disabled_reason:
        return False
    return bool(DEEPGRAM_API_KEY and _DEEPGRAM_AVAILABLE)


def _mark_disabled(reason: str) -> None:
    global _disabled_reason
    if _disabled_reason is None:
        logger.warning(
            "Deepgram disabled for the rest of this process (%s). "
            "Whisper will handle all transcription until the server restarts.",
            reason,
        )
    _disabled_reason = reason


def _get_client():
    """Lazily build the global DeepgramClient. Returns None if not configured."""
    global _client
    if not is_configured():
        return None
    if _client is None:
        try:
            _client = DeepgramClient(api_key=DEEPGRAM_API_KEY)
        except Exception as e:
            logger.warning("Deepgram client init failed: %s", e)
            _client = False
    return _client if _client is not False else None


def _sync_transcribe(blob: bytes, filename: str | None = None) -> Dict[str, Any]:
    """Blocking call to Deepgram's prerecorded /v1/listen via the SDK v7.

    v7 dropped the top-level `PrerecordedOptions` / `FileSource` helpers and
    accepts plain dicts instead. We pass `{"buffer": blob}` as the source and
    a dict of model parameters as options.
    """
    client = _get_client()
    if client is None:
        raise RuntimeError("deepgram_not_configured")

    # Note: v7 SDK transcribe_file infers mimetype from the body; filename is
    # only used for logging.
    _ = filename

    try:
        response = client.listen.v1.media.transcribe_file(
            request=blob,
            model="nova-3",
            smart_format=True,
            detect_language=True,
            punctuate=True,
        )
    except Exception as exc:
        # 401 / invalid key → flip the kill-switch so we don't keep eating
        # 500-1000ms per chunk on a doomed network round-trip.
        msg = str(exc).lower()
        if "invalid_auth" in msg or "401" in msg or "invalid credentials" in msg:
            _mark_disabled("auth_failed")
        raise

    # v7's response object exposes .to_dict() for safe access.
    try:
        data = response.to_dict()
    except Exception:
        # Some response shapes are still dataclasses — fall back to attr access.
        data = {}

    text = ""
    language: Any = None
    duration: Any = None
    words: list = []

    try:
        if data:
            metadata = data.get("metadata") or {}
            duration = metadata.get("duration")
            results = data.get("results") or {}
            channels = results.get("channels") or []
            if channels:
                ch0 = channels[0]
                language = ch0.get("detected_language") or results.get("language")
                alts = ch0.get("alternatives") or []
                if alts:
                    text = (alts[0].get("transcript") or "").strip()
                    for w in (alts[0].get("words") or []):
                        words.append({
                            "word": w.get("word", ""),
                            "start": w.get("start"),
                            "end": w.get("end"),
                        })
        else:
            # Attribute-based fallback (older v7 builds where to_dict isn't present).
            results = getattr(response, "results", None)
            if results and getattr(results, "channels", None):
                ch0 = results.channels[0]
                language = getattr(ch0, "detected_language", None)
                alts = getattr(ch0, "alternatives", None) or []
                if alts:
                    text = (getattr(alts[0], "transcript", "") or "").strip()
                    for w in (getattr(alts[0], "words", None) or []):
                        words.append({
                            "word": getattr(w, "word", ""),
                            "start": getattr(w, "start", None),
                            "end": getattr(w, "end", None),
                        })
            metadata = getattr(response, "metadata", None)
            if metadata is not None:
                duration = getattr(metadata, "duration", None)
    except Exception as e:
        logger.warning("Deepgram response parse failed: %s", e)

    return {
        "text": text,
        "language": language,
        "duration": duration,
        "segments": words or None,
        "provider": "deepgram",
    }


async def transcribe(blob: bytes, filename: str | None = None) -> Dict[str, Any]:
    """Async wrapper that offloads the blocking Deepgram call to a thread."""
    return await asyncio.to_thread(_sync_transcribe, blob, filename)
