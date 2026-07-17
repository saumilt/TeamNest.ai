"""Microsoft 365 / Outlook read-only connector — per-user OAuth (Microsoft Graph).

Reads the user's OWN sent mail (read-only) to learn their writing style. Never
sends, modifies or deletes anything. All extracted text is run through the
shared `redact()` before it is shown or analysed — "we learn style, not secrets."

Confidential-client (Web) auth-code flow with a client secret, mirroring the
Gmail connector's shape but against the Microsoft identity platform + Graph.
"""
from __future__ import annotations

import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import httpx

from services.gmail_connector import redact  # shared redaction

CLIENT_ID = os.environ.get("M365_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("M365_CLIENT_SECRET", "")
TENANT = os.environ.get("M365_TENANT_ID", "") or "organizations"
PUBLIC_URL = (os.environ.get("PUBLIC_BACKEND_URL") or "").rstrip("/")
REDIRECT_URI = f"{PUBLIC_URL}/api/oauth/m365/callback"

AUTHORITY = f"https://login.microsoftonline.com/{TENANT}"
AUTH_ENDPOINT = f"{AUTHORITY}/oauth2/v2.0/authorize"
TOKEN_ENDPOINT = f"{AUTHORITY}/oauth2/v2.0/token"
GRAPH = "https://graph.microsoft.com/v1.0"

SCOPES = ["User.Read", "Mail.Read", "Chat.Read", "offline_access"]
_SCOPE_STR = " ".join(SCOPES)


def is_configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET)


def authorization_url() -> Tuple[str, str]:
    state = secrets.token_urlsafe(24)
    from urllib.parse import urlencode
    params = {
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "response_mode": "query",
        "scope": _SCOPE_STR,
        "state": state,
        "prompt": "select_account",
    }
    return f"{AUTH_ENDPOINT}?{urlencode(params)}", state


def _token_doc(payload: Dict) -> Dict:
    expires_in = int(payload.get("expires_in", 3600))
    return {
        "access_token": payload.get("access_token"),
        "refresh_token": payload.get("refresh_token"),
        "token_uri": TOKEN_ENDPOINT,
        "client_id": CLIENT_ID,
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)).isoformat(),
    }


async def exchange_code(code: str) -> Dict:
    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
        "scope": _SCOPE_STR,
    }
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(TOKEN_ENDPOINT, data=data)
        r.raise_for_status()
        return _token_doc(r.json())


async def refresh(refresh_token: str) -> Dict:
    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
        "scope": _SCOPE_STR,
    }
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(TOKEN_ENDPOINT, data=data)
        r.raise_for_status()
        doc = _token_doc(r.json())
        # MS may omit a new refresh_token on refresh — keep the old one.
        if not doc.get("refresh_token"):
            doc["refresh_token"] = refresh_token
        return doc


async def account_email(access_token: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(f"{GRAPH}/me", headers={"Authorization": f"Bearer {access_token}"})
            r.raise_for_status()
            me = r.json()
            return me.get("mail") or me.get("userPrincipalName")
    except Exception:
        return None


_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"[ \t]+")


def _html_to_text(html: str) -> str:
    import html as _h
    t = re.sub(r"(?is)<(script|style).*?</\1>", " ", html)
    t = _TAG.sub(" ", t)
    t = _h.unescape(t)
    lines = []
    for ln in t.splitlines():
        s = ln.strip()
        # stop at quoted reply / forwarded history
        if s.startswith(">") or s.startswith("From:") or (s.startswith("On ") and s.endswith("wrote:")):
            break
        lines.append(s)
    return _WS.sub(" ", "\n".join(lines)).strip()


async def _is_expired(token_doc: Dict) -> bool:
    exp = token_doc.get("expires_at")
    if not exp:
        return False
    try:
        return datetime.fromisoformat(exp) <= datetime.now(timezone.utc)
    except Exception:
        return True


async def fetch_sent_samples(token_doc: Dict, max_messages: int = 40, days: int = 90,
                             on_refresh=None) -> List[Dict]:
    """Return [{source:'m365', text}] of the user's own recent SENT messages,
    already redacted. Refreshes the token if expired (via `on_refresh`)."""
    if await _is_expired(token_doc) and token_doc.get("refresh_token"):
        token_doc = await refresh(token_doc["refresh_token"])
        if on_refresh:
            on_refresh(token_doc)

    access = token_doc.get("access_token")
    after = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    params = {
        "$top": str(min(max_messages, 100)),
        "$select": "subject,body,bodyPreview,sentDateTime",
        "$filter": f"sentDateTime ge {after}",
        "$orderby": "sentDateTime desc",
    }
    samples: List[Dict] = []
    async with httpx.AsyncClient(timeout=45) as c:
        r = await c.get(
            f"{GRAPH}/me/mailFolders/sentitems/messages",
            headers={"Authorization": f"Bearer {access}", "Prefer": 'outlook.body-content-type="text"'},
            params=params,
        )
        r.raise_for_status()
        for m in r.json().get("value", [])[:max_messages]:
            body = m.get("body", {})
            content = body.get("content", "") or m.get("bodyPreview", "")
            if body.get("contentType") == "html":
                content = _html_to_text(content)
            else:
                content = _html_to_text(content) if "<" in content else content.strip()
            if content and len(content.split()) >= 5:
                samples.append({"source": "m365", "text": redact(content)[:2000]})
    return samples


async def fetch_teams_messages(token_doc: Dict, max_messages: int = 40, days: int = 90,
                               on_refresh=None) -> List[Dict]:
    """Return [{source:'teams', text}] of the user's OWN recent Teams chat
    messages (read-only, redacted). Best-effort across the user's chats."""
    if await _is_expired(token_doc) and token_doc.get("refresh_token"):
        token_doc = await refresh(token_doc["refresh_token"])
        if on_refresh:
            on_refresh(token_doc)
    access = token_doc.get("access_token")
    headers = {"Authorization": f"Bearer {access}"}
    after = datetime.now(timezone.utc) - timedelta(days=days)
    samples: List[Dict] = []
    async with httpx.AsyncClient(timeout=45) as c:
        me = await c.get(f"{GRAPH}/me", headers=headers)
        me.raise_for_status()
        my_id = me.json().get("id")
        chats = await c.get(f"{GRAPH}/me/chats", headers=headers, params={"$top": "20"})
        chats.raise_for_status()
        for ch in chats.json().get("value", []):
            if len(samples) >= max_messages:
                break
            try:
                msgs = await c.get(
                    f"{GRAPH}/me/chats/{ch['id']}/messages",
                    headers=headers, params={"$top": "20"})
                if msgs.status_code != 200:
                    continue
                for m in msgs.json().get("value", []):
                    frm = (m.get("from") or {}).get("user") or {}
                    if frm.get("id") != my_id:
                        continue
                    try:
                        when = datetime.fromisoformat((m.get("createdDateTime") or "").replace("Z", "+00:00"))
                        if when < after:
                            continue
                    except Exception:
                        pass
                    body = m.get("body", {})
                    content = body.get("content", "")
                    content = _html_to_text(content) if body.get("contentType") == "html" else content.strip()
                    if content and len(content.split()) >= 4:
                        samples.append({"source": "teams", "text": redact(content)[:1500]})
                    if len(samples) >= max_messages:
                        break
            except Exception:
                continue
    return samples
