"""Twilio SMS bridge (TEST MODE).

Outbound: external contacts created in `external_contacts`. Sending an SMS
posts the message into a virtual chat and ships it via Twilio. Inbound:
webhook receives the SMS and posts it back into the same chat.

Test-mode notes (from Twilio docs):
- `from_=+15005550006` is a magic number that always succeeds in test mode.
- Other magic numbers simulate errors (e.g. +15005550001 = invalid).
- Test credentials never actually deliver a message — they validate the API
  call format and return a fake SID. We use this for safe local testing.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from deps import _broadcast_message, db, new_id, now_iso, require_user

router = APIRouter()

TWILIO_MODE = os.environ.get("TWILIO_MODE", "test")
TEST_SID = os.environ.get("TWILIO_TEST_ACCOUNT_SID", "")
TEST_TOKEN = os.environ.get("TWILIO_TEST_AUTH_TOKEN", "")
LIVE_SID = os.environ.get("TWILIO_LIVE_ACCOUNT_SID", "")
LIVE_TOKEN = os.environ.get("TWILIO_LIVE_AUTH_TOKEN", "")
LIVE_API_KEY_SID = os.environ.get("TWILIO_API_KEY_SID", "")
LIVE_API_KEY_SECRET = os.environ.get("TWILIO_API_KEY_SECRET", "")
LIVE_FROM = os.environ.get("TWILIO_FROM_NUMBER", "")
LIVE_MSG_SERVICE_SID = os.environ.get("TWILIO_MESSAGING_SERVICE_SID", "")
TEST_FROM = "+15005550006"  # magic test number that always succeeds


def _twilio_client():
    from twilio.rest import Client
    if TWILIO_MODE == "live":
        if not LIVE_SID:
            raise HTTPException(503, "Twilio live account SID missing.")
        # Use Account SID + Auth Token (most universally supported). API Key
        # auth is documented but requires the key to be created under the same
        # account; we keep it as a fallback only.
        if LIVE_TOKEN:
            client = Client(LIVE_SID, LIVE_TOKEN)
        elif LIVE_API_KEY_SID and LIVE_API_KEY_SECRET:
            client = Client(LIVE_API_KEY_SID, LIVE_API_KEY_SECRET, LIVE_SID)
        else:
            raise HTTPException(503, "Twilio live credentials missing.")
        if not LIVE_FROM and not LIVE_MSG_SERVICE_SID:
            raise HTTPException(
                503,
                "Twilio live mode is on but TWILIO_FROM_NUMBER (or "
                "TWILIO_MESSAGING_SERVICE_SID) is not set. Add the number you "
                "purchased in Twilio Console → Phone Numbers.",
            )
        return client, LIVE_FROM or TEST_FROM
    if not TEST_SID or not TEST_TOKEN:
        raise HTTPException(503, "Twilio test credentials missing.")
    return Client(TEST_SID, TEST_TOKEN), TEST_FROM


class ContactCreate(BaseModel):
    name: str
    phone: str  # E.164 like +15555550123
    email: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    relationship: Optional[str] = "customer"


class SmsSendRequest(BaseModel):
    contact_id: str
    body: str
    chat_id: Optional[str] = None  # if set, mirror the message into a chat thread


def _normalize_phone(p: str) -> str:
    return p.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")


@router.post("/sms/contacts")
async def create_contact(payload: ContactCreate, current=Depends(require_user)):
    phone = _normalize_phone(payload.phone)
    if not phone.startswith("+"):
        raise HTTPException(400, "Phone must be E.164 format (e.g. +15555550123)")
    existing = await db.external_contacts.find_one(
        {"workspace_id": current["workspace_id"], "phone": phone}, {"_id": 0}
    )
    if existing:
        return existing
    doc = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "created_by": current["id"],
        "name": payload.name,
        "phone": phone,
        "email": payload.email,
        "company": payload.company,
        "role": payload.role,
        "relationship": payload.relationship,
        "sms_opted_in": True,  # implied consent for now; STOP flips to False
        "last_message_at": None,
        "created_at": now_iso(),
    }
    await db.external_contacts.insert_one(doc.copy())
    return doc


@router.get("/sms/contacts")
async def list_contacts(current=Depends(require_user)):
    rows = await db.external_contacts.find(
        {"workspace_id": current["workspace_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return {"contacts": rows}


@router.post("/sms/send")
async def send_sms(payload: SmsSendRequest, current=Depends(require_user)):
    contact = await db.external_contacts.find_one(
        {"id": payload.contact_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not contact:
        raise HTTPException(404, "Contact not found")
    if not contact.get("sms_opted_in", True):
        raise HTTPException(400, f"{contact['name']} opted out of SMS (replied STOP).")

    client, from_number = _twilio_client()
    try:
        msg = client.messages.create(
            to=contact["phone"], from_=from_number, body=payload.body[:1600],
        )
        sid = msg.sid
        status = msg.status or "queued"
    except Exception as e:
        raise HTTPException(502, f"Twilio send failed: {e}")

    log_doc = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "contact_id": contact["id"],
        "direction": "outbound",
        "body": payload.body,
        "twilio_sid": sid,
        "twilio_status": status,
        "twilio_mode": TWILIO_MODE,
        "sent_by": current["id"],
        "chat_id": payload.chat_id,
        "created_at": now_iso(),
    }
    await db.sms_messages.insert_one(log_doc.copy())
    await db.external_contacts.update_one(
        {"id": contact["id"]}, {"$set": {"last_message_at": now_iso()}}
    )

    # Mirror into chat as a system-style message (only if chat exists).
    if payload.chat_id:
        chat_msg = {
            "id": new_id(),
            "chat_id": payload.chat_id,
            "sender_id": current["id"],
            "message_type": "text",
            "body": f"📱 **SMS to {contact['name']}** ({contact['phone']}):\n{payload.body}",
            "parent_message_id": None,
            "metadata": {
                "event": "sms_outbound",
                "contact_id": contact["id"],
                "twilio_sid": sid,
                "twilio_mode": TWILIO_MODE,
            },
            "reactions": {},
            "created_at": now_iso(),
            "edited_at": None,
            "deleted_at": None,
        }
        await db.messages.insert_one(chat_msg.copy())
        await _broadcast_message(payload.chat_id, chat_msg)

    return log_doc


@router.post("/sms/inbound", response_class=PlainTextResponse)
async def sms_inbound(
    request: Request,
    From: str = Form(...),
    To: str = Form(...),
    Body: str = Form(""),
):
    """Twilio webhook for inbound SMS. Set this URL in the Twilio number's
    Messaging webhook field."""
    body_normalized = (Body or "").strip().upper()
    contact = await db.external_contacts.find_one(
        {"phone": _normalize_phone(From)}, {"_id": 0}
    )
    if not contact:
        # Unknown contact — log and respond gracefully.
        await db.sms_messages.insert_one({
            "id": new_id(),
            "workspace_id": None,
            "contact_id": None,
            "direction": "inbound",
            "from_phone": From,
            "body": Body,
            "twilio_mode": TWILIO_MODE,
            "created_at": now_iso(),
        })
        return "<Response/>"

    # STOP / START opt-out compliance.
    if body_normalized in ("STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"):
        await db.external_contacts.update_one(
            {"id": contact["id"]}, {"$set": {"sms_opted_in": False}}
        )
    elif body_normalized in ("START", "YES", "UNSTOP"):
        await db.external_contacts.update_one(
            {"id": contact["id"]}, {"$set": {"sms_opted_in": True}}
        )

    log_doc = {
        "id": new_id(),
        "workspace_id": contact["workspace_id"],
        "contact_id": contact["id"],
        "direction": "inbound",
        "from_phone": From,
        "body": Body,
        "twilio_mode": TWILIO_MODE,
        "created_at": now_iso(),
    }
    await db.sms_messages.insert_one(log_doc.copy())

    # Mirror into the last chat this contact was bridged to, if any.
    last_out = await db.sms_messages.find_one(
        {"contact_id": contact["id"], "direction": "outbound", "chat_id": {"$ne": None}},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if last_out and last_out.get("chat_id"):
        chat_msg = {
            "id": new_id(),
            "chat_id": last_out["chat_id"],
            "sender_id": f"sms-{contact['id']}",
            "message_type": "text",
            "body": f"📱 **SMS reply from {contact['name']}** ({contact['phone']}):\n{Body}",
            "parent_message_id": None,
            "metadata": {
                "event": "sms_inbound",
                "contact_id": contact["id"],
                "twilio_mode": TWILIO_MODE,
            },
            "reactions": {},
            "created_at": now_iso(),
            "edited_at": None,
            "deleted_at": None,
        }
        await db.messages.insert_one(chat_msg.copy())
        await _broadcast_message(last_out["chat_id"], chat_msg)
    return "<Response/>"


@router.get("/sms/messages")
async def list_messages(current=Depends(require_user), contact_id: Optional[str] = None):
    q: Dict[str, Any] = {"workspace_id": current["workspace_id"]}
    if contact_id:
        q["contact_id"] = contact_id
    rows = await db.sms_messages.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"messages": rows, "twilio_mode": TWILIO_MODE}


@router.get("/sms/config")
async def sms_config(current=Depends(require_user)):
    """Return current Twilio config so the UI can show TEST/LIVE badge."""
    return {
        "mode": TWILIO_MODE,
        "from_number": (TEST_FROM if TWILIO_MODE == "test" else LIVE_FROM),
        "configured": bool(TEST_SID and TEST_TOKEN),
    }
