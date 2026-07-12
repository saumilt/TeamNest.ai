"""Symmetric encryption for connector OAuth tokens (encrypted at rest).

Uses Fernet with a key derived from JWT_SECRET so no extra secret has to be
provisioned. Tokens are never returned to clients in plaintext.
"""
import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken

_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
_KEY = base64.urlsafe_b64encode(hashlib.sha256(_SECRET.encode()).digest())
_f = Fernet(_KEY)


def encrypt(plaintext: str) -> str:
    if plaintext is None:
        return ""
    return _f.encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        return _f.decrypt(token.encode()).decode()
    except InvalidToken:
        return ""


def mask(value: str, keep: int = 4) -> str:
    """Show only the last few chars of a secret for UI display."""
    if not value:
        return ""
    tail = value[-keep:]
    return f"••••{tail}"
