"""Social announcement copy for invite-code drops (Launch Control → Drops).

Template-based copy is instant and free; an optional AI rewrite (Claude via the
Emergent LLM key) punches it up. Copy is produced for LinkedIn, X, Instagram
and Facebook, each with the drop code, spots left, urgency and claim URL.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict

PLATFORMS = ["linkedin", "x", "instagram", "facebook"]
DROP_BASE_URL = "https://teamnest.ai/drop"


def expiry_phrase(expires_at: Any) -> str:
    if not expires_at:
        return "limited time only"
    try:
        exp = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return "limited time only"
    delta = exp - datetime.now(timezone.utc)
    total = delta.total_seconds()
    if total <= 0:
        return "expiring now"
    hours = total / 3600
    if hours < 1:
        return f"expires in {int(total // 60)} min"
    if hours < 48:
        return f"expires in {int(round(hours))} hours"
    try:
        return f"expires {exp.strftime('%b %-d')}"
    except ValueError:  # platforms without %-d support
        return f"expires {exp.strftime('%b %d')}"


def build_templates(drop: Dict[str, Any], spots_left: int, url: str) -> Dict[str, str]:
    code = drop["code"]
    title = drop.get("title") or "TeamNest drop"
    exp = expiry_phrase(drop.get("expires_at"))
    spots = max(0, int(spots_left))

    linkedin = (
        f"🚀 {title} — now live.\n\n"
        f"{spots} spots just opened on TeamNest.ai, the AI workspace where your team "
        f"chats, compares 6 AI models side-by-side, hires AI employees, and ships working "
        f"software from chat with @devmanager.\n\n"
        f"Claim your access with code {code}: {url}\n"
        f"⏳ {exp} · only {spots} spots left.\n\n"
        f"#AI #FutureOfWork #Startups #Productivity #BuildInPublic"
    )
    x = (
        f"🚀 {title}\n\n"
        f"{spots} spots left on TeamNest.ai — team chat + 6 AIs + build apps straight from chat.\n\n"
        f"Code: {code}\n"
        f"👉 {url}\n"
        f"⏳ {exp}"
    )
    instagram = (
        f"{title} ✨🚀\n\n"
        f"Your whole team + AI in one app — chat, compare 6 AI models, and build working "
        f"apps from a conversation. 🤯\n\n"
        f"🔑 Code {code} — only {spots} spots left\n"
        f"🔗 {url}\n"
        f"⏳ {exp}\n\n"
        f"#ai #teamwork #startup #productivity #buildinpublic #saas #founders #techtools"
    )
    facebook = (
        f"🚀 {title}\n\n"
        f"We just opened {spots} invites to TeamNest.ai — the AI workspace where your team "
        f"chats, hires AI employees, and builds software with @devmanager.\n\n"
        f"👉 Grab your spot with code {code}: {url}\n"
        f"⏳ {exp} — don't miss it!"
    )
    return {"linkedin": linkedin, "x": x, "instagram": instagram, "facebook": facebook}


def _parse_ai(raw: str) -> Dict[str, str]:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if "```" in text[3:] else text.lstrip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip().rstrip("`").strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    data = json.loads(text)
    return {p: str(data[p]).strip() for p in PLATFORMS if data.get(p)}


async def ai_rewrite(drop: Dict[str, Any], spots_left: int, url: str) -> Dict[str, str]:
    """AI-rewritten copy for all platforms. Falls back to templates on any
    parse/format issue so the caller always gets usable copy."""
    from ai_service import complete

    code = drop["code"]
    title = drop.get("title") or "TeamNest drop"
    exp = expiry_phrase(drop.get("expires_at"))
    spots = max(0, int(spots_left))
    prompt = (
        "Write punchy launch announcement copy for a limited invite-code drop for "
        "TeamNest.ai — an AI workspace where teams chat, compare 6 AI models, hire AI "
        "employees, and build working software from chat with @devmanager.\n\n"
        f"Drop title: {title}\n"
        f"Invite code: {code}\n"
        f"Spots left: {spots}\n"
        f"Urgency: {exp}\n"
        f"Claim URL: {url}\n\n"
        "Return ONLY a JSON object with keys: linkedin, x, instagram, facebook. Each value "
        "is the full ready-to-post text for that platform. Tailor tone and length per "
        "platform: linkedin professional (~80 words, 3-5 hashtags); x concise and under 280 "
        "characters; instagram emoji-forward caption with 6-8 hashtags; facebook friendly "
        "(~60 words). Every post MUST include the invite code, spots left, the urgency and "
        "the claim URL. Do not wrap the JSON in code fences."
    )
    fallback = build_templates(drop, spots_left, url)
    try:
        raw = await complete(
            "You are an expert growth marketer. Return ONLY valid JSON, no preamble, no code fences.",
            prompt,
        )
        parsed = _parse_ai(raw)
    except Exception:
        return fallback
    return {p: parsed.get(p) or fallback[p] for p in PLATFORMS}
