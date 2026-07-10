"""AI Employee runtime — builds the employee's system prompt and generates
sandbox replies (Phase 3). Uses Claude Fable 5 with a Sonnet 4.6 fallback.

The system prompt is assembled from the employee profile, saved style profile,
knowledge docs, good/bad examples, permission level and escalation rules so a
sandbox reply reflects everything configured across the earlier phases.
"""
from __future__ import annotations

import os
import secrets
from typing import Dict, List, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
PRIMARY = ("anthropic", "claude-fable-5")
FALLBACK = ("anthropic", "claude-sonnet-4-6")

PERMISSION_LEVELS = [
    "Answer only",                       # may only answer questions
    "Draft only",                        # may draft content, never send/act
    "Create internal tasks",             # may create internal tasks
    "Take external actions with approval",  # may propose actions requiring approval
    "Autonomous (low-risk only)",        # may act autonomously on low-risk items
]


def _bullets(items: Optional[List[str]], limit: int = 8) -> str:
    return "\n".join(f"- {x}" for x in (items or [])[:limit]) or "- (none specified)"


def build_system_prompt(
    emp: Dict,
    style: Optional[Dict],
    docs: List[Dict],
    examples: List[Dict],
    permission_level: str,
    escalation_rules: List[Dict],
) -> str:
    parts: List[str] = []
    parts.append(
        f"You are {emp.get('name')}, an AI employee acting as a "
        f"{emp.get('job_title') or 'team member'} in the "
        f"{emp.get('department') or 'company'} department. "
        f"{emp.get('description') or ''}".strip()
    )
    parts.append(f"\nDefault tone: {emp.get('tone')}. Output style: {emp.get('output_style')}.")
    parts.append("\nYour responsibilities:\n" + _bullets(emp.get("responsibilities")))
    parts.append("\nTasks you SHOULD do:\n" + _bullets(emp.get("tasks_to_do")))
    parts.append("\nTasks you must NEVER do:\n" + _bullets(emp.get("tasks_to_avoid")))

    if style:
        s = style
        parts.append(
            "\nWrite in this trained voice:\n"
            f"- Tone: {s.get('tone')}\n"
            f"- Formality: {s.get('formality')}\n"
            f"- Sentence length: {s.get('avg_sentence_length')}\n"
            f"- Vocabulary: {s.get('vocabulary')}\n"
            f"- Greeting: {s.get('greeting')}\n"
            f"- Sign-off: {s.get('sign_off')}\n"
            f"- Emoji usage: {s.get('emoji_usage')}\n"
            f"- Signature phrases: {', '.join(s.get('signature_phrases') or []) or 'n/a'}\n"
            f"- Avoid: {', '.join(s.get('avoid_phrases') or []) or 'n/a'}"
        )

    if docs:
        knowledge = "\n\n".join(
            f"[{d.get('category')}] {d.get('title')}\n{(d.get('content_preview') or '')[:800]}"
            for d in docs[:6]
        )
        parts.append("\nKnowledge base (use this to answer):\n" + knowledge)

    good = [e for e in examples if e.get("is_good")][:3]
    bad = [e for e in examples if not e.get("is_good")][:3]
    if good:
        parts.append("\nGOOD examples to emulate:\n" + "\n---\n".join(
            f"{e.get('title')}: {e.get('content')[:400]}" for e in good))
    if bad:
        parts.append("\nBAD examples to avoid:\n" + "\n---\n".join(
            f"{e.get('title')}: {e.get('content')[:400]}" for e in bad))

    parts.append(f"\nPermission level: {permission_level}. Respect this strictly.")
    if permission_level == "Answer only":
        parts.append("You may ONLY answer questions. Do not draft external content or take actions.")
    elif permission_level == "Draft only":
        parts.append("You may draft content but must NEVER send it or take real-world actions.")

    if escalation_rules:
        rules = "\n".join(
            f"- If {r.get('trigger')} → {r.get('action')}"
            + (f" (notify {r.get('notify_role')})" if r.get("notify_role") else "")
            for r in escalation_rules
        )
        parts.append(
            "\nEscalation rules — if any trigger applies, DO NOT act. Instead reply with a line "
            "that begins exactly with 'ESCALATE:' followed by a short reason, then the escalation "
            "path.\nRules:\n" + rules
        )

    parts.append(
        "\nAlways stay in character. Be concise and helpful. If a request conflicts with your "
        "tasks-to-avoid or an escalation rule, refuse politely and escalate."
    )
    return "\n".join(parts)


async def generate_reply(system_prompt: str, user_message: str,
                         history: Optional[List[Dict]] = None) -> Dict:
    """Returns {reply, model, escalated}. `history` is a list of prior turns
    [{"user": str, "ai": str}] used to give the sandbox multi-turn memory."""
    if history:
        transcript = "\n".join(
            f"User: {h.get('user', '')}\nYou: {h.get('ai', '')}" for h in history[-10:]
        )
        prompt = (
            "Continue this ongoing conversation, staying consistent with what you "
            "already said.\n\n--- Conversation so far ---\n"
            f"{transcript}\n\n--- Latest message ---\nUser: {user_message}\n\n"
            "Reply to the latest message only (do not repeat prior answers)."
        )
    else:
        prompt = user_message

    for provider, model in (PRIMARY, FALLBACK):
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"sandbox-{secrets.randbelow(1_000_000) + 1}",
                system_message=system_prompt,
            ).with_model(provider, model)
            raw = str(await chat.send_message(UserMessage(text=prompt)))
            return {
                "reply": raw.strip(),
                "model": model,
                "escalated": raw.strip().upper().startswith("ESCALATE:"),
            }
        except Exception:
            continue
    return {
        "reply": "I'm unable to respond right now — the AI service is unavailable. Please try again.",
        "model": "unavailable",
        "escalated": False,
    }
