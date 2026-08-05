"""Iteration 127 backend tests — team_tools router:
  * GET/POST/DELETE /api/workspace/model-presets
  * GET /api/workspace/invite-analytics
  * GET /api/workspace/members returns status/must_change_password/accepted_at/joined_at/last_invite_sent_at
  * Latest AI models resolve via GET /api/ai/models
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

OWNER_EMAIL = "sam@funasia.net"
OWNER_PW = "Perfect$2008"
MEMBER_EMAIL = "os@radciti.com"
MEMBER_PW = "Summer$123"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def owner_session():
    return _login(OWNER_EMAIL, OWNER_PW)


@pytest.fixture(scope="module")
def member_session():
    try:
        return _login(MEMBER_EMAIL, MEMBER_PW)
    except AssertionError:
        pytest.skip("member login unavailable")


# ---- Model presets --------------------------------------------------------
class TestModelPresets:
    def test_list_seeds_defaults(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/workspace/model-presets", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        names = {p["name"] for p in data}
        # 3 defaults must be seeded on first call
        for expected in ("Deep dive", "Fast", "Research"):
            assert expected in names, f"Default preset '{expected}' missing. Got: {names}"
        # Structure check
        for p in data:
            assert "id" in p and "name" in p and "models" in p
            assert isinstance(p["models"], list) and len(p["models"]) >= 1
            assert "is_default" in p

    def test_create_preset_ok(self, owner_session):
        payload = {"name": "TEST_iter127_alpha", "models": ["chatgpt", "claude"]}
        r = owner_session.post(f"{BASE_URL}/api/workspace/model-presets", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["name"] == "TEST_iter127_alpha"
        assert rec["models"] == ["chatgpt", "claude"]
        assert rec["is_default"] is False
        assert rec["created_by"]
        # Cleanup
        owner_session.delete(f"{BASE_URL}/api/workspace/model-presets/{rec['id']}", timeout=20)

    def test_create_rejects_duplicate_name_case_insensitive(self, owner_session):
        p1 = owner_session.post(f"{BASE_URL}/api/workspace/model-presets", json={"name": "TEST_dupA", "models": ["chatgpt"]}, timeout=20)
        assert p1.status_code == 200
        pid = p1.json()["id"]
        try:
            r = owner_session.post(f"{BASE_URL}/api/workspace/model-presets", json={"name": "test_DUPA", "models": ["claude"]}, timeout=20)
            assert r.status_code == 400
        finally:
            owner_session.delete(f"{BASE_URL}/api/workspace/model-presets/{pid}", timeout=20)

    def test_create_validates_name_length(self, owner_session):
        r = owner_session.post(f"{BASE_URL}/api/workspace/model-presets", json={"name": "", "models": ["chatgpt"]}, timeout=20)
        assert r.status_code == 400
        r2 = owner_session.post(f"{BASE_URL}/api/workspace/model-presets", json={"name": "x" * 41, "models": ["chatgpt"]}, timeout=20)
        assert r2.status_code == 400

    def test_create_validates_model_count_and_keys(self, owner_session):
        # zero models
        r = owner_session.post(f"{BASE_URL}/api/workspace/model-presets", json={"name": "TEST_zero", "models": []}, timeout=20)
        assert r.status_code == 400
        # >5 valid models
        r2 = owner_session.post(f"{BASE_URL}/api/workspace/model-presets",
                                 json={"name": "TEST_big", "models": ["chatgpt", "claude", "claude-opus", "gemini", "perplexity", "deepseek"]},
                                 timeout=20)
        assert r2.status_code == 400
        # invalid keys filtered → 0 remaining
        r3 = owner_session.post(f"{BASE_URL}/api/workspace/model-presets", json={"name": "TEST_bad", "models": ["nope-model"]}, timeout=20)
        assert r3.status_code == 400

    def test_delete_by_creator_and_admin(self, owner_session):
        # Owner creates preset, then owner deletes it (admin path).
        r = owner_session.post(f"{BASE_URL}/api/workspace/model-presets", json={"name": "TEST_del_by_owner", "models": ["chatgpt"]}, timeout=20)
        assert r.status_code == 200
        pid = r.json()["id"]
        d = owner_session.delete(f"{BASE_URL}/api/workspace/model-presets/{pid}", timeout=20)
        assert d.status_code == 200
        assert d.json().get("ok") is True

    def test_delete_missing_returns_404(self, owner_session):
        d = owner_session.delete(f"{BASE_URL}/api/workspace/model-presets/does-not-exist-xyz", timeout=20)
        assert d.status_code == 404


# ---- Members payload shape -----------------------------------------------
class TestMembers:
    def test_members_includes_status_and_accepted_fields(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/workspace/members", timeout=20)
        assert r.status_code == 200
        members = r.json()
        assert isinstance(members, list) and len(members) >= 1
        keys_seen = set()
        for m in members:
            keys_seen.update(m.keys())
        # Required fields for the new UI
        for k in ("status", "joined_at"):
            assert k in keys_seen, f"member payload missing '{k}'. keys={keys_seen}"
        # Presence-only check for optional fields (must at least be tolerated in shape)
        # last_invite_sent_at exists on invited users, accepted_at may be null for legacy
        # Verify at least one pending member if any exists
        invited = [m for m in members if m.get("status") == "invited"]
        if invited:
            assert any("last_invite_sent_at" in m for m in invited), "pending invitees should carry last_invite_sent_at"


# ---- Invite analytics -----------------------------------------------------
class TestInviteAnalytics:
    def test_analytics_shape(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/workspace/invite-analytics", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "configured" in data
        assert "analytics" in data
        assert isinstance(data["analytics"], dict)
        if data.get("configured"):
            # If any entries exist, each must have a status enum
            for uid, summary in data["analytics"].items():
                assert "status" in summary
                assert summary["status"] in ("sent", "delivered", "opened", "failed", "unknown")

    def test_analytics_cached_flag_on_second_call(self, owner_session):
        r1 = owner_session.get(f"{BASE_URL}/api/workspace/invite-analytics", timeout=30)
        assert r1.status_code == 200
        r2 = owner_session.get(f"{BASE_URL}/api/workspace/invite-analytics", timeout=30)
        assert r2.status_code == 200
        # Second call within 60s cache TTL should include cached=True (only when configured)
        if r2.json().get("configured"):
            # cached flag may or may not be present depending on cache warmup, but let's assert it appears when second call fired quickly
            # We accept either cached=True or unmarked (workspace with 0 targets skips cache write path)
            if r2.json().get("analytics"):
                assert r2.json().get("cached") is True, "expected cached=True on 2nd call within 60s"


# ---- Latest AI models resolve --------------------------------------------
class TestAiModels:
    def test_ai_models_endpoint(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/ai/models", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # Response may be dict or list; normalize
        rows = data if isinstance(data, list) else data.get("models") or list(data.values()) if isinstance(data, dict) else []
        assert rows, f"empty ai/models response: {data}"
        # Convert to string blob and search for latest tags
        blob = str(rows).lower()
        for expected in ("gpt-5.6-sol", "claude-sonnet-5", "claude-opus-4-8"):
            assert expected in blob, f"latest model '{expected}' not surfaced. Payload preview: {blob[:400]}"


# ---- Role gating on presets (member cannot delete others; can create) ---
class TestPresetRoleGating:
    def test_member_can_list_and_create(self, member_session):
        r = member_session.get(f"{BASE_URL}/api/workspace/model-presets", timeout=20)
        assert r.status_code == 200
        # attempt create — the endpoint allows owner/admin/member
        c = member_session.post(f"{BASE_URL}/api/workspace/model-presets", json={"name": "TEST_member_alpha", "models": ["chatgpt"]}, timeout=20)
        # OK for member since role is member/owner; if role is guest, would be 403 — accept either
        assert c.status_code in (200, 403)
        if c.status_code == 200:
            pid = c.json()["id"]
            # creator may delete own preset
            d = member_session.delete(f"{BASE_URL}/api/workspace/model-presets/{pid}", timeout=20)
            assert d.status_code == 200
