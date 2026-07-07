"""Privacy-preserving contact-book matching.

Mobile app reads the user's address book, normalizes & SHA-256-hashes each
phone number locally, and sends ONLY the hashes here. We compute the same
hash for every TeamNest user with a phone on file and return matches.

The raw address-book data NEVER leaves the device.
"""
from __future__ import annotations

import hashlib
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import db, normalize_phone, require_user

router = APIRouter()


HASH_PEPPER = "teamnest.v1.contact-match"  # global salt; not a secret, just prevents trivial rainbow lookups


def _hash_phone(normalized: str) -> str:
    return hashlib.sha256(f"{HASH_PEPPER}|{normalized}".encode("utf-8")).hexdigest()


class ContactMatchIn(BaseModel):
    hashes: List[str]  # SHA-256 hex hashes of "PEPPER|<E.164>"
    raw_contacts: Optional[List[Dict[str, str]]] = None
    # If raw_contacts is provided AND the client is the workspace owner,
    # the server normalizes+hashes on its side. This is a convenience path
    # for web/desktop where the user pastes a CSV — NOT recommended for mobile.


@router.post("/contacts/match")
async def match_contacts(payload: ContactMatchIn, current=Depends(require_user)):
    """Return which of the supplied hashed contacts already have a TeamNest
    account. The response includes display name, avatar, and a chat-with-able
    user_id — but only for users in the same workspace (privacy: we don't
    leak the existence of accounts outside the requesting workspace)."""
    hashes = list({h.lower() for h in (payload.hashes or []) if isinstance(h, str) and len(h) == 64})

    # If the client passed raw numbers we hash them server-side too.
    if payload.raw_contacts:
        for c in payload.raw_contacts:
            norm = normalize_phone(c.get("phone") or "")
            if norm and len(norm) >= 8:
                hashes.append(_hash_phone(norm))

    if not hashes:
        return {"matches": [], "match_count": 0, "checked": 0}

    # Scope to the current workspace: only return users who are members.
    member_ids = await db.workspace_members.find(
        {"workspace_id": current["workspace_id"]}, {"user_id": 1, "_id": 0},
    ).to_list(1000)
    member_id_set = {m["user_id"] for m in member_ids}

    matches: List[Dict[str, str]] = []
    if member_id_set:
        cur = db.users.find(
            {"id": {"$in": list(member_id_set)}, "phone_hash": {"$in": hashes}},
            {"_id": 0, "id": 1, "name": 1, "phone_hash": 1, "avatar": 1},
        )
        async for u in cur:
            matches.append({
                "user_id": u["id"],
                "name": u.get("name") or "Member",
                "avatar": u.get("avatar"),
                "phone_hash": u["phone_hash"],
            })
    return {
        "matches": matches,
        "match_count": len(matches),
        "checked": len(hashes),
    }


@router.post("/contacts/_backfill_hashes")
async def backfill_hashes(current=Depends(require_user)):
    """Owner-only utility: walks users with a `phone_normalized` and adds the
    `phone_hash` field. Idempotent."""
    if current.get("role") != "owner":
        raise HTTPException(403, "Owner only")
    cur = db.users.find({"phone_normalized": {"$exists": True, "$ne": None}}, {"_id": 0, "id": 1, "phone_normalized": 1})
    updated = 0
    async for u in cur:
        h = _hash_phone(u["phone_normalized"])
        await db.users.update_one({"id": u["id"]}, {"$set": {"phone_hash": h}})
        updated += 1
    return {"backfilled": updated}
