# SIP Dial-In Setup — TeamNest.ai (Iteration 46)

This lets external participants join any TeamNest call by dialing your
Twilio phone number and entering the 6-digit PIN shown on the host's
screen. No app install, no link.

The **code is fully wired** — you just need to:
1. Point your Twilio number at our webhook.
2. Create a LiveKit SIP trunk + dispatch rule.
3. Set one env var.

---

## 1. Twilio side

1. Twilio Console → **Phone Numbers** → **Manage** → **Active numbers** → click `+1 270 818 3800`.
2. **Voice & Fax** section:
   - **Configure with**: Webhooks, TwiML Bins, …
   - **A CALL COMES IN**: Webhook · `POST` · `https://teamnest.ai/api/twilio/voice/incoming`
   - (Optional) **CALL STATUS CHANGES**: Webhook · `POST` · `https://teamnest.ai/api/twilio/voice/status`
3. **Save**.

⚠️ **For preview testing**, replace `https://teamnest.ai` with the preview URL.

---

## 2. LiveKit SIP trunk

1. LiveKit Cloud Console → **SIP** → **Inbound Trunks** → **Create Trunk**.
2. Pick **Twilio** as the carrier (or "Custom" if Twilio isn't listed).
3. The trunk creates a SIP URI like:
   ```
   sip:trunk_abcdef123@sip.livekit.cloud
   ```
4. Copy that URI.

### Dispatch rule (routes incoming calls to a room)

1. LiveKit Console → **SIP** → **Dispatch Rules** → **Create Rule**.
2. **Trunk**: the trunk you just created.
3. **Rule type**: `Dispatch by SIP header`.
4. **Header name**: `X-LK-Room`
5. **Behavior**: Route to room matching the header value.

Our TwiML adds `X-LK-Room=call_<id>` automatically.

---

## 3. Env var

Add to `/app/backend/.env`:

```bash
LIVEKIT_SIP_URI=sip:trunk_abcdef123@sip.livekit.cloud
TWILIO_VOICE_NUMBER=+12708183800
TWILIO_WEBHOOK_BASE_URL=https://teamnest.ai
```

Restart backend:

```bash
sudo supervisorctl restart backend
```

---

## 4. Verify

1. Open the demo workspace, start an audio call.
2. Click the **Dial-in** button in the top bar — copy the PIN.
3. Call `+1 270 818 3800` from a regular phone.
4. Listen to the Twilio prompt → enter the 6-digit PIN.
5. You should hear "Connecting you now" and join the call as a phone-only participant.

---

## 5. Endpoints reference

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/calls/{id}/dial-in-info` | Returns `{pin, phone_number, configured}` to the host UI. |
| `POST` | `/api/twilio/voice/incoming`  | TwiML: greets the caller and asks for the PIN. |
| `POST` | `/api/twilio/voice/pin`       | TwiML: validates PIN, dials into LiveKit SIP. |
| `POST` | `/api/twilio/voice/status`    | TwiML: optional, acknowledges Twilio's status callback. |

---

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Caller hears "Dial-in is not yet configured" | `LIVEKIT_SIP_URI` is empty. Set it in `.env`. |
| Caller enters PIN but never joins the room | Check LiveKit SIP dispatch rule header name = `X-LK-Room`. |
| Twilio webhook returns 502 / 503 | Check backend logs `tail -f /var/log/supervisor/backend.err.log`. |
| Caller is silent / can't hear others | LiveKit room codec mismatch. Use `OPUS` on the SIP trunk. |
| Webhook never fires | Twilio Console → Voice & Fax — confirm the webhook URL is reachable from the public internet. |
