"""ChatGPT/Claude-style learned memory — a persistent, self-improving profile
of durable facts & preferences about each USER (personal) and the WORKSPACE
(shared team knowledge), auto-extracted from `@ai` conversations (and addable
manually via "remember this"). Injected into every AI answer so responses get
progressively more personalized.

Complements `memory_rag` (which stores decision/call/research knowledge cards):
this layer is about *who the user is and how they like to work*.
"""
from __future__ import annotations

import json
import re
import secrets
from typing import Dict, List, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

from deps import db, new_id, now_iso

import os

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
_MAX_ACTIVE = 60  # soft cap per (scope,user)

_EXTRACT_SYS = (
    "You maintain a long-term memory about a user and their team, exactly like "
    "ChatGPT/Claude memory. From a chat exchange, capture ONLY durable, reusable "
    "facts or preferences worth remembering for months — e.g. communication "
    "preferences, role/title, company & industry, tools & workflows they use, "
    "recurring processes, ongoing goals. IGNORE ephemeral/one-off details, "
    "small talk, and anything time-bound. NEVER store secrets, passwords, or "
    "sensitive personal data. Return ONLY a JSON array; [] if nothing durable."
)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())[:200]


async def _run_llm(system: str, prompt: str) -> str:
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"mem-{secrets.randbelow(1_000_000)}",
                   system_message=system).with_model("openai", "gpt-4o-mini")
    return str(await chat.send_message(UserMessage(text=prompt)))


def _parse_array(raw: str) -> list:
    t = (raw or "").strip()
    if t.startswith("```"):
        t = t.split("```")[1] if "```" in t[3:] else t[3:]
        if t.lower().startswith("json"):
            t = t[4:]
    s, e = t.find("["), t.rfind("]")
    if s != -1 and e != -1:
        t = t[s:e + 1]
    try:
        v = json.loads(t)
        return v if isinstance(v, list) else []
    except Exception:
        return []


async def remember(workspace_id: str, user_id: str, text: str, scope: str = "personal",
                   kind: str = "fact", source: str = "manual") -> Optional[Dict]:
    """Upsert one durable memory (deduped by normalized text within its scope)."""
    text = (text or "").strip()
    if not text or len(text) < 3:
        return None
    scope = scope if scope in ("personal", "workspace") else "personal"
    key = _norm(text)
    scope_q = {"workspace_id": workspace_id, "scope": scope, "norm_key": key}
    if scope == "personal":
        scope_q["user_id"] = user_id
    existing = await db.learned_memories.find_one(scope_q, {"_id": 0, "id": 1})
    now = now_iso()
    if existing:
        await db.learned_memories.update_one(
            {"id": existing["id"]},
            {"$set": {"text": text, "active": True, "updated_at": now, "last_used_at": now},
             "$inc": {"use_count": 1}})
        return await db.learned_memories.find_one({"id": existing["id"]}, {"_id": 0})
    doc = {
        "id": new_id(), "workspace_id": workspace_id,
        "user_id": user_id if scope == "personal" else None,
        "scope": scope, "kind": kind if kind in ("fact", "preference") else "fact",
        "text": text, "norm_key": key, "source": source, "active": True,
        "use_count": 0, "created_at": now, "updated_at": now, "last_used_at": now,
    }
    await db.learned_memories.insert_one(doc.copy())
    await _prune(workspace_id, user_id, scope)
    return doc


async def _prune(workspace_id: str, user_id: str, scope: str) -> None:
    q = {"workspace_id": workspace_id, "scope": scope, "active": True}
    if scope == "personal":
        q["user_id"] = user_id
    n = await db.learned_memories.count_documents(q)
    if n <= _MAX_ACTIVE:
        return
    stale = db.learned_memories.find(q, {"_id": 0, "id": 1}).sort("last_used_at", 1).limit(n - _MAX_ACTIVE)
    ids = [d["id"] async for d in stale]
    if ids:
        await db.learned_memories.update_many({"id": {"$in": ids}}, {"$set": {"active": False}})


async def extract_and_store(workspace_id: str, user_id: str, question: str,
                            context: str = "") -> int:
    """Fire-and-forget: pull durable facts/preferences from an exchange. Best-effort."""
    if not workspace_id or not user_id or not (question or "").strip():
        return 0
    try:
        prompt = (
            "Extract durable memory items from this exchange. For each return "
            '{"text": "...", "scope": "personal"|"workspace", "kind": "preference"|"fact"}. '
            "personal = about this individual user (their preferences/role/context); "
            "workspace = shared team/company facts.\n\n"
            + (f"[Recent context]\n{context[:1500]}\n\n" if context else "")
            + f"[User message]\n{question[:1500]}"
        )
        arr = _parse_array(await _run_llm(_EXTRACT_SYS, prompt))
        stored = 0
        for m in arr[:4]:
            if isinstance(m, dict) and m.get("text"):
                r = await remember(
                    workspace_id, user_id, str(m["text"]),
                    scope=str(m.get("scope", "personal")),
                    kind=str(m.get("kind", "fact")), source="auto")
                if r:
                    stored += 1
        return stored
    except Exception:
        return 0


async def build_memory_profile_block(workspace_id: str, user_id: str, limit: int = 14,
                                     workspace_only: bool = False) -> str:
    """Formatted memory block to inject into an AI prompt for personalization.
    `workspace_only` skips personal memory (use in shared/multi-user chats)."""
    if not workspace_id:
        return ""
    try:
        personal = [] if workspace_only else await db.learned_memories.find(
            {"workspace_id": workspace_id, "user_id": user_id, "scope": "personal", "active": True},
            {"_id": 0, "id": 1, "text": 1},
        ).sort("last_used_at", -1).to_list(limit)
        workspace = await db.learned_memories.find(
            {"workspace_id": workspace_id, "scope": "workspace", "active": True},
            {"_id": 0, "id": 1, "text": 1},
        ).sort("last_used_at", -1).to_list(limit)
        if not personal and not workspace:
            return ""
        # Mark used (keeps fresh memories surfaced).
        used = [d["id"] for d in personal + workspace]
        if used:
            await db.learned_memories.update_many({"id": {"$in": used}}, {"$set": {"last_used_at": now_iso()}})
        parts = ["[Memory — what you've learned about this user and team. Use it to personalize your answer; do not repeat it verbatim.]"]
        if personal:
            parts.append("About the user:\n" + "\n".join(f"- {d['text']}" for d in personal))
        if workspace:
            parts.append("About the team/workspace:\n" + "\n".join(f"- {d['text']}" for d in workspace))
        return "\n".join(parts)
    except Exception:
        return ""


# ---- Management (settings screen) ----
async def list_memories(workspace_id: str, user_id: str) -> Dict[str, List[Dict]]:
    personal = await db.learned_memories.find(
        {"workspace_id": workspace_id, "user_id": user_id, "scope": "personal"}, {"_id": 0},
    ).sort("updated_at", -1).to_list(500)
    workspace = await db.learned_memories.find(
        {"workspace_id": workspace_id, "scope": "workspace"}, {"_id": 0},
    ).sort("updated_at", -1).to_list(500)
    return {"personal": personal, "workspace": workspace}


async def update_memory(mem_id: str, workspace_id: str, text: Optional[str], active: Optional[bool]) -> bool:
    upd: Dict = {"updated_at": now_iso()}
    if text is not None:
        upd["text"] = text.strip()
        upd["norm_key"] = _norm(text)
    if active is not None:
        upd["active"] = active
    r = await db.learned_memories.update_one({"id": mem_id, "workspace_id": workspace_id}, {"$set": upd})
    return r.matched_count > 0


async def forget(mem_id: str, workspace_id: str) -> bool:
    r = await db.learned_memories.delete_one({"id": mem_id, "workspace_id": workspace_id})
    return r.deleted_count > 0
