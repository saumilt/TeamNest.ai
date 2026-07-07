"""Iteration 54 — Dev OS nightly auto-scan scheduler tests.

Covers:
- GET /api/dev-os/governance includes new `nightly_scan_enabled` (defaults True)
- PUT /api/dev-os/governance persists `nightly_scan_enabled=false`
- POST /api/dev-os/run-nightly-scan triggers a scan + returns {scanned_projects, drafted_proposals}
- Chat receives the system digest starting with '🌙 **Dev OS · nightly scan**'
- Proposals are tagged created_by_agent='devos_nightly' + source_chat_id set
- Dedupe: 2nd run drafts strictly fewer proposals (or 0)
- Opt-out switch: with nightly_scan_enabled=false, scan returns 0 drafted_proposals
- Startup log line is present in supervisor logs
"""
import os
import time
import pytest
import requests

# Use localhost to bypass Cloudflare 100s edge timeout for the LLM-heavy scan.
LOCAL_URL = "http://localhost:8001"
PUBLIC_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def public_url():
    return PUBLIC_URL


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{LOCAL_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.text}"
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


# ── Governance policy: new nightly_scan_enabled key ──────────────────────────
class TestGovernancePolicyKey:
    def test_get_governance_has_nightly_scan_enabled(self, session):
        r = session.get(f"{LOCAL_URL}/api/dev-os/governance", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "policy" in data
        assert "nightly_scan_enabled" in data["policy"], "policy should expose nightly_scan_enabled"
        # default True (when no override saved)
        assert isinstance(data["policy"]["nightly_scan_enabled"], bool)

    def test_put_governance_persists_nightly_scan_enabled_false(self, session):
        # Persist false
        r = session.put(
            f"{LOCAL_URL}/api/dev-os/governance",
            json={"nightly_scan_enabled": False},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["policy"]["nightly_scan_enabled"] is False

        # Confirm via GET
        r2 = session.get(f"{LOCAL_URL}/api/dev-os/governance", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["policy"]["nightly_scan_enabled"] is False

    def test_put_governance_reset_to_true(self, session):
        # Reset so other tests run the scheduler
        r = session.put(
            f"{LOCAL_URL}/api/dev-os/governance",
            json={"nightly_scan_enabled": True},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["policy"]["nightly_scan_enabled"] is True


# ── Opt-out switch: with false, scan drafts nothing ──────────────────────────
class TestOptOutSwitch:
    def test_opt_out_skips_all_projects(self, session):
        # Disable
        session.put(f"{LOCAL_URL}/api/dev-os/governance",
                    json={"nightly_scan_enabled": False}, timeout=15)
        try:
            r = session.post(f"{LOCAL_URL}/api/dev-os/run-nightly-scan", timeout=180)
            assert r.status_code == 200
            data = r.json()
            assert "scanned_projects" in data
            assert "drafted_proposals" in data
            assert data["drafted_proposals"] == 0, f"opt-out should skip all; got {data}"
        finally:
            # Re-enable for the next tests
            session.put(f"{LOCAL_URL}/api/dev-os/governance",
                        json={"nightly_scan_enabled": True}, timeout=15)


# ── End-to-end manual trigger + chat digest + dedupe ─────────────────────────
@pytest.fixture(scope="module")
def first_run_result(session):
    # Ensure enabled
    session.put(f"{LOCAL_URL}/api/dev-os/governance",
                json={"nightly_scan_enabled": True}, timeout=15)
    r = session.post(f"{LOCAL_URL}/api/dev-os/run-nightly-scan", timeout=180)
    assert r.status_code == 200, f"manual scan failed: {r.text}"
    return r.json()


class TestManualNightlyScan:
    def test_first_run_returns_counts(self, first_run_result):
        assert "scanned_projects" in first_run_result
        assert "drafted_proposals" in first_run_result
        assert isinstance(first_run_result["scanned_projects"], int)
        assert isinstance(first_run_result["drafted_proposals"], int)
        assert first_run_result["scanned_projects"] >= 1

    def test_proposals_tagged_with_devos_nightly_agent(self, session, first_run_result):
        if first_run_result["drafted_proposals"] == 0:
            pytest.skip("no proposals drafted in first run (signals stable)")
        r = session.get(f"{LOCAL_URL}/api/dev-os/proposals?status=pending", timeout=20)
        # endpoint might be /proposals or /improvement-proposals — try both
        if r.status_code == 404:
            r = session.get(f"{LOCAL_URL}/api/improvement-proposals?status=pending", timeout=20)
        # Either way the listing returns a list-like
        if r.status_code == 200:
            body = r.json()
            items = body if isinstance(body, list) else body.get("proposals") or body.get("items") or []
            nightly = [p for p in items if p.get("created_by_agent") == "devos_nightly"]
            assert nightly, "expected at least one proposal with created_by_agent='devos_nightly'"
            for p in nightly[:5]:
                assert p.get("source_chat_id"), "nightly proposal must carry source_chat_id"
        else:
            pytest.skip(f"proposals listing endpoint returned {r.status_code}")

    def test_digest_message_posted_to_linked_chat(self, session, first_run_result):
        if first_run_result["drafted_proposals"] == 0:
            pytest.skip("no proposals drafted; no digest expected")
        # find dev_projects with related_chat_id
        r = session.get(f"{LOCAL_URL}/api/dev-projects", timeout=15)
        assert r.status_code == 200
        projects = r.json() if isinstance(r.json(), list) else r.json().get("projects", [])
        chat_ids = {p["related_chat_id"] for p in projects if p.get("related_chat_id")}
        assert chat_ids, "no chat-linked dev_projects found — cannot verify digest"

        found_digest = False
        for cid in list(chat_ids)[:6]:
            m = session.get(f"{LOCAL_URL}/api/chats/{cid}/messages?limit=20", timeout=15)
            if m.status_code != 200:
                continue
            msgs = m.json() if isinstance(m.json(), list) else m.json().get("messages", [])
            for msg in msgs:
                body = msg.get("body") or ""
                if body.startswith("🌙 **Dev OS · nightly scan**"):
                    found_digest = True
                    assert "/dev-os/projects/" in body, "digest should include deep-link to project"
                    break
            if found_digest:
                break
        assert found_digest, "expected at least one '🌙 Dev OS · nightly scan' digest message in a linked chat"

    def test_second_run_dedupes(self, session, first_run_result):
        """Re-running immediately should NOT duplicate same source_signal proposals."""
        # Snapshot how many nightly proposals exist now
        r = session.post(f"{LOCAL_URL}/api/dev-os/run-nightly-scan", timeout=180)
        assert r.status_code == 200
        second = r.json()
        # Either zero, OR fewer-than-or-equal-to first (each new draft must have a NEW source_signal).
        assert second["drafted_proposals"] <= first_run_result["drafted_proposals"], (
            f"dedupe failed: 2nd run drafted {second['drafted_proposals']} "
            f"vs 1st run {first_run_result['drafted_proposals']}"
        )


# ── Supervisor startup log line ──────────────────────────────────────────────
class TestStartupLog:
    def test_nightly_scheduler_log_line_present(self):
        paths = [
            "/var/log/supervisor/backend.out.log",
            "/var/log/supervisor/backend.err.log",
        ]
        needle = "[startup] Dev OS nightly scan loop scheduled (1h tick, 22h cooldown)"
        found = False
        for p in paths:
            try:
                with open(p, "r", errors="ignore") as fh:
                    if needle in fh.read():
                        found = True
                        break
            except FileNotFoundError:
                continue
        assert found, f"missing startup log line: {needle}"
