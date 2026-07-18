"""Gmail read-only connector — per-user OAuth + style-sample extraction.

Reads the user's OWN sent mail (read-only) to learn their writing style. Never
sends, modifies, deletes or labels anything. All extracted text is run through
`redact()` before it is shown or handed to the style analyser — "we learn
style, not secrets."
"""
from __future__ import annotations

import base64
import os
import re
import warnings
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
PUBLIC_URL = (os.environ.get("PUBLIC_BACKEND_URL") or "").rstrip("/")
REDIRECT_URI = f"{PUBLIC_URL}/api/oauth/gmail/callback"

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

_CLIENT_CONFIG = {
    "web": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [REDIRECT_URI],
    }
}


def is_configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET)


def _flow() -> Flow:
    return Flow.from_client_config(_CLIENT_CONFIG, scopes=SCOPES, redirect_uri=REDIRECT_URI)


def authorization_url() -> Tuple[str, str]:
    flow = _flow()
    url, state = flow.authorization_url(
        access_type="offline", prompt="consent", include_granted_scopes="true"
    )
    return url, state


def exchange_code(code: str) -> Credentials:
    flow = _flow()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # Google reorders scopes → scope warning
        flow.fetch_token(code=code)
    return flow.credentials


def creds_to_doc(creds: Credentials) -> Dict:
    return {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "expires_at": creds.expiry.replace(tzinfo=timezone.utc).isoformat() if creds.expiry else None,
    }


def doc_to_creds(doc: Dict) -> Credentials:
    return Credentials(
        token=doc.get("access_token"),
        refresh_token=doc.get("refresh_token"),
        token_uri=doc.get("token_uri") or "https://oauth2.googleapis.com/token",
        client_id=doc.get("client_id") or CLIENT_ID,
        client_secret=doc.get("client_secret") or CLIENT_SECRET,
        scopes=SCOPES,
    )


def account_email(creds: Credentials) -> Optional[str]:
    try:
        svc = build("oauth2", "v2", credentials=creds, cache_discovery=False)
        return svc.userinfo().get().execute().get("email")
    except Exception:
        return None


# ── Redaction / sanitization ────────────────────────────────────────────
_EMAIL = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_PHONE = re.compile(r"(?<!\d)(\+?\d[\d\s().-]{7,}\d)(?!\d)")
_MONEY = re.compile(r"[$€£]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|K|m|M|bn))?")
_LONGNUM = re.compile(r"\b\d{6,}\b")
_URL = re.compile(r"https?://\S+")
_GREETING = re.compile(r"^(Hi|Hello|Hey|Dear)\s+[A-Z][a-zA-Z'’.-]+(\s+[A-Z][a-zA-Z'’.-]+)?", re.MULTILINE)
_SECRET = re.compile(r"\b(sk-[A-Za-z0-9]+|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]+)\b")


def redact(text: str) -> str:
    if not text:
        return ""
    t = _SECRET.sub("[SECRET]", text)
    t = _EMAIL.sub("[EMAIL]", t)
    t = _URL.sub("[LINK]", t)
    t = _MONEY.sub("[AMOUNT]", t)
    t = _PHONE.sub("[PHONE]", t)
    t = _LONGNUM.sub("[ACCOUNT]", t)
    t = _GREETING.sub(lambda m: f"{m.group(1)} [PERSON]", t)
    return t


def _decode_part(data: str) -> str:
    try:
        return base64.urlsafe_b64decode(data.encode()).decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _extract_body(payload: Dict) -> str:
    """Prefer text/plain; strip quoted-reply lines and signatures."""
    def walk(p):
        if p.get("mimeType") == "text/plain" and p.get("body", {}).get("data"):
            return _decode_part(p["body"]["data"])
        for sub in p.get("parts", []) or []:
            r = walk(sub)
            if r:
                return r
        return ""

    raw = walk(payload)
    lines = []
    for ln in raw.splitlines():
        s = ln.strip()
        if s.startswith(">") or s.startswith("On ") and s.endswith("wrote:"):
            break  # start of quoted history
        lines.append(ln)
    return "\n".join(lines).strip()


def _date_bounds(days: int, start_date: Optional[str], end_date: Optional[str]):
    """Return (after_epoch, before_epoch|None). `start_date`/`end_date` (ISO
    'YYYY-MM-DD') take precedence over the rolling `days` window when provided."""
    if start_date:
        try:
            after_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            after_dt = datetime.now(timezone.utc) - timedelta(days=days)
    else:
        after_dt = datetime.now(timezone.utc) - timedelta(days=days)
    before_epoch = None
    if end_date:
        try:
            before_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
            before_epoch = int(before_dt.timestamp())
        except ValueError:
            before_epoch = None
    return int(after_dt.timestamp()), before_epoch


_GMAIL_SCOPE = {"sent": "in:sent", "inbox": "in:inbox", "all": "in:anywhere"}


def fetch_sent_samples(creds: Credentials, max_messages: int = 40, days: int = 90,
                       folder: str = "sent", start_date: Optional[str] = None,
                       end_date: Optional[str] = None, on_refresh=None) -> List[Dict]:
    """Return [{source:'gmail', text}] of the user's own recent messages from the
    chosen `folder` (sent|inbox|all|<label>) within the date range, already
    redacted. Read-only."""
    if creds.expiry and datetime.now(timezone.utc) >= creds.expiry.replace(tzinfo=timezone.utc):
        creds.refresh(GoogleRequest())
        if on_refresh:
            on_refresh(creds)

    svc = build("gmail", "v1", credentials=creds, cache_discovery=False)
    after, before = _date_bounds(days, start_date, end_date)
    scope = _GMAIL_SCOPE.get((folder or "sent").lower())
    if scope is None:
        scope = f'label:"{folder}"'
    q = f"{scope} after:{after}"
    if before:
        q += f" before:{before}"
    res = svc.users().messages().list(
        userId="me", q=q, maxResults=min(max_messages, 100)
    ).execute()
    ids = [m["id"] for m in res.get("messages", [])]

    samples: List[Dict] = []
    for mid in ids[:max_messages]:
        try:
            msg = svc.users().messages().get(userId="me", id=mid, format="full").execute()
            body = _extract_body(msg.get("payload", {}))
            if body and len(body.split()) >= 5:
                samples.append({"source": "gmail", "text": redact(body)[:2000]})
        except Exception:
            continue
    return samples
