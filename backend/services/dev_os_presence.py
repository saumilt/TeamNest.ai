"""Dev OS — Live presence WebSocket manager.

Tracks which users are currently looking at a Dev OS project (and which
tab/route they're on, plus their cursor X/Y in normalized 0..1 coords).
Used by the Kanban / Plan / Bugs tabs to render real-time avatars and
cursors so collaboration feels alive.

Wire from server.py with:

    from services.dev_os_presence import presence_manager, presence_ws

Then expose:

    @app.websocket("/api/ws/dev-os-presence/{project_id}")
    async def dev_os_presence(websocket, project_id, token=Query(...)):
        await presence_ws(websocket, project_id, token)
"""
import asyncio
import logging
from collections import defaultdict
from typing import Any, Dict, Set

from fastapi import WebSocket, WebSocketDisconnect

from auth_utils import decode_token
from deps import db

logger = logging.getLogger("teamnest")

# A stable, color-blind-friendly palette for assigning each user a cursor color.
_PALETTE = [
    "#fbbf24", "#22d3ee", "#a78bfa", "#34d399", "#f472b6",
    "#fb923c", "#60a5fa", "#f87171", "#4ade80", "#c084fc",
]


def _color_for_user(user_id: str) -> str:
    # Stable hash → palette index (no random per-connect flicker).
    h = sum(ord(c) for c in user_id) % len(_PALETTE)
    return _PALETTE[h]


class PresenceManager:
    """In-memory per-project presence room.

    Each project_id maps to {user_id: {ws, info, last_cursor}}. The `info`
    holds {name, color, tab}; `last_cursor` is the most recent throttled
    cursor event so newcomers see existing cursors immediately.
    """

    def __init__(self) -> None:
        self._rooms: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
        self._lock = asyncio.Lock()

    async def connect(
        self, project_id: str, user_id: str, websocket: WebSocket, info: Dict[str, Any],
    ) -> None:
        await websocket.accept()
        async with self._lock:
            self._rooms[project_id][user_id] = {
                "ws": websocket,
                "info": info,
                "cursor": None,
            }
        # Send the new participant the existing roster so cursors snap in.
        roster = self._roster(project_id, exclude=user_id)
        await websocket.send_json({"event": "roster", "users": roster})
        # Tell everyone else someone joined.
        await self._broadcast(project_id, {"event": "join", "user": {**info, "user_id": user_id}}, exclude=user_id)

    async def disconnect(self, project_id: str, user_id: str) -> None:
        async with self._lock:
            room = self._rooms.get(project_id) or {}
            entry = room.pop(user_id, None)
            if not room:
                self._rooms.pop(project_id, None)
        if entry:
            await self._broadcast(project_id, {"event": "leave", "user_id": user_id})

    async def handle_event(self, project_id: str, user_id: str, payload: Dict[str, Any]) -> None:
        event = payload.get("event")
        if event == "cursor":
            # {x:0..1, y:0..1, tab:'plan'|'tasks'|...}
            x = float(payload.get("x", 0))
            y = float(payload.get("y", 0))
            tab = str(payload.get("tab", ""))[:32]
            cursor = {"x": max(0.0, min(1.0, x)), "y": max(0.0, min(1.0, y)), "tab": tab}
            room = self._rooms.get(project_id) or {}
            entry = room.get(user_id)
            if entry:
                entry["cursor"] = cursor
            await self._broadcast(
                project_id,
                {"event": "cursor", "user_id": user_id, **cursor},
                exclude=user_id,
            )
        elif event == "tab":
            tab = str(payload.get("tab", ""))[:32]
            room = self._rooms.get(project_id) or {}
            entry = room.get(user_id)
            if entry:
                entry["info"]["tab"] = tab
            await self._broadcast(
                project_id,
                {"event": "tab", "user_id": user_id, "tab": tab},
                exclude=user_id,
            )
        elif event == "ping":
            entry = (self._rooms.get(project_id) or {}).get(user_id)
            if entry:
                try:
                    await entry["ws"].send_json({"event": "pong"})
                except Exception:
                    pass

    def _roster(self, project_id: str, *, exclude: str | None = None) -> list:
        room = self._rooms.get(project_id) or {}
        out = []
        for uid, entry in room.items():
            if uid == exclude:
                continue
            out.append({**entry["info"], "user_id": uid, "cursor": entry.get("cursor")})
        return out

    async def _broadcast(
        self, project_id: str, payload: Dict[str, Any], *, exclude: str | None = None,
    ) -> None:
        room = self._rooms.get(project_id) or {}
        dead: list = []
        for uid, entry in list(room.items()):
            if uid == exclude:
                continue
            try:
                await entry["ws"].send_json(payload)
            except Exception:
                dead.append(uid)
        for uid in dead:
            room.pop(uid, None)


presence_manager = PresenceManager()


async def presence_ws(websocket: WebSocket, project_id: str, token: str) -> None:
    """One-stop entry called from server.py's @app.websocket route."""
    user_id = decode_token(token)
    if not user_id:
        await websocket.close(code=4401)
        return
    user = await db.users.find_one(
        {"id": user_id}, {"_id": 0, "id": 1, "name": 1, "workspace_id": 1},
    )
    if not user:
        await websocket.close(code=4404)
        return
    # Multi-workspace support: users have a scalar `workspace_id` AND can be
    # members of additional workspaces via the workspace_members collection.
    ws_ids = [
        m["workspace_id"]
        async for m in db.workspace_members.find(
            {"user_id": user_id}, {"_id": 0, "workspace_id": 1},
        )
    ]
    if user.get("workspace_id") and user["workspace_id"] not in ws_ids:
        ws_ids.append(user["workspace_id"])
    project = await db.dev_projects.find_one(
        {"id": project_id, "workspace_id": {"$in": ws_ids}},
        {"_id": 0, "id": 1},
    )
    if not project:
        await websocket.close(code=4403)
        return

    info = {
        "name": user.get("name") or "User",
        "color": _color_for_user(user_id),
        "tab": "plan",
    }
    await presence_manager.connect(project_id, user_id, websocket, info)
    try:
        while True:
            payload = await websocket.receive_json()
            await presence_manager.handle_event(project_id, user_id, payload)
    except WebSocketDisconnect:
        await presence_manager.disconnect(project_id, user_id)
    except Exception as e:
        logger.warning("[devos-presence] socket error: %s", e)
        await presence_manager.disconnect(project_id, user_id)
