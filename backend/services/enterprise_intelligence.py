"""TeamNest Role Intelligence — Phase B intelligence layer.

Two capabilities, both grounded strictly in a role's APPROVED, source-grounded
knowledge (never in a person's identity — "transfer the knowledge, not the
person"):

1. Knowledge-transfer handoff packages: a 30/60/90 checklist + an anonymized
   handoff brief generated from the role profile + approved memories.
2. "Ask Previous Role": a successor-facing chat that answers only from the
   role's approved knowledge, anonymizes identity, and cites its sources.

Uses Claude Fable 5 via the Emergent LLM Key (Sonnet 4.6 fallback), mirroring
the AI Employee runtime. Deterministic fallbacks keep everything usable if the
model is unavailable.
"""
from __future__ import annotations

import os
import re
import secrets
from typing import Dict, List, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
PRIMARY = ("anthropic", "claude-fable-5")
FALLBACK = ("anthropic", "claude-sonnet-4-6")


async def _run_llm(system_message: str, prompt: str, session_id: str) -> str:
    for provider, model in (PRIMARY, FALLBACK):
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=session_id,
                system_message=system_message,
            ).with_model(provider, model)
            return str(await chat.send_message(UserMessage(text=prompt)))
        except Exception:
            continue
    raise RuntimeError("LLM unavailable")


# ── Handoff package ──────────────────────────────────────────────────────────
def build_checklist(role: Dict, profile: Optional[Dict]) -> List[Dict]:
    """Deterministic 30/60/90 onboarding checklist derived from the role profile."""
    profile = profile or {}
    sops = (profile.get("sops") or [])[:4]
    workflows = (profile.get("workflow_steps") or [])[:2]
    daily = (role.get("daily_tasks") or [])[:3]
    weekly = (role.get("weekly_tasks") or [])[:3]
    decisions = profile.get("decision_history") or []
    relationships = profile.get("relationships") or []
    risks = (profile.get("known_risks") or [])[:4]

    items: List[Dict] = []

    def add(phase: str, label: str):
        items.append({
            "id": f"chk-{len(items) + 1}",
            "phase": phase,
            "label": label,
            "done": False,
            "done_at": None,
        })

    # First 30 days — learn the shape of the role.
    add("30", "Read the role summary and success metrics")
    add("30", "Review all approved role knowledge in the Knowledge tab")
    for s in sops:
        add("30", f"Shadow SOP: {s}")
    for r in relationships[:3]:
        org = r.get("org") if isinstance(r, dict) else str(r)
        add("30", f"Get introduced to key relationship: {org}")

    # First 60 days — own recurring work.
    for d in daily:
        add("60", f"Own daily task: {d}")
    for w in weekly:
        add("60", f"Own weekly task: {w}")
    for wf in workflows:
        add("60", f"Run workflow end-to-end: {wf}")
    if decisions:
        add("60", "Review the decision history and the reasoning behind each call")

    # First 90 days — full ownership + de-risk.
    add("90", f"Take full ownership of the {role.get('role_name', 'role')}")
    for rk in risks:
        add("90", f"Mitigate known risk: {rk}")

    return items


async def generate_handoff_brief(role: Dict, profile: Optional[Dict], memories: List[Dict]) -> str:
    """Anonymized handoff brief. Grounded on profile + approved memories."""
    profile = profile or {}
    context_parts = [
        f"Role: {role.get('role_name')} ({role.get('department')})",
        f"Description: {role.get('description')}",
        f"Approval authority: {role.get('approval_authority')}",
        f"Escalation rules: {role.get('escalation_rules')}",
        f"Role summary: {profile.get('role_summary')}",
        "SOPs: " + "; ".join(profile.get("sops") or []),
        "Workflows: " + "; ".join(profile.get("workflow_steps") or []),
        "Known risks: " + "; ".join(profile.get("known_risks") or []),
    ]
    if memories:
        context_parts.append("Approved knowledge:\n" + "\n".join(
            f"- {m.get('title')}: {m.get('content')}" for m in memories[:8]))
    context = "\n".join(p for p in context_parts if p and not p.endswith(": "))

    system = (
        "You write concise, professional knowledge-transfer handoff briefs for a "
        "successor taking over a role. CRITICAL: never mention or reference any "
        "individual person's name or personal identity — refer only to 'the "
        "previous role holder' or 'this role'. Transfer the knowledge, not the person."
    )
    prompt = (
        "Write a short handoff brief (markdown, ~150 words) for the successor of "
        "this role. Cover: what the role owns, the most important recurring work, "
        "the key relationships/systems, and the top risks to watch. Do NOT invent "
        "facts beyond the context. Do NOT name any individual.\n\n"
        f"--- Role knowledge ---\n{context}"
    )
    try:
        raw = await _run_llm(system, prompt, f"handoff-{secrets.randbelow(1_000_000) + 1}")
        return raw.strip()
    except Exception:
        # Deterministic fallback.
        risks = "; ".join(profile.get("known_risks") or []) or "none recorded"
        sops = "; ".join((profile.get("sops") or [])[:3]) or "the documented SOPs"
        return (
            f"**Handoff — {role.get('role_name')}**\n\n"
            f"This role owns: {role.get('description')}\n\n"
            f"Start with the core SOPs ({sops}) and the recurring daily/weekly work. "
            f"Approval authority: {role.get('approval_authority')}. "
            f"Escalate per: {role.get('escalation_rules')}.\n\n"
            f"Top risks to watch: {risks}."
        )


# ── Ask Previous Role (grounded, anonymized) ─────────────────────────────────
def _build_sources(profile: Optional[Dict], memories: List[Dict], role: Dict) -> List[Dict]:
    """Numbered source blocks the model may cite as [S1], [S2], ..."""
    profile = profile or {}
    sources: List[Dict] = []

    def add(title: str, content: str):
        if content and content.strip():
            sources.append({"n": len(sources) + 1, "title": title, "content": content.strip()})

    add("Role summary", profile.get("role_summary") or role.get("description") or "")
    if profile.get("sops"):
        add("Standard operating procedures", "; ".join(profile["sops"]))
    if profile.get("workflow_steps"):
        add("Key workflows", "; ".join(profile["workflow_steps"]))
    for d in (profile.get("decision_history") or [])[:6]:
        add(f"Decision: {d.get('decision')}",
            f"{d.get('decision')} — reason: {d.get('reason')} (approved by {d.get('approver')}, {d.get('date')})")
    for r in (profile.get("relationships") or [])[:6]:
        add(f"Relationship: {r.get('org')}", f"{r.get('org')} ({r.get('type')}) — {r.get('notes')}")
    if profile.get("known_risks"):
        add("Known risks", "; ".join(profile["known_risks"]))
    for m in memories[:12]:
        add(m.get("title", "Approved knowledge"), m.get("content", ""))
    return sources


async def ask_previous_role(
    role: Dict,
    profile: Optional[Dict],
    memories: List[Dict],
    question: str,
    history: Optional[List[Dict]] = None,
) -> Dict:
    """Answer strictly from approved knowledge, anonymized, with citations.

    Returns {answer, citations:[{n,title}], model, grounded}.
    """
    sources = _build_sources(profile, memories, role)
    if not sources:
        return {
            "answer": "There's no approved knowledge captured for this role yet, so I can't answer that. "
                      "Ask an admin to capture and approve role knowledge first.",
            "citations": [], "model": "none", "grounded": False,
        }

    source_block = "\n\n".join(f"[S{s['n']}] {s['title']}\n{s['content']}" for s in sources)

    system = (
        "You are the Role Intelligence assistant for a successor taking over the "
        f"'{role.get('role_name')}' role. Answer questions ONLY using the APPROVED "
        "role knowledge provided. RULES:\n"
        "1. Never reveal, mention, or reference any individual person's name or "
        "personal identity. Refer only to 'the previous role holder' or 'this role'. "
        "Transfer the knowledge, not the person.\n"
        "2. Use ONLY the provided sources. If the answer isn't in them, say you "
        "don't have that information — never guess or invent.\n"
        "3. Cite every claim with the matching [S#] tag inline.\n"
        "4. Be concise and practical — you are onboarding a successor."
    )

    if history:
        transcript = "\n".join(
            f"Successor: {h.get('question', '')}\nAssistant: {h.get('answer', '')}"
            for h in history[-6:]
        )
        convo = f"\n--- Conversation so far ---\n{transcript}\n"
    else:
        convo = ""

    prompt = (
        f"--- APPROVED ROLE KNOWLEDGE ---\n{source_block}\n{convo}\n"
        f"--- SUCCESSOR QUESTION ---\n{question}\n\n"
        "Answer using only the sources above, cite with [S#], and never name anyone."
    )

    try:
        raw = (await _run_llm(system, prompt, f"askrole-{secrets.randbelow(1_000_000) + 1}")).strip()
        model = "claude-fable-5"
    except Exception:
        raw = ("I'm unable to reach the AI service right now. Based on the approved knowledge, "
               f"review these sources: " + ", ".join(f"[S{s['n']}] {s['title']}" for s in sources[:4]) + ".")
        model = "unavailable"

    cited_ns = {int(n) for n in re.findall(r"\[S(\d+)\]", raw)}
    citations = [{"n": s["n"], "title": s["title"]} for s in sources if s["n"] in cited_ns]
    return {"answer": raw, "citations": citations, "model": model, "grounded": True}
