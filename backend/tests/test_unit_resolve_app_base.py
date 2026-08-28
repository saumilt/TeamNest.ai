"""Pure unit tests for the emailed-link origin resolver (no network / DB).

Runs in CI without a live backend or MongoDB. `deps` creates a Motor client at
import time but that client is lazy — it never connects unless an operation is
awaited, so importing here is safe.
"""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "teamnest_ci")
os.environ.setdefault("JWT_SECRET", "ci-not-a-secret")
os.environ.setdefault("PUBLIC_BACKEND_URL", "http://localhost:8001")

from deps import resolve_app_base, _link_host_allowed  # noqa: E402


class FakeRequest:
    def __init__(self, headers=None):
        self.headers = headers or {}


def _env_fallback():
    return (os.environ.get("PUBLIC_BACKEND_URL") or "").rstrip("/")


def test_link_host_allowlist_accepts_trusted_hosts():
    assert _link_host_allowed("teamnest.ai")
    assert _link_host_allowed("app.teamnest.ai")
    assert _link_host_allowed("preview.emergentagent.com")
    assert _link_host_allowed("localhost")


def test_link_host_allowlist_rejects_untrusted_hosts():
    assert not _link_host_allowed("evil.com")
    assert not _link_host_allowed("teamnest.ai.evil.com")
    assert not _link_host_allowed("")


def test_resolve_no_request_uses_env_fallback():
    assert resolve_app_base(None) == _env_fallback()


def test_resolve_trusts_allowlisted_origin():
    req = FakeRequest({"origin": "https://teamnest.ai"})
    assert resolve_app_base(req) == "https://teamnest.ai"


def test_resolve_rejects_forged_origin():
    req = FakeRequest({"origin": "https://evil.com"})
    assert resolve_app_base(req) == _env_fallback()


def test_resolve_falls_back_to_referer_when_no_origin():
    req = FakeRequest({"referer": "https://app.teamnest.ai/reset?token=abc"})
    assert resolve_app_base(req) == "https://app.teamnest.ai"
