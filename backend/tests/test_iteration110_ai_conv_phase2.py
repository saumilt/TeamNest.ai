"""Iteration 110 — AI Conversation Mode Phase 2 (Batch 1).

Covers:
 - user preferences GET/PUT
 - workspace settings GET/PUT + non-admin 403
 - security settings GET/PUT (+ negative-days validation)
 - provisioned-accounts list + rotate
 - roles picker (member-accessible)
 - save-to-role staging
 - temp-password expiry logic (services.workspace_settings.temp_password_expired)
"""
import os
import pytest
import requests

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or "https://nest-app-prep.preview.emergentagent.com").rstrip("/")

OWNER = {"email": "sam@funasia.net", "password": os.environ.get("SUPERADMIN_TEST_PASSWORD", "")}
MEMBER = {"email": "mate1@test.io", "password": "secret123"}
# raj is a true 'member' role (not owner) — used to test RBAC 403s in his workspace.
MEMBER_ROLE = {"email": "raj@demo.team", "password": "Demo@2026"}


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def owner_token():
    return _login(**OWNER)


@pytest.fixture(scope="module")
def member_token():
    return _login(**MEMBER)


@pytest.fixture(scope="module")
def member_role_token():
    return _login(**MEMBER_ROLE)


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ── Preferences ─────────────────────────────────────────────────────────────
class TestPreferences:
    def test_get_preferences_shape(self, owner_token):
        r = requests.get(f"{BASE}/api/ai-conversation/preferences", headers=_h(owner_token), timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert set(body.keys()) >= {"preferences", "workspace", "effective"}
        prefs = body["preferences"]
        for k in [
            "auto_continue_enabled", "session_timeout_minutes",
            "follow_up_threshold", "show_recipient_indicator", "ask_when_ambiguous",
        ]:
            assert k in prefs
        eff = body["effective"]
        assert "enabled" in eff and "timeout_minutes" in eff and "ask_when_ambiguous" in eff

    def test_put_preferences_and_persistence(self, owner_token):
        # mutate: turn off auto_continue + ask_when_ambiguous
        r = requests.put(
            f"{BASE}/api/ai-conversation/preferences",
            headers=_h(owner_token),
            json={
                "auto_continue_enabled": False,
                "ask_when_ambiguous": False,
                "session_timeout_minutes": 15,
                "follow_up_threshold": 0.6,
                "show_recipient_indicator": True,
            },
            timeout=30,
        )
        assert r.status_code == 200
        p = r.json()["preferences"]
        assert p["auto_continue_enabled"] is False
        assert p["ask_when_ambiguous"] is False
        assert p["session_timeout_minutes"] == 15
        assert p["follow_up_threshold"] == 0.6

        # verify GET reflects it AND effective.enabled becomes False
        r = requests.get(f"{BASE}/api/ai-conversation/preferences", headers=_h(owner_token), timeout=30)
        eff = r.json()["effective"]
        assert eff["enabled"] is False
        assert eff["ask_when_ambiguous"] is False
        assert eff["timeout_minutes"] == 15

    def test_reset_owner_prefs_to_defaults(self, owner_token):
        """RESET sam's prefs to app defaults so downstream flows are unaffected."""
        r = requests.put(
            f"{BASE}/api/ai-conversation/preferences",
            headers=_h(owner_token),
            json={
                "auto_continue_enabled": True,
                "ask_when_ambiguous": True,
                "session_timeout_minutes": 30,
                "follow_up_threshold": 0.75,
                "show_recipient_indicator": True,
            },
            timeout=30,
        )
        assert r.status_code == 200
        eff = requests.get(
            f"{BASE}/api/ai-conversation/preferences", headers=_h(owner_token), timeout=30
        ).json()["effective"]
        assert eff["enabled"] is True
        assert eff["ask_when_ambiguous"] is True


# ── Workspace settings ──────────────────────────────────────────────────────
class TestWorkspaceSettings:
    def test_owner_get_workspace_settings(self, owner_token):
        r = requests.get(
            f"{BASE}/api/ai-conversation/workspace-settings", headers=_h(owner_token), timeout=30
        )
        assert r.status_code == 200
        body = r.json()
        assert "ai_conversation" in body
        assert "security" in body
        assert body["can_edit"] is True
        for k in ["enabled", "default_timeout_minutes", "follow_up_threshold", "allow_in_group_chats"]:
            assert k in body["ai_conversation"]

    def test_member_get_workspace_settings_can_edit_false(self, member_role_token):
        r = requests.get(
            f"{BASE}/api/ai-conversation/workspace-settings", headers=_h(member_role_token), timeout=30
        )
        assert r.status_code == 200
        assert r.json()["can_edit"] is False

    def test_member_put_workspace_settings_403(self, member_role_token):
        r = requests.put(
            f"{BASE}/api/ai-conversation/workspace-settings",
            headers=_h(member_role_token),
            json={"enabled": False},
            timeout=30,
        )
        assert r.status_code == 403

    def test_owner_put_workspace_and_reset(self, owner_token):
        # flip enabled off
        r = requests.put(
            f"{BASE}/api/ai-conversation/workspace-settings",
            headers=_h(owner_token),
            json={"enabled": False, "allow_in_group_chats": True, "default_timeout_minutes": 20, "follow_up_threshold": 0.7},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["ai_conversation"]["enabled"] is False

        # RESET to defaults
        r = requests.put(
            f"{BASE}/api/ai-conversation/workspace-settings",
            headers=_h(owner_token),
            json={"enabled": True, "allow_in_group_chats": True, "default_timeout_minutes": 30, "follow_up_threshold": 0.75},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["ai_conversation"]["enabled"] is True


# ── Security settings ───────────────────────────────────────────────────────
class TestSecuritySettings:
    def test_owner_get_and_put(self, owner_token):
        r = requests.get(f"{BASE}/api/admin/security-settings", headers=_h(owner_token), timeout=30)
        assert r.status_code == 200
        assert "temp_password_expiry_days" in r.json()

        # PUT to 14, verify, then reset to 7
        r = requests.put(
            f"{BASE}/api/admin/security-settings",
            headers=_h(owner_token),
            json={"temp_password_expiry_days": 14},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["temp_password_expiry_days"] == 14

        r = requests.put(
            f"{BASE}/api/admin/security-settings",
            headers=_h(owner_token),
            json={"temp_password_expiry_days": 7},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["temp_password_expiry_days"] == 7

    def test_negative_days_rejected(self, owner_token):
        r = requests.put(
            f"{BASE}/api/admin/security-settings",
            headers=_h(owner_token),
            json={"temp_password_expiry_days": -1},
            timeout=30,
        )
        assert r.status_code == 400

    def test_member_forbidden(self, member_role_token):
        r = requests.get(f"{BASE}/api/admin/security-settings", headers=_h(member_role_token), timeout=30)
        assert r.status_code == 403
        r = requests.put(
            f"{BASE}/api/admin/security-settings",
            headers=_h(member_role_token),
            json={"temp_password_expiry_days": 3},
            timeout=30,
        )
        assert r.status_code == 403


# ── Provisioned accounts + rotate ───────────────────────────────────────────
class TestProvisioned:
    def test_owner_list(self, owner_token):
        r = requests.get(
            f"{BASE}/api/admin/provisioned-accounts", headers=_h(owner_token), timeout=30
        )
        assert r.status_code == 200
        body = r.json()
        assert "accounts" in body and "expiry_days" in body
        assert isinstance(body["accounts"], list)

    def test_member_forbidden(self, member_role_token):
        r = requests.get(
            f"{BASE}/api/admin/provisioned-accounts", headers=_h(member_role_token), timeout=30
        )
        assert r.status_code == 403

    def test_rotate_if_any(self, owner_token):
        body = requests.get(
            f"{BASE}/api/admin/provisioned-accounts", headers=_h(owner_token), timeout=30
        ).json()
        accts = body.get("accounts") or []
        if not accts:
            pytest.skip("no provisioned accounts in this workspace to rotate")
        # Don't rotate os@radciti.com — pick a non-os target if possible, else skip.
        target = next((a for a in accts if a.get("email") != "os@radciti.com"), None)
        if not target:
            pytest.skip("only os@radciti.com present; skipping rotation to avoid breaking docs")
        r = requests.post(
            f"{BASE}/api/admin/provisioned-accounts/{target['id']}/rotate",
            headers=_h(owner_token), timeout=30,
        )
        assert r.status_code == 200
        j = r.json()
        assert j["ok"] is True
        assert j["email"] == target["email"]
        assert isinstance(j["temporary_password"], str) and len(j["temporary_password"]) >= 12


# ── Roles picker + save-to-role ─────────────────────────────────────────────
class TestSaveToRole:
    def test_roles_owner(self, owner_token):
        r = requests.get(f"{BASE}/api/ai-conversation/roles", headers=_h(owner_token), timeout=30)
        assert r.status_code == 200
        roles = r.json()["roles"]
        assert isinstance(roles, list) and len(roles) >= 1
        for row in roles:
            assert "id" in row and "role_name" in row

    def test_roles_member_can_read(self, member_token):
        r = requests.get(f"{BASE}/api/ai-conversation/roles", headers=_h(member_token), timeout=30)
        # Member's workspace may have zero roles; that's still 200.
        assert r.status_code == 200
        assert isinstance(r.json().get("roles"), list)

    def _first_chat_id(self, tok):
        r = requests.get(f"{BASE}/api/chats", headers=_h(tok), timeout=30)
        if r.status_code != 200:
            return None
        chats = r.json() if isinstance(r.json(), list) else r.json().get("chats") or []
        return chats[0]["id"] if chats else None

    def test_save_to_role_owner_returns_pending_or_zero(self, owner_token):
        roles = requests.get(
            f"{BASE}/api/ai-conversation/roles", headers=_h(owner_token), timeout=30
        ).json()["roles"]
        if not roles:
            pytest.skip("no enterprise roles available")
        chat_id = self._first_chat_id(owner_token)
        if not chat_id:
            pytest.skip("no chats to test against")
        r = requests.post(
            f"{BASE}/api/chats/{chat_id}/save-to-role",
            headers=_h(owner_token),
            json={"role_id": roles[0]["id"]},
            timeout=60,
        )
        assert r.status_code in (200, 400)  # 400 only if truly empty chat
        if r.status_code == 200:
            body = r.json()
            assert "proposed" in body
            if body["proposed"] > 0:
                assert body.get("status") == "pending_review"
            else:
                assert "note" in body


# ── temp-password expiry logic (unit-ish through service) ───────────────────
class TestTempPasswordExpiryLogic:
    """We can't easily create an expired user via API without disturbing seeded
    accounts. So we validate the helper directly (imports are safe from the
    backend container: this test file runs there)."""

    def test_expiry_helper_matches_docs(self):
        import asyncio
        from services.workspace_settings import temp_password_expired
        # Not must_change_password => never expired
        assert asyncio.get_event_loop().run_until_complete(
            temp_password_expired({"must_change_password": False})
        ) is False
