"""Backend tests for TeamNest.ai Phase 2 — uploads, file download, snapshot sharing, real AI models."""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com"
).rstrip("/")

STATE = {}


@pytest.fixture(scope="module")
def amit():
    r = requests.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["token"], "user": d["user"], "headers": {"Authorization": f"Bearer {d['token']}"}}


@pytest.fixture(scope="module")
def priya():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "priya@demo.team", "password": os.environ.get("DEMO_PASSWORD", "DemoPass123!")},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["token"], "user": d["user"], "headers": {"Authorization": f"Bearer {d['token']}"}}


@pytest.fixture(scope="module")
def outsider():
    """Sign up a new user in a fresh workspace to test cross-workspace forbidden."""
    email = f"outsider_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(
        f"{BASE_URL}/api/auth/signup",
        json={"name": "Outsider", "email": email, "password": "Out@1234"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["token"], "user": d["user"], "headers": {"Authorization": f"Bearer {d['token']}"}}


# ===== UPLOADS =====
class TestUploads:
    def test_upload_text_file(self, amit):
        files = {"file": ("note.txt", b"hello teamnest", "text/plain")}
        r = requests.post(f"{BASE_URL}/api/uploads", headers=amit["headers"], files=files, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["id", "url", "filename", "content_type", "size", "is_image"]:
            assert k in data, f"missing {k}"
        assert data["filename"] == "note.txt"
        assert data["is_image"] is False
        assert data["url"].startswith("/api/files/")
        assert data["size"] == len(b"hello teamnest")
        STATE["text_file_id"] = data["id"]
        STATE["text_file_url"] = data["url"]

    def test_upload_image_file(self, amit):
        # Minimal valid PNG (1x1)
        png = bytes.fromhex(
            "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
            "0000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
        )
        files = {"file": ("pixel.png", png, "image/png")}
        r = requests.post(f"{BASE_URL}/api/uploads", headers=amit["headers"], files=files, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_image"] is True
        assert data["content_type"].startswith("image/")
        STATE["image_file_id"] = data["id"]

    def test_upload_rejects_bad_ext(self, amit):
        files = {"file": ("malware.exe", b"MZ\x90\x00", "application/octet-stream")}
        r = requests.post(f"{BASE_URL}/api/uploads", headers=amit["headers"], files=files, timeout=30)
        assert r.status_code == 400, r.text

    def test_upload_rejects_too_large(self, amit):
        # 21MB > 20MB limit
        big = b"x" * (21 * 1024 * 1024)
        files = {"file": ("big.txt", big, "text/plain")}
        r = requests.post(f"{BASE_URL}/api/uploads", headers=amit["headers"], files=files, timeout=120)
        assert r.status_code == 413, r.text

    def test_upload_requires_auth(self):
        files = {"file": ("note.txt", b"x", "text/plain")}
        r = requests.post(f"{BASE_URL}/api/uploads", files=files, timeout=30)
        assert r.status_code in (401, 403)


# ===== FILE DOWNLOAD =====
class TestFileDownload:
    def test_download_with_bearer(self, amit):
        fid = STATE["text_file_id"]
        r = requests.get(f"{BASE_URL}/api/files/{fid}", headers=amit["headers"], timeout=30)
        assert r.status_code == 200, r.text
        assert r.content == b"hello teamnest"
        assert "text" in r.headers.get("Content-Type", "")

    def test_download_with_query_auth(self, amit):
        fid = STATE["text_file_id"]
        r = requests.get(f"{BASE_URL}/api/files/{fid}?auth={amit['token']}", timeout=30)
        assert r.status_code == 200
        assert r.content == b"hello teamnest"

    def test_download_no_auth(self):
        fid = STATE["text_file_id"]
        r = requests.get(f"{BASE_URL}/api/files/{fid}", timeout=30)
        assert r.status_code == 401

    def test_download_cross_workspace_forbidden(self, outsider):
        fid = STATE["text_file_id"]
        r = requests.get(f"{BASE_URL}/api/files/{fid}", headers=outsider["headers"], timeout=30)
        assert r.status_code == 403

    def test_download_nonexistent(self, amit):
        r = requests.get(f"{BASE_URL}/api/files/no-such-id", headers=amit["headers"], timeout=30)
        assert r.status_code == 404


# ===== AI RESEARCH WITH REAL MODELS =====
class TestRealAIModels:
    def test_perplexity_grok_real_responses(self, amit):
        # Find a group chat
        chats = requests.get(f"{BASE_URL}/api/chats", headers=amit["headers"], timeout=30).json()
        group = next(c for c in chats if c["type"] == "group")
        r = requests.post(
            f"{BASE_URL}/api/ai/research",
            headers=amit["headers"],
            json={
                "chat_id": group["id"],
                "question": "What is the capital of France? One word.",
                "selected_models": ["perplexity", "grok"],
            },
            timeout=180,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["responses"]) == 2
        by_model = {resp["model_key"]: resp for resp in data["responses"]}
        # Perplexity should be real
        assert by_model["perplexity"].get("real") is True, f"Perplexity not real: {by_model['perplexity']}"
        assert "Paris" in by_model["perplexity"]["answer"] or len(by_model["perplexity"]["answer"]) > 10
        # Grok should be real
        assert by_model["grok"].get("real") is True, f"Grok not real: {by_model['grok']}"
        assert len(by_model["grok"]["answer"]) > 0
        STATE["share_thread_id"] = data["thread"]["id"]
        STATE["share_chat_id"] = group["id"]

    def test_deepseek_402_handled_gracefully(self, amit):
        chats = requests.get(f"{BASE_URL}/api/chats", headers=amit["headers"], timeout=30).json()
        group = next(c for c in chats if c["type"] == "group")
        r = requests.post(
            f"{BASE_URL}/api/ai/research",
            headers=amit["headers"],
            json={
                "chat_id": group["id"],
                "question": "ping",
                "selected_models": ["deepseek"],
            },
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        ds = data["responses"][0]
        # Expected: real=False with 402 error text (per spec) OR real=True if billing fixed
        assert isinstance(ds["answer"], str) and len(ds["answer"]) > 0
        if ds.get("real") is False:
            assert "402" in ds["answer"] or "Payment" in ds["answer"] or "Error" in ds["answer"]


# ===== SHARE SNAPSHOT =====
class TestShareSnapshot:
    def test_create_share_link(self, amit):
        tid = STATE["share_thread_id"]
        r = requests.post(
            f"{BASE_URL}/api/ai/research/{tid}/share", headers=amit["headers"], timeout=30
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) >= 10
        assert data["thread_id"] == tid
        STATE["share_token"] = data["token"]

    def test_share_idempotent(self, amit):
        tid = STATE["share_thread_id"]
        r = requests.post(
            f"{BASE_URL}/api/ai/research/{tid}/share", headers=amit["headers"], timeout=30
        )
        assert r.status_code == 200
        # same token returned
        assert r.json()["token"] == STATE["share_token"]

    def test_share_forbidden_for_outsider(self, outsider):
        tid = STATE["share_thread_id"]
        r = requests.post(
            f"{BASE_URL}/api/ai/research/{tid}/share", headers=outsider["headers"], timeout=30
        )
        assert r.status_code in (403, 404)

    def test_public_snapshot_no_auth(self):
        token = STATE["share_token"]
        # Plain session, no auth header
        s = requests.Session()
        r = s.get(f"{BASE_URL}/api/public/snapshot/{token}", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "thread" in data
        assert "responses" in data
        assert "workspace_name" in data
        assert len(data["responses"]) >= 1
        # ensure _id stripped
        assert "_id" not in data["thread"]
        for r2 in data["responses"]:
            assert "_id" not in r2
            assert "model_key" in r2 and "answer" in r2
            assert "vote_counts" in r2  # counts, not voter ids
            assert isinstance(r2["vote_counts"], dict)

    def test_revoke_share_link(self, amit):
        tid = STATE["share_thread_id"]
        token = STATE["share_token"]
        r = requests.delete(
            f"{BASE_URL}/api/ai/research/{tid}/share", headers=amit["headers"], timeout=30
        )
        assert r.status_code == 200
        # Now public access should 404
        r2 = requests.get(f"{BASE_URL}/api/public/snapshot/{token}", timeout=30)
        assert r2.status_code == 404

    def test_invalid_token_404(self):
        r = requests.get(f"{BASE_URL}/api/public/snapshot/nope-not-real-token", timeout=30)
        assert r.status_code == 404


# ===== BRAND =====
class TestBrand:
    def test_root_brand(self):
        # No assertion on brand name change at API root — just sanity check it still answers
        r = requests.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200
