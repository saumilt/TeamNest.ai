"""Dev OS — reference website importer.

When a user says "use our current website" or drops a URL/domain into a
build request (e.g. "create website for funpizzakitchen.com, use current
website"), fetch that site's real content — title, description, headings,
brand colors, sample copy — and feed it to codegen as grounding context.
"""
import logging
import re
from collections import Counter
from typing import Optional

logger = logging.getLogger("teamnest")

_URL_RE = re.compile(r"https?://[\w.-]+(?:/[^\s'\"<>)]*)?", re.I)
_DOMAIN_RE = re.compile(
    r"\b((?:[a-z0-9-]+\.)+(?:com|net|org|io|co|ai|app|dev|shop|store|biz|us|uk|ca))\b", re.I,
)
_SITE_PHRASES = ("current website", "existing website", "current site", "existing site", "our website", "my website")
_HEX_RE = re.compile(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
_TAG_RE = re.compile(r"<[^>]+>")
_BORING_COLORS = {"#fff", "#ffffff", "#000", "#000000"}


def find_reference_url(*texts: Optional[str]) -> Optional[str]:
    """Return a fetchable URL when any text contains one (or a bare domain)."""
    blob = " ".join(t or "" for t in texts)
    m = _URL_RE.search(blob)
    if m:
        return m.group(0).rstrip(".,)")
    m = _DOMAIN_RE.search(blob)
    if m:
        return "https://" + m.group(1)
    return None


def wants_site_import(instruction: str) -> bool:
    low = (instruction or "").lower()
    return any(p in low for p in _SITE_PHRASES) or bool(_URL_RE.search(low)) or bool(_DOMAIN_RE.search(low))


def _grab(pattern: str, html: str, flags=re.I | re.S) -> str:
    m = re.search(pattern, html, flags)
    return _TAG_RE.sub(" ", m.group(1)).strip() if m else ""


async def fetch_site_context(url: str) -> Optional[str]:
    """Fetch + summarize a website into a compact prompt block. Best-effort:
    returns None on any failure so codegen simply proceeds without it."""
    try:
        import httpx
        async with httpx.AsyncClient(
            timeout=8, follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; TeamNestBot/1.0)"},
        ) as client:
            r = await client.get(url)
        if r.status_code >= 400 or not r.text:
            return None
        html = r.text[:400_000]
    except Exception as e:
        logger.info("[site-import] fetch failed for %s: %s", url, e)
        return None

    title = _grab(r"<title[^>]*>(.*?)</title>", html)[:120]
    desc = ""
    m = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']{10,300})', html, re.I)
    if m:
        desc = m.group(1).strip()

    headings = []
    for hm in re.finditer(r"<h[12][^>]*>(.*?)</h[12]>", html, re.I | re.S):
        t = _TAG_RE.sub(" ", hm.group(1)).strip()
        if 2 < len(t) < 90 and t not in headings:
            headings.append(t)
        if len(headings) >= 10:
            break

    nav_links = []
    for am in re.finditer(r"<a[^>]*>(.*?)</a>", html, re.I | re.S):
        t = _TAG_RE.sub(" ", am.group(1)).strip()
        if 1 < len(t) < 30 and t not in nav_links:
            nav_links.append(t)
        if len(nav_links) >= 12:
            break

    colors = [
        c.lower() for c, _ in Counter(_HEX_RE.findall(html)).most_common(12)
        if c.lower() not in _BORING_COLORS
    ][:6]

    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.I | re.S)
    text = re.sub(r"\s+", " ", _TAG_RE.sub(" ", body)).strip()[:1000]

    parts = [f"=== REFERENCE WEBSITE ({url}) ==="]
    if title:
        parts.append(f"Title: {title}")
    if desc:
        parts.append(f"Description: {desc}")
    if headings:
        parts.append("Headings: " + " | ".join(headings))
    if nav_links:
        parts.append("Nav/links: " + " | ".join(nav_links))
    if colors:
        parts.append("Brand colors (by frequency): " + ", ".join(colors))
    if text:
        parts.append(f"Copy sample: {text}")
    parts.append(
        "=== END REFERENCE ===\n"
        "Ground the app in this real site: reuse its name, tone, menu/nav "
        "structure, product/service names and brand colors instead of "
        "inventing placeholder content."
    )
    return "\n".join(parts)


async def site_context_for(*texts: Optional[str]) -> Optional[str]:
    """One-call helper: detect a URL across the given texts and fetch context."""
    url = find_reference_url(*texts)
    if not url:
        return None
    return await fetch_site_context(url)
