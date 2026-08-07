import asyncio, json, os as _os
import sys
sys.path.insert(0, "/app/backend")
import urllib.request
import websockets
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from auth_utils import create_short_lived_token

BASE = "http://localhost:8001"
load_dotenv("/app/backend/.env")
db = AsyncIOMotorClient(_os.environ["MONGO_URL"])[_os.environ["DB_NAME"]]


def req(path, method="GET", body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read().decode())


async def main():
    # Caller = demo user (amit); Ringee = another member of amit's group chat.
    demo = req("/api/auth/demo-login", "POST", {})
    tokA, aId = demo["token"], demo["user"]["id"]
    chatsA = req("/api/chats", headers={"Authorization": f"Bearer {tokA}"})
    grp = next((c for c in chatsA if c.get("type") == "group" and len(c.get("members") or c.get("member_ids") or []) > 1), None)
    if not grp:
        grp = next((c for c in chatsA if c.get("type") == "group"), None)
    doc = await db.chats.find_one({"id": grp["id"]}, {"_id": 0, "member_ids": 1, "name": 1})
    members = doc.get("member_ids", [])
    ringee = next((m for m in members if m != aId), None)
    if not ringee:
        print("no second member in", grp["id"]); return
    print("chat:", grp["id"], doc.get("name"), "| caller(amit)=", aId[:8], "ringee=", ringee[:8])

    wt = create_short_lived_token(ringee)
    got = {}

    async def listen():
        async with websockets.connect(f"ws://localhost:8001/api/ws/user?token={wt}") as ws:
            try:
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                    if msg.get("event") == "incoming_call":
                        got["incoming"] = msg["data"]; return
                    if msg.get("event") == "call_unring":
                        got["unring"] = msg["data"]
            except asyncio.TimeoutError:
                got["timeout"] = True

    task = asyncio.create_task(listen())
    await asyncio.sleep(1.0)
    call = req("/api/calls/start", "POST", {"chat_id": grp["id"], "mode": "video"}, {"Authorization": f"Bearer {tokA}"})
    call_id = (call.get("call") or call).get("id")
    print("amit started call:", call_id)
    try:
        await asyncio.wait_for(task, timeout=12)
    except asyncio.TimeoutError:
        pass

    print("[OK] ringee received incoming_call:" , got["incoming"]) if got.get("incoming") else print("[FAIL] no incoming_call (timeout=%s)" % got.get("timeout"))

    # Verify unring on end
    async def listen_unring():
        async with websockets.connect(f"ws://localhost:8001/api/ws/user?token={create_short_lived_token(ringee)}") as ws:
            try:
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=8))
                    if msg.get("event") == "call_unring":
                        got["unring"] = msg["data"]; return
            except asyncio.TimeoutError:
                pass

    t2 = asyncio.create_task(listen_unring())
    await asyncio.sleep(0.8)
    try:
        req(f"/api/calls/{call_id}/end", "POST", {}, {"Authorization": f"Bearer {tokA}"})
    except Exception as e:
        print("end err", e)
    try:
        await asyncio.wait_for(t2, timeout=9)
    except asyncio.TimeoutError:
        pass
    print("[OK] ringee received call_unring on end" if got.get("unring") else "[WARN] no call_unring received")


asyncio.run(main())
