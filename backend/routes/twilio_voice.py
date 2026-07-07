"""Twilio Voice → LiveKit SIP dial-in.

External users can call our Twilio number, enter the 6-digit PIN shown on
the host's call screen, and get bridged into the LiveKit room as a
phone-only participant. No app install, no link click.

Flow:
  Twilio Number rings → POST /api/twilio/voice/incoming → TwiML <Gather>
    asks for PIN → POST /api/twilio/voice/pin → look up call by PIN →
    return TwiML <Dial><Sip> → caller is now in the LiveKit room.

Setup required (one-time):
  1. Buy a Twilio number with Voice capability (already done: +12708183800).
  2. In Twilio Console → Phone Numbers → manage → A CALL COMES IN →
     Webhook → POST → https://teamnest.ai/api/twilio/voice/incoming
  3. In LiveKit Cloud → SIP → Inbound Trunks → create a trunk pointing to
     your Twilio number, copy the SIP URI (e.g. sip:trunk_abc@sip.livekit.cloud).
  4. Set LIVEKIT_SIP_URI in backend/.env to that URI.
"""
import os
from typing import Optional

from fastapi import APIRouter, Form, HTTPException, Response

from deps import db, now_iso

router = APIRouter()

LIVEKIT_SIP_URI = os.environ.get("LIVEKIT_SIP_URI", "")  # e.g. sip:trunk_xxx@sip.livekit.cloud


def _twiml(body: str) -> Response:
    """Twilio expects an XML response with content-type text/xml."""
    return Response(content=body, media_type="text/xml")


@router.post("/twilio/voice/incoming")
async def twilio_incoming(From: Optional[str] = Form(None)):
    """Twilio calls this when our number rings. Greet + ask for PIN."""
    base = os.environ.get("TWILIO_WEBHOOK_BASE_URL", "").rstrip("/")
    pin_url = f"{base}/api/twilio/voice/pin" if base else "/api/twilio/voice/pin"
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" timeout="10" numDigits="6" action="{pin_url}" method="POST">
    <Say voice="alice">Welcome to TeamNest. Please enter the six digit
      meeting P.I.N. shown on your host's screen, followed by the pound key.</Say>
  </Gather>
  <Say voice="alice">No P.I.N. entered. Goodbye.</Say>
  <Hangup/>
</Response>"""
    return _twiml(twiml)


@router.post("/twilio/voice/pin")
async def twilio_pin(Digits: Optional[str] = Form(None), From: Optional[str] = Form(None)):
    """Validate the PIN and bridge the caller into the LiveKit SIP trunk."""
    pin = (Digits or "").strip()
    if not pin or len(pin) != 6 or not pin.isdigit():
        return _twiml(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response>"
            "<Say voice=\"alice\">That P.I.N. is invalid. Goodbye.</Say>"
            "<Hangup/></Response>"
        )
    call = await db.calls.find_one(
        {"dial_in_pin": pin, "status": "active"}, {"_id": 0}
    )
    if not call:
        return _twiml(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response>"
            "<Say voice=\"alice\">No matching meeting found. Please check the "
            "P.I.N. and try again.</Say><Hangup/></Response>"
        )
    if not LIVEKIT_SIP_URI:
        # Mis-configured: show a graceful failure rather than infinite loop.
        return _twiml(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response>"
            "<Say voice=\"alice\">Dial-in is not yet configured on this "
            "workspace. Please join from the app.</Say><Hangup/></Response>"
        )
    # Record dial-in participant on the call doc so the UI shows "Phone caller".
    await db.calls.update_one(
        {"id": call["id"]},
        {"$push": {"participants": {
            "id": f"phone:{(From or 'unknown').replace('+', '')}",
            "name": From or "Phone caller",
            "joined_at": now_iso(),
            "left_at": None,
            "channel": "phone",
        }}},
    )
    # Pass the room name as a SIP header so LiveKit's dispatch rule routes
    # the call to the right room. LiveKit's docs: X-LK-Room header.
    sip_uri = LIVEKIT_SIP_URI
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting you now.</Say>
  <Dial answerOnBridge="true">
    <Sip>{sip_uri}?X-LK-Room={call['livekit_room']}</Sip>
  </Dial>
</Response>"""
    return _twiml(twiml)


@router.post("/twilio/voice/status")
async def twilio_status_callback(CallStatus: Optional[str] = Form(None)):
    """Twilio call-status callback (optional). We acknowledge for logging."""
    return _twiml("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>")


@router.get("/calls/{call_id}/dial-in-info")
async def dial_in_info(call_id: str):
    """Lightweight read endpoint so the UI can display the PIN + dial-in number.
    Auth is handled at the chat-membership level by the host page; we only
    return data when the call is active and the PIN is known.
    """
    call = await db.calls.find_one({"id": call_id, "status": "active"}, {"_id": 0})
    if not call:
        raise HTTPException(404, "Call not found or has ended")
    if not call.get("dial_in_pin"):
        raise HTTPException(503, "Dial-in not available for this call")
    twilio_number = os.environ.get("TWILIO_VOICE_NUMBER") or os.environ.get("TWILIO_FROM_NUMBER", "")
    return {
        "pin": call["dial_in_pin"],
        "phone_number": twilio_number,
        "configured": bool(twilio_number and LIVEKIT_SIP_URI),
    }
