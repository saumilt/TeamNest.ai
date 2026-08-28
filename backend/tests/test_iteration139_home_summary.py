"""Iteration 139: New Home 'Start Center' A/B toggle + /home/summary endpoint."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed {r.status_code}: {r.text[:300]}"
    return s


def test_home_summary_shape_super_admin():
    s = _login("sam@funasia.net", os.environ.get("SUPERADMIN_TEST_PASSWORD", ""))
    r = s.get(f"{BASE_URL}/api/home/summary")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("saved_facts", "decisions", "research_threads", "documents"):
        assert k in d, f"missing {k}"
        assert isinstance(d[k], int), f"{k} not int: {type(d[k])}"
    print("sam summary:", d)


def test_home_summary_shape_test_user():
    s = _login("os@radciti.com", os.environ.get("RADCITI_TEST_PASSWORD", "RadcitiPass123!"))
    r = s.get(f"{BASE_URL}/api/home/summary")
    # user may need password change first — allow 403 gracefully
    if r.status_code == 403:
        print("os user needs password change; skipping shape check")
        return
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("saved_facts", "decisions", "research_threads", "documents"):
        assert isinstance(d[k], int)


def test_home_summary_requires_auth():
    r = requests.get(f"{BASE_URL}/api/home/summary")
    assert r.status_code in (401, 403), r.status_code


def test_dashboard_regression():
    s = _login("sam@funasia.net", os.environ.get("SUPERADMIN_TEST_PASSWORD", ""))
    r = s.get(f"{BASE_URL}/api/dashboard")
    assert r.status_code == 200
    d = r.json()
    for k in ("open_tasks", "due_today", "recent_chats", "folders", "recent_threads"):
        assert k in d
