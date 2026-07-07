"""Iteration 24 — Native push device registration endpoint.

Verifies the device tokens API used by the Capacitor iOS/Android wrappers:
- POST /api/devices/register inserts a new device row
- POST again with same token upserts (no duplicate row, app_version updated)
- GET /api/devices lists registered devices for the current user
- DELETE /api/devices/register removes the row
"""
from __future__ import annotations

import os
import secrets as _secrets


# Generate a unique synthetic device token per test run so concurrent CI jobs
# don't collide. Override via env if needed in your pipeline.
DEVICE_TOKEN = os.environ.get("TEST_DEVICE_TOKEN") or f"test-device-{_secrets.token_urlsafe(16)}"


def _list(client, base_url):
    r = client.get(f"{base_url}/api/devices", timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def test_register_list_upsert_delete(auth_client, base_url):
    token = DEVICE_TOKEN

    # Clean slate
    auth_client.delete(f"{base_url}/api/devices/register?token={token}", timeout=15)

    # Register fresh
    r = auth_client.post(
        f"{base_url}/api/devices/register",
        json={"token": token, "platform": "ios", "app_version": "1.0.0"},
        timeout=15,
    )
    assert r.status_code == 200 and r.json()["ok"] is True

    devices = _list(auth_client, base_url)
    matched = [d for d in devices if d["token"] == token]
    assert len(matched) == 1
    assert matched[0]["platform"] == "ios"
    assert matched[0]["app_version"] == "1.0.0"

    # Re-register same token → upsert, no duplicate, app_version updated
    r = auth_client.post(
        f"{base_url}/api/devices/register",
        json={"token": token, "platform": "ios", "app_version": "1.0.1"},
        timeout=15,
    )
    assert r.status_code == 200

    devices = _list(auth_client, base_url)
    matched = [d for d in devices if d["token"] == token]
    assert len(matched) == 1, f"expected idempotent upsert, got {len(matched)}"
    assert matched[0]["app_version"] == "1.0.1"

    # Delete
    r = auth_client.delete(
        f"{base_url}/api/devices/register?token={token}", timeout=15
    )
    assert r.status_code == 200 and r.json()["ok"] is True

    devices = _list(auth_client, base_url)
    assert not any(d["token"] == token for d in devices)


def test_register_rejects_empty_token(auth_client, base_url):
    r = auth_client.post(
        f"{base_url}/api/devices/register",
        json={"token": "   ", "platform": "android"},
        timeout=15,
    )
    assert r.status_code == 400


def test_register_validates_platform(auth_client, base_url):
    r = auth_client.post(
        f"{base_url}/api/devices/register",
        json={"token": "abc", "platform": "windows-phone"},
        timeout=15,
    )
    assert r.status_code == 422  # FastAPI validation rejects unknown Literal value


def test_devices_requires_auth(api_client, base_url):
    bare = api_client
    # Strip any auth header so we test unauthenticated access
    bare_headers = {k: v for k, v in bare.headers.items() if k.lower() != "authorization"}
    import requests
    r = requests.get(f"{base_url}/api/devices", headers=bare_headers, timeout=15)
    assert r.status_code in (401, 403)
