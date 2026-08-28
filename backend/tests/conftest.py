"""Shared fixtures for backend tests."""
import os
from pathlib import Path
import pytest
import requests

# Load backend/.env so secrets (SUPERADMIN_TEST_PASSWORD, RC_WEBHOOK_AUTH, etc.)
# are available to tests without being hardcoded in the repo.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except Exception:
    pass

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_login(api_client):
    r = api_client.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text}"
    data = r.json()
    return data  # {token, user}


@pytest.fixture(scope="session")
def auth_headers(demo_login):
    return {"Authorization": f"Bearer {demo_login['token']}"}


@pytest.fixture(scope="session")
def auth_client(api_client, auth_headers):
    api_client.headers.update(auth_headers)
    return api_client
