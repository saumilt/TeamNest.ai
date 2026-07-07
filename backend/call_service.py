"""LiveKit call service — server-side token generation, room ops, webhook verify."""
import os
from datetime import timedelta
from typing import Optional

from dotenv import load_dotenv
from livekit import api as lkapi
from livekit.api import AccessToken, VideoGrants

load_dotenv()

LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "")


def is_configured() -> bool:
    return bool(LIVEKIT_URL and LIVEKIT_API_KEY and LIVEKIT_API_SECRET)


def create_access_token(
    *,
    identity: str,
    name: str,
    room: str,
    can_publish: bool = True,
    can_subscribe: bool = True,
    can_publish_data: bool = True,
    ttl_minutes: int = 360,
) -> str:
    """Sign a LiveKit AccessToken for a user to join `room`."""
    token = (
        AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(name)
        .with_grants(
            VideoGrants(
                room_join=True,
                room=room,
                can_publish=can_publish,
                can_subscribe=can_subscribe,
                can_publish_data=can_publish_data,
            )
        )
        .with_ttl(timedelta(minutes=ttl_minutes))
    )
    return token.to_jwt()


async def end_room(room: str) -> None:
    """Force-disconnect all participants and delete a room."""
    try:
        client = lkapi.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        try:
            await client.room.delete_room(lkapi.DeleteRoomRequest(room=room))
        finally:
            await client.aclose()
    except Exception:
        pass


async def publish_data(room: str, payload: dict, topic: str = "transcript") -> None:
    """Broadcast a JSON message to all participants of a room via LiveKit data channel.

    Frontend listens via `useDataChannel(topic)`. Keep payloads small (<10 KB).
    """
    import json
    if not is_configured():
        return
    try:
        client = lkapi.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        try:
            data_bytes = json.dumps(payload).encode("utf-8")
            await client.room.send_data(
                lkapi.SendDataRequest(
                    room=room,
                    data=data_bytes,
                    kind=lkapi.DataPacket.Kind.RELIABLE,
                    topic=topic,
                )
            )
        finally:
            await client.aclose()
    except Exception as e:
        # Don't crash transcript path if LiveKit is briefly unavailable
        print(f"[call_service] publish_data failed: {e}")


def receive_webhook(body: str, auth_header: Optional[str]) -> dict:
    """Verify a LiveKit webhook signature and return the parsed event dict."""
    from livekit.api.webhook import WebhookReceiver
    from livekit.api.access_token import TokenVerifier

    verifier = TokenVerifier(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    receiver = WebhookReceiver(verifier)
    event = receiver.receive(body, auth_header or "")
    # `event` is a protobuf WebhookEvent — convert to dict for our handlers
    return {
        "event": event.event,
        "room": {
            "name": event.room.name if event.room and event.room.name else "",
            "sid": event.room.sid if event.room and event.room.sid else "",
        },
        "participant": {
            "identity": event.participant.identity if event.participant and event.participant.identity else "",
            "name": event.participant.name if event.participant and event.participant.name else "",
        },
    }
