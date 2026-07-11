"""Content-aware AI-employee recommendation for a chat.

Analyses the recent conversation and recommends the single best-suited AI
employee the workspace can hire — from published marketplace listings
(TeamNest + community built), the workspace's own saved AI employees, and the
built-in @devmanager engineering team.

If nothing fits confidently it returns None so the UI falls back to a generic
"Hire an AI employee" banner that links to the marketplace.

Uses Claude (Fable 5 → Sonnet 4.6 fallback) via the Emergent LLM key. Results
are cached on the chat doc keyed by the latest message id so a chat only costs
one classification until new messages arrive.
"""
from __future__ import annotations

import json
import os
import secrets
from typing import Dict, List, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

from deps import db, now_iso

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
RECO_MODEL = ("anthropic", "claude-fable-5")
RECO_FALLBACK = ("anthropic", "claude-sonnet-4-6")

DEVMANAGER = {
    "kind": "devmanager",
    "id": "devmanager",
    "name": "AI Engineering Team (@devmanager)",
    "desc": "Plans, architects, codes, tests and ships software / apps / websites / dev projects.",
}


def _parse_json(raw: str) -> Dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text[3:]
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip().rstrip("`").strip()
    s, e = text.find("{"), text.rfind("}")
    if s != -1 and e != -1:
        text = text[s : e + 1]
    return json.loads(text)


async def _chat_text(chat_id: str, limit: int = 25) -> tuple[str, Optional[str], int]:
    """Recent human message text, the latest message id, and human-msg count."""
    msgs = await db.messages.find(
        {"chat_id": chat_id, "deleted_at": None},
        {"_id": 0, "body": 1, "message_type": 1, "id": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(limit)
    latest_id = msgs[0]["id"] if msgs else None
    human = [
        m.get("body", "").strip()
        for m in reversed(msgs)
        if m.get("body") and m.get("message_type") in (None, "text", "ai_question")
    ]
    text = "\n".join(human)[:4000]
    return text, latest_id, len(human)


async def _candidates(workspace_id: str) -> List[Dict]:
    out: List[Dict] = [DEVMANAGER]
    seen_emp = set()

    async for lst in db.ai_employee_marketplace_listings.find(
        {"status": "Published"},
        {"_id": 0, "id": 1, "employee_id": 1, "title": 1, "tagline": 1,
         "description": 1, "category": 1, "price": 1},
    ):
        seen_emp.add(lst.get("employee_id"))
        desc = " · ".join(filter(None, [lst.get("category"), lst.get("tagline"), (lst.get("description") or "")[:160]]))
        out.append({
            "kind": "marketplace",
            "id": lst["id"],
            "employee_id": lst.get("employee_id"),
            "name": lst.get("title"),
            "price": lst.get("price"),
            "desc": desc or lst.get("title", ""),
        })

    async for emp in db.ai_employees.find(
        {"workspace_id": workspace_id, "status": {"$ne": "archived"}},
        {"_id": 0, "id": 1, "name": 1, "job_title": 1, "industry": 1, "description": 1},
    ):
        if emp["id"] in seen_emp:
            continue
        desc = " · ".join(filter(None, [emp.get("job_title"), emp.get("industry"), (emp.get("description") or "")[:160]]))
        out.append({
            "kind": "employee",
            "id": emp["id"],
            "employee_id": emp["id"],
            "name": emp.get("name"),
            "desc": desc or emp.get("name", ""),
        })
    return out


async def _classify(chat_text: str, candidates: List[Dict]) -> Dict:
    listing = "\n".join(
        f"[{i}] {c['name']} — {c['desc']}" for i, c in enumerate(candidates)
    )
    system = (
        "You match a team chat to the single best-suited AI employee to hire. "
        "Return STRICT JSON only: {\"best_index\": <int or -1>, \"confidence\": <0..1>, "
        "\"reason\": \"<max 12 words, why it fits this chat>\"}. "
        "Pick -1 if no candidate clearly fits the chat's actual topic."
    )
    prompt = (
        f"CHAT EXCERPT:\n{chat_text}\n\nCANDIDATE AI EMPLOYEES:\n{listing}\n\n"
        "Which candidate index best fits what THIS chat is about? JSON only."
    )
    for provider, model in (RECO_MODEL, RECO_FALLBACK):
        try:
            llm = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"reco-{secrets.randbelow(1_000_000) + 1}",
                system_message=system,
            ).with_model(provider, model)
            return _parse_json(str(await llm.send_message(UserMessage(text=prompt))))
        except Exception:
            continue
    raise RuntimeError("reco model unavailable")


def _build_reco(cand: Dict, reason: str) -> Dict:
    if cand["kind"] == "devmanager":
        return {
            "kind": "devmanager", "name": "AI Engineering Team", "handle": "devmanager",
            "reason": reason or "This chat is about building software.",
            "cta_label": "Hire @devmanager", "link": None,
        }
    if cand["kind"] == "marketplace":
        price = cand.get("price")
        return {
            "kind": "marketplace", "id": cand["id"], "employee_id": cand.get("employee_id"),
            "name": cand["name"], "reason": reason,
            "price": price,
            "cta_label": f"Hire {cand['name']}" + (f" · ${int(price)}" if price else ""),
            "link": f"/ai-builder/marketplace?listing={cand['id']}",
        }
    return {
        "kind": "employee", "id": cand["id"], "employee_id": cand.get("employee_id"),
        "name": cand["name"], "reason": reason,
        "cta_label": f"Use {cand['name']}",
        "link": f"/ai-builder/{cand['id']}",
    }


async def recommend_for_chat(chat: Dict, force: bool = False) -> Optional[Dict]:
    chat_id = chat["id"]
    text, latest_id, human_count = await _chat_text(chat_id)

    cached = chat.get("employee_reco")
    if cached and not force and cached.get("based_on") == latest_id:
        return cached.get("reco")

    reco: Optional[Dict] = None
    if human_count >= 2 and text.strip():
        candidates = await _candidates(chat["workspace_id"])
        try:
            res = await _classify(text, candidates)
            idx = int(res.get("best_index", -1))
            conf = float(res.get("confidence", 0) or 0)
            if 0 <= idx < len(candidates) and conf >= 0.5:
                reco = _build_reco(candidates[idx], (res.get("reason") or "").strip())
        except Exception:
            reco = None

    await db.chats.update_one(
        {"id": chat_id},
        {"$set": {"employee_reco": {"reco": reco, "based_on": latest_id, "at": now_iso()}}},
    )
    return reco
