"""User profile self-serve: edit own name, phone, avatar URL."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from auth_utils import hash_password, password_complexity_error, verify_password
from deps import db, normalize_phone, now_iso, public_user, require_user

router = APIRouter()


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    avatar: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.patch("/me/profile")
async def update_profile(payload: ProfileUpdate, current=Depends(require_user)):
    update: dict = {}
    if payload.name is not None:
        n = payload.name.strip()
        if len(n) < 1:
            raise HTTPException(400, "Name cannot be empty")
        update["name"] = n
    if payload.phone is not None:
        phone_raw = payload.phone.strip()
        if not phone_raw:
            update["phone"] = None
            update["phone_normalized"] = None
        else:
            phone_norm = normalize_phone(phone_raw)
            if phone_norm:
                clash = await db.users.find_one(
                    {"phone_normalized": phone_norm, "id": {"$ne": current["id"]}}
                )
                if clash:
                    raise HTTPException(400, "Phone number already registered to another account")
            update["phone"] = phone_raw
            update["phone_normalized"] = phone_norm or None
    if payload.avatar is not None:
        update["avatar"] = payload.avatar.strip() or None
    if not update:
        raise HTTPException(400, "Nothing to update")
    update["updated_at"] = now_iso()
    await db.users.update_one({"id": current["id"]}, {"$set": update})
    user = await db.users.find_one({"id": current["id"]}, {"_id": 0, "password_hash": 0})
    return public_user(user)


@router.post("/me/password")
async def change_password(payload: PasswordChange, current=Depends(require_user)):
    user = await db.users.find_one({"id": current["id"]})
    if not user or not verify_password(payload.current_password, user.get("password_hash", "")):
        raise HTTPException(401, "Current password is incorrect")
    pw_err = password_complexity_error(payload.new_password)
    if pw_err:
        raise HTTPException(400, pw_err)
    await db.users.update_one(
        {"id": current["id"]},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "must_change_password": False,
            "updated_at": now_iso(),
        }},
    )
    return {"ok": True}


class InitialPassword(BaseModel):
    new_password: str


@router.post("/me/set-initial-password")
async def set_initial_password(payload: InitialPassword, current=Depends(require_user)):
    """Complete the forced first-login password change for admin-provisioned
    users (must_change_password=True). No current password required — the user
    is already authenticated with their temporary password."""
    user = await db.users.find_one({"id": current["id"]})
    if not user:
        raise HTTPException(404, "User not found")
    if not user.get("must_change_password"):
        raise HTTPException(400, "No password change is required for this account")
    pw_err = password_complexity_error(payload.new_password)
    if pw_err:
        raise HTTPException(400, pw_err)
    if verify_password(payload.new_password, user.get("password_hash", "")):
        raise HTTPException(400, "Choose a password different from your temporary one.")
    await db.users.update_one(
        {"id": current["id"]},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "must_change_password": False,
            "updated_at": now_iso(),
        }},
    )
    return {"ok": True}


class EmailChange(BaseModel):
    new_email: EmailStr
    password: str


@router.post("/me/email")
async def change_email(payload: EmailChange, current=Depends(require_user)):
    user = await db.users.find_one({"id": current["id"]})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(401, "Password incorrect")
    new_email = payload.new_email.lower()
    if new_email == user["email"]:
        raise HTTPException(400, "That's already your email")
    clash = await db.users.find_one({"email": new_email})
    if clash:
        raise HTTPException(400, "Email already in use")
    await db.users.update_one(
        {"id": current["id"]}, {"$set": {"email": new_email, "updated_at": now_iso()}}
    )
    return {"email": new_email}
