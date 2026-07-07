"""Biometric MFA via WebAuthn / Passkeys + recovery codes.

Design:
- Users opt in from `/profile` -> POST /api/mfa/passkey/register/begin then complete.
- Each user can register multiple passkeys (one per device). Stored in
  `webauthn_credentials` collection.
- 10 single-use recovery codes are generated at first-time enrollment and
  surfaced once to the user (must download / copy / print). Stored hashed in
  `mfa_recovery_codes`.
- Login flow:
    POST /auth/login  -> returns either { token, user, ... } (no MFA) OR
                          { mfa_required: true, mfa_token } (pending MFA).
    Frontend then completes /api/mfa/passkey/auth/begin + /complete using the
    mfa_token, which on success swaps for the real session cookie.

Library: `webauthn==2.7.1` (Yubico/Duo). Stores credentials as (credential_id,
public_key) blobs and increments sign_count on each successful auth.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets as pysecrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import (
    bytes_to_base64url,
    base64url_to_bytes,
)
from webauthn.helpers.cose import COSEAlgorithmIdentifier
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from auth_utils import create_token, set_session_cookie
from deps import db, new_id, now_iso, public_user, require_user
from services.workspace_membership import list_user_workspaces

router = APIRouter()


# ─── Relying Party configuration ─────────────────────────────────────────────
# RP_ID is the canonical hostname (no scheme, no port). RP_ORIGIN is the
# scheme+host that the frontend ceremony will originate from.
def _resolve_rp() -> Dict[str, str]:
    """RP_ID = registrable domain; ORIGINS = list of allowed origins (web +
    capacitor schemes). Reads `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` /
    `WEBAUTHN_ORIGINS` from env, with sane fallbacks derived from
    REACT_APP_BACKEND_URL."""
    rp_id = os.environ.get("WEBAUTHN_RP_ID")
    rp_name = os.environ.get("WEBAUTHN_RP_NAME", "TeamNest.ai")
    origins_env = os.environ.get("WEBAUTHN_ORIGINS", "")
    public_base = (
        os.environ.get("PUBLIC_BACKEND_URL")
        or os.environ.get("REACT_APP_BACKEND_URL")
        or ""
    )
    if not rp_id and public_base:
        rp_id = urlparse(public_base).hostname or "localhost"
    if not rp_id:
        rp_id = "localhost"
    origins: List[str] = [o.strip() for o in origins_env.split(",") if o.strip()]
    if public_base:
        origins.append(public_base.rstrip("/"))
    # Also accept the production domain so passkeys enrolled there work.
    origins.append("https://teamnest.ai")
    # Capacitor mobile shells originate from these schemes.
    origins.extend(["capacitor://localhost", "https://localhost", "http://localhost"])
    # Deduplicate while preserving order.
    seen = set()
    uniq_origins = []
    for o in origins:
        if o not in seen:
            uniq_origins.append(o)
            seen.add(o)
    return {"rp_id": rp_id, "rp_name": rp_name, "origins": uniq_origins}


RP = _resolve_rp()


# ─── Pydantic payloads ───────────────────────────────────────────────────────
class PasskeyRegisterBegin(BaseModel):
    device_name: Optional[str] = None


class PasskeyVerifyPayload(BaseModel):
    credential: Dict[str, Any]
    challenge_id: str


class MfaLoginVerify(BaseModel):
    credential: Dict[str, Any]
    challenge_id: str
    mfa_token: str


class MfaRecoveryUse(BaseModel):
    code: str
    mfa_token: str


# ─── Helpers ─────────────────────────────────────────────────────────────────
async def _save_challenge(user_id: str, kind: str, challenge: bytes) -> str:
    challenge_id = new_id()
    await db.webauthn_challenges.insert_one({
        "id": challenge_id,
        "user_id": user_id,
        "kind": kind,
        "challenge_b64": bytes_to_base64url(challenge),
        "created_at": now_iso(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
        "used": False,
    })
    return challenge_id


async def _consume_challenge(challenge_id: str, user_id: str, kind: str) -> bytes:
    doc = await db.webauthn_challenges.find_one({"id": challenge_id})
    if not doc or doc.get("used") or doc.get("user_id") != user_id or doc.get("kind") != kind:
        raise HTTPException(400, "Invalid or expired challenge")
    expires_at = doc.get("expires_at")
    if expires_at and datetime.fromisoformat(expires_at) < datetime.now(timezone.utc):
        raise HTTPException(400, "Challenge expired — please retry")
    await db.webauthn_challenges.update_one({"id": challenge_id}, {"$set": {"used": True}})
    return base64url_to_bytes(doc["challenge_b64"])


def _gen_recovery_codes(n: int = 10) -> List[str]:
    """10 codes, 5+5 hex chars separated by a dash (e.g. `a3f9e-b21c8`)."""
    return [f"{pysecrets.token_hex(3)[:5]}-{pysecrets.token_hex(3)[:5]}".lower() for _ in range(n)]


def _hash_recovery_code(code: str) -> str:
    return bcrypt.hashpw(code.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_recovery_code(code: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(code.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _create_mfa_token(user_id: str) -> str:
    """Short-lived (5 min) token issued after correct password but before
    MFA challenge. Cannot be used as a session token — only redeemable at
    /api/mfa/passkey/auth/complete or /api/mfa/recovery/use."""
    import jwt
    from auth_utils import JWT_ALG, JWT_SECRET
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        "scope": "mfa_pending",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def _decode_mfa_token(token: str) -> str:
    import jwt
    from auth_utils import JWT_ALG, JWT_SECRET
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("scope") != "mfa_pending":
            raise HTTPException(401, "Invalid MFA token")
        return payload["sub"]
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid or expired MFA token")


async def _complete_mfa_login(user_id: str, response: Response) -> Dict[str, Any]:
    """Issue the full session cookie + return the user payload, same shape as
    /auth/login on the non-MFA path."""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(401, "User not found")
    token = create_token(user_id)
    set_session_cookie(response, token)
    return {
        "token": token,
        "user": public_user(user),
        "workspaces": await list_user_workspaces(user_id),
    }


# ─── Status / settings ───────────────────────────────────────────────────────
@router.get("/mfa/status")
async def mfa_status(current=Depends(require_user)):
    creds = await db.webauthn_credentials.find(
        {"user_id": current["id"]}, {"_id": 0}
    ).to_list(20)
    unused_codes = await db.mfa_recovery_codes.count_documents(
        {"user_id": current["id"], "used": False}
    )
    return {
        "mfa_enabled": bool(current.get("mfa_enabled")),
        "passkey_count": len(creds),
        "passkeys": [
            {
                "id": c["id"],
                "device_name": c.get("device_name") or "Unnamed device",
                "created_at": c.get("created_at"),
                "last_used_at": c.get("last_used_at"),
            }
            for c in creds
        ],
        "recovery_codes_remaining": unused_codes,
    }


# ─── Passkey registration ───────────────────────────────────────────────────
@router.post("/mfa/passkey/register/begin")
async def passkey_register_begin(payload: PasskeyRegisterBegin, current=Depends(require_user)):
    existing = await db.webauthn_credentials.find(
        {"user_id": current["id"]}, {"credential_id": 1, "_id": 0}
    ).to_list(20)
    exclude = [
        PublicKeyCredentialDescriptor(id=base64url_to_bytes(c["credential_id"]))
        for c in existing
    ]
    options = generate_registration_options(
        rp_id=RP["rp_id"],
        rp_name=RP["rp_name"],
        user_id=current["id"].encode("utf-8"),
        user_name=current["email"],
        user_display_name=current.get("name") or current["email"],
        exclude_credentials=exclude,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        supported_pub_key_algs=[
            COSEAlgorithmIdentifier.ECDSA_SHA_256,
            COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
        ],
    )
    challenge_id = await _save_challenge(current["id"], "register", options.challenge)
    return {
        "options": json.loads(options_to_json(options)),
        "challenge_id": challenge_id,
        "pending_device_name": payload.device_name or "New device",
    }


@router.post("/mfa/passkey/register/complete")
async def passkey_register_complete(
    payload: PasskeyVerifyPayload, current=Depends(require_user)
):
    challenge = await _consume_challenge(payload.challenge_id, current["id"], "register")
    try:
        verification = verify_registration_response(
            credential=payload.credential,
            expected_challenge=challenge,
            expected_origin=RP["origins"],
            expected_rp_id=RP["rp_id"],
            require_user_verification=False,
        )
    except Exception as exc:
        raise HTTPException(400, f"Passkey verification failed: {exc}")

    device_name = payload.credential.get("device_name") or "New device"

    cred_doc = {
        "id": new_id(),
        "user_id": current["id"],
        "credential_id": bytes_to_base64url(verification.credential_id),
        "public_key": bytes_to_base64url(verification.credential_public_key),
        "sign_count": verification.sign_count,
        "device_name": device_name,
        "created_at": now_iso(),
        "last_used_at": None,
        "transports": payload.credential.get("response", {}).get("transports", []),
    }
    await db.webauthn_credentials.insert_one(cred_doc.copy())

    # First passkey ever? Enable MFA + generate recovery codes.
    first_time = not current.get("mfa_enabled")
    codes_plaintext: Optional[List[str]] = None
    if first_time:
        codes_plaintext = _gen_recovery_codes(10)
        await db.mfa_recovery_codes.insert_many([
            {
                "id": new_id(),
                "user_id": current["id"],
                "code_hash": _hash_recovery_code(c),
                "used": False,
                "created_at": now_iso(),
                "used_at": None,
            }
            for c in codes_plaintext
        ])
        await db.users.update_one(
            {"id": current["id"]},
            {"$set": {"mfa_enabled": True, "mfa_enabled_at": now_iso()}},
        )

    return {
        "ok": True,
        "passkey": {
            "id": cred_doc["id"],
            "device_name": cred_doc["device_name"],
            "created_at": cred_doc["created_at"],
        },
        "mfa_enabled": True,
        "recovery_codes": codes_plaintext,  # only on first enrollment
    }


@router.delete("/mfa/passkey/{passkey_id}")
async def passkey_delete(passkey_id: str, current=Depends(require_user)):
    res = await db.webauthn_credentials.delete_one(
        {"id": passkey_id, "user_id": current["id"]}
    )
    if res.deleted_count == 0:
        raise HTTPException(404, "Passkey not found")
    # If user removed last passkey, disable MFA.
    remaining = await db.webauthn_credentials.count_documents({"user_id": current["id"]})
    if remaining == 0:
        await db.users.update_one(
            {"id": current["id"]},
            {"$set": {"mfa_enabled": False}, "$unset": {"mfa_enabled_at": ""}},
        )
        await db.mfa_recovery_codes.delete_many({"user_id": current["id"]})
    return {"ok": True, "remaining": remaining, "mfa_enabled": remaining > 0}


# ─── Login challenge (called from frontend mid-login) ────────────────────────
@router.post("/mfa/passkey/auth/begin")
async def passkey_auth_begin(payload: Dict[str, str]):
    mfa_token = payload.get("mfa_token")
    if not mfa_token:
        raise HTTPException(400, "mfa_token is required")
    user_id = _decode_mfa_token(mfa_token)
    creds = await db.webauthn_credentials.find(
        {"user_id": user_id}, {"credential_id": 1, "_id": 0}
    ).to_list(20)
    allow = [
        PublicKeyCredentialDescriptor(id=base64url_to_bytes(c["credential_id"]))
        for c in creds
    ]
    options = generate_authentication_options(
        rp_id=RP["rp_id"],
        allow_credentials=allow,
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    challenge_id = await _save_challenge(user_id, "auth", options.challenge)
    return {
        "options": json.loads(options_to_json(options)),
        "challenge_id": challenge_id,
    }


@router.post("/mfa/passkey/auth/complete")
async def passkey_auth_complete(payload: MfaLoginVerify, response: Response):
    user_id = _decode_mfa_token(payload.mfa_token)
    challenge = await _consume_challenge(payload.challenge_id, user_id, "auth")
    raw_id = payload.credential.get("id") or payload.credential.get("rawId")
    if not raw_id:
        raise HTTPException(400, "Missing credential id")
    cred = await db.webauthn_credentials.find_one(
        {"credential_id": raw_id, "user_id": user_id}
    )
    if not cred:
        raise HTTPException(400, "Unknown passkey for this account")
    try:
        verification = verify_authentication_response(
            credential=payload.credential,
            expected_challenge=challenge,
            expected_origin=RP["origins"],
            expected_rp_id=RP["rp_id"],
            credential_public_key=base64url_to_bytes(cred["public_key"]),
            credential_current_sign_count=cred.get("sign_count", 0),
            require_user_verification=False,
        )
    except Exception as exc:
        raise HTTPException(400, f"Passkey verification failed: {exc}")
    await db.webauthn_credentials.update_one(
        {"id": cred["id"]},
        {"$set": {
            "sign_count": verification.new_sign_count,
            "last_used_at": now_iso(),
        }},
    )
    return await _complete_mfa_login(user_id, response)


# ─── Recovery codes ──────────────────────────────────────────────────────────
@router.post("/mfa/recovery-codes/regenerate")
async def regenerate_recovery_codes(current=Depends(require_user)):
    if not current.get("mfa_enabled"):
        raise HTTPException(400, "MFA is not enabled — register a passkey first.")
    await db.mfa_recovery_codes.delete_many({"user_id": current["id"]})
    plaintext = _gen_recovery_codes(10)
    await db.mfa_recovery_codes.insert_many([
        {
            "id": new_id(),
            "user_id": current["id"],
            "code_hash": _hash_recovery_code(c),
            "used": False,
            "created_at": now_iso(),
            "used_at": None,
        }
        for c in plaintext
    ])
    return {"recovery_codes": plaintext}


@router.post("/mfa/recovery/use")
async def mfa_recovery_use(payload: MfaRecoveryUse, response: Response):
    user_id = _decode_mfa_token(payload.mfa_token)
    code = payload.code.strip().lower()
    candidates = await db.mfa_recovery_codes.find(
        {"user_id": user_id, "used": False}
    ).to_list(50)
    for row in candidates:
        if _verify_recovery_code(code, row["code_hash"]):
            await db.mfa_recovery_codes.update_one(
                {"id": row["id"]},
                {"$set": {"used": True, "used_at": now_iso()}},
            )
            return await _complete_mfa_login(user_id, response)
    raise HTTPException(401, "Invalid recovery code")


# ─── Disable MFA (requires fresh passkey assertion via /auth/login flow) ─────
@router.post("/mfa/disable")
async def mfa_disable(current=Depends(require_user)):
    """Disable MFA + remove all passkeys + recovery codes. Requires being
    currently authenticated (cookie session)."""
    await db.webauthn_credentials.delete_many({"user_id": current["id"]})
    await db.mfa_recovery_codes.delete_many({"user_id": current["id"]})
    await db.users.update_one(
        {"id": current["id"]},
        {"$set": {"mfa_enabled": False}, "$unset": {"mfa_enabled_at": ""}},
    )
    return {"ok": True}
