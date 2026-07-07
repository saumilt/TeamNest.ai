"""JWT + bcrypt auth helpers.

Auth strategy (v2 — Feb 2026):
  - Long-lived session lives in an HttpOnly, Secure, SameSite=Lax cookie named
    `tn_session`. The browser never sees this token in JS, eliminating XSS-
    based token theft.
  - For backwards compatibility (and for the WebSocket upgrade path, which
    can't read cookies reliably across browsers), we still accept the same
    JWT in an `Authorization: Bearer …` header.
  - The frontend persists no token in localStorage. It either relies on the
    cookie (HTTP requests via axios `withCredentials: true`) or requests a
    short-lived WS token from `/api/auth/ws-token` when opening a WebSocket.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
JWT_ALG = "HS256"
JWT_EXP_DAYS = 30
WS_TOKEN_EXP_MINUTES = 5

# Cookie configuration — read once at import time.
COOKIE_NAME = "tn_session"
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() != "false"
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax")
COOKIE_DOMAIN = os.environ.get("COOKIE_DOMAIN") or None

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str, ttl_days: int = JWT_EXP_DAYS) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=ttl_days),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def create_short_lived_token(user_id: str) -> str:
    """A 5-minute token issued from cookie auth, used to attach to WebSocket
    upgrades where cookies aren't reliable."""
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=WS_TOKEN_EXP_MINUTES),
        "scope": "ws",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return payload.get("sub")
    except Exception:
        return None


def set_session_cookie(response, token: str) -> None:
    """Set the HttpOnly session cookie on a Starlette/FastAPI Response."""
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=JWT_EXP_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        domain=COOKIE_DOMAIN,
        path="/",
    )


def clear_session_cookie(response) -> None:
    response.delete_cookie(
        key=COOKIE_NAME,
        domain=COOKIE_DOMAIN,
        path="/",
    )


def _extract_token(
    request: Request, creds: Optional[HTTPAuthorizationCredentials]
) -> Optional[str]:
    """Prefer the cookie (most users post-login). Fall back to Bearer header for
    legacy clients, mobile apps, and the WS handshake path."""
    cookie_token = request.cookies.get(COOKIE_NAME) if request else None
    if cookie_token:
        return cookie_token
    if creds and creds.credentials:
        return creds.credentials
    return None


async def get_current_user_id(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> str:
    token = _extract_token(request, creds)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user_id
