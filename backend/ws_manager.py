"""Simple in-memory WebSocket manager per chat room."""
from collections import defaultdict
from typing import Dict, Set

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.user_sockets: Dict[str, Set[WebSocket]] = defaultdict(set)

    async def connect(self, chat_id: str, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active[chat_id].add(websocket)
        self.user_sockets[user_id].add(websocket)

    def disconnect(self, chat_id: str, user_id: str, websocket: WebSocket) -> None:
        self.active.get(chat_id, set()).discard(websocket)
        self.user_sockets.get(user_id, set()).discard(websocket)

    async def broadcast(self, chat_id: str, payload: dict) -> None:
        dead = []
        for ws in list(self.active.get(chat_id, set())):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for d in dead:
            self.active[chat_id].discard(d)

    # ── User-level channel (app-wide, not tied to an open chat) ──────────────
    # Powers foreground incoming-call ringing: a client keeps one socket open
    # under its user id regardless of which screen it's on.
    async def connect_user(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.user_sockets[user_id].add(websocket)

    def disconnect_user(self, user_id: str, websocket: WebSocket) -> None:
        self.user_sockets.get(user_id, set()).discard(websocket)

    async def send_to_user(self, user_id: str, payload: dict) -> None:
        dead = []
        for ws in list(self.user_sockets.get(user_id, set())):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for d in dead:
            self.user_sockets.get(user_id, set()).discard(d)


manager = ConnectionManager()
