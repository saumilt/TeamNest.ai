"""Iteration 98 tests
1. Deployed AI employee auto-responds on @handle mention in chat.
2. Chat-scoped deployment scoping: only replies in its bound chat.
3. Escalation applied via chat @mention.
4. Rejection cooldown: cannot re-apply for 30 days.
5. Builder Program audit trail.
6. Regression: plain messages don't trigger a bogus AI reply.
"""
import os
import time
import uuid

import pytest
import requests
from dotenv import load_dotenv

# Load backend .env so MONGO_URL/DB_NAME are available for direct cleanup.
load_dotenv("/app/backend/.env")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://nest-app-prep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "amit@demo.team"
ADMIN_PWD = os.environ.get("DEMO_PASSWORD", "DemoPass123!")
BUILDER_EMAIL = "buildertest@example.com"
BUILDER_PWD = os.environ.get("DEMO_PASSWORD", "DemoPass123!")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PWD)


@pytest.fixture(scope="module")
def builder():
    return _login(BUILDER_EMAIL, BUILDER_PWD)


# ── Deployment & auto-respond tests ──────────────────────────────────────
@pytest.fixture(scope="module")
def deployed_employee(admin):
    """Create AI employee as super admin, deploy with handle=helpbotXXXX."""
    unique = uuid.uuid4().hex[:6]
    handle = f"helpbot{unique}"
    r = admin.post(f"{API}/ai-builder/employees", json={
        "source": "blank",
        "name": f"TEST_HelpBot_{unique}",
        "job_title": "Customer Support",
    }, timeout=30)
    assert r.status_code == 200, r.text
    emp = r.json()
    eid = emp["id"]
    # Deploy with channel=handle
    r2 = admin.post(f"{API}/ai-builder/employees/{eid}/deploy",
                    json={"channel": "handle", "handle": handle}, timeout=30)
    assert r2.status_code == 200, r2.text
    dep = r2.json()
    assert dep["handle"] == handle
    yield {"employee_id": eid, "handle": handle}
    # cleanup
    try:
        admin.post(f"{API}/ai-builder/employees/{eid}/undeploy", timeout=30)
    except Exception:
        pass


@pytest.fixture(scope="module")
def chat_with_admin(admin):
    r = admin.post(f"{API}/chats", json={"type": "group", "name": f"TEST_dep_{uuid.uuid4().hex[:6]}", "member_ids": []}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _send(session, chat_id, body):
    r = session.post(f"{API}/chats/{chat_id}/messages",
                     json={"body": body, "message_type": "text"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _wait_for_ai_reply(session, chat_id, deployed_eid, since_msg_id, timeout=30):
    """Poll messages for one with sender_id ai-emp-<eid> AFTER since_msg_id."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = session.get(f"{API}/chats/{chat_id}/messages?limit=100", timeout=30)
        if r.status_code == 200:
            msgs = r.json()
            seen_start = False
            for m in msgs:
                if m["id"] == since_msg_id:
                    seen_start = True
                    continue
                if seen_start and m.get("sender_id") == f"ai-emp-{deployed_eid}":
                    # Wait a bit more for LLM to finalize the placeholder → body
                    if m.get("metadata", {}).get("status") in (None, "complete", "error"):
                        return m
        time.sleep(2)
    return None


def test_1_deployed_employee_autorespond(admin, deployed_employee, chat_with_admin):
    """@mention the handle → an AI message from ai-emp-<eid> appears."""
    handle = deployed_employee["handle"]
    eid = deployed_employee["employee_id"]
    chat_id = chat_with_admin["id"]
    q = _send(admin, chat_id, f"@{handle} how do I reset my password?")
    ai = _wait_for_ai_reply(admin, chat_id, eid, q["id"], timeout=45)
    assert ai is not None, "No AI response received within 45s"
    assert ai["message_type"] == "ai_answer"
    assert ai["metadata"].get("deployed_employee_id") == eid
    assert ai["metadata"].get("handle") == handle
    # Body should be non-empty and not the loading placeholder
    assert ai["body"] and "is thinking" not in ai["body"]


def test_2_normal_message_no_bogus_ai(admin, deployed_employee, chat_with_admin):
    """Plain non-@mention message should NOT trigger deployed AI response."""
    handle = deployed_employee["handle"]
    eid = deployed_employee["employee_id"]
    chat_id = chat_with_admin["id"]
    q = _send(admin, chat_id, "just a plain human message about the weather")
    # Wait 8s and check no ai-emp-<eid> reply after this message
    time.sleep(8)
    r = admin.get(f"{API}/chats/{chat_id}/messages?limit=100", timeout=30)
    msgs = r.json()
    seen = False
    for m in msgs:
        if m["id"] == q["id"]:
            seen = True
            continue
        if seen and m.get("sender_id") == f"ai-emp-{eid}":
            pytest.fail(f"Unexpected AI reply after plain message: {m}")


def test_3_scoping_chat_bound_does_not_respond_in_other_chat(admin):
    """channel=chat deployment bound to chatA should NOT reply in chatB."""
    # Create employee + two chats
    unique = uuid.uuid4().hex[:6]
    handle = f"scopebot{unique}"
    r = admin.post(f"{API}/ai-builder/employees",
                   json={"source": "blank", "name": f"TEST_ScopeBot_{unique}"}, timeout=30)
    emp = r.json()
    eid = emp["id"]
    chat_a = admin.post(f"{API}/chats", json={"type": "group", "name": f"TEST_A_{unique}", "member_ids": []}, timeout=30).json()
    chat_b = admin.post(f"{API}/chats", json={"type": "group", "name": f"TEST_B_{unique}", "member_ids": []}, timeout=30).json()
    # Deploy scoped to chat_a
    dep = admin.post(f"{API}/ai-builder/employees/{eid}/deploy",
                     json={"channel": "chat", "handle": handle, "chat_id": chat_a["id"]}, timeout=30)
    assert dep.status_code == 200, dep.text
    # Mention in chat_b -- should not respond
    q = _send(admin, chat_b["id"], f"@{handle} hello?")
    time.sleep(8)
    msgs = admin.get(f"{API}/chats/{chat_b['id']}/messages?limit=100", timeout=30).json()
    seen = False
    ai_found = False
    for m in msgs:
        if m["id"] == q["id"]:
            seen = True
            continue
        if seen and m.get("sender_id") == f"ai-emp-{eid}":
            ai_found = True
            break
    assert not ai_found, "chat-bound deployment leaked into another chat"
    # cleanup
    admin.post(f"{API}/ai-builder/employees/{eid}/undeploy", timeout=30)


# ── Rejection cooldown + audit trail ────────────────────────────────────
def _clear_builder_state(admin):
    """Reset buildertest so we can apply again."""
    r = admin.post(f"{API}/superadmin/reset-builder-test", timeout=10)
    # If dedicated endpoint doesn't exist, fall back to direct db via mongo shell in a helper (skip if unavailable)


@pytest.fixture(scope="module")
def clean_builder_state():
    """Reset the buildertest user's applications & builder_approved flag directly via Mongo."""
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    assert mongo_url and db_name
    cli = MongoClient(mongo_url)
    db = cli[db_name]
    user = db.users.find_one({"email": BUILDER_EMAIL})
    assert user, "buildertest user missing"
    uid = user["id"]
    db.users.update_one({"id": uid}, {"$set": {"builder_approved": False}})
    db.builder_applications.delete_many({"user_id": uid})
    db.builder_program_audit.delete_many({"user_id": uid})
    yield uid
    # teardown: leave clean too
    db.users.update_one({"id": uid}, {"$set": {"builder_approved": False}})
    db.builder_applications.delete_many({"user_id": uid})
    db.builder_program_audit.delete_many({"user_id": uid})
    cli.close()


def test_4_rejection_cooldown_and_audit(admin, builder, clean_builder_state):
    """Apply -> reject -> re-apply must 429; /me returns can_reapply=false + reapply_at; audit has 1 row."""
    # Apply
    r = builder.post(f"{API}/builder-program/apply", json={
        "full_name": "Builder Test",
        "motivation": "I want to build cool AI employees for testing.",
        "value_prop": "I bring solid engineering experience and creativity.",
        "agent_ideas": "AI Recruiter, AI Bookkeeper, AI Legal Assistant.",
    }, timeout=30)
    assert r.status_code == 200, r.text
    app_id = r.json()["id"]

    # Super admin rejects
    r2 = admin.post(f"{API}/builder-program/applications/{app_id}/decide",
                    json={"decision": "reject", "note": "not yet"}, timeout=30)
    assert r2.status_code == 200
    assert r2.json()["status"] == "rejected"

    # Attempt re-apply -> 429
    r3 = builder.post(f"{API}/builder-program/apply", json={
        "full_name": "Builder Test",
        "motivation": "Trying again please please please.",
        "value_prop": "Same value prop as before, more experienced now.",
        "agent_ideas": "AI Recruiter v2, AI Bookkeeper v2.",
    }, timeout=30)
    assert r3.status_code == 429, f"expected 429, got {r3.status_code}: {r3.text}"
    assert "re-apply after" in r3.text.lower() or "re-apply" in r3.text.lower()

    # /me returns can_reapply=false + reapply_at
    r4 = builder.get(f"{API}/builder-program/me", timeout=30)
    assert r4.status_code == 200, r4.text
    me = r4.json()
    assert me["can_reapply"] is False
    assert me["reapply_at"] is not None
    assert me.get("reapply_cooldown_days") == 30

    # Audit trail (super admin)
    r5 = admin.get(f"{API}/builder-program/applications/{app_id}/audit", timeout=30)
    assert r5.status_code == 200, r5.text
    audit = r5.json()["audit"]
    assert len(audit) >= 1
    row = audit[0]
    assert row["decision"] == "rejected"
    assert row["decided_by"] == ADMIN_EMAIL
    assert "created_at" in row
    assert row.get("note") == "not yet"

    # Non-super admin -> 403
    r6 = builder.get(f"{API}/builder-program/applications/{app_id}/audit", timeout=30)
    assert r6.status_code == 403, f"expected 403 for non-super, got {r6.status_code}"


def test_5_audit_multiple_decisions(admin, clean_builder_state):
    """Simulate approve after a fresh apply → audit gets an approve row."""
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    cli = MongoClient(mongo_url)
    db = cli[db_name]
    # Clean state
    uid = clean_builder_state
    db.builder_applications.delete_many({"user_id": uid})
    db.builder_program_audit.delete_many({"user_id": uid})
    db.users.update_one({"id": uid}, {"$set": {"builder_approved": False}})

    b = _login(BUILDER_EMAIL, BUILDER_PWD)
    r = b.post(f"{API}/builder-program/apply", json={
        "full_name": "Builder Test",
        "motivation": "Reapply flow after cleanup for audit-test.",
        "value_prop": "Testing multi-decision audit history.",
        "agent_ideas": "Second batch of ideas.",
    }, timeout=30)
    assert r.status_code == 200, r.text
    app_id = r.json()["id"]

    r2 = admin.post(f"{API}/builder-program/applications/{app_id}/decide",
                    json={"decision": "approve", "note": "great!"}, timeout=30)
    assert r2.status_code == 200
    assert r2.json()["status"] == "approved"

    r3 = admin.get(f"{API}/builder-program/applications/{app_id}/audit", timeout=30)
    audit = r3.json()["audit"]
    assert any(a["decision"] == "approved" and a.get("note") == "great!" for a in audit)
    cli.close()
