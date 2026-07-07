"""Firebase Cloud Messaging (FCM) / APNs push notification dispatcher.

Sends one notification to all of a user's registered devices. APNs tokens
are delivered via FCM's "send to legacy iOS token" flow because we already
have the Firebase service account in hand — single SDK for both platforms.

CONFIGURATION
=============
Drop the Firebase Admin SDK service-account JSON at one of:
  - File path in env: FIREBASE_SERVICE_ACCOUNT_PATH
  - Inline JSON in env: FIREBASE_SERVICE_ACCOUNT_JSON
  - Default file path: /app/backend/secrets/firebase-service-account.json

If neither is set, this module no-ops and logs a warning, so the rest of
the app keeps working during local dev.
"""
import json
import os
from typing import Any, Dict, List, Optional

from deps import db, logger

_initialized = False
_messaging = None  # firebase_admin.messaging module reference


def _init_firebase() -> bool:
    """Lazily initialize the Firebase Admin SDK on first send. Returns True
    if Firebase is configured and ready, False otherwise."""
    global _initialized, _messaging
    if _initialized:
        return _messaging is not None
    _initialized = True

    try:
        import firebase_admin
        from firebase_admin import credentials, messaging
    except ImportError:
        logger.warning(
            "[push] firebase-admin not installed; pushes are disabled. "
            "Run: pip install firebase-admin"
        )
        return False

    # 1) Try inline JSON env (recommended on Render / Heroku-style envs).
    inline = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    cred = None
    if inline:
        try:
            cred = credentials.Certificate(json.loads(inline))
        except Exception as e:
            logger.warning("[push] FIREBASE_SERVICE_ACCOUNT_JSON parse failed: %s", e)

    # 2) Try a file path.
    if cred is None:
        path = os.environ.get(
            "FIREBASE_SERVICE_ACCOUNT_PATH",
            "/app/backend/secrets/firebase-service-account.json",
        )
        if os.path.exists(path):
            try:
                cred = credentials.Certificate(path)
            except Exception as e:
                logger.warning("[push] Could not load service account at %s: %s", path, e)

    if cred is None:
        logger.info(
            "[push] No Firebase service account found — pushes are disabled. "
            "Drop the JSON at /app/backend/secrets/firebase-service-account.json "
            "or set FIREBASE_SERVICE_ACCOUNT_JSON."
        )
        return False

    try:
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        _messaging = messaging
        logger.info("[push] Firebase Admin initialized.")
        return True
    except Exception as e:
        logger.exception("[push] firebase init failed: %s", e)
        return False


async def send_to_user(
    user_id: str, title: str, body: str, data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Send a push to every registered device of the user. Best-effort: any
    device that returns an invalid-token error is auto-removed. Returns a
    summary {sent: int, removed: int, configured: bool}."""
    if not _init_firebase():
        return {"sent": 0, "removed": 0, "configured": False, "reason": "firebase_not_configured"}

    cursor = db.devices.find({"user_id": user_id}, {"_id": 0, "token": 1, "platform": 1})
    tokens: List[dict] = [d async for d in cursor]
    if not tokens:
        return {"sent": 0, "removed": 0, "configured": True, "reason": "no_devices"}

    sent = 0
    removed = 0
    for d in tokens:
        try:
            msg = _messaging.Message(
                token=d["token"],
                notification=_messaging.Notification(title=title, body=body),
                data={k: str(v) for k, v in (data or {}).items()},
                apns=_messaging.APNSConfig(
                    payload=_messaging.APNSPayload(
                        aps=_messaging.Aps(sound="default", badge=1),
                    ),
                ),
                android=_messaging.AndroidConfig(
                    priority="high",
                    notification=_messaging.AndroidNotification(
                        sound="default", click_action="FLUTTER_NOTIFICATION_CLICK",
                    ),
                ),
            )
            _messaging.send(msg)
            sent += 1
        except Exception as e:
            err = str(e).lower()
            if "registration-token-not-registered" in err or "invalid" in err:
                await db.devices.delete_one({"user_id": user_id, "token": d["token"]})
                removed += 1
            else:
                logger.warning("[push] send failed for %s: %s", user_id, e)
    return {"sent": sent, "removed": removed, "configured": True}


async def send_to_workspace(
    workspace_id: str, title: str, body: str,
    data: Optional[Dict[str, Any]] = None, exclude_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Broadcast to every member of a workspace (excluding the sender if set)."""
    q = {"workspace_id": workspace_id}
    if exclude_user_id:
        q["id"] = {"$ne": exclude_user_id}
    cursor = db.users.find(q, {"_id": 0, "id": 1})
    total = {"sent": 0, "removed": 0, "configured": True}
    async for u in cursor:
        r = await send_to_user(u["id"], title, body, data)
        total["sent"] += r.get("sent", 0)
        total["removed"] += r.get("removed", 0)
        total["configured"] = total["configured"] and r.get("configured", True)
    return total
