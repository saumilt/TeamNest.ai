"""Iteration 31 — Batch a+b+d+g: WhatsApp import, Audit log, Decision log, Project memory timeline.

Tests these 4 new features only. Phase 1-4 already covered by prior iterations.
"""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


# ---- Fixtures ----

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def owner_token(session):
    r = session.post(f"{BASE_URL}/api/auth/demo-login")
    assert r.status_code == 200, f"demo-login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def owner_client(session, owner_token):
    session.headers.update({"Authorization": f"Bearer {owner_token}"})
    return session


@pytest.fixture(scope="module")
def non_admin_token():
    """Login as Raj (member, non-admin) via /api/auth/login."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "raj@demo.team", "password": "Demo@2026"})
    if r.status_code != 200:
        pytest.skip(f"Could not login as non-admin: {r.status_code} {r.text}")
    return r.json()["token"]


WHATSAPP_SAMPLE = """[12/05/24, 14:32:01] Amit Patel: Lease rates at Stonebriar look strong
[12/05/24, 14:33:00] Raj Mehta: I'll check Plano
[12/05/24, 14:34:12] Priya Shah: <Media omitted>
[12/05/24, 14:35:00] Priya Shah: Demographics report attached."""


# ============ WhatsApp Import ============

class TestWhatsAppImport:
    def test_preview_parses_messages(self, owner_client):
        files = {"file": ("chat.txt", io.BytesIO(WHATSAPP_SAMPLE.encode()), "text/plain")}
        # need to send w/o JSON content-type for multipart
        h = {k: v for k, v in owner_client.headers.items() if k.lower() != "content-type"}
        r = requests.post(f"{BASE_URL}/api/imports/whatsapp/preview", files=files, headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["message_count"] == 4
        names = [p["name"] for p in data["participants"]]
        assert set(names) == {"Amit Patel", "Raj Mehta", "Priya Shah"}
        assert data["media_placeholders"] == 1
        assert data["date_range"]["from"] == "2024-05-12"
        assert "raw_text" in data
        assert isinstance(data["preview"], list)

    def test_preview_rejects_invalid(self, owner_client):
        files = {"file": ("chat.txt", io.BytesIO(b"random text"), "text/plain")}
        h = {k: v for k, v in owner_client.headers.items() if k.lower() != "content-type"}
        r = requests.post(f"{BASE_URL}/api/imports/whatsapp/preview", files=files, headers=h)
        assert r.status_code == 400

    def test_commit_inserts_messages(self, owner_client):
        # Get a chat where current user is member
        chats = owner_client.get(f"{BASE_URL}/api/chats").json()
        assert chats, "No chats available for current user"
        chat_id = chats[0]["id"]
        # Find user id for "Raj Mehta"
        users = owner_client.get(f"{BASE_URL}/api/admin/users").json()
        raj = next((u for u in users if isinstance(u, dict) and "raj" in (u.get("email", "") or "").lower()), None)
        pmap = {"Raj Mehta": raj["id"]} if raj else {}
        payload = {
            "chat_id": chat_id,
            "participant_map": pmap,
            "raw_text": WHATSAPP_SAMPLE,
            "skip_media_placeholders": True,
        }
        r = owner_client.post(f"{BASE_URL}/api/imports/whatsapp/commit", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["imported"] == 3  # 4 messages, 1 media skipped
        assert body["skipped_media"] == 1
        assert body["destination_chat_id"] == chat_id


# ============ Audit logs ============

class TestAuditLogs:
    def test_admin_lists_audit_logs(self, owner_client):
        r = owner_client.get(f"{BASE_URL}/api/admin/audit-logs")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "logs" in body
        assert isinstance(body["logs"], list)

    def test_non_admin_forbidden(self, non_admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/audit-logs",
            headers={"Authorization": f"Bearer {non_admin_token}"},
        )
        assert r.status_code == 403

    def test_filter_by_action(self, owner_client):
        r = owner_client.get(f"{BASE_URL}/api/admin/audit-logs?action=import.whatsapp")
        assert r.status_code == 200
        logs = r.json()["logs"]
        if logs:
            assert all(log["action"] == "import.whatsapp" for log in logs)

    def test_whatsapp_import_recorded_in_audit(self, owner_client):
        # After commit ran above, there should be an import.whatsapp audit row.
        r = owner_client.get(f"{BASE_URL}/api/admin/audit-logs?action=import.whatsapp")
        assert r.status_code == 200
        logs = r.json()["logs"]
        assert len(logs) >= 1, "Expected at least one import.whatsapp audit entry"


# ============ Decision Log ============

class TestDecisions:
    decision_id = None

    def test_list_decisions(self, owner_client):
        r = owner_client.get(f"{BASE_URL}/api/decisions")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "decisions" in body
        assert body["count"] == len(body["decisions"])
        # Backfilled decisions should have meta.decision_status filled
        for d in body["decisions"]:
            assert d.get("memory_type") == "decision"
            assert (d.get("meta") or {}).get("decision_status") in (
                "proposed", "under_review", "approved", "rejected", "reversed", "superseded"
            )

    def test_filter_by_status_approved(self, owner_client):
        r = owner_client.get(f"{BASE_URL}/api/decisions?status=approved")
        assert r.status_code == 200
        for d in r.json()["decisions"]:
            assert (d.get("meta") or {}).get("decision_status") == "approved"

    def test_create_decision(self, owner_client):
        payload = {
            "title": "TEST_Adopt Stonebriar lease",
            "summary": "Lock in the Stonebriar lease terms ASAP.",
            "rationale": "Lease rates trending upward.",
            "risks": "Plano may be cheaper but lower foot traffic.",
            "status": "proposed",
        }
        r = owner_client.post(f"{BASE_URL}/api/decisions", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == payload["title"]
        assert d["memory_type"] == "decision"
        assert d["meta"]["decision_status"] == "proposed"
        assert len(d["meta"]["decision_history"]) == 1
        TestDecisions.decision_id = d["id"]

    def test_get_decision_with_linked_tasks(self, owner_client):
        assert TestDecisions.decision_id, "Decision must be created first"
        r = owner_client.get(f"{BASE_URL}/api/decisions/{TestDecisions.decision_id}")
        assert r.status_code == 200
        body = r.json()
        assert body["decision"]["id"] == TestDecisions.decision_id
        assert "linked_tasks" in body
        assert isinstance(body["linked_tasks"], list)

    def test_update_status_to_approved(self, owner_client):
        assert TestDecisions.decision_id
        r = owner_client.patch(
            f"{BASE_URL}/api/decisions/{TestDecisions.decision_id}/status",
            json={"status": "approved", "note": "lgtm"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["meta"]["decision_status"] == "approved"
        history = d["meta"]["decision_history"]
        assert len(history) == 2
        assert history[-1]["status"] == "approved"

    def test_supersede_sets_outdated(self, owner_client):
        # Create another decision, then supersede the first with it.
        r2 = owner_client.post(f"{BASE_URL}/api/decisions", json={
            "title": "TEST_Replacement decision", "summary": "Newer choice",
        })
        new_id_ = r2.json()["id"]
        r = owner_client.patch(
            f"{BASE_URL}/api/decisions/{TestDecisions.decision_id}/status",
            json={"status": "superseded", "superseded_by": new_id_},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["meta"]["decision_status"] == "superseded"
        assert d.get("status") == "outdated"
        assert d["meta"].get("superseded_by") == new_id_


# ============ Project memory timeline ============

class TestMemoryTimeline:
    def test_timeline_requires_project_folder(self, owner_client):
        # Get a project_folder_id from existing memory items if any
        decs = owner_client.get(f"{BASE_URL}/api/decisions").json()["decisions"]
        pf_ids = [d.get("project_folder_id") for d in decs if d.get("project_folder_id")]
        if not pf_ids:
            # Try listing project folders directly
            pf_resp = owner_client.get(f"{BASE_URL}/api/project-folders")
            if pf_resp.status_code == 200 and pf_resp.json():
                pf_ids = [pf_resp.json()[0]["id"]]
        if not pf_ids:
            pytest.skip("No project folder available to test timeline")
        pf_id = pf_ids[0]
        r = owner_client.get(f"{BASE_URL}/api/memory/timeline?project_folder_id={pf_id}")
        assert r.status_code == 200, r.text
        body = r.json()
        # Should be a list of memory items (key may be 'items' or top-level list)
        assert isinstance(body, (list, dict))


# ============ Audit on role-change ============

class TestRoleChangeAudit:
    def test_role_change_emits_audit(self, owner_client):
        # Find a non-owner member
        users = owner_client.get(f"{BASE_URL}/api/admin/users").json()
        target = next((u for u in users if u.get("role") in ("member", "admin") and "raj" in u.get("email", "")), None)
        if not target:
            pytest.skip("No suitable member found")
        original = target["role"]
        new_role = "admin" if original == "member" else "member"
        r = owner_client.patch(
            f"{BASE_URL}/api/admin/users/{target['id']}",
            json={"role": new_role},
        )
        assert r.status_code == 200, r.text
        # Verify audit emitted
        logs = owner_client.get(f"{BASE_URL}/api/admin/audit-logs?action=user.role_changed").json()["logs"]
        assert any(log["target_id"] == target["id"] for log in logs)
        # Revert
        owner_client.patch(f"{BASE_URL}/api/admin/users/{target['id']}", json={"role": original})
