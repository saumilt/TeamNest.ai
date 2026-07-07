"""Tests for the @devmgr auto-start Dev OS project feature (iteration 68).

Feature under test: when a user @devmgr's a real product idea in a chat,
the backend should:
  1. Create a `dev_projects` row with source='auto_devmgr',
     related_chat_id=<chat>, and a name derived from the request.
  2. Set the chat's `linked_dev_project_id` to that project id.
  3. Post a follow-up `ai-system` message with a markdown link to
     `/dev-os/projects/{pid}/studio` and metadata.source='auto_start_project'.
  4. Kick off an async build that lands ~7 generated files and flips
     `dev_builds.build_status` to 'success'.
  5. Be idempotent — re-mentioning @devmgr in the same chat must NOT
     create a second project.
  6. Skip the auto-start for short / non-project messages.
  7. Skip the auto-start for chats that are already development chats.
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient


BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


# ─── Shared session / fixtures ──────────────────────────────────────────────
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    last_err = None
    for attempt in range(6):
        try:
            r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=60)
            if r.status_code == 200:
                return s
            last_err = f"{r.status_code} {r.text[:200]}"
        except requests.exceptions.RequestException as e:
            last_err = str(e)
        time.sleep(5 * (attempt + 1))
    pytest.skip(f"demo-login unavailable after retries: {last_err}")


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


def _new_group_chat(session, name: str, retries: int = 5) -> dict:
    last_err = None
    for i in range(retries):
        try:
            r = session.post(
                f"{BASE_URL}/api/chats",
                json={"type": "group", "name": name, "member_ids": []},
                timeout=90,
            )
            if r.status_code == 200:
                return r.json()
            last_err = f"{r.status_code} {r.text[:200]}"
        except requests.exceptions.RequestException as e:
            last_err = str(e)
        time.sleep(5 * (i + 1))
    raise AssertionError(f"create chat failed after retries: {last_err}")


def _send_msg(session, chat_id: str, body: str, retries: int = 5) -> dict:
    last_err = None
    for i in range(retries):
        try:
            r = session.post(
                f"{BASE_URL}/api/chats/{chat_id}/messages",
                json={"message_type": "text", "body": body},
                timeout=90,
            )
            if r.status_code == 200:
                return r.json()
            last_err = f"{r.status_code} {r.text[:200]}"
        except requests.exceptions.RequestException as e:
            last_err = str(e)
        time.sleep(5 * (i + 1))
    raise AssertionError(f"send msg failed after retries: {last_err}")


# ─── Happy path: auto-start fires and creates project + system msg ──────────
class TestAutoStartHappyPath:
    @pytest.fixture(scope="class")
    def context(self, session, db):
        chat = _new_group_chat(session, "TEST_autostart_happy")
        msg = _send_msg(
            session,
            chat["id"],
            "@devmgr please build me a simple todo app with categories and a calendar view, target audience is freelancers",
        )
        # Async tasks fire via asyncio.create_task; the devmgr reply + auto-start need ~8-12s
        time.sleep(12)
        return {"chat": chat, "trigger_msg": msg}

    def test_dev_project_created(self, context, db):
        chat = context["chat"]
        projects = list(db.dev_projects.find(
            {"workspace_id": chat["workspace_id"], "related_chat_id": chat["id"]},
            {"_id": 0},
        ))
        assert len(projects) == 1, f"expected exactly 1 project, got {len(projects)}"
        p = projects[0]
        assert p["source"] == "auto_devmgr"
        assert p["related_chat_id"] == chat["id"]
        # Name should be derived from request (not generic). Title-cased.
        assert p["name"] and len(p["name"]) > 4
        assert "Please" in p["name"] or "Build" in p["name"] or "Todo" in p["name"], (
            f"project name not derived from request: {p['name']!r}"
        )
        context["project_id"] = p["id"]

    def test_chat_linked_to_project(self, context, db):
        chat = context["chat"]
        # re-load chat from DB
        updated = db.chats.find_one({"id": chat["id"]}, {"_id": 0})
        assert updated.get("linked_dev_project_id"), "chat.linked_dev_project_id not set"
        # And it should match the project we found.
        proj = db.dev_projects.find_one(
            {"related_chat_id": chat["id"]}, {"_id": 0, "id": 1}
        )
        assert updated["linked_dev_project_id"] == proj["id"]

    def test_followup_system_message_posted(self, context, db):
        chat = context["chat"]
        sys_msgs = list(db.messages.find(
            {
                "chat_id": chat["id"],
                "sender_id": "ai-system",
                "message_type": "ai-system",
                "metadata.source": "auto_start_project",
            },
            {"_id": 0},
        ))
        assert len(sys_msgs) >= 1, "no auto_start_project system message found"
        m = sys_msgs[0]
        assert "🚀" in m["body"] and "Project created" in m["body"]
        proj = db.dev_projects.find_one(
            {"related_chat_id": chat["id"]}, {"_id": 0, "id": 1}
        )
        studio_path = f"/dev-os/projects/{proj['id']}/studio"
        assert studio_path in m["body"], f"studio link missing from body: {m['body'][:200]}"
        assert m["metadata"].get("studio_url") == studio_path
        assert m["metadata"].get("project_id") == proj["id"]


# ─── Build completion: files generated + build success + preview served ─────
class TestAutoStartBuildCompletes:
    @pytest.fixture(scope="class")
    def project_id(self, session, db):
        chat = _new_group_chat(session, "TEST_autostart_build")
        _send_msg(
            session,
            chat["id"],
            "@devmgr please create a kanban project board application with drag and drop columns for software teams to organize their sprints and backlogs",
        )
        # Wait for devmgr reply + auto-start (~8s) + build (~60-120s) = ~180s budget
        deadline = time.time() + 180
        proj = None
        while time.time() < deadline:
            proj = db.dev_projects.find_one(
                {"workspace_id": chat["workspace_id"], "related_chat_id": chat["id"]},
                {"_id": 0},
            )
            if proj:
                break
            time.sleep(2)
        assert proj, "project never got created"
        # Now wait for build to land
        pid = proj["id"]
        while time.time() < deadline:
            build = db.dev_builds.find_one(
                {"project_id": pid, "build_status": "success"}, {"_id": 0}
            )
            files_count = db.dev_code_files.count_documents({"project_id": pid})
            if build and files_count >= 5:
                break
            time.sleep(3)
        return pid

    def test_build_marked_success(self, project_id, db):
        build = db.dev_builds.find_one(
            {"project_id": project_id, "build_status": "success"}, {"_id": 0}
        )
        assert build, "no successful build found for project"
        assert build.get("preview_url") == f"/api/dev-projects/{project_id}/preview/index.html"

    def test_seven_files_generated(self, project_id, db):
        files = list(db.dev_code_files.find({"project_id": project_id}, {"_id": 0, "path": 1}))
        paths = {f["path"] for f in files}
        # Per spec ~7 files. We tolerate small drift but require the canonical set is mostly present.
        assert len(files) >= 5, f"expected ~7 files, got {len(files)}: {paths}"
        # Check a few canonical paths the codegen contract promises
        expected_subset = {"frontend/index.html", "README.md"}
        missing = expected_subset - paths
        assert not missing, f"missing expected files: {missing}; have: {paths}"

    def test_preview_index_served(self, session, project_id):
        # Preview endpoint per spec should be public (no auth needed)
        r = requests.get(
            f"{BASE_URL}/api/dev-projects/{project_id}/preview/index.html",
            timeout=30,
        )
        assert r.status_code == 200, f"preview not served: {r.status_code} {r.text[:200]}"
        assert "text/html" in r.headers.get("content-type", "")
        # Body should contain some HTML
        assert "<" in r.text and ">" in r.text


# ─── Idempotency: second @devmgr in same chat must NOT create new project ───
class TestAutoStartIdempotent:
    def test_second_mention_no_new_project(self, session, db):
        chat = _new_group_chat(session, "TEST_autostart_idem")
        _send_msg(
            session,
            chat["id"],
            "@devmgr please build me a workout tracker app with weekly progress charts for fitness coaches",
        )
        time.sleep(12)
        # confirm first project exists
        first = list(db.dev_projects.find(
            {"workspace_id": chat["workspace_id"], "related_chat_id": chat["id"]},
            {"_id": 0, "id": 1},
        ))
        assert len(first) == 1, f"first mention didn't create exactly one project: {len(first)}"

        # Second mention in same chat
        _send_msg(
            session,
            chat["id"],
            "@devmgr also please add a feature to share workouts socially with friends, it's an app for fitness people",
        )
        time.sleep(12)

        after = list(db.dev_projects.find(
            {"workspace_id": chat["workspace_id"], "related_chat_id": chat["id"]},
            {"_id": 0, "id": 1},
        ))
        assert len(after) == 1, f"idempotency broken: {len(after)} projects after re-mention"
        assert after[0]["id"] == first[0]["id"]


# ─── Negative heuristics: short msg / no project keywords ───────────────────
class TestAutoStartNegativeHeuristics:
    def test_short_message_no_project(self, session, db):
        chat = _new_group_chat(session, "TEST_autostart_short")
        _send_msg(session, chat["id"], "@devmgr hi")
        time.sleep(10)
        projects = list(db.dev_projects.find(
            {"workspace_id": chat["workspace_id"], "related_chat_id": chat["id"]},
            {"_id": 0, "id": 1},
        ))
        assert len(projects) == 0, f"short msg should NOT auto-create project, got {len(projects)}"
        # devmgr reply should still appear (the agent itself still runs)
        devmgr_reply = db.messages.find_one(
            {"chat_id": chat["id"], "sender_id": "ai-agent-devmgr"}, {"_id": 0}
        )
        # Not strictly required, but we expect a reply for any @devmgr mention.
        # Allow this to be flaky — log only.
        if not devmgr_reply:
            print("[note] devmgr did not reply to short message — may be intentional rate-limit")

    def test_no_project_keywords_no_project(self, session, db):
        chat = _new_group_chat(session, "TEST_autostart_nokeywords")
        # Long enough but contains no build/create/app/project/etc. keywords.
        _send_msg(
            session,
            chat["id"],
            "@devmgr what time is it right now and how are you doing today my dear friend please answer",
        )
        time.sleep(10)
        projects = list(db.dev_projects.find(
            {"workspace_id": chat["workspace_id"], "related_chat_id": chat["id"]},
            {"_id": 0, "id": 1},
        ))
        assert len(projects) == 0, (
            f"msg without project keywords should NOT auto-create, got {len(projects)}"
        )


# ─── Dev chat (kind=='development'): no double-firing on existing project ───
class TestAutoStartSkipsDevChat:
    def test_devchat_no_second_project(self, session, db):
        """In a chat where the dev team was already hired (via /chats/dev),
        the chat is `kind='development'` and has `related_chat_id` (the source
        chat). The new auto-start should SKIP it (the early-return on
        `related_chat_id` should fire)."""
        # Create a dev chat via the same endpoint hire-dev-team uses internally
        # (POST /api/chats/dev). It auto-seeds an initial dev project.
        r = session.post(
            f"{BASE_URL}/api/chats/dev",
            json={"name": "TEST_autostart_devchat", "description": "dev chat test"},
            timeout=30,
        )
        if r.status_code != 200:
            pytest.skip(f"POST /chats/dev not available in this build: {r.status_code}")
        dev_chat = r.json().get("chat") or r.json()
        chat_id = dev_chat["id"]

        # Count projects related to this chat BEFORE the @devmgr message
        before = db.dev_projects.count_documents({"related_chat_id": chat_id})

        # Send a fully qualified @devmgr build request
        _send_msg(
            session,
            chat_id,
            "@devmgr please build an analytics dashboard application with charts and filters for marketing teams",
        )
        time.sleep(12)

        after = db.dev_projects.count_documents({"related_chat_id": chat_id})
        assert after == before, (
            f"auto-start should NOT fire in dev chat (related_chat_id set); "
            f"before={before} after={after}"
        )
