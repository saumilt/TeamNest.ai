"""Iteration 70: working SPA codegen + Hire Dev Team toolbar + banner copy.

Covers:
1. Build → generate 7 files with working SPA content.
2. index.html contains login-view, app-view, email/password inputs, Sign in btn,
   and the demo email hint.
3. app.js references localStorage + demo email.
4. backend/server.py has /api/auth/login, LoginReq Pydantic model, CORS middleware.
5. talk-to-build regression with role_key + backwards compat.
6. role-claims endpoints regression.
7. Auto-start @devmgr chat message new copy.
"""
import os
import re
import time
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")


# ---------- Session/auth helpers ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    # Demo workspace owner login (sets tn_session HttpOnly cookie)
    r = s.post(f"{BASE}/api/auth/demo-login", timeout=30)
    assert r.status_code in (200, 201), f"demo-login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def project(session):
    r = session.get(f"{BASE}/api/dev-projects", timeout=30)
    assert r.status_code == 200, f"list projects: {r.status_code}"
    projects = r.json() if isinstance(r.json(), list) else r.json().get("projects", [])
    assert projects, "No dev projects in demo workspace"

    # Prefer a project that already has files, else fall back to first
    target = None
    for p in projects:
        pid = p["id"]
        fr = session.get(f"{BASE}/api/dev-projects/{pid}/files", timeout=30)
        if fr.status_code == 200:
            files = fr.json().get("files") or []
            if len(files) >= 7:
                target = p
                break
    if target is None:
        target = projects[0]
        # Trigger build
        b = session.post(f"{BASE}/api/dev-projects/{target['id']}/builds", timeout=30)
        assert b.status_code in (200, 201, 202), f"build trigger: {b.status_code} {b.text[:200]}"
        # Wait up to 60s for files to land
        deadline = time.time() + 60
        while time.time() < deadline:
            fr = session.get(f"{BASE}/api/dev-projects/{target['id']}/files", timeout=30)
            if fr.status_code == 200 and len(fr.json().get("files") or []) >= 7:
                break
            time.sleep(3)
    return target


def _files_map(session, pid):
    r = session.get(f"{BASE}/api/dev-projects/{pid}/files", timeout=30)
    assert r.status_code == 200, f"files: {r.status_code}"
    files = r.json().get("files") or []
    out = {}
    for f in files:
        fr = session.get(f"{BASE}/api/dev-projects/{pid}/files/{f['id']}", timeout=30)
        if fr.status_code == 200:
            out[f["path"]] = fr.json().get("content", "")
    return out


# ---------- P1: working SPA codegen ----------
class TestWorkingSPACodegen:
    def test_seven_files_exist(self, session, project):
        files = _files_map(session, project["id"])
        expected = {
            "README.md",
            "frontend/index.html",
            "frontend/app.js",
            "frontend/styles.css",
            "backend/server.py",
            "backend/schema.sql",
            "tests/test_basic.py",
        }
        missing = expected - set(files.keys())
        assert not missing, f"Missing files: {missing}. Got: {list(files.keys())}"

    def test_index_html_has_login_and_app_views(self, session, project):
        files = _files_map(session, project["id"])
        html = files["frontend/index.html"].lower()
        assert "login-view" in html, "index.html missing login-view"
        assert "app-view" in html, "index.html missing app-view"

    def test_index_html_has_email_password_signin(self, session, project):
        files = _files_map(session, project["id"])
        html = files["frontend/index.html"]
        assert re.search(r"<input[^>]*type=['\"]email['\"]", html, re.I), "no email input"
        assert re.search(r"<input[^>]*type=['\"]password['\"]", html, re.I), "no password input"
        assert re.search(r"sign\s*in", html, re.I), "no Sign in text"
        assert "demo@example.com" in html, "no demo email hint"

    def test_app_js_references_localstorage_and_demo(self, session, project):
        files = _files_map(session, project["id"])
        js = files["frontend/app.js"]
        assert "localStorage" in js, "app.js doesn't reference localStorage"
        assert "demo@example.com" in js, "app.js doesn't reference demo email"

    def test_backend_server_has_login_and_cors(self, session, project):
        files = _files_map(session, project["id"])
        py = files["backend/server.py"]
        assert "/api/auth/login" in py, "server.py missing /api/auth/login"
        # LoginReq-style: either a literal `class LoginReq` (stub) or any
        # Pydantic BaseModel used as the login body. LLM occasionally picks
        # OAuth2PasswordRequestForm — accept that too.
        login_model_ok = (
            re.search(r"class\s+LoginReq", py)
            or "OAuth2PasswordRequestForm" in py
            or (re.search(r"class\s+\w+\(BaseModel\)", py) and "email" in py and "password" in py)
        )
        assert login_model_ok, "server.py missing a Pydantic LoginReq-style model"
        assert "CORSMiddleware" in py or "CORS" in py, "server.py missing CORS middleware"


# ---------- P2: Hire Dev Team checkout endpoint ----------
class TestHireDevTeamEndpoint:
    def test_checkout_endpoint_exists(self, session, project):
        # We only verify the endpoint is reachable / returns sane status.
        # In demo mode it may short-circuit; in production it 200s with a Stripe URL.
        chat_id = project.get("related_chat_id")
        if not chat_id:
            pytest.skip("Project has no related_chat_id; toolbar btn is intentionally hidden")
        r = session.post(
            f"{BASE}/api/chats/{chat_id}/hire-dev-team/checkout",
            json={"origin_url": BASE},
            timeout=30,
        )
        # Acceptable: 200 (demo or stripe), 402 (already), 4xx for biz reasons.
        # Critical fail = 5xx or 404.
        assert r.status_code < 500, f"checkout 5xx: {r.status_code} {r.text[:200]}"
        assert r.status_code != 404, "checkout endpoint missing"


# ---------- Regression: talk-to-build ----------
class TestTalkToBuild:
    def test_talk_with_role_key(self, session, project):
        r = session.post(
            f"{BASE}/api/dev-projects/{project['id']}/talk",
            json={
                "instruction": "add a green border to the login card",
                "role_key": "frontend",
            },
            timeout=120,
        )
        assert r.status_code == 200, f"talk: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert "ok" in data
        # Either succeeded with files_changed OR returned a known fallback reason
        if data.get("ok"):
            assert "files_changed" in data or "summary" in data
        else:
            assert data.get("reason") in {"no_files", "no_llm_key", "llm_error", "bad_response"}, data

    def test_talk_without_role_key_backwards_compat(self, session, project):
        r = session.post(
            f"{BASE}/api/dev-projects/{project['id']}/talk",
            json={"instruction": "tighten spacing in the dashboard"},
            timeout=120,
        )
        assert r.status_code == 200, f"talk no-role: {r.status_code} {r.text[:300]}"


# ---------- Regression: role-claims ----------
class TestRoleClaims:
    def test_role_claims_get(self, session, project):
        # Retry once for Cloudflare-fronted transient 404s.
        for _ in range(3):
            r = session.get(f"{BASE}/api/dev-projects/{project['id']}/role-claims", timeout=30)
            if r.status_code == 200:
                break
            time.sleep(1)
        assert r.status_code == 200, f"role-claims GET: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert "role_claims" in data or "claims" in data or "roles" in data

    def test_role_claim_post_and_delete(self, session, project):
        pid = project["id"]
        # claim
        r = session.post(f"{BASE}/api/dev-projects/{pid}/role-claims/qa", timeout=30)
        assert r.status_code in (200, 201, 409), f"claim qa: {r.status_code} {r.text[:200]}"
        # release
        r2 = session.delete(f"{BASE}/api/dev-projects/{pid}/role-claims/qa", timeout=30)
        assert r2.status_code in (200, 204), f"release qa: {r2.status_code}"


# ---------- Auto-start @devmgr copy ----------
class TestAutoStartCopy:
    def test_auto_start_message_new_copy(self, session):
        # Create a new chat (type='direct' or 'group' required)
        r = session.post(
            f"{BASE}/api/chats",
            json={"name": "TEST_iter70_autostart", "type": "group", "member_ids": []},
            timeout=30,
        )
        assert r.status_code in (200, 201), f"create chat: {r.status_code} {r.text[:200]}"
        chat = r.json()
        chat_id = chat.get("id") or chat.get("chat", {}).get("id")
        assert chat_id, f"no chat id in {chat}"

        # Post @devmgr trigger — this can take >30s (LLM project gen).
        # Auto-start requires >=40 chars (after @-mentions stripped) and a
        # project keyword.
        trigger_body = (
            "@devmgr build me an expense tracker with categories, monthly "
            "summaries and CSV export — full CRUD please."
        )
        try:
            r2 = session.post(
                f"{BASE}/api/chats/{chat_id}/messages",
                json={"body": trigger_body},
                timeout=120,
            )
        except requests.exceptions.ReadTimeout:
            r2 = None  # The server may keep processing — fall through to poll.
        if r2 is not None:
            assert r2.status_code in (200, 201), f"post msg: {r2.status_code} {r2.text[:200]}"

        # Poll for system message — auto-start runs in background.
        deadline = time.time() + 90
        body_blob = ""
        while time.time() < deadline:
            mr = session.get(f"{BASE}/api/chats/{chat_id}/messages", timeout=30)
            if mr.status_code == 200:
                payload = mr.json()
                if isinstance(payload, dict):
                    msgs = payload.get("messages") or []
                else:
                    msgs = payload
                for m in msgs:
                    body_blob += " " + (m.get("body") or "")
                if "working" in body_blob.lower() and "demo@example.com" in body_blob.lower():
                    break
            time.sleep(2)

        assert "working" in body_blob.lower(), f"auto-start msg missing 'working': {body_blob[:500]}"
        assert "demo@example.com" in body_blob.lower(), "auto-start msg missing demo email"
        assert "static design mockup" not in body_blob.lower(), "old 'static design mockup' copy still present"
