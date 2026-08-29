"""Phase 1 UX simplification (iter 144): /api/home/overview + /api/home/summary."""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def auth_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "amit@demo.team", "password": "Demo@2026"})
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    return s


def test_home_overview_unauthenticated_401():
    r = requests.get(f"{BASE_URL}/api/home/overview")
    assert r.status_code in (401, 403)


def test_home_overview_shape(auth_client):
    r = auth_client.get(f"{BASE_URL}/api/home/overview")
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert "remembers" in body and "continue" in body
    rem = body["remembers"]
    for k in ("my_memory", "team_knowledge", "research", "decisions", "documents"):
        assert k in rem, f"remembers missing {k}"
        assert isinstance(rem[k], int), f"remembers.{k} is {type(rem[k])}"
        assert rem[k] >= 0

    cont = body["continue"]
    assert "meetings" in cont and "documents" in cont
    assert isinstance(cont["meetings"], list)
    assert isinstance(cont["documents"], list)

    for m in cont["meetings"]:
        # id / chat_id / title / status per spec
        assert "id" in m
        assert "chat_id" in m
        assert "title" in m
        assert "status" in m


def test_home_summary_regression_shape(auth_client):
    r = auth_client.get(f"{BASE_URL}/api/home/summary")
    assert r.status_code == 200
    body = r.json()
    for k in ("saved_facts", "decisions", "research_threads",
              "documents", "my_memory", "team_knowledge"):
        assert k in body, f"summary missing {k}"
        assert isinstance(body[k], int)


def test_home_overview_counts_consistent_with_summary(auth_client):
    ov = auth_client.get(f"{BASE_URL}/api/home/overview").json()
    su = auth_client.get(f"{BASE_URL}/api/home/summary").json()
    # research count and my_memory count should be same source
    assert ov["remembers"]["research"] == su["research_threads"]
    assert ov["remembers"]["my_memory"] == su["my_memory"]
    assert ov["remembers"]["documents"] == su["documents"]
