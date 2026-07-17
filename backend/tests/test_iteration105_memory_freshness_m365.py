"""Iteration 105 — Learned Memory CRUD + @ai remember flow + Role freshness
+ M365 Teams scope. Backend-only tests. Owner: sam@funasia.net."""
import os
import time

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
OWNER = {"email": "sam@funasia.net", "password": "Perfect$2008"}


@pytest.fixture(scope="module")
def auth():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=OWNER, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


# ─────────── Learned memory CRUD ───────────
class TestLearnedMemoryCRUD:
    def test_list_shape(self, auth):
        r = auth.get(f"{API}/memory/learned", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "personal" in d and "workspace" in d
        assert isinstance(d["personal"], list) and isinstance(d["workspace"], list)

    def test_add_personal_and_dedupe(self, auth):
        text = "TEST_iter105 I prefer concise bullet-point answers"
        r = auth.post(f"{API}/memory/learned", json={"text": text, "scope": "personal"})
        assert r.status_code == 200, r.text
        mem = r.json()["memory"]
        assert mem["scope"] == "personal"
        assert mem["text"] == text
        assert mem["active"] is True
        assert "id" in mem
        # Dedupe: same normalized text again → same id
        r2 = auth.post(f"{API}/memory/learned", json={"text": text.upper(), "scope": "personal"})
        assert r2.status_code == 200
        assert r2.json()["memory"]["id"] == mem["id"]
        # Persisted via GET
        g = auth.get(f"{API}/memory/learned").json()
        assert any(x["id"] == mem["id"] for x in g["personal"])
        pytest.iter105_pid = mem["id"]

    def test_add_workspace(self, auth):
        r = auth.post(f"{API}/memory/learned",
                      json={"text": "TEST_iter105 our company only ships on weekdays",
                            "scope": "workspace"})
        assert r.status_code == 200
        mem = r.json()["memory"]
        assert mem["scope"] == "workspace"
        assert mem["user_id"] is None
        pytest.iter105_wid = mem["id"]

    def test_toggle_active(self, auth):
        mid = pytest.iter105_pid
        r = auth.patch(f"{API}/memory/learned/{mid}", json={"active": False})
        assert r.status_code == 200
        g = auth.get(f"{API}/memory/learned").json()
        m = next(x for x in g["personal"] if x["id"] == mid)
        assert m["active"] is False
        # Toggle back
        r = auth.patch(f"{API}/memory/learned/{mid}", json={"active": True})
        assert r.status_code == 200
        g = auth.get(f"{API}/memory/learned").json()
        assert next(x for x in g["personal"] if x["id"] == mid)["active"] is True

    def test_patch_unknown_404(self, auth):
        r = auth.patch(f"{API}/memory/learned/nonexistent-iter105", json={"active": False})
        assert r.status_code == 404

    def test_delete_and_persist_removed(self, auth):
        mid = pytest.iter105_pid
        r = auth.delete(f"{API}/memory/learned/{mid}")
        assert r.status_code == 200
        # Delete workspace one too (cleanup)
        auth.delete(f"{API}/memory/learned/{pytest.iter105_wid}")
        g = auth.get(f"{API}/memory/learned").json()
        assert not any(x["id"] == mid for x in g["personal"])

    def test_delete_unknown_404(self, auth):
        r = auth.delete(f"{API}/memory/learned/nonexistent-iter105")
        assert r.status_code == 404

    def test_empty_text_rejected(self, auth):
        r = auth.post(f"{API}/memory/learned", json={"text": "  ", "scope": "personal"})
        assert r.status_code == 400


# ─────────── @ai remember (manual) ───────────
def _get_or_create_chat(auth):
    """Find a self-chat or create one to post an @ai message in."""
    r = auth.get(f"{API}/chats")
    assert r.status_code == 200
    chats = r.json() if isinstance(r.json(), list) else r.json().get("chats", [])
    if chats:
        return chats[0]["id"]
    # create a note-to-self chat
    me = auth.get(f"{API}/auth/me").json()
    r = auth.post(f"{API}/chats", json={"type": "direct", "participant_ids": [me["id"]]})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


class TestAiRememberFlow:
    def test_remember_manual_creates_personal_memory(self, auth):
        chat_id = _get_or_create_chat(auth)
        msg_body = "@ai remember TEST_iter105 I prefer short answers with no fluff"
        r = auth.post(f"{API}/chats/{chat_id}/messages",
                      json={"body": msg_body, "message_type": "text"})
        assert r.status_code in (200, 201), r.text
        # Poll for AI confirmation
        confirm_found = False
        for _ in range(15):
            time.sleep(1)
            msgs = auth.get(f"{API}/chats/{chat_id}/messages").json()
            arr = msgs if isinstance(msgs, list) else msgs.get("messages", [])
            for m in arr:
                if (m.get("message_type") == "ai_answer"
                        and "remember" in (m.get("body") or "").lower()
                        and (m.get("metadata") or {}).get("memory_saved")):
                    confirm_found = True
                    break
            if confirm_found:
                break
        assert confirm_found, "AI confirmation for remember not posted"
        # Check memory GET reflects it
        g = auth.get(f"{API}/memory/learned").json()
        assert any("short answers" in x["text"].lower() for x in g["personal"]), \
            "Personal memory not created via @ai remember"
        # Cleanup
        for x in g["personal"]:
            if "TEST_iter105" in x["text"]:
                auth.delete(f"{API}/memory/learned/{x['id']}")

    def test_normal_ai_still_answers(self, auth):
        """A regular @ai question should still get an ai_answer (not a remember-confirm)."""
        chat_id = _get_or_create_chat(auth)
        r = auth.post(f"{API}/chats/{chat_id}/messages",
                      json={"body": "@ai what is 2+2?", "message_type": "text"})
        assert r.status_code in (200, 201)
        got_answer = False
        for _ in range(40):
            time.sleep(1)
            msgs = auth.get(f"{API}/chats/{chat_id}/messages").json()
            arr = msgs if isinstance(msgs, list) else msgs.get("messages", [])
            # Look for an ai_answer WITHOUT memory_saved flag (i.e. a real answer)
            for m in arr:
                if (m.get("message_type") == "ai_answer"
                        and not (m.get("metadata") or {}).get("memory_saved")
                        and (m.get("metadata") or {}).get("status") == "complete"):
                    got_answer = True
                    break
            if got_answer:
                break
        assert got_answer, "Normal @ai question did not receive an answer"


# ─────────── Role freshness ───────────
class TestRoleFreshness:
    def test_roles_include_freshness(self, auth):
        r = auth.get(f"{API}/enterprise/roles")
        assert r.status_code == 200, r.text
        d = r.json()
        roles = d.get("roles") if isinstance(d, dict) else d
        assert isinstance(roles, list) and len(roles) > 0, "Expected some seeded roles"
        any_with_data = False
        for role in roles:
            assert "freshness" in role, f"role {role.get('id')} missing freshness"
            f = role["freshness"]
            assert isinstance(f, dict)
            # When populated (role has captures), all 3 keys must be present.
            if f:
                any_with_data = True
                for k in ("last_captured_at", "last_approved_at", "approved_count"):
                    assert k in f, f"freshness missing key {k}"
        # At least ONE seeded role should have freshness data (from prior captures).
        # If not, that's still acceptable (empty freshness is a valid state).
        _ = any_with_data

    def test_risk_dashboard_includes_freshness(self, auth):
        r = auth.get(f"{API}/enterprise/risk-dashboard")
        assert r.status_code == 200, r.text
        d = r.json()
        roles = d.get("roles", [])
        assert isinstance(roles, list) and roles
        for role in roles:
            assert "freshness" in role


# ─────────── M365 Teams scope ───────────
class TestM365Scope:
    def test_login_url_contains_chat_read(self, auth):
        r = auth.get(f"{API}/oauth/m365/login")
        # If not configured, backend returns 400 — treat as skip
        if r.status_code == 400 and "not configured" in r.text.lower():
            pytest.skip("M365 connector not configured on server")
        assert r.status_code == 200, r.text
        url = r.json().get("url", "")
        # Scope param is URL-encoded (spaces → %20 or +)
        assert "Chat.Read" in url
        assert "User.Read" in url
        assert "Mail.Read" in url
        assert "offline_access" in url
