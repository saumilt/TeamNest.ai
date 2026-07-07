# Push Notifications Setup — TeamNest.ai (Iteration 46)

Push notifications are **fully wired in the codebase** but no-op until you
provide a Firebase Admin SDK service-account JSON. Once you drop the file
in, every new chat message and every new call automatically fires a push to
the recipient's mobile devices via FCM (Android & iOS).

---

## 1. Generate the Firebase service-account JSON

1. Go to https://console.firebase.google.com/
2. Create a new project (or pick existing): `teamnest-ai`
3. In the left sidebar → **Project settings** (gear icon)
4. **Service accounts** tab → click **Generate new private key**
5. Save the downloaded JSON as `firebase-service-account.json`

⚠️ This file contains a private key — never commit it to git.

---

## 2. Deliver the JSON to the backend

Pick ONE of these three methods (in order of preference):

### Option A — File path (best for self-hosted)

```bash
mkdir -p /app/backend/secrets
mv ~/Downloads/firebase-service-account.json /app/backend/secrets/
chmod 600 /app/backend/secrets/firebase-service-account.json
sudo supervisorctl restart backend
```

The push service auto-discovers
`/app/backend/secrets/firebase-service-account.json` on startup.

### Option B — Custom file path

```bash
# In /app/backend/.env
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/firebase-service-account.json
```

### Option C — Inline JSON (best for Render / Railway / Vercel envs)

```bash
# In /app/backend/.env, single line, no quotes around the value:
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"…",…}
```

---

## 3. iOS — Enable APNs in Apple Developer Portal

1. https://developer.apple.com/account → **Certificates, Identifiers & Profiles**
2. **Identifiers** → select `ai.teamnest.app` → **Capabilities** → enable **Push Notifications**
3. **Keys** → **+** → check **Apple Push Notifications service (APNs)** → download `AuthKey_XXXXXXX.p8`
4. In Firebase Console → **Project settings** → **Cloud Messaging** → **Apple app configuration** → upload the `.p8`, paste the Key ID + Team ID.

In Xcode:
- Project → **Signing & Capabilities** → **+ Capability** → **Push Notifications**
- Project → **Signing & Capabilities** → **+ Capability** → **Background Modes** → check **Remote notifications**

---

## 4. Android — Wire google-services.json

1. In Firebase Console → **Project settings** → **General** → **Your apps** → add Android app, package `ai.teamnest.app`.
2. Download `google-services.json`.
3. Drop it at `/app/frontend/android/app/google-services.json`.
4. Verify `android/build.gradle` has the `com.google.gms:google-services` classpath (already added by `@capacitor/push-notifications` config helper — run `npx cap sync android` if missing).

---

## 5. Capacitor side — already wired

The native wrapper already uses `@capacitor/push-notifications` and registers
the device token by POSTing to `/api/devices/register` on every app launch.
See `frontend/src/lib/pushBootstrap.js`.

After step 1-4, just rebuild:

```bash
cd /app/frontend
npx cap sync ios && npx cap sync android
npx cap open ios       # Xcode → Run on device
npx cap open android   # Android Studio → Run on device
```

---

## 6. Verify

After logging in on a device, you should see a row in `db.devices`:

```bash
# from /app/backend
python -c "
import asyncio, json
from deps import db
async def main():
    async for d in db.devices.find({}, {'_id': 0}):
        print(d)
asyncio.run(main())
"
```

Then send any chat message from another user — the device should receive
the push within ~2 seconds. Tap the push → app opens to that chat.

---

## 7. What's pushed automatically

| Trigger | Title | Body | Data payload |
|---------|-------|------|--------------|
| New chat message | `<sender> · <chat>` | first 140 chars | `{chat_id, message_id, type: chat}` |
| New call started | `<caller> is calling` | `in <chat> · audio/video call` | `{chat_id, call_id, type: call_started}` |

To push to a specific user from code:

```python
from services.push_service import send_to_user

await send_to_user(
    user_id="usr_123",
    title="Approval needed",
    body="Amit submitted the Q4 budget for review.",
    data={"approval_id": "apr_456", "type": "approval"},
)
```

To broadcast to a whole workspace:

```python
from services.push_service import send_to_workspace

await send_to_workspace(
    workspace_id="ws_abc",
    title="System maintenance",
    body="TeamNest will restart in 5 minutes.",
)
```
