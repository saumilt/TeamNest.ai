"""
Backend tests for the new chat Integrations system (Iteration 7).

Covers:
- GET    /api/chats/{chat_id}/integrations (initially empty)
- POST   /api/chats/{chat_id}/integrations (incoming_webhook + api_fetch + validation)
- POST   /api/webhooks/incoming/{token}    (PUBLIC, no auth)
- POST   /api/webhooks/incoming/INVALID    (404)
- POST   /api/chats/{chat_id}/api-fetch    (real external HTTP, success + 502)
- DELETE /api/integrations/{id}            (and webhook 404 after delete)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://nest-app-prep.preview.emergentagent.com",
).rstrip("/")


# ---------- Helpers ----------

@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def fresh_chat_id(headers):
    """Create a brand new chat so we start with zero integrations."""
    # Get the demo workspace's other members to add as members.
    r = requests.get(f"{BASE_URL}/api/workspace/members", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    users = r.json()
    other_ids = [u["id"] for u in users][:2]  # require_user already added as a member by chat create
    payload = {
        "name": f"TEST_Integrations_{uuid.uuid4().hex[:6]}",
        "type": "group",
        "member_ids": other_ids,
    }
    r = requests.post(f"{BASE_URL}/api/chats", headers=headers, json=payload, timeout=20)
    assert r.status_code == 200, f"create chat failed: {r.status_code} {r.text}"
    return r.json()["id"]


# ---------- Tests ----------

class TestIntegrations:
    def test_empty_list_on_new_chat(self, headers, fresh_chat_id):
        r = requests.get(
            f"{BASE_URL}/api/chats/{fresh_chat_id}/integrations",
            headers=headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert data == []

    def test_create_incoming_webhook(self, headers, fresh_chat_id):
        r = requests.post(
            f"{BASE_URL}/api/chats/{fresh_chat_id}/integrations",
            headers=headers,
            json={"type": "incoming_webhook", "name": "Test Zapier"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data and isinstance(data["id"], str)
        assert data["type"] == "incoming_webhook"
        assert data["name"] == "Test Zapier"
        assert "secret_token" in data and len(data["secret_token"]) > 10
        assert data["webhook_url"] == f"/api/webhooks/incoming/{data['secret_token']}"
        # stash for later tests via class attr
        pytest.WEBHOOK_INT_ID = data["id"]
        pytest.WEBHOOK_TOKEN = data["secret_token"]

    def test_api_fetch_type_requires_url(self, headers, fresh_chat_id):
        r = requests.post(
            f"{BASE_URL}/api/chats/{fresh_chat_id}/integrations",
            headers=headers,
            json={"type": "api_fetch", "name": "Missing URL", "config": {}},
            timeout=20,
        )
        assert r.status_code == 400, r.text

    def test_api_fetch_type_create_ok(self, headers, fresh_chat_id):
        r = requests.post(
            f"{BASE_URL}/api/chats/{fresh_chat_id}/integrations",
            headers=headers,
            json={
                "type": "api_fetch",
                "name": "BTC Price",
                "config": {"url": "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"},
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["type"] == "api_fetch"
        assert data["config"]["url"].startswith("https://api.coingecko.com")
        # api_fetch should NOT carry a webhook_url
        assert "webhook_url" not in data

    def test_list_now_has_two(self, headers, fresh_chat_id):
        r = requests.get(
            f"{BASE_URL}/api/chats/{fresh_chat_id}/integrations",
            headers=headers, timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 2
        types = sorted(d["type"] for d in data)
        assert types == ["api_fetch", "incoming_webhook"]
        wh = next(d for d in data if d["type"] == "incoming_webhook")
        assert "webhook_url" in wh and wh["webhook_url"].startswith("/api/webhooks/incoming/")

    def test_public_webhook_post_creates_message(self, fresh_chat_id):
        token = pytest.WEBHOOK_TOKEN
        # NO Authorization header sent on purpose
        r = requests.post(
            f"{BASE_URL}/api/webhooks/incoming/{token}",
            json={"title": "Order #1234", "text": "New paid order", "source": "Zapier"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["ok"] is True
        assert isinstance(out["message_id"], str) and len(out["message_id"]) > 5

        # Verify it really landed in the chat
        # Need auth to read messages
        r2 = requests.post(f"{BASE_URL}/api/auth/demo-login", timeout=20)
        token2 = r2.json()["token"]
        h = {"Authorization": f"Bearer {token2}"}
        r3 = requests.get(f"{BASE_URL}/api/chats/{fresh_chat_id}/messages", headers=h, timeout=20)
        assert r3.status_code == 200
        msgs = r3.json()
        match = [m for m in msgs if m["id"] == out["message_id"]]
        assert len(match) == 1
        m = match[0]
        assert m["metadata"]["integration"] == "incoming_webhook"
        assert m["metadata"]["source"] == "Zapier"
        assert "Order #1234" in m["body"]
        assert "_via Zapier_" in m["body"]

    def test_public_webhook_invalid_token_404(self):
        r = requests.post(
            f"{BASE_URL}/api/webhooks/incoming/INVALID_TOKEN_XYZ",
            json={"text": "hello"},
            timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_api_fetch_endpoint_success(self, headers, fresh_chat_id):
        r = requests.post(
            f"{BASE_URL}/api/chats/{fresh_chat_id}/api-fetch",
            headers=headers,
            json={
                "url": "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
                "method": "GET",
                "label": "BTC",
            },
            timeout=40,
        )
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg["metadata"]["integration"] == "api_fetch"
        assert msg["metadata"]["status_code"] == 200
        assert "bitcoin" in msg["body"].lower() or "usd" in msg["body"].lower()

    def test_api_fetch_endpoint_502_on_bad_url(self, headers, fresh_chat_id):
        r = requests.post(
            f"{BASE_URL}/api/chats/{fresh_chat_id}/api-fetch",
            headers=headers,
            json={"url": "http://localhost:9/no-such-route", "method": "GET"},
            timeout=20,
        )
        assert r.status_code == 502, r.text
        assert "Fetch failed" in r.text

    def test_delete_integration_and_webhook_404(self, headers):
        int_id = pytest.WEBHOOK_INT_ID
        token = pytest.WEBHOOK_TOKEN
        r = requests.delete(
            f"{BASE_URL}/api/integrations/{int_id}", headers=headers, timeout=20
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Subsequent webhook POST must now 404
        r2 = requests.post(
            f"{BASE_URL}/api/webhooks/incoming/{token}",
            json={"text": "should fail"},
            timeout=15,
        )
        assert r2.status_code == 404, r2.text
