"""AI Employee — Style Training (Phase 2).

Turns writing samples (good/bad examples, uploaded/pasted samples, and MOCKED
email/chat connector samples) into a structured "style profile" using Claude
Fable 5 (falls back to Claude Sonnet 4.6 if Fable 5 is unavailable).

The mock connectors return realistic sample snippets so the LLM has real text
to analyse without any real OAuth. They are clearly labelled as samples.
"""
from __future__ import annotations

import json
import os
import secrets
from typing import Dict, List

from emergentintegrations.llm.chat import LlmChat, UserMessage

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# Primary style model (user-requested) + safe fallback if the API rejects it.
STYLE_MODEL = ("anthropic", "claude-fable-5")
FALLBACK_MODEL = ("anthropic", "claude-sonnet-4-6")

# ── Mocked style-source connectors ──────────────────────────────────────
# Each connector returns sample writing snippets so the analyser has real text
# to work with. NO real OAuth — clearly sample data.
MOCK_CONNECTORS: Dict[str, Dict] = {
    "gmail": {
        "label": "Gmail",
        "samples": [
            "Hi Sarah,\n\nThanks so much for the quick turnaround on this. I've reviewed the proposal and it looks great — just one small tweak on the timeline. Could we push the kickoff to Monday? Let me know what works.\n\nBest,\nAlex",
            "Hi team,\n\nFollowing up on yesterday's call. To recap: we're aligned on scope, pricing is approved, and next steps are with legal. I'll circle back once we hear from them.\n\nThanks,\nAlex",
            "Hi Marcus,\n\nApologies for the delay here. We hit a small snag on our end but it's resolved now. Everything should be back on track by end of week. Really appreciate your patience.\n\nBest regards,\nAlex",
        ],
    },
    "slack": {
        "label": "Slack",
        "samples": [
            "hey team 👋 quick update — the deploy went out clean, no issues so far. will keep an eye on it through the afternoon",
            "yep on it! give me ~20 and i'll have the summary ready",
            "great catch 🙏 fixing now — should be good in a few mins",
        ],
    },
    "whatsapp": {
        "label": "WhatsApp",
        "samples": [
            "Hey! Just confirming we're still on for 3pm today 👍",
            "Perfect, thanks so much! Talk soon 🙌",
            "No worries at all — take your time, whenever works for you 😊",
        ],
    },
}


def list_connectors() -> List[Dict]:
    return [
        {"id": key, "label": val["label"], "sample_count": len(val["samples"])}
        for key, val in MOCK_CONNECTORS.items()
    ]


def connector_samples(source: str) -> List[str]:
    c = MOCK_CONNECTORS.get(source)
    return list(c["samples"]) if c else []


# ── Style profile generation ────────────────────────────────────────────
def _parse_json(raw: str) -> Dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text[3:]
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip().rstrip("`").strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    return json.loads(text)


async def _run_llm(system_message: str, prompt: str) -> str:
    """Try Fable 5 first; fall back to Sonnet 4.6 on any error."""
    for provider, model in (STYLE_MODEL, FALLBACK_MODEL):
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"style-{secrets.randbelow(1_000_000) + 1}",
                system_message=system_message,
            ).with_model(provider, model)
            return str(await chat.send_message(UserMessage(text=prompt)))
        except Exception:
            continue
    raise RuntimeError("Style model unavailable")


def _deterministic_profile(samples: List[str]) -> Dict:
    """Fallback profile if the LLM/parse fails — always returns something usable."""
    joined = " ".join(samples)
    has_emoji = any(ord(ch) > 0x2190 for ch in joined)
    avg_len = (sum(len(s.split()) for s in samples) / len(samples)) if samples else 0
    return {
        "tone": "Professional and friendly",
        "formality": "Neutral",
        "avg_sentence_length": "Short" if avg_len < 12 else "Medium",
        "vocabulary": "Everyday",
        "greeting": "Hi [name],",
        "sign_off": "Best,",
        "emoji_usage": "Sparing" if has_emoji else "None",
        "signature_phrases": ["Thanks so much", "Let me know"],
        "avoid_phrases": ["To whom it may concern"],
        "summary": "Warm, concise and approachable — leads with gratitude and clear next steps.",
        "generated_by": "fallback",
    }


async def generate_style_profile(employee: Dict, samples: List[Dict]) -> Dict:
    """`samples` = [{source, text}]. Returns a structured style profile dict."""
    texts = [s["text"] for s in samples if s.get("text")]
    if not texts:
        raise ValueError("No writing samples to analyse")

    numbered = "\n\n".join(f"[Sample {i + 1} · {s.get('source', 'manual')}]\n{s['text']}"
                           for i, s in enumerate(samples) if s.get("text"))
    prompt = (
        f"Analyse the writing samples below for an AI employee named "
        f"'{employee.get('name')}' ({employee.get('job_title') or 'staff'}). "
        "Produce a reusable STYLE PROFILE that another AI could follow to write in "
        "the same voice.\n\n"
        "Return ONLY a JSON object with these keys:\n"
        '- tone (short phrase, e.g. "Warm and direct")\n'
        '- formality (one of: Casual, Neutral, Formal)\n'
        '- avg_sentence_length (one of: Short, Medium, Long)\n'
        '- vocabulary (one of: Simple, Everyday, Technical, Sophisticated)\n'
        '- greeting (typical opening line/salutation)\n'
        '- sign_off (typical closing/sign-off)\n'
        '- emoji_usage (one of: None, Sparing, Frequent)\n'
        '- signature_phrases (array of up to 5 recurring phrases/habits)\n'
        '- avoid_phrases (array of up to 5 phrases that would feel off-brand)\n'
        '- summary (2-3 sentence description of the overall writing style)\n\n'
        f"Writing samples:\n{numbered}\n\n"
        "Do not wrap the JSON in code fences."
    )
    system = "You are an expert writing-style analyst. Return ONLY valid JSON, no preamble, no code fences."
    try:
        raw = await _run_llm(system, prompt)
        profile = _parse_json(raw)
        profile["generated_by"] = "claude-fable-5"
    except Exception:
        profile = _deterministic_profile(texts)
    # Normalise arrays
    for k in ("signature_phrases", "avoid_phrases"):
        v = profile.get(k)
        if isinstance(v, str):
            profile[k] = [v]
        elif not isinstance(v, list):
            profile[k] = []
        profile[k] = [str(x).strip() for x in profile[k]][:5]
    return profile
