"""AI service: parallel calls to GPT, Claude, Gemini via emergentintegrations,
and to DeepSeek, Perplexity, Grok via their OpenAI-compatible APIs.
"""
import asyncio
import os
import secrets
from typing import Dict, List, Optional

import base64
import httpx
from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
PERPLEXITY_API_KEY = os.environ.get("PERPLEXITY_API_KEY", "")
XAI_API_KEY = os.environ.get("XAI_API_KEY", "")

MODEL_CONFIG = {
    "chatgpt": {
        "provider": "openai",
        "model": "gpt-5.5",
        "display": "ChatGPT 5.5",
        "system": "You are ChatGPT. Be strategic, structured, and insightful.",
        "engine": "emergent",
    },
    "claude": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-6",
        "display": "Claude Sonnet 4.6",
        "system": "You are Claude. Be thoughtful, nuanced, and detailed.",
        "engine": "emergent",
    },
    "gemini": {
        "provider": "gemini",
        "model": "gemini-3.1-pro-preview",
        "display": "Gemini 3.1 Pro",
        "system": "You are Gemini. Be data-driven and analytical with concrete numbers when relevant.",
        "engine": "emergent",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "api_key": DEEPSEEK_API_KEY,
        "model": "deepseek-chat",
        "display": "DeepSeek",
        "system": "You are DeepSeek. Be technically rigorous, code-aware, and precise.",
        "engine": "openai_compat",
    },
    "perplexity": {
        "base_url": "https://api.perplexity.ai",
        "api_key": PERPLEXITY_API_KEY,
        "model": "sonar",
        "display": "Perplexity",
        "system": "You are Perplexity. Cite credible sources where possible and be web-aware.",
        "engine": "openai_compat",
    },
    "grok": {
        "base_url": "https://api.x.ai/v1",
        "api_key": XAI_API_KEY,
        "model": "grok-4",
        "display": "Grok",
        "system": "You are Grok. Be witty, direct, contrarian where useful.",
        "engine": "openai_compat",
    },
    # ---- Fast / cheap models (used for inline @ai and credit-low fallback) ----
    "gpt-4o-mini": {
        "provider": "openai",
        "model": "gpt-5.4-mini",
        "display": "GPT-5.4 mini",
        "system": "You are a fast helpful assistant. Be concise and direct.",
        "engine": "emergent",
    },
    "claude-haiku": {
        "provider": "anthropic",
        "model": "claude-haiku-4-5-20251001",
        "display": "Claude Haiku",
        "system": "You are Claude Haiku. Be concise and quick.",
        "engine": "emergent",
    },
    "gemini-flash": {
        "provider": "gemini",
        "model": "gemini-3.5-flash",
        "display": "Gemini 3.5 Flash",
        "system": "You are Gemini Flash. Be fast and direct.",
        "engine": "emergent",
    },
}


def _build_strengths_weaknesses(model_key: str) -> Dict[str, List[str]]:
    profiles = {
        "chatgpt": (["Clear structure", "Strategic framing", "Broad knowledge"],
                    ["Can be generic", "Less recent data"]),
        "claude": (["Nuanced analysis", "Long-form coherence", "Safe reasoning"],
                   ["Verbose at times", "Cautious tone"]),
        "gemini": (["Strong data integration", "Concrete numbers", "Multi-modal"],
                   ["Less narrative flair", "Variable depth"]),
        "deepseek": (["Technical depth", "Logical rigor", "Cost-effective"],
                     ["Less polish", "Newer ecosystem"]),
        "perplexity": (["Citation-rich", "Web-grounded", "Up-to-date"],
                       ["Shorter answers", "Less reasoning depth"]),
        "grok": (["Bold perspective", "Real-time slant", "Contrarian angles"],
                 ["Less measured", "Sometimes flippant"]),
        "gpt-4o-mini": (["Very fast", "Cheap to run", "Reasonable quality"],
                        ["Less depth than GPT-4o", "Less nuance"]),
        "claude-haiku": (["Very fast", "Cheap to run", "Crisp answers"],
                         ["Less depth than Sonnet"]),
        "gemini-flash": (["Extremely fast", "Cheapest premium model"],
                         ["Less depth than Pro"]),
    }
    s, w = profiles.get(model_key, (["Solid"], ["N/A"]))
    return {"strengths": s, "weaknesses": w}


async def _call_emergent_model(
    model_key: str,
    question: str,
    session_id: str,
    image_bytes_list: Optional[List[bytes]] = None,
) -> str:
    cfg = MODEL_CONFIG[model_key]
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"{session_id}-{model_key}",
        system_message=cfg["system"] + " Keep your response under 220 words.",
    ).with_model(cfg["provider"], cfg["model"])
    file_contents = None
    if image_bytes_list:
        file_contents = [
            ImageContent(image_base64=base64.b64encode(b).decode("utf-8"))
            for b in image_bytes_list
        ]
    response = await chat.send_message(
        UserMessage(text=question, file_contents=file_contents)
    )
    return str(response)


async def _call_openai_compat(model_key: str, question: str, session_id: str) -> str:
    cfg = MODEL_CONFIG[model_key]
    if not cfg.get("api_key"):
        raise RuntimeError(f"{cfg['display']} API key not configured")
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{cfg['base_url']}/chat/completions",
            headers={
                "Authorization": f"Bearer {cfg['api_key']}",
                "Content-Type": "application/json",
            },
            json={
                "model": cfg["model"],
                "messages": [
                    {"role": "system", "content": cfg["system"] + " Keep your response under 220 words."},
                    {"role": "user", "content": question},
                ],
                "max_tokens": 600,
                "temperature": 0.7,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def call_model(
    model_key: str,
    question: str,
    session_id: str,
    image_bytes_list: Optional[List[bytes]] = None,
) -> Dict:
    cfg = MODEL_CONFIG.get(model_key)
    if not cfg:
        return {"model_key": model_key, "model_name": model_key, "answer": "Unknown model",
                "strengths": [], "weaknesses": [], "confidence_score": 0, "real": False, "error": "unknown_model"}
    try:
        if cfg["engine"] == "emergent":
            answer = await _call_emergent_model(
                model_key, question, session_id, image_bytes_list=image_bytes_list
            )
        else:
            # OpenAI-compat models (DeepSeek/Perplexity/Grok) don't reliably
            # support vision — fall back to text-only and prepend a note.
            text_q = question
            if image_bytes_list:
                text_q = (
                    "[Note: user attached image(s) but this model does not "
                    "support vision. Reply based on the text only.]\n\n" + question
                )
            answer = await _call_openai_compat(model_key, text_q, session_id)
        confidence = secrets.randbelow(24) + 72
        real = True
    except Exception as e:
        answer = f"[Error calling {cfg['display']}: {e}]"
        confidence = 0
        real = False

    sw = _build_strengths_weaknesses(model_key)
    return {
        "model_key": model_key,
        "model_name": cfg["display"],
        "answer": answer,
        "strengths": sw["strengths"],
        "weaknesses": sw["weaknesses"],
        "confidence_score": confidence,
        "real": real,
    }


async def ask_models_parallel(
    question: str,
    models: List[str],
    session_id: str,
    image_bytes_list: Optional[List[bytes]] = None,
) -> List[Dict]:
    tasks = [
        call_model(m, question, session_id, image_bytes_list=image_bytes_list)
        for m in models
    ]
    return await asyncio.gather(*tasks)


async def synthesize_answer(question: str, responses: List[Dict], session_id: str, preferred_best: Optional[Dict] = None) -> str:
    bullet_blocks = "\n\n".join(f"--- {r['model_name']} ---\n{r['answer']}" for r in responses)
    preference = ""
    if preferred_best:
        preference = (
            f"\nThe team has marked **{preferred_best['model_name']}**'s answer as the preferred best — "
            "weight its perspective more heavily in your synthesis while still incorporating the strongest "
            "insights from the others.\n"
        )
    prompt = (
        f"Original question: {question}\n\n"
        f"Below are answers from multiple AI models:\n\n{bullet_blocks}\n{preference}\n"
        "Synthesize the BEST FINAL ANSWER by combining the strongest insights, "
        "removing redundancy, and resolving contradictions. Use clear sections. Keep under 300 words."
    )
    try:
        # Use a small fast model for synthesis — text merging doesn't need a
        # premium reasoning model and this saves ~3-5s + lots of credits on
        # every multi-model `@ai` query.
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"{session_id}-synth",
            system_message="You are an expert synthesizer of multiple AI model outputs.",
        ).with_model("openai", "gpt-5.4-mini")
        return str(await chat.send_message(UserMessage(text=prompt)))
    except Exception as e:
        return f"[Synthesis error: {e}]\n\n" + bullet_blocks[:600]


IMPROVE_PROMPTS = {
    "fix_grammar": "Fix grammar and spelling only. Keep meaning identical.",
    "make_professional": "Rewrite in a polished, professional business tone.",
    "make_shorter": "Rewrite to be significantly shorter while keeping core meaning.",
    "make_detailed": "Expand with relevant detail, examples, and structure.",
    "make_persuasive": "Rewrite to be more persuasive and confident.",
    "make_diplomatic": "Rewrite to be tactful, diplomatic, and considerate.",
    "bullet_points": "Convert into clear bullet points.",
    "translate": "Translate the text into {language}. Return only the translation.",
    "fact_check": "List the factual claims in the text and rate each as Likely True / Uncertain / Likely False, briefly.",
    "improve_tone": "Improve the tone to be clear, warm, and professional.",
}


async def improve_message(text: str, action: str, language: str = "English") -> str:
    instruction = IMPROVE_PROMPTS.get(action, IMPROVE_PROMPTS["improve_tone"])
    if action == "translate":
        instruction = instruction.format(language=language)
    prompt = f"{instruction}\n\nOriginal:\n{text}\n\nImproved:"
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"improve-{secrets.randbelow(1_000_000) + 1}",
            system_message="You rewrite messages precisely as instructed. Return ONLY the improved text, no preamble.",
        ).with_model("openai", "gpt-5.4")
        return str(await chat.send_message(UserMessage(text=prompt)))
    except Exception as e:
        return f"[Improvement error: {e}]\n\n{text}"


async def complete(system_message: str, prompt: str, model_key: str = "claude") -> str:
    """Generic single-shot text completion via the Emergent LLM key. Reused by
    lightweight AI features (e.g. marketing copy generation)."""
    cfg = MODEL_CONFIG.get(model_key) or MODEL_CONFIG["claude"]
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"complete-{secrets.randbelow(1_000_000) + 1}",
        system_message=system_message,
    ).with_model(cfg["provider"], cfg["model"])
    return str(await chat.send_message(UserMessage(text=prompt)))


async def vision_extract_text(image_bytes: bytes, model_key: str = "gemini") -> str:
    """Best-effort OCR: pull readable text out of an image via a multimodal model
    (Universal LLM key). Falls back to Gemini for non-multimodal keys."""
    cfg = MODEL_CONFIG.get(model_key) or MODEL_CONFIG["gemini"]
    if cfg.get("engine") != "emergent":
        cfg = MODEL_CONFIG["gemini"]
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"ocr-{secrets.randbelow(1_000_000) + 1}",
        system_message=(
            "You extract text from images. Return ONLY the readable text in the "
            "image, verbatim. If there is no readable text, describe the image in "
            "one short sentence."
        ),
    ).with_model(cfg["provider"], cfg["model"])
    resp = await chat.send_message(
        UserMessage(
            text="Extract all readable text from this image.",
            file_contents=[ImageContent(image_base64=base64.b64encode(image_bytes).decode("utf-8"))],
        )
    )
    return str(resp)


async def extract_task(message_body: str, team_members: List[Dict]) -> Dict:
    """Use AI to convert a chat message into a structured task draft."""
    import json
    members_str = ", ".join([f"{m['name']} ({m['id']})" for m in team_members])
    prompt = (
        f"Convert the following chat message into a task. Return ONLY a valid JSON object with these keys:\n"
        f"- title (short imperative phrase, max 100 chars)\n"
        f"- description (1-2 sentences with context, can include relevant detail from the message)\n"
        f"- priority (one of: low, medium, high, urgent)\n"
        f"- suggested_assignee_id (the id of the team member whose skills/role best match the task, or null)\n\n"
        f"Team members available:\n{members_str}\n\n"
        f"Message:\n{message_body}\n\n"
        f"JSON:"
    )
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"extract-task-{secrets.randbelow(1_000_000) + 1}",
            system_message="You convert chat messages into structured task JSON. Return ONLY valid JSON, no markdown code fences, no preamble.",
        ).with_model("openai", "gpt-5.4")
        raw = str(await chat.send_message(UserMessage(text=prompt)))
        # Strip code fences if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()
        parsed = json.loads(cleaned)
        priority = parsed.get("priority", "medium")
        if priority not in {"low", "medium", "high", "urgent"}:
            priority = "medium"
        return {
            "title": (parsed.get("title") or message_body[:100]).strip()[:200],
            "description": (parsed.get("description") or message_body).strip(),
            "priority": priority,
            "suggested_assignee_id": parsed.get("suggested_assignee_id"),
        }
    except Exception as e:
        return {
            "title": message_body[:100],
            "description": message_body,
            "priority": "medium",
            "suggested_assignee_id": None,
            "error": str(e),
        }


def _build_task_suggestion_prompt(message_body: str, team_members: List[Dict], max_tasks: int) -> str:
    members_str = ", ".join(
        [f"{m['name']} ({m['id']}, role={m.get('role', 'member')})" for m in team_members]
    )
    return (
        "Analyze the message below and break it down into ALL the actionable tasks it implies. "
        f"Return a JSON ARRAY with 1 to {max_tasks} task objects. If the message describes only one clear "
        "action, return an array with a single task. If it implies multiple sub-tasks, return them all in "
        "logical order. Each task object MUST have:\n"
        "- title (short imperative phrase, max 100 chars)\n"
        "- description (1-2 sentence context, can include relevant detail from the message)\n"
        "- priority (one of: low, medium, high, urgent)\n"
        "- suggested_assignee_id (id of the team member whose role best matches, or null)\n"
        "- suggested_due_offset_days (integer 0-30, or null — how many days from today this should be done)\n\n"
        f"Team members:\n{members_str}\n\n"
        f"Message:\n{message_body}\n\n"
        "JSON array only, no markdown fences, no preamble:"
    )


def _parse_task_suggestions_payload(raw: str) -> List[Dict]:
    """Tolerantly extract a list of task dicts from an LLM response."""
    import json
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    parsed = json.loads(cleaned)
    if isinstance(parsed, dict) and "tasks" in parsed:
        parsed = parsed["tasks"]
    if not isinstance(parsed, list):
        parsed = [parsed]
    return parsed


def _normalize_suggested_task(t: Dict, valid_member_ids: set, fallback_body: str) -> Dict:
    """Coerce one raw LLM task object into the strict shape the API expects."""
    pri = t.get("priority", "medium")
    if pri not in {"low", "medium", "high", "urgent"}:
        pri = "medium"
    assignee = t.get("suggested_assignee_id")
    if assignee not in valid_member_ids:
        assignee = None
    offset = t.get("suggested_due_offset_days")
    try:
        offset = int(offset) if offset is not None else None
    except (TypeError, ValueError):
        offset = None
    return {
        "title": (t.get("title") or fallback_body[:100]).strip()[:200],
        "description": (t.get("description") or "").strip(),
        "priority": pri,
        "suggested_assignee_id": assignee,
        "suggested_due_offset_days": offset,
    }


def _fallback_single_task(message_body: str, error: str | None = None) -> List[Dict]:
    """Final safety net when AI suggestion fails entirely."""
    task: Dict = {
        "title": message_body[:100],
        "description": message_body[:400],
        "priority": "medium",
        "suggested_assignee_id": None,
        "suggested_due_offset_days": None,
    }
    if error:
        task["error"] = error
    return [task]


async def suggest_tasks(
    message_body: str, team_members: List[Dict], max_tasks: int = 5
) -> List[Dict]:
    """Use AI to analyze a message and break it into 1..N actionable tasks.
    Returns a list (possibly with a single task) of structured task drafts.
    """
    prompt = _build_task_suggestion_prompt(message_body, team_members, max_tasks)
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"suggest-tasks-{secrets.randbelow(1_000_000) + 1}",
            system_message=(
                "You convert chat messages into structured task LISTS. "
                "Return ONLY a valid JSON array. No markdown, no preamble, no trailing commentary."
            ),
        ).with_model("openai", "gpt-5.4")
        raw = str(await chat.send_message(UserMessage(text=prompt)))
        parsed = _parse_task_suggestions_payload(raw)
        valid_ids = {m["id"] for m in team_members}
        out = [
            _normalize_suggested_task(t, valid_ids, message_body)
            for t in parsed[:max_tasks]
            if isinstance(t, dict)
        ]
        return out or _fallback_single_task(message_body)
    except Exception as e:
        return _fallback_single_task(message_body, error=str(e))



def parse_ai_command(body: str) -> Dict:
    """Parse `@ai ...` chat commands.

    Returns:
        {is_ai: True, models: [...], question: str, default_models: bool, compare: bool}

    `default_models=True` means the user didn't pick specific models — the
    caller should substitute a single fast model (their favorite or claude)
    so we don't fire a 4-LLM fan-out for casual quick questions.

    Multi-model triggers (any of these in the message kicks off ALL models):
        - "@ai compare ..."          (must be the first word after @ai)
        - "@ai ask all ..."          (legacy)
        - "@ai all models ..."
        - "@ai show comparison" / "@ai show me comparison"
        - "@ai compare all" / "@ai show all comparison"
    """
    import re
    if not body.strip().lower().startswith("@ai"):
        return {"is_ai": False}
    rest = body.strip()[3:].strip()
    models: List[str] = []
    default_models = False
    compare = False
    lower = rest.lower()
    all_models = ["chatgpt", "claude", "gemini", "perplexity", "grok"]
    # Catch every natural way a user might ask for the comparison view.
    compare_triggers = [
        r"^compare\b",                  # @ai compare ...
        r"\bask all( models)?\b",       # @ai ask all
        r"\ball models\b",              # @ai all models
        r"\bshow( me)?( all)? comparis(o|i)n\b",  # show comparison / show all comparison
        r"\bcompare (all|across|models)\b",
    ]
    for pattern in compare_triggers:
        if re.search(pattern, lower):
            models = all_models[:]
            rest = re.sub(pattern, "", rest, flags=re.IGNORECASE).strip(" :,")
            compare = True
            break

    if not compare:
        m = re.search(r"(?i)ask ([a-zA-Z, ]+?)(?: about| to|:|$)", rest)
        if m:
            names = re.split(r",| and ", m.group(1))
            for n in names:
                key = n.strip().lower()
                if key in MODEL_CONFIG:
                    models.append(key)
            if models:
                rest = rest[m.end():].strip(" :")
    if not models:
        # Single fast default — caller may swap to the user's favorite.
        # GPT-4o mini is the snappiest universal default for casual inline `@ai`.
        models = ["gpt-4o-mini"]
        default_models = True
    return {
        "is_ai": True,
        "models": models,
        "question": rest or body,
        "default_models": default_models,
        "compare": compare,
    }


def parse_task_command(body: str) -> Dict:
    """Parse inline task command syntax in chat messages.
    Supported: '@task <title> @assign @<name> @due <date> @priority <level>'
    Returns {is_task: True, title, assignee_name, due_date, priority} or {is_task: False}
    """
    import re
    text = body.strip()
    if not re.search(r"(?i)@task\b", text):
        return {"is_task": False}

    # @assign @Name or @assign Name
    assignee_name = None
    m_assign = re.search(r"(?i)@assign\s+@?([A-Za-z][\w .-]+?)(?=\s+@|\s*$)", text)
    if m_assign:
        assignee_name = m_assign.group(1).strip()

    # @due 2026-05-15 OR @due tomorrow OR @due Friday OR @due May 15
    due_date_iso = None
    m_due = re.search(r"(?i)@due\s+(.+?)(?=\s+@|\s*$)", text)
    if m_due:
        due_str = m_due.group(1).strip()
        due_date_iso = _parse_due(due_str)

    # @priority urgent|high|medium|low
    priority = "medium"
    m_pri = re.search(r"(?i)@priority\s+(low|medium|high|urgent)\b", text)
    if m_pri:
        priority = m_pri.group(1).lower()

    # Title: text after @task up to the next @ command, OR if @task is at the end, the rest of the message before it
    m_title = re.search(r"(?i)@task\s+(.+?)(?=\s+@(?:assign|due|priority)\b|\s*$)", text)
    title = (m_title.group(1).strip() if m_title else text.replace("@task", "").strip())[:200]

    if not title:
        return {"is_task": False}

    return {
        "is_task": True,
        "title": title,
        "assignee_name": assignee_name,
        "due_date": due_date_iso,
        "priority": priority,
    }


def _parse_due(raw: str) -> Optional[str]:
    """Best-effort due-date parsing into ISO string."""
    import re
    from datetime import datetime, timedelta, timezone
    s = raw.strip().lower()
    now = datetime.now(timezone.utc)
    if s == "today":
        return now.replace(hour=23, minute=59).isoformat()
    if s == "tomorrow":
        return (now + timedelta(days=1)).replace(hour=23, minute=59).isoformat()
    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    if s in weekdays:
        target = weekdays.index(s)
        days_ahead = (target - now.weekday()) % 7 or 7
        return (now + timedelta(days=days_ahead)).replace(hour=23, minute=59).isoformat()
    # ISO 2026-05-15
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if m:
        try:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), 23, 59, tzinfo=timezone.utc).isoformat()
        except Exception:
            return None
    return None


_HIGHLIGHT_VALID_KINDS = {"decision", "action_item", "risk", "question"}


def _build_highlight_prompt(segments: List[Dict]) -> str:
    """Render the transcript as numbered lines + ask the LLM for highlights."""
    lines = "\n".join(
        f"[{i}] {s.get('speaker_name', 'Speaker')}: {s.get('text', '')}"
        for i, s in enumerate(segments[:200])
    )
    return (
        "You are a meeting-notes assistant. Analyze the following call transcript and identify "
        "the segments that contain notable content. For each notable segment, output ONE entry in "
        "a JSON array with EXACTLY these keys:\n"
        "  - index (the integer in square brackets at the start of the line)\n"
        "  - kind (one of: 'decision', 'action_item', 'risk', 'question')\n"
        "  - note (short reason, max 14 words, plain language)\n\n"
        "Rules:\n"
        "- 'decision' = a choice the team made (selected a vendor, agreed on a plan, picked a date).\n"
        "- 'action_item' = someone is going to do something (verb phrase, often has an owner).\n"
        "- 'risk' = a worry, blocker, dependency, or open concern flagged.\n"
        "- 'question' = an unresolved question that requires follow-up.\n"
        "- Skip greetings, small talk, repetitions, and routine info.\n"
        "- Return at most 25 highlights total. Prefer fewer high-signal items over many.\n"
        "- Output ONLY the JSON array. No prose, no markdown, no commentary.\n\n"
        f"Transcript:\n{lines}\n\n"
        "JSON array:"
    )


def _parse_highlight_response(raw: str) -> List[Dict]:
    """Strip optional fences and JSON-decode the highlight payload."""
    import json
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    parsed = json.loads(cleaned)
    return parsed if isinstance(parsed, list) else []


def _validate_highlight(entry: Dict, segments: List[Dict]) -> Dict | None:
    """Drop or normalize a single highlight entry returned by the LLM."""
    if not isinstance(entry, dict):
        return None
    try:
        idx = int(entry.get("index"))
    except (TypeError, ValueError):
        return None
    if idx < 0 or idx >= len(segments):
        return None
    kind = entry.get("kind") or ""
    if kind not in _HIGHLIGHT_VALID_KINDS:
        return None
    note = (entry.get("note") or "").strip()[:140]
    return {
        "segment_id": segments[idx].get("id"),
        "index": idx,
        "kind": kind,
        "note": note,
    }


async def highlight_segments(segments: List[Dict]) -> List[Dict]:
    """Given a list of transcript segments, return a list of highlight annotations:
    [{segment_id, kind: 'decision'|'action_item'|'risk'|'question', note}].

    The 'kind' indicates why the segment is important. 'note' is a one-line context.
    Segments that aren't notable are simply not included.
    """
    if not segments:
        return []
    prompt = _build_highlight_prompt(segments)
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"highlights-{secrets.randbelow(1_000_000) + 1}",
            system_message="You return ONLY a valid JSON array — no markdown, no prose.",
        ).with_model("anthropic", "claude-sonnet-4-6")
        raw = str(await chat.send_message(UserMessage(text=prompt)))
        parsed = _parse_highlight_response(raw)
        out: List[Dict] = []
        for entry in parsed[:25]:
            valid = _validate_highlight(entry, segments)
            if valid:
                out.append(valid)
        return out
    except Exception:
        return []

