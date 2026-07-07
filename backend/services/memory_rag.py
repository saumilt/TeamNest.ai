"""Phase 4 — Persistent Chat Memory + Shared AI Context (RAG).

Lightweight, dependency-free retrieval:
- Mongo `memory_items` collection stores summaries of important sources with
  scope metadata (workspace / project / chat) + a free-text `search_text` field
  indexed for `$text` BM25-style scoring.
- Auto-summaries are produced by Gemini Flash via the universal Emergent LLM key
  to keep stored content compact.
- Retrieval combines text-score + recency boost + scope filtering, returning
  the top-K items to feed back into the AI prompt as context.
- No external vector DB needed — works on any MongoDB.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

from deps import db, logger, new_id, now_iso
import os

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# ---- Memory item shape ----
# {
#   id, workspace_id, project_folder_id?, chat_id?, source_type, source_id,
#   title, content, summary, search_text, memory_type, visibility,
#   importance_score, status, created_by, created_at, updated_at
# }

MEMORY_TYPES = {"fact", "decision", "assumption", "risk", "task", "research", "note"}
VISIBILITY = {"private", "chat", "project", "workspace"}
STATUS = {"active", "outdated", "archived", "deleted"}

# Source-type → importance default (decisions outrank chitchat)
_IMPORTANCE = {
    "approval": 0.95,
    "call_summary": 0.85,
    "ai_thread": 0.80,
    "ai_response": 0.75,
    "voice_note": 0.65,
    "task": 0.60,
    "transcript": 0.55,
    "file": 0.50,
    "message": 0.30,
}

_log = logging.getLogger("teamnest.memory")


# ---- Indexes ----
_indexes_ready = False


async def ensure_memory_indexes() -> None:
    """Create the text index + scope indexes on first use (idempotent)."""
    global _indexes_ready
    if _indexes_ready:
        return
    try:
        await db.memory_items.create_index(
            [("search_text", "text")],
            name="memory_text_idx",
            default_language="english",
        )
        await db.memory_items.create_index(
            [("workspace_id", 1), ("status", 1), ("created_at", -1)],
            name="memory_scope_idx",
        )
        await db.memory_items.create_index([("source_type", 1), ("source_id", 1)], unique=False)
        await db.memory_items.create_index([("chat_id", 1)])
        await db.memory_items.create_index([("project_folder_id", 1)])
        _indexes_ready = True
    except Exception as e:
        _log.warning("Memory index creation skipped: %s", e)


# ---- Summarization ----

async def summarize_text(
    raw: str,
    title_hint: Optional[str] = None,
    max_words: int = 80,
) -> Dict[str, str]:
    """Produce a concise (<= ~80 word) summary + a 1-line title.

    Uses Gemini Flash (cheap, fast). Falls back to a truncated copy of `raw` on
    error so we never block the calling write path.
    """
    raw = (raw or "").strip()
    if not raw:
        return {"title": title_hint or "Untitled", "summary": ""}
    if len(raw.split()) <= max_words:
        return {"title": title_hint or _first_line(raw)[:120], "summary": raw}
    prompt = (
        "Summarize the content below for later retrieval.\n"
        "Return EXACTLY two lines:\n"
        f"  Line 1: a 6–12 word title.\n"
        f"  Line 2: a {max_words}-word summary capturing the key decisions, facts, "
        "people involved, and any concrete numbers.\n"
        "No markdown, no preamble.\n\n"
        f"Content:\n{raw[:4000]}"
    )
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"mem-sum-{secrets.randbelow(1_000_000)}",
            system_message="You write tight retrieval summaries.",
        ).with_model("gemini", "gemini-3.5-flash")
        out = str(await chat.send_message(UserMessage(text=prompt))).strip()
        lines = [ln.strip() for ln in out.splitlines() if ln.strip()]
        if len(lines) >= 2:
            return {"title": lines[0][:140], "summary": " ".join(lines[1:])[:600]}
        return {"title": title_hint or _first_line(raw)[:120], "summary": out[:600]}
    except Exception as e:
        _log.warning("Summarize failed: %s", e)
        return {"title": title_hint or _first_line(raw)[:120], "summary": raw[:600]}


def _first_line(s: str) -> str:
    for line in s.splitlines():
        line = line.strip()
        if line:
            return line
    return s[:120]


# ---- Write path ----

async def record_memory(
    *,
    workspace_id: str,
    source_type: str,
    source_id: str,
    raw_content: str,
    created_by: Optional[str] = None,
    chat_id: Optional[str] = None,
    project_folder_id: Optional[str] = None,
    title: Optional[str] = None,
    memory_type: str = "note",
    visibility: str = "chat",
    importance_score: Optional[float] = None,
    extra_meta: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Write a memory item. Idempotent on (source_type, source_id).

    Returns the stored item (without `_id`). Best-effort — swallows errors so
    failures here never break a user request.
    """
    try:
        await ensure_memory_indexes()
        if not raw_content or not raw_content.strip():
            return None

        # Idempotency: upsert by (source_type, source_id)
        existing = await db.memory_items.find_one(
            {"source_type": source_type, "source_id": source_id}, {"_id": 0}
        )
        if existing:
            return existing  # already recorded; don't duplicate

        # Summarize asynchronously (in line) — costs ~1 credit on Gemini Flash.
        s = await summarize_text(raw_content, title_hint=title)
        if memory_type not in MEMORY_TYPES:
            memory_type = "note"
        if visibility not in VISIBILITY:
            visibility = "chat"
        item: Dict[str, Any] = {
            "id": new_id(),
            "workspace_id": workspace_id,
            "project_folder_id": project_folder_id,
            "chat_id": chat_id,
            "source_type": source_type,
            "source_id": source_id,
            "title": s["title"],
            "content": raw_content[:4000],
            "summary": s["summary"],
            "search_text": f"{s['title']}\n{s['summary']}\n{raw_content[:1500]}",
            "memory_type": memory_type,
            "visibility": visibility,
            "importance_score": float(
                importance_score if importance_score is not None else _IMPORTANCE.get(source_type, 0.4)
            ),
            "status": "active",
            "created_by": created_by,
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "meta": extra_meta or {},
        }
        await db.memory_items.insert_one(item.copy())
        item.pop("_id", None)
        return item
    except Exception as e:
        _log.warning("[record_memory] failed: %s", e)
        return None


# ---- Retrieval ----

async def retrieve_memory(
    *,
    workspace_id: str,
    query: str,
    chat_id: Optional[str] = None,
    project_folder_id: Optional[str] = None,
    mode: Literal["none", "chat", "project", "workspace", "custom"] = "chat",
    selected_ids: Optional[List[str]] = None,
    limit: int = 8,
    user_role: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return up to `limit` relevant memory items, scored by (text-relevance ×
    importance × recency). Filtered by `mode`. Optionally enforces per-role
    access rules from `memory_access_rules` collection."""
    await ensure_memory_indexes()

    # Per-role access enforcement. If a rule exists for this user_role and it
    # forbids the requested mode, downgrade to the safest allowed scope.
    if user_role:
        rule = await db.memory_access_rules.find_one(
            {"workspace_id": workspace_id, "role": user_role}, {"_id": 0}
        )
        if rule:
            if mode == "workspace" and not rule.get("can_use_workspace_memory", True):
                mode = "project" if project_folder_id else ("chat" if chat_id else "none")
            if mode == "project" and not rule.get("can_use_project_memory", True):
                mode = "chat" if chat_id else "none"
            if mode == "chat" and not rule.get("can_use_chat_memory", True):
                mode = "none"

    if mode == "none":
        return []

    if mode == "custom" and selected_ids:
        cur = db.memory_items.find(
            {"id": {"$in": list(selected_ids)}, "status": "active"},
            {"_id": 0},
        ).limit(limit)
        return [doc async for doc in cur]

    # Scope filter
    scope_filter: Dict[str, Any] = {"workspace_id": workspace_id, "status": "active"}
    if mode == "chat" and chat_id:
        scope_filter["$or"] = [{"chat_id": chat_id}, {"visibility": "workspace"}]
    elif mode == "project" and project_folder_id:
        scope_filter["$or"] = [
            {"project_folder_id": project_folder_id},
            {"chat_id": chat_id} if chat_id else {"project_folder_id": project_folder_id},
            {"visibility": "workspace"},
        ]
    elif mode == "project" and chat_id:
        # Project mode but chat isn't linked — fallback to chat scope
        scope_filter["$or"] = [{"chat_id": chat_id}, {"visibility": "workspace"}]
    # mode == "workspace": no additional scope narrowing

    # If query is empty, do a recency-based pull instead of text search
    if not (query or "").strip():
        cur = db.memory_items.find(scope_filter, {"_id": 0}).sort(
            "created_at", -1
        ).limit(limit)
        return [doc async for doc in cur]

    # Text search with relevance ranking
    try:
        text_filter = {**scope_filter, "$text": {"$search": query[:400]}}
        cur = db.memory_items.find(
            text_filter,
            {"_id": 0, "score": {"$meta": "textScore"}},
        ).sort([("score", {"$meta": "textScore"})]).limit(limit * 3)
        candidates = [doc async for doc in cur]
    except Exception as e:
        _log.warning("[retrieve_memory] text search failed: %s", e)
        candidates = []

    # Recency + importance boost
    now = datetime.now(timezone.utc)
    scored: List[tuple] = []
    for c in candidates:
        try:
            t = datetime.fromisoformat(c["created_at"].replace("Z", "+00:00"))
            age_days = max(0.0, (now - t).total_seconds() / 86400.0)
        except Exception:
            age_days = 30.0
        recency = 1.0 / (1.0 + age_days / 14.0)  # half-weight at 2 weeks old
        score = (c.get("score") or 1.0) * (0.5 + 0.5 * recency) * (0.6 + 0.4 * float(c.get("importance_score") or 0.5))
        c["_combined_score"] = round(score, 4)
        scored.append((score, c))
    scored.sort(key=lambda x: x[0], reverse=True)

    out = [c for _, c in scored[:limit]]
    # Always include latest 2 approvals/call summaries verbatim if absent (high authority)
    if mode != "none":
        try:
            high_filter = {
                **scope_filter,
                "source_type": {"$in": ["approval", "call_summary"]},
            }
            high = db.memory_items.find(high_filter, {"_id": 0}).sort("created_at", -1).limit(2)
            existing_ids = {x["id"] for x in out}
            async for h in high:
                if h["id"] not in existing_ids:
                    out.append(h)
        except Exception:
            pass
    return out[:limit + 2]


# ---- Prompt assembly ----

def build_rag_context(memory_items: List[Dict[str, Any]]) -> str:
    """Render memory items as a compact context block for the AI prompt."""
    if not memory_items:
        return ""
    lines: List[str] = ["=== Relevant memory from this team's prior work ==="]
    for i, m in enumerate(memory_items, 1):
        kind = m.get("memory_type", "note").upper()
        date = (m.get("created_at") or "")[:10]
        title = m.get("title") or "Memory"
        body = m.get("summary") or m.get("content") or ""
        lines.append(f"\n[{i}] ({kind} · {date}) {title}\n    {body[:400]}")
    lines.append(
        "\n\nUse this memory to inform your answer. When relevant, cite items "
        "with their [#] number. If the new question conflicts with prior decisions, "
        "name the conflict explicitly. If memory is insufficient, say so."
    )
    return "\n".join(lines)


def format_memory_sources(memory_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Trim memory items into the payload returned to the frontend."""
    out: List[Dict[str, Any]] = []
    for m in memory_items:
        out.append({
            "id": m["id"],
            "source_type": m.get("source_type"),
            "source_id": m.get("source_id"),
            "title": m.get("title"),
            "summary": m.get("summary"),
            "memory_type": m.get("memory_type"),
            "chat_id": m.get("chat_id"),
            "project_folder_id": m.get("project_folder_id"),
            "created_at": m.get("created_at"),
            "score": m.get("_combined_score"),
        })
    return out


# ---- Background backfill (optional util) ----

async def backfill_existing_chats(workspace_id: str, max_per_collection: int = 200) -> Dict[str, int]:
    """One-shot helper to seed memory from existing approved answers, AI threads,
    call summaries, voice notes. Safe to re-run (idempotent on source_id).
    """
    await ensure_memory_indexes()
    counts: Dict[str, int] = {}

    # AI threads with final_answer
    async for t in db.ai_threads.find(
        {}, {"_id": 0}
    ).limit(max_per_collection):
        chat = await db.chats.find_one({"id": t.get("chat_id")}, {"_id": 0})
        if not chat or chat.get("workspace_id") != workspace_id or not t.get("final_answer"):
            continue
        await record_memory(
            workspace_id=workspace_id,
            source_type="ai_thread",
            source_id=t["id"],
            raw_content=f"Q: {t.get('question','')}\n\nA: {t.get('final_answer','')}",
            chat_id=t.get("chat_id"),
            project_folder_id=chat.get("project_folder_id"),
            title=t.get("question", "AI research")[:120],
            memory_type="research",
            visibility="chat",
            created_by=t.get("created_by"),
        )
        counts["ai_thread"] = counts.get("ai_thread", 0) + 1

    # Approvals
    async for a in db.approvals.find(
        {"workspace_id": workspace_id, "status": "approved"}, {"_id": 0}
    ).limit(max_per_collection):
        await record_memory(
            workspace_id=workspace_id,
            source_type="approval",
            source_id=a["id"],
            raw_content=f"{a.get('title','Approved')}: {a.get('final_answer','')}",
            chat_id=a.get("chat_id"),
            project_folder_id=a.get("project_folder_id"),
            title=a.get("title"),
            memory_type="decision",
            visibility="project",
            importance_score=0.95,
            created_by=a.get("created_by"),
        )
        counts["approval"] = counts.get("approval", 0) + 1

    # Calls with summary
    async for c in db.calls.find({}, {"_id": 0}).limit(max_per_collection):
        if (c.get("workspace_id") and c["workspace_id"] != workspace_id):
            continue
        summary = (c.get("summary") or {}).get("text") or c.get("summary_text")
        if not summary:
            continue
        await record_memory(
            workspace_id=workspace_id,
            source_type="call_summary",
            source_id=c["id"],
            raw_content=summary,
            chat_id=c.get("chat_id"),
            title=f"Call: {c.get('title') or c.get('id', '')[:8]}",
            memory_type="note",
            visibility="chat",
            importance_score=0.85,
            created_by=c.get("created_by"),
        )
        counts["call_summary"] = counts.get("call_summary", 0) + 1

    return counts


# ---- Smart Memory Cards extraction ----

_SMART_CARDS_PROMPT = """You are a senior project knowledge extractor. Given an approved
team decision, call summary, or research conclusion below, extract 1 to 4 high-signal
memory cards that capture the team's working knowledge.

For each card, output ONE entry in a JSON array with EXACTLY these keys:
  - card_type: one of "decision" | "assumption" | "risk" | "task" | "fact"
  - title: 6-12 word headline (no trailing punctuation)
  - content: 1-3 sentence detail. Include concrete numbers, names, and dates if present.

Rules:
- "decision" = a concrete choice the team made (preferred a market, picked a vendor, set a price).
- "assumption" = a working belief that should be verified later (e.g. "we assume rent is X").
- "risk" = a flagged worry, blocker, or open dependency.
- "task" = a clear next-step action item.
- "fact" = an important reference fact (a number, a date, a constraint).
- Output ONLY the JSON array. No prose, no markdown.
- Skip anything that's just narrative; only emit cards that capture *durable knowledge*.

Source content:
{content}

JSON array:"""


def _parse_smart_cards_response(raw: str) -> List[Dict[str, str]]:
    import json
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    valid_types = {"decision", "assumption", "risk", "task", "fact"}
    out: List[Dict[str, str]] = []
    for c in parsed[:4]:
        if not isinstance(c, dict):
            continue
        ct = (c.get("card_type") or "").lower().strip()
        if ct not in valid_types:
            continue
        title = (c.get("title") or "").strip()[:140]
        content = (c.get("content") or "").strip()[:1200]
        if title and content:
            out.append({"card_type": ct, "title": title, "content": content})
    return out


async def extract_smart_cards(
    *,
    workspace_id: str,
    source_type: str,
    source_id: str,
    raw_content: str,
    chat_id: Optional[str] = None,
    project_folder_id: Optional[str] = None,
    created_by: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Run Claude over a source's content and persist 1-4 structured memory cards
    (Decision / Assumption / Risk / Task / Fact). Idempotent on
    (workspace_id, parent_source_id, card_index): re-running for the same source
    skips already-created cards.
    """
    if not raw_content or not raw_content.strip():
        return []

    # Idempotency: if we've already extracted cards for this source, skip.
    existing = await db.memory_items.count_documents({
        "workspace_id": workspace_id,
        "source_type": "smart_card",
        "meta.parent_source_id": source_id,
    })
    if existing >= 1:
        return []

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"smartcards-{secrets.randbelow(1_000_000)}",
            system_message="You extract durable team knowledge into structured JSON memory cards.",
        ).with_model("anthropic", "claude-haiku-4-5-20251001")
        raw = str(await chat.send_message(UserMessage(text=_SMART_CARDS_PROMPT.format(content=raw_content[:6000]))))
        cards = _parse_smart_cards_response(raw)
    except Exception as e:
        _log.warning("[smart_cards] extraction failed for %s/%s: %s", source_type, source_id, e)
        return []

    persisted: List[Dict[str, Any]] = []
    for i, card in enumerate(cards):
        item = await record_memory(
            workspace_id=workspace_id,
            source_type="smart_card",
            source_id=f"{source_id}-card-{i}",
            raw_content=card["content"],
            chat_id=chat_id,
            project_folder_id=project_folder_id,
            title=card["title"],
            memory_type=card["card_type"],
            visibility="workspace",
            importance_score=0.85,
            created_by=created_by,
            extra_meta={
                "parent_source_type": source_type,
                "parent_source_id": source_id,
                "card_index": i,
            },
        )
        if item:
            persisted.append(item)
    return persisted


async def extract_smart_cards_bulk(
    workspace_id: str, max_sources: int = 100
) -> Dict[str, int]:
    """Backfill smart cards for all existing approved decisions + call summaries
    in a workspace. Skips sources that already have cards."""
    counts = {"approval": 0, "call_summary": 0, "cards_created": 0}
    # Approvals
    async for a in db.approvals.find(
        {"workspace_id": workspace_id, "status": "approved"}, {"_id": 0}
    ).limit(max_sources):
        if not a.get("final_answer"):
            continue
        cards = await extract_smart_cards(
            workspace_id=workspace_id,
            source_type="approval",
            source_id=a["id"],
            raw_content=f"{a.get('title','')}\n\n{a['final_answer']}",
            chat_id=a.get("chat_id"),
            project_folder_id=a.get("project_folder_id"),
            created_by=a.get("approved_by") or a.get("created_by"),
        )
        if cards:
            counts["approval"] += 1
            counts["cards_created"] += len(cards)
    # Call summaries
    async for c in db.calls.find({}, {"_id": 0}).limit(max_sources):
        if c.get("workspace_id") and c["workspace_id"] != workspace_id:
            continue
        summary = (c.get("summary") or {}).get("markdown") or (c.get("summary") or {}).get("text")
        if not summary:
            continue
        chat = await db.chats.find_one({"id": c.get("chat_id")}, {"_id": 0})
        cards = await extract_smart_cards(
            workspace_id=workspace_id,
            source_type="call_summary",
            source_id=c["id"],
            raw_content=summary,
            chat_id=c.get("chat_id"),
            project_folder_id=(chat or {}).get("project_folder_id"),
            created_by=c.get("created_by"),
        )
        if cards:
            counts["call_summary"] += 1
            counts["cards_created"] += len(cards)
    return counts
