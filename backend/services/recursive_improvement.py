"""TeamNest Dev OS — Recursive Improvement Engine (Phase 2).

Scans a project's linked chat (or any chat in the workspace tagged to a
project) for *signals*: user complaints, bug reports, feature asks. Buckets
them by theme, ranks the strongest, and asks the Reviewer Agent to draft
proposal-ready problem statements. The Dev OS routes then call
`generate_proposal` for each top signal.

Design choices:
- Lightweight signal extraction first (keyword + heuristic) so we don't burn
  LLM credits scanning every message; only the top N candidates go to the LLM.
- Returns up to `max_proposals` proposals — caller decides whether to persist.
"""
import logging
import re
from collections import Counter
from typing import Any, Dict, List, Optional

from deps import db

logger = logging.getLogger("teamnest")

# Heuristic patterns — order matters; first match wins per message.
SIGNAL_PATTERNS = [
    ("bug",      re.compile(r"\b(bug|broken|crash|error|fails?|doesn'?t work|not working|freeze|hang)\b", re.I)),
    ("ux",       re.compile(r"\b(confusing|hard to find|can'?t figure out|unclear|ugly|too many clicks|where is)\b", re.I)),
    ("perf",     re.compile(r"\b(slow|laggy|takes? forever|spinner|loading.*forever)\b", re.I)),
    ("missing",  re.compile(r"\b(wish|i want|need|please add|would love|feature request|missing)\b", re.I)),
    ("churn",    re.compile(r"\b(cancel|unsubscribe|leaving|switching to|competitor|refund)\b", re.I)),
    ("praise",   re.compile(r"\b(love|amazing|great|works perfectly|awesome|so good)\b", re.I)),
]


def _classify_message(body: str) -> Optional[str]:
    for label, pat in SIGNAL_PATTERNS:
        if pat.search(body):
            return label
    return None


async def scan_chat_for_signals(
    *, chat_id: str, workspace_id: str, lookback_messages: int = 200,
) -> Dict[str, Any]:
    """Pull recent messages and bucket them by signal type. Returns:

    {
      "total_scanned": int,
      "signals_found": int,
      "by_type": {"bug": [...], "ux": [...], ...},
      "top_signals": [{"type": "...", "summary": "...", "examples": [...]}],
    }

    Messages are scoped by chat_id only — workspace membership was verified
    by the caller before invoking this function.
    """
    _ = workspace_id  # kept for future tenant guard
    cursor = (
        db.messages.find(
            {"chat_id": chat_id, "deleted_at": None},
            {"_id": 0, "body": 1, "sender_id": 1, "created_at": 1, "message_type": 1},
        )
        .sort("created_at", -1)
        .limit(lookback_messages)
    )
    messages: List[Dict[str, Any]] = await cursor.to_list(length=lookback_messages)

    by_type: Dict[str, List[Dict[str, Any]]] = {}
    for m in messages:
        # Skip system / AI-system / call-event messages and any AI-sender posts
        # so the scheduler's own digests + employee replies don't re-feed regex.
        mtype = m.get("message_type") or ""
        if mtype.startswith("system") or mtype in ("ai-system", "ai_answer", "call_started", "call_ended"):
            continue
        if (m.get("sender_id") or "").startswith("ai-") or m.get("sender_id") == "system":
            continue
        body = (m.get("body") or "").strip()
        if not body or len(body) < 8:
            continue
        kind = _classify_message(body)
        if not kind or kind == "praise":
            continue
        by_type.setdefault(kind, []).append({"body": body[:280], "created_at": m.get("created_at")})

    # Rank: more matches = stronger signal. Cap each bucket at 5 examples.
    counts = Counter({k: len(v) for k, v in by_type.items()})
    top_signals = []
    for kind, _count in counts.most_common(4):
        examples = by_type[kind][:5]
        joined = " | ".join(e["body"] for e in examples)
        top_signals.append({
            "type": kind,
            "summary": _summary_for_bucket(kind, examples),
            "examples": examples,
            "signal_text": joined,
        })

    return {
        "total_scanned": len(messages),
        "signals_found": sum(counts.values()),
        "by_type": {k: len(v) for k, v in by_type.items()},
        "top_signals": top_signals,
    }


def _summary_for_bucket(kind: str, examples: List[Dict[str, Any]]) -> str:
    n = len(examples)
    label = {
        "bug": "bug report",
        "ux": "UX confusion",
        "perf": "performance complaint",
        "missing": "feature request",
        "churn": "churn signal",
    }.get(kind, kind)
    plural = "s" if n != 1 else ""
    return f"{n} {label}{plural} in recent messages"
