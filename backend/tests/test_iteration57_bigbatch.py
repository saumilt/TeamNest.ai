"""Iteration 57 big-batch tests:
- Governance policy with new keys (daily_push, daily_email, quiet_hours)
- Granular permissions: chat viewers (POST /chats/{id}/viewers)
- Resend service stub returns not_configured
- Quiet hours guard string present in dev_os_nightly_scan._tick_once
- OneSignal frontend files presence (sanity)
"""
import os
import asyncio
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for backend-local env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"


# ---------- shared fixtures ----------
@pytest.fixture(scope="module")
def amit_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "amit@demo.team", "password": "Demo@2026"})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def priya_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "priya@demo.team", "password": "Demo@2026"})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def raj_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "raj@demo.team", "password": "Demo@2026"})
    assert r.status_code == 200, r.text
    return s


def _me(s):
    return s.get(f"{API}/auth/me").json()


# ---------- Governance ----------
class TestGovernancePolicy:
    def test_get_governance_includes_new_keys(self, amit_session):
        r = amit_session.get(f"{API}/dev-os/governance")
        assert r.status_code == 200, r.text
        body = r.json()
        policy = body.get("policy", body)
        for k in ("daily_push_enabled", "daily_email_enabled", "quiet_hours_start", "quiet_hours_end", "nightly_scan_enabled"):
            assert k in policy, f"missing key {k} in policy: {list(policy.keys())}"

    def test_put_governance_persists_new_fields(self, amit_session):
        # Read current policy to be able to merge.
        cur = amit_session.get(f"{API}/dev-os/governance").json()
        policy = cur.get("policy", {})
        # Update fields
        update_payload = {
            **policy,
            "quiet_hours_start": 23,
            "quiet_hours_end": 8,
            "daily_email_enabled": True,
        }
        r = amit_session.put(f"{API}/dev-os/governance", json=update_payload)
        assert r.status_code == 200, r.text
        # Verify persistence via GET
        r2 = amit_session.get(f"{API}/dev-os/governance")
        assert r2.status_code == 200
        p = r2.json().get("policy", {})
        assert p["quiet_hours_start"] == 23
        assert p["quiet_hours_end"] == 8
        assert p["daily_email_enabled"] is True

        # Restore defaults so other tests don't break
        restore = {**p, "quiet_hours_start": 22, "quiet_hours_end": 7, "daily_email_enabled": False}
        amit_session.put(f"{API}/dev-os/governance", json=restore)


# ---------- Chat viewer permissions ----------
class TestChatViewerPermissions:
    @pytest.fixture(scope="class")
    def chat_setup(self, amit_session, raj_session, priya_session):
        amit = _me(amit_session)
        raj = _me(raj_session)
        priya = _me(priya_session)
        # Create a group chat with raj + priya as members
        r = amit_session.post(
            f"{API}/chats",
            json={
                "type": "group",
                "title": "TEST_viewer_group",
                "member_ids": [amit["id"], raj["id"], priya["id"]],
            },
        )
        assert r.status_code in (200, 201), r.text
        chat = r.json()
        chat_id = chat.get("id") or chat.get("chat", {}).get("id")
        assert chat_id
        yield {"chat_id": chat_id, "amit": amit, "raj": raj, "priya": priya}
        # cleanup
        try:
            amit_session.delete(f"{API}/chats/{chat_id}")
        except Exception:
            pass

    def test_creator_cannot_be_made_viewer(self, amit_session, chat_setup):
        chat_id = chat_setup["chat_id"]
        amit = chat_setup["amit"]
        r = amit_session.post(
            f"{API}/chats/{chat_id}/viewers",
            json={"user_id": amit["id"], "make_admin": True},
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_non_admin_cannot_toggle_viewer(self, raj_session, chat_setup):
        chat_id = chat_setup["chat_id"]
        priya = chat_setup["priya"]
        r = raj_session.post(
            f"{API}/chats/{chat_id}/viewers",
            json={"user_id": priya["id"], "make_admin": True},
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

    def test_make_viewer_then_block_post_then_restore(self, amit_session, raj_session, chat_setup):
        chat_id = chat_setup["chat_id"]
        raj = chat_setup["raj"]
        # Make raj a viewer
        r = amit_session.post(
            f"{API}/chats/{chat_id}/viewers",
            json={"user_id": raj["id"], "make_admin": True},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("is_viewer") is True

        # raj tries to post — should be 403
        r2 = raj_session.post(
            f"{API}/chats/{chat_id}/messages",
            json={"body": "hello", "message_type": "text"},
        )
        assert r2.status_code == 403, f"expected 403 got {r2.status_code}: {r2.text}"

        # restore
        r3 = amit_session.post(
            f"{API}/chats/{chat_id}/viewers",
            json={"user_id": raj["id"], "make_admin": False},
        )
        assert r3.status_code == 200, r3.text
        assert r3.json().get("is_viewer") is False

        # raj can post again
        r4 = raj_session.post(
            f"{API}/chats/{chat_id}/messages",
            json={"body": "hello again", "message_type": "text"},
        )
        assert r4.status_code in (200, 201), f"expected post success got {r4.status_code}: {r4.text}"

    def test_admin_bypasses_viewer_check(self, amit_session, chat_setup):
        # Even though amit is creator (admin), normal post should work
        chat_id = chat_setup["chat_id"]
        r = amit_session.post(
            f"{API}/chats/{chat_id}/messages",
            json={"body": "admin msg", "message_type": "text"},
        )
        assert r.status_code in (200, 201), r.text


# ---------- Resend service stub ----------
class TestResendService:
    def test_send_email_not_configured(self):
        # Ensure env not set in current process
        os.environ.pop("RESEND_API_KEY", None)
        os.environ.pop("RESEND_FROM", None)
        import sys
        sys.path.insert(0, "/app/backend")
        # Force re-import to re-read env
        if "services.resend_service" in sys.modules:
            del sys.modules["services.resend_service"]
        from services import resend_service  # noqa
        # Reload internals
        resend_service._API_KEY = os.environ.get("RESEND_API_KEY")
        resend_service._FROM = os.environ.get("RESEND_FROM")
        result = asyncio.run(
            resend_service.send_email(to=["test@x.io"], subject="t", html="<p>hi</p>")
        )
        assert result == {"ok": False, "reason": "not_configured"}, result


# ---------- Quiet hours guard in code ----------
class TestQuietHoursGuard:
    def test_nightly_scan_has_quiet_hours_check(self):
        with open("/app/backend/services/dev_os_nightly_scan.py") as f:
            src = f.read()
        assert "quiet_hours_start" in src
        assert "quiet_hours_end" in src
        assert "in quiet hours" in src
        # Sanity: reads from policy
        assert 'policy.get("quiet_hours_start")' in src or "policy.get('quiet_hours_start')" in src


# ---------- OneSignal frontend artifacts ----------
class TestOneSignalArtifacts:
    def test_onesignal_lib_exports(self):
        with open("/app/frontend/src/lib/onesignal.js") as f:
            src = f.read()
        for name in ("ensureOneSignal", "setOneSignalUser", "clearOneSignalUser", "requestPushPermission", "getOneSignalStatus"):
            assert f"export async function {name}" in src or f"export function {name}" in src, f"missing export {name}"

    def test_worker_file_exists(self):
        assert os.path.exists("/app/frontend/public/OneSignalSDKWorker.js")

    def test_env_has_onesignal_app_id(self):
        with open("/app/frontend/.env") as f:
            assert "REACT_APP_ONESIGNAL_APP_ID=" in f.read()

    def test_authcontext_binds_onesignal(self):
        with open("/app/frontend/src/context/AuthContext.jsx") as f:
            src = f.read()
        assert "setOneSignalUser" in src
        assert "clearOneSignalUser" in src
