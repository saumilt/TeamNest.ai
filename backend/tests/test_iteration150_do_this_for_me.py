"""Iteration 150 — 'Do this for me' (Round 3): contextual AI actions on
task / document / chat. Draft-only (never writes/sends).
Tests: GET /api/ai/do-actions catalog + POST /api/ai/do-action for each entity
type, followups structure, error paths, and read-only assertion (no mutation)."""
import os
import time

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


# --- Auth fixtures -----------------------------------------------------------

@pytest.fixture(scope="module")
def owner_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "amit@demo.team", "password": "Demo@2026"})
    assert r.status_code == 200, r.text
    tok = r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def member_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "raj@demo.team", "password": "Demo@2026"})
    assert r.status_code == 200, r.text
    tok = r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# --- Helpers -----------------------------------------------------------------

def _pick_task(owner):
    r = owner.get(f"{BASE_URL}/api/tasks")
    assert r.status_code == 200, r.text
    data = r.json()
    tasks = data.get("tasks") if isinstance(data, dict) else data
    assert tasks, "Demo workspace must have at least one task"
    return tasks[0]


def _pick_ready_document(owner):
    r = owner.get(f"{BASE_URL}/api/knowledge/sources")
    assert r.status_code == 200, r.text
    data = r.json()
    docs = data if isinstance(data, list) else data.get("sources", [])
    ready = [d for d in docs if (d.get("status") or "").lower() == "ready"]
    if not ready:
        pytest.skip("No READY knowledge document in demo workspace")
    return ready[0]


def _pick_non_ai_chat(owner):
    r = owner.get(f"{BASE_URL}/api/chats")
    assert r.status_code == 200, r.text
    chats = r.json()
    if isinstance(chats, dict):
        chats = chats.get("chats") or chats.get("items") or []
    # prefer a non-AI chat (chat_type != 'ai') with some messages
    for c in chats:
        if c.get("chat_type") != "ai":
            return c
    return chats[0] if chats else None


# --- Catalog -----------------------------------------------------------------

class TestDoActionsCatalog:
    """GET /api/ai/do-actions?entity_type=..."""

    @pytest.mark.parametrize("etype,expected_keys", [
        ("task", {"summarize", "subtasks", "update", "draft_email"}),
        ("document", {"summarize", "action_items", "draft_email"}),
        ("chat", {"summarize", "reply", "decisions", "draft_email"}),
    ])
    def test_catalog_shape(self, owner_session, etype, expected_keys):
        r = owner_session.get(f"{BASE_URL}/api/ai/do-actions?entity_type={etype}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "actions" in data and isinstance(data["actions"], list)
        keys = {a["key"] for a in data["actions"]}
        labels = {a["label"] for a in data["actions"]}
        assert expected_keys.issubset(keys), f"missing keys for {etype}: {expected_keys - keys}"
        # Each entry has key + label
        for a in data["actions"]:
            assert "key" in a and "label" in a
            assert isinstance(a["label"], str) and a["label"]
        assert labels  # non-empty

    def test_unsupported_entity_type_400(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/ai/do-actions?entity_type=widget")
        assert r.status_code == 400, r.text

    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/ai/do-actions?entity_type=task")
        assert r.status_code in (401, 403)


# --- do-action task ----------------------------------------------------------

class TestDoActionTask:
    def test_task_summarize_returns_result_and_followups(self, owner_session):
        task = _pick_task(owner_session)
        original = owner_session.get(f"{BASE_URL}/api/tasks/{task['id']}").json()
        t0 = time.time()
        r = owner_session.post(f"{BASE_URL}/api/ai/do-action",
                               json={"entity_type": "task", "entity_id": task["id"], "action": "summarize"})
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text
        data = r.json()
        # Shape assertions
        assert data["entity_type"] == "task"
        assert data["entity_id"] == task["id"]
        assert data["action"] == "summarize"
        assert isinstance(data.get("title"), str) and data["title"]
        assert "Summary" in data["title"]
        assert isinstance(data.get("result"), str) and len(data["result"]) > 5
        # Followups: copy always; automate + draft_email present for non-those actions
        kinds = [f["kind"] for f in data["followups"]]
        assert "copy" in kinds
        assert "automate" in kinds
        assert "draft_email" in kinds
        auto = next(f for f in data["followups"] if f["kind"] == "automate")
        assert auto.get("prompt")
        de = next(f for f in data["followups"] if f["kind"] == "draft_email")
        assert de.get("content")
        # Read-only: task unchanged
        after = owner_session.get(f"{BASE_URL}/api/tasks/{task['id']}").json()
        for k in ("title", "description", "status", "priority", "due_date"):
            assert original.get(k) == after.get(k), f"task field {k} mutated (read-only violated)"
        print(f"[timing] task summarize took {elapsed:.1f}s")

    def test_task_draft_email_action_omits_draft_email_followup(self, owner_session):
        task = _pick_task(owner_session)
        r = owner_session.post(f"{BASE_URL}/api/ai/do-action",
                               json={"entity_type": "task", "entity_id": task["id"], "action": "draft_email"})
        assert r.status_code == 200, r.text
        data = r.json()
        kinds = [f["kind"] for f in data["followups"]]
        assert "copy" in kinds
        assert "automate" in kinds
        # draft_email action should NOT include a draft_email followup
        assert "draft_email" not in kinds, f"draft_email action should not offer draft_email followup, got {kinds}"

    def test_task_unknown_action_400(self, owner_session):
        task = _pick_task(owner_session)
        r = owner_session.post(f"{BASE_URL}/api/ai/do-action",
                               json={"entity_type": "task", "entity_id": task["id"], "action": "delete_it"})
        assert r.status_code == 400, r.text

    def test_task_not_found_404(self, owner_session):
        r = owner_session.post(f"{BASE_URL}/api/ai/do-action",
                               json={"entity_type": "task", "entity_id": "nope-does-not-exist", "action": "summarize"})
        assert r.status_code == 404, r.text


# --- do-action document ------------------------------------------------------

class TestDoActionDocument:
    def test_document_summarize(self, owner_session):
        doc = _pick_ready_document(owner_session)
        r = owner_session.post(f"{BASE_URL}/api/ai/do-action",
                               json={"entity_type": "document", "entity_id": doc["id"], "action": "summarize"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["entity_type"] == "document"
        assert isinstance(data.get("result"), str) and data["result"]
        kinds = [f["kind"] for f in data["followups"]]
        assert set(kinds) >= {"copy", "automate", "draft_email"}

    def test_document_action_items(self, owner_session):
        doc = _pick_ready_document(owner_session)
        r = owner_session.post(f"{BASE_URL}/api/ai/do-action",
                               json={"entity_type": "document", "entity_id": doc["id"], "action": "action_items"})
        assert r.status_code == 200, r.text
        assert r.json().get("result")

    def test_document_not_found_404(self, owner_session):
        r = owner_session.post(f"{BASE_URL}/api/ai/do-action",
                               json={"entity_type": "document", "entity_id": "nope-xyz", "action": "summarize"})
        assert r.status_code == 404, r.text


# --- do-action chat ----------------------------------------------------------

class TestDoActionChat:
    def test_chat_summarize(self, owner_session):
        chat = _pick_non_ai_chat(owner_session)
        assert chat, "Demo workspace must have at least one chat"
        r = owner_session.post(f"{BASE_URL}/api/ai/do-action",
                               json={"entity_type": "chat", "entity_id": chat["id"], "action": "summarize"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["action"] == "summarize"
        assert isinstance(data.get("result"), str) and data["result"]

    def test_chat_not_member_404(self, owner_session, member_session):
        # find a chat that raj is NOT a member of
        owner_chats = owner_session.get(f"{BASE_URL}/api/chats").json()
        if isinstance(owner_chats, dict):
            owner_chats = owner_chats.get("chats") or owner_chats.get("items") or []
        member_chats = member_session.get(f"{BASE_URL}/api/chats").json()
        if isinstance(member_chats, dict):
            member_chats = member_chats.get("chats") or member_chats.get("items") or []
        member_ids = {c["id"] for c in member_chats}
        excluded = next((c for c in owner_chats if c["id"] not in member_ids), None)
        if not excluded:
            pytest.skip("Could not find a chat that raj is not a member of")
        r = member_session.post(f"{BASE_URL}/api/ai/do-action",
                                json={"entity_type": "chat", "entity_id": excluded["id"], "action": "summarize"})
        assert r.status_code == 404, r.text


# --- Entity-type validation --------------------------------------------------

class TestValidation:
    def test_unsupported_entity_type_on_do_action_400(self, owner_session):
        r = owner_session.post(f"{BASE_URL}/api/ai/do-action",
                               json={"entity_type": "widget", "entity_id": "x", "action": "summarize"})
        assert r.status_code == 400, r.text
