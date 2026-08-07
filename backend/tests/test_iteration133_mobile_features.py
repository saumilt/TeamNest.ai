"""Iteration 133 — mobile-only features backend coverage.

Covers the shared FastAPI backend that supports:
  1. Invite Timeline  (GET /api/workspace/members/{id}/invite-timeline)
  2. Reaction Overlay (POST /api/chats/{id}/reactions — ephemeral, no message)
  3. Call Recap card  (call_recap message posted by generate_and_post_recap)
  4. Call Ringing     (user WS: incoming_call + call_unring)
"""
import asyncio
import json
import os
import sys
import time

import pytest
import requests
import websockets

sys.path.insert(0, "/app/backend")

# Direct localhost (external ingress may 403 mutations without app session).
BASE = "http://localhost:8001"


# ---------------- shared helpers ----------------
def demo_login():
    r = requests.post(f"{BASE}/api/auth/demo-login", timeout=15)
    r.raise_for_status()
    d = r.json()
    return d["token"], d["user"]


def auth_hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def demo():
    tok, user = demo_login()
    return {"token": tok, "user": user}


@pytest.fixture(scope="module")
def group_chat(demo):
    r = requests.get(f"{BASE}/api/chats", headers=auth_hdr(demo["token"]), timeout=15)
    r.raise_for_status()
    target = next((c for c in r.json() if c.get("name") == "Marketing Site Refresh"), None)
    if not target:
        pytest.skip("Marketing Site Refresh chat not found")
    # Fetch full chat detail so we get the hydrated `members` list.
    r2 = requests.get(f"{BASE}/api/chats/{target['id']}", headers=auth_hdr(demo["token"]), timeout=15)
    r2.raise_for_status()
    return r2.json()


# ============ 1. Invite Timeline ============
class TestInviteTimeline:
    def test_returns_configured_email_events(self, demo, group_chat):
        # find a member other than amit
        other = next(
            (m for m in group_chat.get("members", []) if m.get("id") != demo["user"]["id"]),
            None,
        )
        assert other, "No second member on Marketing Site Refresh"
        r = requests.get(
            f"{BASE}/api/workspace/members/{other['id']}/invite-timeline",
            headers=auth_hdr(demo["token"]), timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "configured" in body
        assert "email" in body
        assert "events" in body and isinstance(body["events"], list)
        # oldest -> newest
        if len(body["events"]) >= 2:
            ts = [e.get("timestamp") or 0 for e in body["events"]]
            assert ts == sorted(ts)

    def test_unknown_member_returns_404(self, demo):
        r = requests.get(
            f"{BASE}/api/workspace/members/does-not-exist/invite-timeline",
            headers=auth_hdr(demo["token"]), timeout=15,
        )
        assert r.status_code == 404


# ============ 2. Reaction broadcast (no persistence) ============
class TestReactionOverlay:
    def test_reaction_returns_ok_and_does_not_persist_message(self, demo, group_chat):
        chat_id = group_chat["id"]
        # snapshot pre-count
        r0 = requests.get(
            f"{BASE}/api/chats/{chat_id}/messages",
            headers=auth_hdr(demo["token"]), timeout=15,
        )
        assert r0.status_code == 200
        pre_msgs = r0.json()
        pre_count = len(pre_msgs) if isinstance(pre_msgs, list) else len(pre_msgs.get("messages", []))
        pre_last_id = None
        if isinstance(pre_msgs, list) and pre_msgs:
            pre_last_id = pre_msgs[-1].get("id")

        # fire reaction
        r = requests.post(
            f"{BASE}/api/chats/{chat_id}/reactions",
            headers=auth_hdr(demo["token"]),
            data=json.dumps({"emoji": "🔥"}),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        time.sleep(0.4)

        # verify no new message was persisted (i.e. no emoji bubble)
        r1 = requests.get(
            f"{BASE}/api/chats/{chat_id}/messages",
            headers=auth_hdr(demo["token"]), timeout=15,
        )
        assert r1.status_code == 200
        post_msgs = r1.json() if isinstance(r1.json(), list) else r1.json().get("messages", [])
        post_count = len(post_msgs)
        assert post_count == pre_count, (
            f"Reaction should NOT persist a message. pre={pre_count} post={post_count}"
        )
        if pre_last_id and post_msgs:
            assert post_msgs[-1].get("id") == pre_last_id

    def test_reaction_empty_emoji_rejected(self, demo, group_chat):
        r = requests.post(
            f"{BASE}/api/chats/{group_chat['id']}/reactions",
            headers=auth_hdr(demo["token"]),
            data=json.dumps({"emoji": ""}),
            timeout=15,
        )
        assert r.status_code == 400

    def test_reaction_broadcasts_over_chat_ws(self, demo, group_chat):
        """Open chat WS as amit, POST reaction as amit, expect {event:'reaction'} received."""
        chat_id = group_chat["id"]

        async def run():
            # mint short-lived ws token
            wr = requests.get(f"{BASE}/api/auth/ws-token", headers=auth_hdr(demo["token"]), timeout=10)
            wtok = wr.json()["token"]
            got = {}
            async with websockets.connect(f"ws://localhost:8001/api/ws/{chat_id}?token={wtok}") as ws:
                async def listen():
                    try:
                        while True:
                            m = json.loads(await asyncio.wait_for(ws.recv(), timeout=6))
                            if m.get("event") == "reaction":
                                got["msg"] = m
                                return
                    except asyncio.TimeoutError:
                        pass
                t = asyncio.create_task(listen())
                await asyncio.sleep(0.4)
                requests.post(
                    f"{BASE}/api/chats/{chat_id}/reactions",
                    headers=auth_hdr(demo["token"]),
                    data=json.dumps({"emoji": "🎉"}),
                    timeout=10,
                )
                try:
                    await asyncio.wait_for(t, timeout=6)
                except asyncio.TimeoutError:
                    pass
            return got

        got = asyncio.run(run())
        assert got.get("msg"), "No reaction event received over chat WS"
        assert got["msg"]["data"]["emoji"] == "🎉"


# ============ 3. Call recap card (seeded demo) ============
class TestCallRecapCard:
    def test_seeded_recap_message_exists(self, demo, group_chat):
        r = requests.get(
            f"{BASE}/api/chats/{group_chat['id']}/messages",
            headers=auth_hdr(demo["token"]), timeout=20,
        )
        assert r.status_code == 200
        msgs = r.json() if isinstance(r.json(), list) else r.json().get("messages", [])
        recap = [m for m in msgs if m.get("message_type") == "call_recap"]
        assert recap, "Expected a seeded call_recap message in 'Marketing Site Refresh'"
        card = recap[-1]
        md = card.get("metadata") or {}
        highlights = md.get("highlights")
        assert isinstance(highlights, list) and len(highlights) >= 1
        for h in highlights:
            assert "kind" in h and "note" in h


# ============ 4. Call ringing user WS ============
class TestCallRinging:
    def test_user_ws_rejects_bad_token(self):
        async def run():
            try:
                async with websockets.connect("ws://localhost:8001/api/ws/user?token=bogus") as ws:
                    await asyncio.wait_for(ws.recv(), timeout=3)
            except Exception as e:
                return str(e)
            return "no-close"

        res = asyncio.run(run())
        # server closes with 4401 on invalid token
        assert "4401" in res or "closed" in res.lower() or "reject" in res.lower(), res

    def test_incoming_call_and_unring(self, demo, group_chat):
        """Caller = amit, ringee = another member. Expect incoming_call + call_unring."""
        from auth_utils import create_short_lived_token
        chat_id = group_chat["id"]
        ringee = next(
            (m for m in group_chat.get("members", []) if m.get("id") != demo["user"]["id"]),
            None,
        )
        assert ringee, "no second member"
        wtok = create_short_lived_token(ringee["id"])

        async def run():
            got = {}
            async with websockets.connect(f"ws://localhost:8001/api/ws/user?token={wtok}") as ws:
                async def listen():
                    try:
                        while True:
                            m = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                            ev = m.get("event")
                            if ev == "incoming_call":
                                got["incoming"] = m["data"]
                            elif ev == "call_unring":
                                got["unring"] = m["data"]
                                return
                    except asyncio.TimeoutError:
                        pass

                task = asyncio.create_task(listen())
                await asyncio.sleep(0.6)
                # start call as amit
                r = requests.post(
                    f"{BASE}/api/calls/start",
                    headers=auth_hdr(demo["token"]),
                    data=json.dumps({"chat_id": chat_id, "mode": "video"}),
                    timeout=15,
                )
                assert r.status_code == 200, r.text
                call = (r.json().get("call") or r.json())
                call_id = call["id"]
                await asyncio.sleep(1.2)
                # end call → expect call_unring
                requests.post(
                    f"{BASE}/api/calls/{call_id}/end",
                    headers=auth_hdr(demo["token"]),
                    data=json.dumps({}),
                    timeout=15,
                )
                try:
                    await asyncio.wait_for(task, timeout=10)
                except asyncio.TimeoutError:
                    pass
            return got, call_id

        got, call_id = asyncio.run(run())
        assert got.get("incoming"), "No incoming_call event"
        assert got["incoming"]["call_id"] == call_id
        assert got["incoming"]["from_id"] == demo["user"]["id"]
        assert got["incoming"]["mode"] == "video"
        assert got["incoming"]["chat_name"] == group_chat["name"]
        assert got.get("unring"), "No call_unring event"
        assert got["unring"]["call_id"] == call_id
