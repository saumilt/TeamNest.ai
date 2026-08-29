"""Iteration 145 (Drop 1) — AI hub backend endpoints:
- POST /api/ai/draft-email  (auth, {content}) -> {subject, body}; 400 empty; 401 no auth
- GET  /api/ai/activity     (auth) -> {items:[...]} newest-first; 401 no auth
"""
import os
import pytest
import requests

def _read_env(path, key):
    with open(path) as f:
        for line in f:
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip()
    raise KeyError(key)

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/")


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": "amit@demo.team", "password": "Demo@2026"}, timeout=30)
    assert r.status_code == 200, r.text
    return s


# --- draft-email ---
def test_draft_email_unauth():
    r = requests.post(f"{BASE}/api/ai/draft-email", json={"content": "hi"}, timeout=20)
    assert r.status_code == 401


def test_draft_email_empty_content_400(sess):
    r = sess.post(f"{BASE}/api/ai/draft-email", json={"content": "  "}, timeout=30)
    assert r.status_code == 400


def test_draft_email_returns_subject_and_body(sess):
    r = sess.post(f"{BASE}/api/ai/draft-email",
                  json={"content": "We should adopt PostgreSQL for our new chat app because of ACID + JSONB."},
                  timeout=90)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "subject" in data and "body" in data
    assert isinstance(data["subject"], str) and isinstance(data["body"], str)
    assert len(data["body"].strip()) > 0


# --- activity ---
def test_activity_unauth():
    r = requests.get(f"{BASE}/api/ai/activity", timeout=20)
    assert r.status_code == 401


def test_activity_returns_items_newest_first(sess):
    r = sess.get(f"{BASE}/api/ai/activity", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "items" in data and isinstance(data["items"], list)
    allowed = {"research", "approval", "knowledge"}
    ats = []
    for it in data["items"]:
        assert it.get("type") in allowed, f"bad type: {it.get('type')}"
        assert "title" in it
        if it.get("at"):
            ats.append(it["at"])
    # newest-first: sorted descending by 'at' where present
    assert ats == sorted(ats, reverse=True)
