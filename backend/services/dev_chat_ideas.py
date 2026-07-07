"""Dev chat — continuation heuristics + end-of-build feature ideas.

Split out of dev_chat_agents.py: pure-text heuristics that decide whether a
message is an edit of the existing project, plus the LLM-backed "what to
build next" recommendation chips posted after a build.
"""
import logging
import re
from typing import Any, Dict, List

from deps import _broadcast_message, db, new_id, now_iso

logger = logging.getLogger("teamnest")


_EDIT_VERBS = (
    "add ", "change ", "rename ", "remove ", "delete ", "drop ",
    "update ", "fix ", "modify ", "tweak ", "edit ", "make the ",
    "make it ", "swap ", "replace ", "set the ", "set to ",
    "increase ", "decrease ", "shrink ", "enlarge ", "color ",
    "style ", "polish ", "improve ", "refactor ",
)

# Bug-report phrasing — when a chat already has an active project, messages
# like "i can't read the fonts" are edit requests even without an edit verb.
_BUG_SIGNALS = (
    "can't", "cant ", "cannot", "not able", "doesn't", "does not", "isn't",
    "won't", "not working", "broken", "bug", "error", "issue", "problem",
    "fix", "unable", "hard to read", "not visible", "unreadable", "readable",
    "visibility", "wrong", "missing", "overlap", "too small", "too big",
)

# Polite lead-ins to strip before matching edit verbs at the start:
# "Let's change the font color" → "change the font color".
_LEADIN_PREFIXES = (
    "let's ", "lets ", "please ", "can you ", "could you ", "can we ",
    "could we ", "we should ", "you should ", "i want to ", "i want you to ",
    "i need you to ", "now ", "also ", "then ", "next ", "hey ", "ok ",
    "okay ",
)


def _strip_leadins(text: str) -> str:
    lower = (text or "").lstrip()
    changed = True
    while changed:
        changed = False
        for p in _LEADIN_PREFIXES:
            if lower.startswith(p):
                lower = lower[len(p):].lstrip()
                changed = True
    return lower


def _looks_actionable(text: str) -> bool:
    """Does this message ask for work on the app (edit verb or bug report)?"""
    lower = _strip_leadins((text or "").lower())
    if any(lower.startswith(v) for v in _EDIT_VERBS):
        return True
    if any(s in lower for s in _BUG_SIGNALS):
        return True
    padded = " " + lower
    return any((" " + v) in padded for v in _EDIT_VERBS)

# Tokens that don't say anything about what the product IS — drop them
# before computing brief-overlap similarity so we don't false-positive
# continuation just because two unrelated briefs share filler words.
_OVERLAP_STOPWORDS = frozenset((
    "a", "an", "the", "with", "and", "or", "for", "of", "to", "in",
    "on", "is", "are", "be", "as", "by", "at", "from", "this", "that",
    "build", "create", "make", "new", "me", "i", "want", "need",
    "please", "can", "you", "app", "application", "system", "platform",
    "tool", "tools", "feature", "features", "have", "has", "should",
))


def _tokens(text: str) -> set[str]:
    """Lowercased alphabetic tokens minus the stopword list above."""
    return {
        t for t in re.findall(r"[a-z]+", (text or "").lower())
        if t not in _OVERLAP_STOPWORDS and len(t) >= 3
    }


def _is_continuation(new_request: str, existing_project: Dict[str, Any]) -> bool:
    """Heuristic: does this @devmanager request look like an edit / refinement
    of the existing project rather than a brand-new product idea?

    Two signals (either is sufficient):
      1. The request starts with an edit verb ('add a status column', 'fix
         the login flow', 'make the buttons amber'). These almost never
         describe a NEW product. Polite lead-ins ("let's", "please", "can
         you") are stripped first.
      2. Bug-report phrasing ("can't read the fonts", "search is broken")
         — complaints are always about the EXISTING app.
      3. Jaccard overlap on content tokens (with stopwords stripped)
         between the new request and the existing project brief ≥ 0.30.
         Catches refinements like 'expense tracker with also tags' when
         the existing brief was 'build me an expense tracker'.
    """
    lower = _strip_leadins((new_request or "").lower())
    if any(lower.startswith(v) for v in _EDIT_VERBS):
        return True
    if any(s in lower for s in _BUG_SIGNALS):
        return True

    existing_brief = (
        (existing_project.get("plan") or {}).get("product_brief")
        or existing_project.get("description")
        or existing_project.get("name", "")
    )
    a = _tokens(new_request)
    b = _tokens(existing_brief)
    if not a or not b:
        return False
    overlap = len(a & b) / max(len(a | b), 1)
    return overlap >= 0.30


# ─── End-of-build recommendations ───────────────────────────────────
_FALLBACK_IDEAS = [
    {"label": "Search & filters", "prompt": "@devmanager add a search box and status filters above the main list view"},
    {"label": "CSV export", "prompt": "@devmanager add an 'Export CSV' button that downloads all entities as a CSV file"},
    {"label": "Edit-in-place rows", "prompt": "@devmanager let me click a row to edit its fields inline and save changes"},
    {"label": "Analytics mini-chart", "prompt": "@devmanager add a small bar chart to the dashboard showing entities created per day"},
]


async def _llm_build_ideas(project: Dict[str, Any]) -> List[Dict[str, str]]:
    """4 product-specific 'what to build next' chips. Deterministic fallback
    when the LLM is unavailable or returns junk."""
    brief = (
        (project.get("plan") or {}).get("product_brief")
        or project.get("description")
        or project.get("name", "")
    )
    try:
        import json
        import os
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            return _FALLBACK_IDEAS
        chat_llm = (
            LlmChat(
                api_key=key,
                session_id=f"build-ideas-{new_id()[:8]}",
                system_message=(
                    "You suggest concise next features for a freshly built web "
                    "app. Respond with valid JSON only."
                ),
            )
            .with_model("openai", "gpt-5.4-mini")
        )
        raw = await chat_llm.send_message(UserMessage(text=(
            f"An AI dev team just built this app: {brief[:500]}\n\n"
            "Return a JSON array of EXACTLY 4 objects: "
            '[{"label": "3-5 word feature name", "prompt": "one-sentence '
            "enhancement instruction starting with '@devmanager add' or "
            "'@devmanager improve'\"}]. Each idea must ENHANCE the existing app "
            "(a new section, field, view or behavior INSIDE it) — never "
            "propose a new or separate app, and never phrase the prompt as "
            "'create a' or 'build a'. Ideas must be specific to this "
            "product (not generic). JSON only, no markdown fences."
        )))
        cleaned = (raw or "").strip()
        if cleaned.startswith("```"):
            m = re.match(r"^```[a-zA-Z]*\n(.*)\n```\s*$", cleaned, re.DOTALL)
            if m:
                cleaned = m.group(1).strip()
        ideas = json.loads(cleaned)
        out = []
        for it in ideas if isinstance(ideas, list) else []:
            label = (it.get("label") or "").strip()
            prompt = (it.get("prompt") or "").strip()
            if not label or not prompt:
                continue
            if not prompt.lower().startswith(("@devmgr", "@devmanager")):
                prompt = f"@devmanager {prompt}"
            out.append({"label": label[:48], "prompt": prompt[:400]})
        return out[:4] or _FALLBACK_IDEAS
    except Exception as e:
        logger.warning("[build-ideas] LLM failed: %s — using fallback", e)
        return _FALLBACK_IDEAS


async def _post_build_recommendations(chat: Dict[str, Any], project: Dict[str, Any]) -> None:
    """Post a '✨ What's next?' message with tappable feature chips after a
    build/edit completes. Chips drop their prompt into the composer."""
    ideas = await _llm_build_ideas(project)
    msg = {
        "id": new_id(),
        "chat_id": chat["id"],
        "sender_id": "ai-system",
        "message_type": "ai-system",
        "body": (
            "✨ **What's next?** Here are some ideas to level this build up — "
            "tap one to queue it in the composer."
        ),
        "parent_message_id": None,
        "metadata": {
            "source": "build_recommendations",
            "project_id": project["id"],
            "idea_chips": ideas,
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(chat["id"], msg)
