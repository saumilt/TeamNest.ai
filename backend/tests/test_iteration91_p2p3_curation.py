"""Iteration 91 — P2 drop announcement generator + P3 marketplace curation
(featured toggle + admin category CRUD). Uses the shared demo super/platform
admin (amit@demo.team) via /api/auth/demo-login (HttpOnly cookie session)."""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

DROP_CODE = "DEVOS100"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/demo-login", timeout=30)
    assert r.status_code == 200, f"demo-login failed: {r.status_code} {r.text[:200]}"
    return s


# ─── P2: Drop announcement generator ────────────────────────────────────────
class TestDropAnnouncement:
    def test_template_copy_all_platforms(self, admin_session):
        r = admin_session.get(
            f"{BASE_URL}/api/launch/admin/drops/{DROP_CODE}/announcement", timeout=30
        )
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "posts" in data and "meta" in data
        posts = data["posts"]
        for p in ("linkedin", "x", "instagram", "facebook"):
            assert p in posts, f"missing {p}"
            copy = posts[p]
            assert isinstance(copy, str) and len(copy) > 20
            assert DROP_CODE in copy, f"{p} missing code {DROP_CODE}"
        meta = data["meta"]
        assert meta["code"] == DROP_CODE
        assert isinstance(meta["spots_left"], int)
        assert meta["url"].endswith(f"/{DROP_CODE}")

    def test_ai_rewrite_all_platforms(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/launch/admin/drops/{DROP_CODE}/announcement/ai", timeout=90
        )
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        posts = data["posts"]
        for p in ("linkedin", "x", "instagram", "facebook"):
            assert p in posts and isinstance(posts[p], str) and posts[p].strip()
            # per spec must include invite code + URL
            assert DROP_CODE in posts[p], f"{p} missing code"
            assert "teamnest.ai/drop" in posts[p].lower(), f"{p} missing URL"
        assert data["meta"]["code"] == DROP_CODE

    def test_unknown_drop_404(self, admin_session):
        r = admin_session.get(
            f"{BASE_URL}/api/launch/admin/drops/NOPECODE/announcement", timeout=30
        )
        assert r.status_code == 404


# ─── P3: Marketplace categories + featured curation ─────────────────────────
class TestMarketCategories:
    def test_public_categories_active_only(self):
        r = requests.get(f"{BASE_URL}/api/market/categories", timeout=30)
        assert r.status_code == 200
        cats = r.json()["categories"]
        assert isinstance(cats, list) and len(cats) >= 1
        # public list must only return active
        for c in cats:
            assert c.get("active") is True
            assert "slug" in c and "label" in c

    def test_admin_category_crud(self, admin_session):
        # LIST
        r = admin_session.get(f"{BASE_URL}/api/market/admin/categories", timeout=30)
        assert r.status_code == 200
        # CREATE
        label = f"TEST_{uuid.uuid4().hex[:6]}"
        r = admin_session.post(
            f"{BASE_URL}/api/market/admin/categories",
            json={"label": label},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:200]
        created = r.json()
        cid = created["id"]
        assert created["label"] == label
        assert created["slug"].startswith("test-")
        assert created["active"] is True

        # RENAME
        new_label = label + "_R"
        r = admin_session.patch(
            f"{BASE_URL}/api/market/admin/categories/{cid}",
            json={"label": new_label}, timeout=30,
        )
        assert r.status_code == 200

        # DEACTIVATE — must disappear from public list
        r = admin_session.patch(
            f"{BASE_URL}/api/market/admin/categories/{cid}",
            json={"active": False}, timeout=30,
        )
        assert r.status_code == 200
        pub = requests.get(f"{BASE_URL}/api/market/categories", timeout=30).json()["categories"]
        assert not any(c["id"] == cid for c in pub), "inactive category leaked to public list"

        # DELETE
        r = admin_session.delete(
            f"{BASE_URL}/api/market/admin/categories/{cid}", timeout=30
        )
        assert r.status_code == 200
        # verify gone from admin list
        adm = admin_session.get(
            f"{BASE_URL}/api/market/admin/categories", timeout=30
        ).json()["categories"]
        assert not any(c["id"] == cid for c in adm), "deleted category still in admin list"

    def test_create_duplicate_category_rejected(self, admin_session):
        label = f"TEST_DUP_{uuid.uuid4().hex[:6]}"
        r1 = admin_session.post(
            f"{BASE_URL}/api/market/admin/categories",
            json={"label": label}, timeout=30,
        )
        assert r1.status_code == 200
        cid = r1.json()["id"]
        r2 = admin_session.post(
            f"{BASE_URL}/api/market/admin/categories",
            json={"label": label}, timeout=30,
        )
        assert r2.status_code == 400
        # cleanup
        admin_session.delete(f"{BASE_URL}/api/market/admin/categories/{cid}", timeout=30)


class TestMarketFeatured:
    def _pick_approved(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/market/admin/templates", timeout=30)
        assert r.status_code == 200
        tpls = r.json()["templates"]
        if not tpls:
            pytest.skip("no approved templates in this env")
        return tpls

    def test_admin_lists_featured_first(self, admin_session):
        tpls = self._pick_approved(admin_session)
        # sort invariant: featured must come before non-featured
        seen_non_featured = False
        for t in tpls:
            if seen_non_featured:
                assert not t.get("featured"), "featured template ordered after non-featured"
            elif not t.get("featured"):
                seen_non_featured = True

    def test_toggle_featured_and_public_ordering(self, admin_session):
        tpls = self._pick_approved(admin_session)
        target = tpls[-1]  # pick a non-featured-first candidate
        tid = target["id"]
        original = bool(target.get("featured"))
        try:
            # toggle ON
            r = admin_session.post(
                f"{BASE_URL}/api/market/admin/templates/{tid}/feature",
                json={"featured": True}, timeout=30,
            )
            assert r.status_code == 200, r.text[:200]
            assert r.json()["featured"] is True

            # public list must return this template featured=True and it should
            # appear before at least one non-featured (or be the only entry).
            pub = requests.get(f"{BASE_URL}/api/market/templates", timeout=30).json()["templates"]
            row = next((t for t in pub if t["id"] == tid), None)
            assert row is not None, "featured template missing from public list"
            assert row["featured"] is True

            # toggle OFF
            r = admin_session.post(
                f"{BASE_URL}/api/market/admin/templates/{tid}/feature",
                json={"featured": False}, timeout=30,
            )
            assert r.status_code == 200
            assert r.json()["featured"] is False
        finally:
            # restore
            admin_session.post(
                f"{BASE_URL}/api/market/admin/templates/{tid}/feature",
                json={"featured": original}, timeout=30,
            )

    def test_feature_unknown_id_404(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/market/admin/templates/does-not-exist/feature",
            json={"featured": True}, timeout=30,
        )
        assert r.status_code == 404

    def test_public_category_filter(self, admin_session):
        # pick any category slug used by an approved template
        pub = requests.get(f"{BASE_URL}/api/market/templates", timeout=30).json()["templates"]
        if not pub:
            pytest.skip("no approved templates")
        slug = next((t.get("category") for t in pub if t.get("category")), None)
        if not slug:
            pytest.skip("no category set on approved templates")
        r = requests.get(f"{BASE_URL}/api/market/templates?category={slug}", timeout=30)
        assert r.status_code == 200
        rows = r.json()["templates"]
        assert all(t["category"] == slug for t in rows), "category filter leaked other categories"
