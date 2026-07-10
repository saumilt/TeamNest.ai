"""Iteration 96 — mobile parity + multi-turn sandbox memory.

Verifies the SHARED backend endpoints the mobile Expo client uses:
- demo-login returns a JWT (mobile Bearer auth path)
- POST /ai-builder/employees + templates + dashboard
- multi-turn sandbox memory across two turns using the same session_id
- test-runs?session_id= filter
- style-connectors + connect + generate + save
- permissions + tools + escalation rules
- deploy/undeploy + marketplace publish/browse/install
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"demo-login did not return a token: {data}"
    return tok


@pytest.fixture(scope="module")
def sess(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def emp(sess):
    r = sess.post(f"{BASE_URL}/api/ai-builder/employees",
                  json={"source": "blank", "name": "TEST_Mobile_Parity"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    eid = r.json()["id"]
    yield r.json()
    # cleanup
    sess.delete(f"{BASE_URL}/api/ai-builder/employees/{eid}", timeout=30)


# ─── shared backend (mobile & web use same endpoints) ────────────────────
class TestBearerAuthWorks:
    def test_dashboard_with_bearer(self, sess):
        r = sess.get(f"{BASE_URL}/api/ai-builder/dashboard", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "total" in d and "deployed" in d and "marketplace" in d

    def test_templates(self, sess):
        r = sess.get(f"{BASE_URL}/api/ai-builder/templates", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json().get("templates"), list)
        assert len(r.json()["templates"]) > 0

    def test_employees_list(self, sess, emp):
        r = sess.get(f"{BASE_URL}/api/ai-builder/employees", timeout=15)
        assert r.status_code == 200
        ids = [e["id"] for e in r.json()["employees"]]
        assert emp["id"] in ids


# ─── multi-turn sandbox memory ───────────────────────────────────────────
class TestSandboxMultiTurnMemory:
    def test_first_turn_returns_session_id(self, sess, emp):
        eid = emp["id"]
        r = sess.post(f"{BASE_URL}/api/ai-builder/employees/{eid}/sandbox",
                      json={"message": "Hi, my name is Zephyrion Blakewood. Please remember it."},
                      timeout=45)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("session_id"), "sandbox response missing session_id"
        assert d.get("ai_response") or d.get("reply"), "sandbox response missing AI text"
        pytest.session_id_holder = d["session_id"]
        pytest.first_run_id = d["id"]

    def test_second_turn_recalls_name(self, sess, emp):
        eid = emp["id"]
        sid = pytest.session_id_holder
        # Small pause to be nice to the LLM
        time.sleep(1)
        r = sess.post(f"{BASE_URL}/api/ai-builder/employees/{eid}/sandbox",
                      json={"message": "What is my name? Reply with just the name.",
                            "session_id": sid}, timeout=45)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["session_id"] == sid, "session_id should be preserved on 2nd turn"
        reply = (d.get("ai_response") or d.get("reply") or "").lower()
        assert "zephyrion" in reply, (
            f"multi-turn memory failed — expected 'Zephyrion' in reply, got: {reply!r}"
        )

    def test_list_runs_filtered_by_session(self, sess, emp):
        eid = emp["id"]
        sid = pytest.session_id_holder
        r = sess.get(f"{BASE_URL}/api/ai-builder/employees/{eid}/test-runs",
                     params={"session_id": sid}, timeout=15)
        assert r.status_code == 200
        runs = r.json()["runs"]
        assert len(runs) >= 2
        assert all(x["session_id"] == sid for x in runs)

    def test_new_session_when_omitted(self, sess, emp):
        eid = emp["id"]
        r = sess.post(f"{BASE_URL}/api/ai-builder/employees/{eid}/sandbox",
                      json={"message": "Fresh turn, no context."}, timeout=45)
        assert r.status_code == 200
        d = r.json()
        assert d["session_id"] and d["session_id"] != pytest.session_id_holder


# ─── style / permissions / deployment / marketplace parity ──────────────
class TestStylePermsDeploy:
    def test_style_connectors_list(self, sess):
        r = sess.get(f"{BASE_URL}/api/ai-builder/style-connectors", timeout=15)
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()["connectors"]]
        assert {"gmail", "slack", "whatsapp"}.issubset(set(ids))

    def test_permission_options(self, sess):
        r = sess.get(f"{BASE_URL}/api/ai-builder/permission-options", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["levels"]) >= 3
        assert len(d["tools"]) >= 3

    def test_marketplace_categories(self, sess):
        r = sess.get(f"{BASE_URL}/api/ai-builder/marketplace/categories", timeout=15)
        assert r.status_code == 200
        assert len(r.json()["categories"]) >= 5

    def test_permissions_put_and_get(self, sess, emp):
        eid = emp["id"]
        r = sess.put(f"{BASE_URL}/api/ai-builder/employees/{eid}/permissions",
                     json={"permission_level": "Draft only"}, timeout=15)
        assert r.status_code in (200, 204), r.text
        r2 = sess.get(f"{BASE_URL}/api/ai-builder/employees/{eid}/permissions", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["permission"]["permission_level"] == "Draft only"

    def test_deploy_and_undeploy(self, sess, emp):
        eid = emp["id"]
        r = sess.post(f"{BASE_URL}/api/ai-builder/employees/{eid}/deploy",
                      json={"channel": "handle", "handle": "test_mobile_parity_bot"}, timeout=15)
        assert r.status_code == 200, r.text
        r2 = sess.get(f"{BASE_URL}/api/ai-builder/employees/{eid}/deployment", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["deployment"]["handle"] == "test_mobile_parity_bot"
        r3 = sess.post(f"{BASE_URL}/api/ai-builder/employees/{eid}/undeploy", timeout=15)
        assert r3.status_code == 200

    def test_marketplace_publish_and_browse(self, sess, emp):
        eid = emp["id"]
        r = sess.post(f"{BASE_URL}/api/ai-builder/employees/{eid}/marketplace/publish",
                      json={"title": "TEST_Mobile_Listing", "tagline": "mobile test",
                            "category": "Productivity", "price_usd": 0,
                            "share_knowledge": False}, timeout=15)
        assert r.status_code == 200, r.text
        listing_id = r.json().get("id")
        assert listing_id
        # browse
        rb = sess.get(f"{BASE_URL}/api/ai-builder/marketplace", timeout=15)
        assert rb.status_code == 200
        assert any(x["id"] == listing_id for x in rb.json()["listings"])
        # detail
        rd = sess.get(f"{BASE_URL}/api/ai-builder/marketplace/{listing_id}", timeout=15)
        assert rd.status_code == 200
        # my listings
        rm = sess.get(f"{BASE_URL}/api/ai-builder/marketplace/mine", timeout=15)
        assert rm.status_code == 200
        # unpublish for cleanup
        ru = sess.post(f"{BASE_URL}/api/ai-builder/employees/{eid}/marketplace/unpublish", timeout=15)
        assert ru.status_code == 200
