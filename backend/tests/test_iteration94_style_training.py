"""AI Employee Builder — Phase 2: Style Training Center backend tests."""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def auth():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def employee(auth):
    r = auth.post(
        f"{BASE_URL}/api/ai-builder/employees",
        json={"source": "blank", "name": "TEST_Style_Emp", "job_title": "QA style tester"},
    )
    assert r.status_code == 200, r.text
    eid = r.json()["id"]
    yield eid
    auth.delete(f"{BASE_URL}/api/ai-builder/employees/{eid}")


# ── Connectors ───────────────────────────────────────────────
class TestConnectors:
    def test_list_connectors(self, auth):
        r = auth.get(f"{BASE_URL}/api/ai-builder/style-connectors")
        assert r.status_code == 200
        conns = r.json()["connectors"]
        ids = {c["id"] for c in conns}
        assert {"gmail", "slack", "whatsapp"} <= ids
        for c in conns:
            assert c["sample_count"] > 0
            assert isinstance(c["label"], str)


# ── Sources ───────────────────────────────────────────────
class TestStyleSources:
    def test_connect_gmail(self, auth, employee):
        r = auth.post(f"{BASE_URL}/api/ai-builder/employees/{employee}/style-sources",
                      json={"source": "gmail"})
        assert r.status_code == 200
        d = r.json()
        assert d["source"] == "gmail"
        assert d["is_mock"] is True
        assert len(d["samples"]) >= 2
        assert d["label"]

    def test_connect_unknown_source(self, auth, employee):
        r = auth.post(f"{BASE_URL}/api/ai-builder/employees/{employee}/style-sources",
                      json={"source": "myspace"})
        assert r.status_code == 400

    def test_reconnect_replaces(self, auth, employee):
        # Connect slack twice, list should only have 1 slack row
        auth.post(f"{BASE_URL}/api/ai-builder/employees/{employee}/style-sources",
                  json={"source": "slack"})
        auth.post(f"{BASE_URL}/api/ai-builder/employees/{employee}/style-sources",
                  json={"source": "slack"})
        r = auth.get(f"{BASE_URL}/api/ai-builder/employees/{employee}/style-sources")
        slacks = [s for s in r.json()["sources"] if s["source"] == "slack"]
        assert len(slacks) == 1, f"expected 1 slack row, got {len(slacks)}"

    def test_add_manual_sample(self, auth, employee):
        r = auth.post(
            f"{BASE_URL}/api/ai-builder/employees/{employee}/style-sources/manual",
            json={"text": "Hi team, quick heads-up: shipping the release at 4pm today. Let me know if any blockers.",
                  "label": "TEST_Manual"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["source"] == "manual"
        assert d["is_mock"] is False
        assert d["samples"] == [
            "Hi team, quick heads-up: shipping the release at 4pm today. Let me know if any blockers."
        ]

    def test_manual_empty_rejected(self, auth, employee):
        r = auth.post(
            f"{BASE_URL}/api/ai-builder/employees/{employee}/style-sources/manual",
            json={"text": ""},
        )
        assert r.status_code == 422

    def test_list_sources(self, auth, employee):
        r = auth.get(f"{BASE_URL}/api/ai-builder/employees/{employee}/style-sources")
        assert r.status_code == 200
        sources = r.json()["sources"]
        assert len(sources) >= 3  # gmail, slack, manual (whatsapp not yet)
        sids = {s["source"] for s in sources}
        assert "gmail" in sids and "slack" in sids and "manual" in sids

    def test_delete_source(self, auth, employee):
        # Add whatsapp then delete it
        r = auth.post(f"{BASE_URL}/api/ai-builder/employees/{employee}/style-sources",
                      json={"source": "whatsapp"})
        sid = r.json()["id"]
        r2 = auth.delete(f"{BASE_URL}/api/ai-builder/employees/{employee}/style-sources/{sid}")
        assert r2.status_code == 200
        r3 = auth.get(f"{BASE_URL}/api/ai-builder/employees/{employee}/style-sources")
        assert sid not in {s["id"] for s in r3.json()["sources"]}

    def test_delete_missing_source_404(self, auth, employee):
        r = auth.delete(f"{BASE_URL}/api/ai-builder/employees/{employee}/style-sources/nope-xyz")
        assert r.status_code == 404


# ── Profile generation ───────────────────────────────────────
class TestProfileGenerate:
    def test_generate_400_when_no_sources(self, auth):
        # Fresh employee with nothing connected
        r = auth.post(f"{BASE_URL}/api/ai-builder/employees",
                      json={"source": "blank", "name": "TEST_Empty_Style"})
        eid = r.json()["id"]
        try:
            g = auth.post(f"{BASE_URL}/api/ai-builder/employees/{eid}/style-profile/generate")
            assert g.status_code == 400
            assert "source" in g.text.lower() or "example" in g.text.lower()
        finally:
            auth.delete(f"{BASE_URL}/api/ai-builder/employees/{eid}")

    def test_generate_returns_draft(self, auth, employee):
        # Sources already added by prior tests (gmail, slack, manual)
        r = auth.post(
            f"{BASE_URL}/api/ai-builder/employees/{employee}/style-profile/generate",
            timeout=60,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "draft"
        p = d["profile"]
        for k in ("tone", "formality", "avg_sentence_length", "vocabulary",
                  "greeting", "sign_off", "emoji_usage",
                  "signature_phrases", "avoid_phrases", "summary"):
            assert k in p, f"missing key {k}"
        assert isinstance(p["signature_phrases"], list)
        assert isinstance(p["avoid_phrases"], list)
        assert p.get("generated_by") in ("claude-fable-5", "fallback")
        assert d["sample_count"] > 0

    def test_get_profile_after_generate(self, auth, employee):
        r = auth.get(f"{BASE_URL}/api/ai-builder/employees/{employee}/style-profile")
        assert r.status_code == 200
        d = r.json()
        assert d["draft"] is not None
        assert d["saved"] is None
        assert d["draft"]["status"] == "draft"

    def test_completeness_style_false_when_only_draft(self, auth, employee):
        r = auth.get(f"{BASE_URL}/api/ai-builder/employees/{employee}")
        assert r.status_code == 200
        checks = {c["label"]: c["done"] for c in r.json()["completeness"]["checks"]}
        assert checks.get("Style profile added") is False, \
            "Draft alone must NOT flip completeness check"


# ── Save profile + completeness ─────────────────────────────
class TestSaveProfile:
    def test_save_profile(self, auth, employee):
        edited = {
            "tone": "TEST_edited tone",
            "formality": "Neutral",
            "avg_sentence_length": "Short",
            "vocabulary": "Everyday",
            "greeting": "Hi [name],",
            "sign_off": "Best,",
            "emoji_usage": "None",
            "signature_phrases": ["Thanks so much"],
            "avoid_phrases": ["To whom it may concern"],
            "summary": "TEST edited summary",
        }
        r = auth.post(
            f"{BASE_URL}/api/ai-builder/employees/{employee}/style-profile",
            json={"profile": edited},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "saved"
        assert d["profile"]["tone"] == "TEST_edited tone"

    def test_save_clears_drafts(self, auth, employee):
        r = auth.get(f"{BASE_URL}/api/ai-builder/employees/{employee}/style-profile")
        d = r.json()
        assert d["saved"] is not None
        assert d["draft"] is None, "Saving must clear the draft"
        assert d["saved"]["profile"]["tone"] == "TEST_edited tone"

    def test_completeness_flips_after_save(self, auth, employee):
        r = auth.get(f"{BASE_URL}/api/ai-builder/employees/{employee}")
        checks = {c["label"]: c["done"] for c in r.json()["completeness"]["checks"]}
        assert checks["Style profile added"] is True

    def test_delete_style_profile(self, auth, employee):
        r = auth.delete(f"{BASE_URL}/api/ai-builder/employees/{employee}/style-profile")
        assert r.status_code == 200
        r2 = auth.get(f"{BASE_URL}/api/ai-builder/employees/{employee}/style-profile")
        d = r2.json()
        assert d["saved"] is None and d["draft"] is None


# ── Cascade delete + doc upload ─────────────────────────────
class TestCascade:
    def test_delete_employee_cascades_style(self, auth):
        r = auth.post(f"{BASE_URL}/api/ai-builder/employees",
                      json={"source": "blank", "name": "TEST_Cascade_Style"})
        eid = r.json()["id"]
        # Add a style source + a saved profile
        auth.post(f"{BASE_URL}/api/ai-builder/employees/{eid}/style-sources",
                  json={"source": "gmail"})
        auth.post(f"{BASE_URL}/api/ai-builder/employees/{eid}/style-profile",
                  json={"profile": {"tone": "test", "summary": "test", "signature_phrases": [], "avoid_phrases": []}})
        # Delete employee
        d = auth.delete(f"{BASE_URL}/api/ai-builder/employees/{eid}")
        assert d.status_code == 200
        # Sources + profile should now 404 (via require_emp)
        r2 = auth.get(f"{BASE_URL}/api/ai-builder/employees/{eid}/style-sources")
        assert r2.status_code == 404
        r3 = auth.get(f"{BASE_URL}/api/ai-builder/employees/{eid}/style-profile")
        assert r3.status_code == 404


class TestDocUpload:
    def test_upload_then_document(self, auth, employee):
        # POST /api/uploads with a multipart file
        s = requests.Session()
        # Preserve auth cookies/token
        s.headers.update({"Authorization": auth.headers.get("Authorization")})
        files = {"file": ("test_iter94.txt", io.BytesIO(b"TEST_upload document body content for iter94"), "text/plain")}
        r = s.post(f"{BASE_URL}/api/uploads", files=files, timeout=30)
        assert r.status_code in (200, 201), r.text
        up = r.json()
        assert "id" in up
        # Now POST /documents with the file_id
        r2 = auth.post(
            f"{BASE_URL}/api/ai-builder/employees/{employee}/documents",
            json={"title": "TEST_Uploaded_Doc", "category": "Style example",
                  "file_id": up["id"], "filename": up.get("filename", "test_iter94.txt")},
        )
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["title"] == "TEST_Uploaded_Doc"
        assert d["category"] == "Style example"
        assert d["file_id"] == up["id"]
