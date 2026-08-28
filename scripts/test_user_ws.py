import os
import asyncio, json, os
import urllib.request
import websockets

BASE = "http://localhost:8001"


def post(path, body, headers=None):
    data = json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, method="POST",
                                 headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())


def get(path, headers=None):
    req = urllib.request.Request(BASE + path, headers=headers or {})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())


async def try_ws(url, label):
    try:
        async with websockets.connect(url) as ws:
            await ws.send(json.dumps({"event": "ping"}))
            msg = await asyncio.wait_for(ws.recv(), timeout=5)
            print(f"[OK] {label}: connected, got {msg}")
    except Exception as e:
        print(f"[FAIL] {label}: {type(e).__name__}: {e}")


async def main():
    login = post("/api/auth/login", {"email": "os@radciti.com", "password": os.environ.get("RADCITI_TEST_PASSWORD", "RadcitiPass123!")})
    tok = login.get("token") or login.get("access_token")
    print("login ok, token?", bool(tok), "keys:", list(login.keys()))
    wt = get("/api/auth/ws-token", {"Authorization": f"Bearer {tok}"})
    wsToken = wt.get("token")
    print("ws-token ok?", bool(wsToken))
    # a chat this user is in
    chats = get("/api/chats", {"Authorization": f"Bearer {tok}"})
    chat_id = (chats[0]["id"] if isinstance(chats, list) and chats else None)
    wsbase = "ws://localhost:8001"
    await try_ws(f"{wsbase}/api/ws/user?token={wsToken}", "ws/user")
    if chat_id:
        await try_ws(f"{wsbase}/api/ws/{chat_id}?token={wsToken}", "ws/{chat}")


asyncio.run(main())
