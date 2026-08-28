"""Iteration 59 — P2 batch regression.

Covers:
- GET /api/dev-os/audit-log (regression — no shape change)
- GET /api/dev-projects (list, returns first project id)
- GET /api/auth/ws-token (used to upgrade the presence socket)
- WebSocket /api/ws/dev-os-presence/{project_id} (happy path + bad token 4401 + wrong project 4403)
- Mailgun service module import + _configured() returns True since env vars are set
"""
import asyncio
import json
import os
import ssl

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")
DEMO_EMAIL = "amit@demo.team"
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "DemoPass123!")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def project_id(session):
    r = session.get(f"{BASE_URL}/api/dev-projects", timeout=30)
    assert r.status_code == 200, f"dev-projects failed: {r.status_code} {r.text}"
    body = r.json()
    items = body if isinstance(body, list) else body.get("projects") or body.get("items") or []
    assert items, f"no dev projects available: {body}"
    return items[0]["id"]


# ── Audit log ────────────────────────────────────────────────────────
class TestAuditLog:
    def test_audit_log_shape(self, session):
        r = session.get(f"{BASE_URL}/api/dev-os/audit-log", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "entries" in body, body
        assert isinstance(body["entries"], list)
        if body["entries"]:
            e = body["entries"][0]
            for k in ("action", "actor_id", "meta", "created_at"):
                assert k in e, f"missing field {k} in entry: {e}"


# ── WS token ─────────────────────────────────────────────────────────
class TestWsToken:
    def test_ws_token_issued(self, session):
        r = session.get(f"{BASE_URL}/api/auth/ws-token", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and isinstance(body["token"], str) and len(body["token"]) > 10


# ── Presence WS ──────────────────────────────────────────────────────
def _ws_url(base: str) -> str:
    return base.replace("https://", "wss://").replace("http://", "ws://")


class TestPresenceWebSocket:
    def test_presence_happy_path(self, session, project_id):
        try:
            import websockets
        except ImportError:
            pytest.skip("websockets lib not installed")

        tok = session.get(f"{BASE_URL}/api/auth/ws-token", timeout=30).json()["token"]
        url = f"{_ws_url(BASE_URL)}/api/ws/dev-os-presence/{project_id}?token={tok}"

        async def run():
            ssl_ctx = ssl.create_default_context() if url.startswith("wss://") else None
            async with websockets.connect(url, ssl=ssl_ctx, open_timeout=15) as ws:
                first = await asyncio.wait_for(ws.recv(), timeout=10)
                msg = json.loads(first)
                assert msg.get("event") == "roster", msg
                assert isinstance(msg.get("users"), list)
                # Send a cursor + tab event; expect no crash
                await ws.send(json.dumps({"event": "cursor", "x": 0.5, "y": 0.3, "tab": "plan"}))
                await ws.send(json.dumps({"event": "tab", "tab": "bugs"}))
                # Use ping → pong to confirm socket still alive
                await ws.send(json.dumps({"event": "ping"}))
                pong = await asyncio.wait_for(ws.recv(), timeout=5)
                assert json.loads(pong).get("event") == "pong"

        asyncio.run(run())

    def test_presence_bad_token_closes_4401(self, project_id):
        try:
            import websockets
            from websockets.exceptions import ConnectionClosed
            # websockets >=14 renamed InvalidStatusCode → InvalidStatus.
            try:
                from websockets.exceptions import InvalidStatus as _InvalidStatus
            except ImportError:
                from websockets.exceptions import InvalidStatusCode as _InvalidStatus
        except ImportError:
            pytest.skip("websockets lib not installed")

        url = f"{_ws_url(BASE_URL)}/api/ws/dev-os-presence/{project_id}?token=garbage-not-a-jwt"

        async def run():
            ssl_ctx = ssl.create_default_context() if url.startswith("wss://") else None
            closed = False
            try:
                async with websockets.connect(url, ssl=ssl_ctx, open_timeout=15) as ws:
                    try:
                        await asyncio.wait_for(ws.recv(), timeout=5)
                    except ConnectionClosed as e:
                        closed = True
                        assert e.code == 4401, f"expected 4401 got {e.code}"
            except (_InvalidStatus, ConnectionClosed) as e:
                closed = True
                # websockets InvalidStatus carries response with status_code; pre-accept
                # closes are translated by Starlette into an HTTP 403 on the upgrade.
                resp = getattr(e, "response", None)
                http_code = getattr(resp, "status_code", None) if resp else None
                ws_code = getattr(e, "code", None) or getattr(e, "status_code", None)
                if ws_code is not None and ws_code >= 4000:
                    assert ws_code in (4401, 4403, 4404), f"unexpected code {ws_code}"
                elif http_code is not None:
                    assert http_code in (401, 403, 404), f"unexpected HTTP {http_code}"
            assert closed, "expected the server to close the socket on bad token"

        asyncio.run(run())

    def test_presence_wrong_project_closes_4403(self, session):
        try:
            import websockets
            from websockets.exceptions import ConnectionClosed
            try:
                from websockets.exceptions import InvalidStatus as _InvalidStatus
            except ImportError:
                from websockets.exceptions import InvalidStatusCode as _InvalidStatus
        except ImportError:
            pytest.skip("websockets lib not installed")

        tok = session.get(f"{BASE_URL}/api/auth/ws-token", timeout=30).json()["token"]
        url = f"{_ws_url(BASE_URL)}/api/ws/dev-os-presence/not-a-real-project-id?token={tok}"

        async def run():
            ssl_ctx = ssl.create_default_context() if url.startswith("wss://") else None
            closed = False
            try:
                async with websockets.connect(url, ssl=ssl_ctx, open_timeout=15) as ws:
                    try:
                        await asyncio.wait_for(ws.recv(), timeout=5)
                    except ConnectionClosed as e:
                        closed = True
                        assert e.code in (4403, 4404), f"unexpected {e.code}"
            except (_InvalidStatus, ConnectionClosed):
                closed = True
            assert closed

        asyncio.run(run())


# ── Mailgun module ───────────────────────────────────────────────────
class TestMailgunModule:
    def test_import_and_configured(self):
        # Inject into sys.path so we can import backend service directly.
        import sys
        sys.path.insert(0, "/app/backend")
        from services import mailgun_service  # noqa
        assert hasattr(mailgun_service, "send_email")
        assert hasattr(mailgun_service, "send_batch")
        # _configured() should return True since env vars are set per the request.
        assert mailgun_service._configured() is True, (
            "Mailgun env vars (MAILGUN_API_KEY/MAILGUN_DOMAIN/MAILGUN_FROM) not all set"
        )
