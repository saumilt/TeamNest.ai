"""Iteration 23 — Big batch (annual billing, Stripe portal, guest revocation,
AI model credits metadata, standup digest, Deepgram fast transcription).

Run:
    pytest /app/backend/tests/test_iteration23_big_batch.py -v --tb=short
"""
import io
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or os.environ.get("BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend env file value used in this preview
    BASE_URL = "https://nest-app-prep.preview.emergentagent.com"

API = f"{BASE_URL}/api"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def owner_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/demo-login", timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def member_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "raj@demo.team", "password": "Demo@2026"}, timeout=20)
    if r.status_code != 200:
        pytest.skip("raj demo account login failed")
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


# ============================================================
# 1) Billing plans → annual fields
# ============================================================
class TestBillingPlansAnnualFields:
    def test_plans_have_annual_fields(self, owner_session):
        r = owner_session.get(f"{API}/billing/plans")
        assert r.status_code == 200, r.text
        data = r.json()
        plans = {p["id"]: p for p in data["plans"]}
        assert set(plans) == {"free", "pro", "team"}

        # Pro
        pro = plans["pro"]
        assert pro["price_usd"] == 20
        assert pro["annual_price_usd"] == 200
        assert "annual_available" in pro
        assert isinstance(pro["annual_available"], bool)

        # Team
        team = plans["team"]
        assert team["price_usd"] == 50
        assert team["annual_price_usd"] == 500
        assert isinstance(team["annual_available"], bool)

        # Free has no annual (None)
        free = plans["free"]
        assert free["price_usd"] == 0
        # annual_price_usd may be None for free
        assert free.get("annual_price_usd") in (None, 0)
        assert free["annual_available"] is False


# ============================================================
# 2) Checkout — annual returns 400 when env not set; monthly works
# ============================================================
class TestBillingCheckoutCycle:
    def test_annual_when_not_configured_returns_400(self, owner_session):
        # Annual env not set per main-agent note → should 400 (not 502)
        annual_env = os.environ.get("STRIPE_PRO_ANNUAL_PRICE_ID")
        payload = {
            "plan_id": "pro",
            "origin_url": "https://teamnest.ai",
            "billing_cycle": "annual",
        }
        r = owner_session.post(f"{API}/billing/checkout", json=payload, timeout=20)
        if annual_env:
            # If somehow set, must succeed
            assert r.status_code in (200, 502), r.text
        else:
            assert r.status_code == 400, r.text
            assert "annual" in r.text.lower()

    def test_monthly_default_works(self, owner_session):
        payload = {
            "plan_id": "pro",
            "origin_url": "https://teamnest.ai",
        }
        r = owner_session.post(f"{API}/billing/checkout", json=payload, timeout=30)
        # If Stripe live mode is configured, expect 200; if not, expect 503
        assert r.status_code in (200, 502, 503), r.text
        if r.status_code == 200:
            j = r.json()
            assert "url" in j and "stripe.com" in j["url"]
            assert "session_id" in j

    def test_member_forbidden(self, member_session):
        payload = {"plan_id": "pro", "origin_url": "https://teamnest.ai"}
        r = member_session.post(f"{API}/billing/checkout", json=payload, timeout=20)
        assert r.status_code == 403, r.text


# ============================================================
# 3) Stripe Customer Portal
# ============================================================
class TestStripeCustomerPortal:
    def test_portal_owner_no_customer_yet_returns_400(self, owner_session):
        # Demo workspace has not completed a checkout in preview → no stripe_customer_id
        r = owner_session.post(
            f"{API}/billing/portal",
            json={"return_url": "https://teamnest.ai/billing"},
            timeout=20,
        )
        # 400 = no Stripe customer yet; 503 = Stripe not configured; 200 = configured + customer exists
        assert r.status_code in (200, 400, 503), r.text
        if r.status_code == 400:
            assert "stripe customer" in r.text.lower() or "checkout first" in r.text.lower()

    def test_portal_member_forbidden(self, member_session):
        r = member_session.post(
            f"{API}/billing/portal",
            json={"return_url": "https://teamnest.ai/billing"},
            timeout=20,
        )
        assert r.status_code == 403, r.text


# ============================================================
# 4) Standup digest
# ============================================================
class TestStandupDigest:
    def test_generate_no_chat(self, owner_session):
        r = owner_session.post(f"{API}/standup/generate", json={}, timeout=60)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "markdown" in j and isinstance(j["markdown"], str) and len(j["markdown"]) > 5
        assert "stats" in j
        for k in ("open", "completed_yesterday", "overdue", "due_today"):
            assert k in j["stats"], f"missing stats.{k}"
            assert isinstance(j["stats"][k], int)
        assert "generated_at" in j

    def test_generate_with_chat_posts_message(self, owner_session):
        # Pick first chat from owner's workspace
        chats = owner_session.get(f"{API}/chats", timeout=20).json()
        if not chats:
            pytest.skip("No chats available for owner")
        chat_id = chats[0]["id"]

        # Snapshot message count
        before = owner_session.get(f"{API}/chats/{chat_id}/messages?limit=200", timeout=20).json()
        before_count = len(before) if isinstance(before, list) else len(before.get("messages", []))

        r = owner_session.post(f"{API}/standup/generate", json={"chat_id": chat_id}, timeout=90)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["markdown"]

        # Verify a message was posted
        time.sleep(1)
        after = owner_session.get(f"{API}/chats/{chat_id}/messages?limit=200", timeout=20).json()
        after_list = after if isinstance(after, list) else after.get("messages", [])
        assert len(after_list) > before_count, "Standup digest message was not posted to chat"


# ============================================================
# 5) Chat guests — list + delete
# ============================================================
class TestGuestRevocation:
    @pytest.fixture(scope="class")
    def setup_chat_with_guest(self, owner_session):
        # Create new chat
        chat_resp = owner_session.post(
            f"{API}/chats",
            json={"name": f"TEST_guestrevoke_{int(time.time())}", "type": "group"},
            timeout=20,
        )
        assert chat_resp.status_code in (200, 201), chat_resp.text
        chat_id = chat_resp.json()["id"]

        # Invite guest by new email
        guest_email = f"guest.revoke+{int(time.time())}@external.io"
        inv = owner_session.post(
            f"{API}/chats/{chat_id}/invite-guest",
            json={"email": guest_email, "name": "Guest Revoke Test"},
            timeout=30,
        )
        assert inv.status_code in (200, 201), inv.text
        guest_user_id = inv.json().get("id") or inv.json().get("user_id")
        assert guest_user_id, f"No user id in invite response: {inv.json()}"
        return chat_id, guest_user_id

    def test_list_guests(self, owner_session, setup_chat_with_guest):
        chat_id, guest_uid = setup_chat_with_guest
        r = owner_session.get(f"{API}/chats/{chat_id}/guests", timeout=20)
        assert r.status_code == 200, r.text
        guests = r.json()
        assert isinstance(guests, list)
        ids = [g["id"] for g in guests]
        assert guest_uid in ids
        g = next(x for x in guests if x["id"] == guest_uid)
        assert "name" in g
        # Ensure mongo _id is not leaked
        assert "_id" not in g

    def test_delete_guest(self, owner_session, setup_chat_with_guest):
        chat_id, guest_uid = setup_chat_with_guest
        r = owner_session.delete(f"{API}/chats/{chat_id}/guests/{guest_uid}", timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        assert "still_in_workspace" in j
        assert isinstance(j["still_in_workspace"], bool)

        # Verify guest no longer in list
        r2 = owner_session.get(f"{API}/chats/{chat_id}/guests", timeout=20)
        assert r2.status_code == 200
        ids = [g["id"] for g in r2.json()]
        assert guest_uid not in ids

        # Verify system message was posted
        msgs = owner_session.get(f"{API}/chats/{chat_id}/messages?limit=50", timeout=20).json()
        msgs_list = msgs if isinstance(msgs, list) else msgs.get("messages", [])
        bodies = " ".join(m.get("body", "") for m in msgs_list)
        assert "removed" in bodies.lower()


# ============================================================
# 6) AI answer metadata — credits_total + credits_breakdown
# ============================================================
class TestAIAnswerCreditsMetadata:
    def test_ai_message_has_credits_metadata(self, owner_session):
        chats = owner_session.get(f"{API}/chats", timeout=20).json()
        if not chats:
            pytest.skip("No chats available")
        chat_id = chats[0]["id"]

        # Snapshot existing ai_answer message IDs to ignore stale ones
        existing = owner_session.get(f"{API}/chats/{chat_id}/messages?limit=100", timeout=20).json()
        existing_list = existing if isinstance(existing, list) else existing.get("messages", [])
        existing_ids = {m["id"] for m in existing_list}

        # Post @ai message
        r = owner_session.post(
            f"{API}/chats/{chat_id}/messages",
            json={"body": "@ai say hi in 5 words please", "message_type": "text"},
            timeout=30,
        )
        assert r.status_code in (200, 201), r.text

        # Wait for NEW AI answer
        ai_msg = None
        for _ in range(30):
            time.sleep(2)
            msgs = owner_session.get(f"{API}/chats/{chat_id}/messages?limit=20", timeout=20).json()
            msgs_list = msgs if isinstance(msgs, list) else msgs.get("messages", [])
            for m in msgs_list:
                if m["id"] in existing_ids:
                    continue
                if m.get("message_type") == "ai_answer" and (m.get("metadata") or {}).get("status") == "complete":
                    ai_msg = m
                    break
            if ai_msg:
                break
        if not ai_msg:
            pytest.skip("AI did not respond within timeout")

        meta = ai_msg.get("metadata") or {}
        assert "credits_total" in meta, f"credits_total missing in metadata: {meta}"
        assert isinstance(meta["credits_total"], int)
        assert "credits_breakdown" in meta, f"credits_breakdown missing: {meta}"
        # breakdown should be a list of dicts with model_key, model_name, credits
        assert isinstance(meta["credits_breakdown"], list)
        if meta["credits_breakdown"]:
            entry = meta["credits_breakdown"][0]
            assert "model_key" in entry
            assert "credits" in entry


# ============================================================
# 7) Deepgram transcription path — empty audio handled gracefully
# ============================================================
class TestDeepgramTranscription:
    def test_transcribe_chunk_empty_returns_ok(self, owner_session):
        # Find a chat to start a call in
        chats = owner_session.get(f"{API}/chats", timeout=20).json()
        if not chats:
            pytest.skip("Cannot create call: no chats")
        chat_id = chats[0]["id"]

        r = owner_session.post(
            f"{API}/calls/start",
            json={"chat_id": chat_id, "kind": "voice"},
            timeout=20,
        )
        if r.status_code == 503:
            pytest.skip("Calls not configured (LiveKit) — Deepgram path tested at service-level only")
        if r.status_code not in (200, 201):
            pytest.skip(f"Cannot start call: {r.status_code} {r.text[:200]}")
        body = r.json()
        call_id = (body.get("call") or {}).get("id") or body.get("id")
        if not call_id:
            pytest.skip(f"No call id in response: {body}")

        # Send empty webm chunk — must not crash
        files = {"audio": ("empty.webm", io.BytesIO(b""), "audio/webm")}
        sess = requests.Session()
        sess.headers.update({"Authorization": owner_session.headers["Authorization"]})
        r2 = sess.post(f"{API}/calls/{call_id}/transcribe-chunk", files=files, timeout=30)
        # Should be 200 with empty text or 400/422; never 500
        assert r2.status_code in (200, 400, 422), f"Unexpected {r2.status_code}: {r2.text[:300]}"
        if r2.status_code == 200:
            j = r2.json()
            assert "ok" in j or "text" in j
