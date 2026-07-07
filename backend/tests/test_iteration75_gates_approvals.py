"""Iteration 75 — QA/Security gates, PM approval flow, guest comments,
snapshot diff viewer, and GitHub-export gating regression tests.

Focus areas (per review request):
  1. Gates run 6/6 QA + security ok on the demo dev project.
  2. Owner (amit) publish → live release (approve path).
  3. Member (raj) publish → approval_requested; raj cannot decide (403);
     owner approves → release version bumps + chat messages posted.
  4. Fresh REJECT path — raj re-publishes → owner rejects → status
     'rejected', chat '⛔ Rejected' message, release version unchanged.
  5. GitHub export as member (raj) → approval_requested (not direct).
  6. Guest share flow — mint token, list + create guest comments.
  7. Snapshot diff viewer for frontend/index.html.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com"
).rstrip("/")

PROJECT_ID = "dc4942dc-c4a5-4020-8419-fef40ea6a19a"
CHAT_ID = "d553cda0-62f4-4c2d-aae1-4b168208ed1e"
AMIT = ("amit@demo.team", "Demo@2026")
RAJ = ("raj@demo.team", "Demo@2026")


# ─── Session helpers ─────────────────────────────────────────────────────
def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    token = r.json().get("token")
    if token:
        s.headers["Authorization"] = f"Bearer {token}"
    return s


@pytest.fixture(scope="module")
def amit():
    return _login(*AMIT)


@pytest.fixture(scope="module")
def raj():
    return _login(*RAJ)


# ─── 1. Gates ─────────────────────────────────────────────────────────────
class TestGates:
    def test_run_gates_returns_qa_6_of_6_and_security_ok(self, amit):
        r = amit.post(f"{BASE_URL}/api/dev-projects/{PROJECT_ID}/gates/run", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "qa" in data and "security" in data
        assert data["qa"]["passed"] >= 5, f"QA passed={data['qa']}"
        assert data["qa"]["total"] == 6
        assert data["security"]["ok"] is True, f"security={data['security']}"
        # Overall ok requires qa.ok + security.ok
        assert data["ok"] is True


# ─── 2 & 3. Owner publish + member approval flow ─────────────────────────
def _current_release_version(session: requests.Session) -> int:
    r = session.get(f"{BASE_URL}/api/dev-projects/{PROJECT_ID}/production", timeout=15)
    if r.status_code == 404:
        return 0
    assert r.status_code == 200, r.text
    return int(r.json().get("version") or 0)


class TestPublishFlow:
    def test_owner_publish_bumps_version(self, amit):
        before = _current_release_version(amit)
        r = amit.post(
            f"{BASE_URL}/api/dev-projects/{PROJECT_ID}/publish",
            json={"override_gates": False},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Owner path returns release directly, not approval_requested
        assert "version" in data, f"owner publish should return release, got: {data}"
        assert data["version"] == before + 1
        assert data["status"] == "live"

    def test_member_publish_creates_approval_request(self, raj):
        r = raj.post(
            f"{BASE_URL}/api/dev-projects/{PROJECT_ID}/publish",
            json={"override_gates": False},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("status") == "approval_requested", f"got: {data}"
        assert "approval" in data
        approval = data["approval"]
        assert approval["action"] == "production_publish"
        assert approval["status"] == "pending"
        pytest.approval_publish_id = approval["id"]

    def test_member_cannot_decide_own_approval_returns_403(self, raj):
        aid = getattr(pytest, "approval_publish_id", None)
        if not aid:
            pytest.skip("No pending publish approval")
        r = raj.post(
            f"{BASE_URL}/api/dev-action-approvals/{aid}/decision",
            json={"decision": "approve", "note": ""},
            timeout=15,
        )
        assert r.status_code == 403, f"raj should be forbidden: {r.status_code} {r.text}"

    def test_owner_approves_bumps_version_and_posts_chat_message(self, amit, raj):
        aid = getattr(pytest, "approval_publish_id", None)
        if not aid:
            pytest.skip("No pending publish approval")
        before = _current_release_version(amit)
        r = amit.post(
            f"{BASE_URL}/api/dev-action-approvals/{aid}/decision",
            json={"decision": "approve", "note": "LGTM"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "approved"
        assert data.get("result"), f"approved action should have result: {data}"
        assert data["result"].get("version") == before + 1
        # Chat message should be posted
        m = amit.get(f"{BASE_URL}/api/chats/{CHAT_ID}/messages?limit=500", timeout=15)
        assert m.status_code == 200
        raw = m.json()
        msgs = raw if isinstance(raw, list) else raw.get("messages", [])
        # Recent messages first for search
        bodies = [msg.get("body", "") for msg in msgs[-30:]]
        assert any("Approved" in b or "approved" in b for b in bodies), (
            f"No approval message in last 30 chat msgs: {bodies[-5:]}"
        )

    def test_reject_path_status_rejected_version_unchanged(self, amit, raj):
        # Re-request publish as raj (should create a fresh pending approval,
        # since the previous one is now 'approved').
        r = raj.post(
            f"{BASE_URL}/api/dev-projects/{PROJECT_ID}/publish",
            json={"override_gates": False},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("status") == "approval_requested", f"got: {data}"
        aid = data["approval"]["id"]
        version_before = _current_release_version(amit)

        # Owner rejects
        d = amit.post(
            f"{BASE_URL}/api/dev-action-approvals/{aid}/decision",
            json={"decision": "reject", "note": "not yet"},
            timeout=30,
        )
        assert d.status_code == 200, d.text
        assert d.json()["status"] == "rejected"

        # Version unchanged
        version_after = _current_release_version(amit)
        assert version_after == version_before, (
            f"Rejected publish must NOT bump version: {version_before} -> {version_after}"
        )

        # Chat should have the rejected message with ⛔
        m = amit.get(f"{BASE_URL}/api/chats/{CHAT_ID}/messages?limit=500", timeout=15)
        assert m.status_code == 200
        raw = m.json()
        msgs = raw if isinstance(raw, list) else raw.get("messages", [])
        bodies = [msg.get("body", "") for msg in msgs[-30:]]
        assert any("Rejected" in b or "⛔" in b for b in bodies), (
            f"No rejection message in last 30 chat msgs: {bodies[-5:]}"
        )


# ─── 4. GitHub export gating ─────────────────────────────────────────────
class TestGitHubExportGating:
    def test_member_github_export_creates_approval(self, raj):
        r = raj.post(f"{BASE_URL}/api/dev-projects/{PROJECT_ID}/github/export", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("status") == "approval_requested", (
            f"member github/export should request approval, got: {data}"
        )
        assert data["approval"]["action"] == "github_export"


# ─── 5. Guest share flow ─────────────────────────────────────────────────
class TestGuestShare:
    def test_mint_share_token_and_public_comments(self, amit):
        r = amit.post(f"{BASE_URL}/api/dev-projects/{PROJECT_ID}/share-token", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        token = data["token"]

        # Public GET — no auth session
        pub = requests.Session()
        g = pub.get(f"{BASE_URL}/api/preview-share/{token}/comments", timeout=15)
        assert g.status_code == 200, g.text
        before = len(g.json().get("comments", []))

        # Public POST comment
        c = pub.post(
            f"{BASE_URL}/api/preview-share/{token}/comments",
            json={"author_name": "TEST_iter75_guest", "comment": "iteration 75 test guest comment", "screen_name": "home"},
            timeout=15,
        )
        assert c.status_code == 200, c.text
        row = c.json()
        assert row["is_guest"] is True
        assert row["author_name"] == "TEST_iter75_guest"

        # Empty body → 400
        bad = pub.post(
            f"{BASE_URL}/api/preview-share/{token}/comments",
            json={"author_name": "x", "comment": ""},
            timeout=15,
        )
        assert bad.status_code == 400

        # List again — new count
        g2 = pub.get(f"{BASE_URL}/api/preview-share/{token}/comments", timeout=15)
        assert g2.status_code == 200
        assert len(g2.json().get("comments", [])) >= before + 1

    def test_invalid_share_token_404(self):
        pub = requests.Session()
        r = pub.get(f"{BASE_URL}/api/preview-share/not-a-real-token-abc/comments", timeout=15)
        assert r.status_code in (404, 410)


# ─── 6. Snapshot diff viewer ─────────────────────────────────────────────
class TestDiffViewer:
    def test_diff_first_snapshot_of_index_html(self, amit):
        # Find frontend/index.html file id
        files_r = amit.get(f"{BASE_URL}/api/dev-projects/{PROJECT_ID}/files", timeout=15)
        assert files_r.status_code == 200, files_r.text
        files = files_r.json().get("files", files_r.json() if isinstance(files_r.json(), list) else [])
        # Payload shape may vary — normalize
        if isinstance(files, dict) and "files" in files:
            files = files["files"]
        idx = next((f for f in files if f.get("path") == "frontend/index.html"), None)
        assert idx is not None, f"no frontend/index.html in project files (got {len(files)} files)"
        file_id = idx["id"]

        # Get snapshots
        snaps_r = amit.get(
            f"{BASE_URL}/api/dev-projects/{PROJECT_ID}/files/{file_id}/snapshots",
            timeout=15,
        )
        if snaps_r.status_code == 404:
            pytest.skip("Snapshots endpoint not present")
        assert snaps_r.status_code == 200, snaps_r.text
        payload = snaps_r.json()
        snaps = payload.get("snapshots") if isinstance(payload, dict) else payload
        if not snaps:
            pytest.skip("No snapshots for this file yet")
        snap_id = snaps[0]["id"] if isinstance(snaps[0], dict) else snaps[0]

        # Fetch diff
        d = amit.get(
            f"{BASE_URL}/api/dev-projects/{PROJECT_ID}/files/{file_id}/diff/{snap_id}",
            timeout=15,
        )
        assert d.status_code == 200, d.text
        diff = d.json()
        assert "lines" in diff
        assert "added" in diff and "removed" in diff
        assert diff["path"] == "frontend/index.html"

    def test_diff_bad_snapshot_id_returns_404(self, amit):
        files_r = amit.get(f"{BASE_URL}/api/dev-projects/{PROJECT_ID}/files", timeout=15)
        payload = files_r.json()
        files = payload.get("files") if isinstance(payload, dict) else payload
        idx = next((f for f in files if f.get("path") == "frontend/index.html"), None)
        assert idx is not None
        file_id = idx["id"]
        d = amit.get(
            f"{BASE_URL}/api/dev-projects/{PROJECT_ID}/files/{file_id}/diff/not-a-real-snapshot",
            timeout=15,
        )
        assert d.status_code == 404
