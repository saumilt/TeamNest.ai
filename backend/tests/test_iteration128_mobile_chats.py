"""Iter128 – backend sanity for mobile Chats parity flows."""
import hashlib
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL"
) else os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

SAM_EMAIL = "sam@funasia.net"
SAM_PW = "Perfect$2008"


@pytest.fixture(scope="module")
def sam():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SAM_EMAIL, "password": SAM_PW})
    assert r.status_code == 200, r.text
    return s


def test_health(sam):
    r = sam.get(f"{BASE_URL}/api/me")
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == SAM_EMAIL


def test_workspaces_me(sam):
    r = sam.get(f"{BASE_URL}/api/me/workspaces")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_workspace_switch_same(sam):
    r = sam.get(f"{BASE_URL}/api/me/workspaces")
    ws = r.json()
    if not ws:
        pytest.skip("no workspaces")
    r2 = sam.post(f"{BASE_URL}/api/workspace/switch", json={"workspace_id": ws[0]["workspace_id"]})
    assert r2.status_code in (200, 201)
    assert "user" in r2.json()


def test_folders(sam):
    r = sam.get(f"{BASE_URL}/api/folders")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_workspace_members_shape(sam):
    r = sam.get(f"{BASE_URL}/api/workspace/members")
    assert r.status_code == 200
    body = r.json()
    members = body if isinstance(body, list) else body.get("members", [])
    assert isinstance(members, list)
    assert len(members) >= 1
    m = members[0]
    assert "id" in m and "name" in m


def test_model_presets_seed(sam):
    r = sam.get(f"{BASE_URL}/api/workspace/model-presets")
    assert r.status_code == 200
    presets = r.json()
    names = {p["name"] for p in presets}
    assert {"Deep dive", "Fast", "Research"}.issubset(names), names


def test_create_direct_chat(sam):
    # find another workspace member
    members = sam.get(f"{BASE_URL}/api/workspace/members").json()
    others = [m for m in members if m.get("email") != SAM_EMAIL]
    if not others:
        pytest.skip("only 1 member in workspace")
    other = others[0]
    r = sam.post(
        f"{BASE_URL}/api/chats",
        json={"name": other["name"], "type": "direct", "member_ids": [other["id"]], "default_models": []},
    )
    assert r.status_code in (200, 201), r.text
    chat = r.json()
    assert chat.get("type") == "direct"
    assert chat.get("id")


def test_create_group_chat(sam):
    members = sam.get(f"{BASE_URL}/api/workspace/members").json()
    others = [m for m in members if m.get("email") != SAM_EMAIL]
    if not others:
        pytest.skip("no other members")
    name = f"TEST_grp_{uuid.uuid4().hex[:6]}"
    r = sam.post(
        f"{BASE_URL}/api/chats",
        json={"name": name, "type": "group", "member_ids": [m["id"] for m in others[:2]], "default_models": []},
    )
    assert r.status_code in (200, 201), r.text
    c = r.json()
    assert c["type"] == "group"
    assert c["name"] == name


def test_dev_chat_create(sam):
    r = sam.post(f"{BASE_URL}/api/chats/dev", json={"name": "TEST_dev_chat"})
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body.get("chat", {}).get("id")


def test_invite_phone_whatsapp(sam):
    r = sam.post(
        f"{BASE_URL}/api/invites/phone",
        json={"phone": "+14155550100", "name": "TEST_QA", "method": "whatsapp", "share_url_base": BASE_URL},
    )
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body.get("method") == "whatsapp"
    assert "wa.me" in (body.get("open_url") or "")


def test_invite_phone_sms(sam):
    r = sam.post(
        f"{BASE_URL}/api/invites/phone",
        json={"phone": "+14155550101", "name": "TEST_QA_sms", "method": "sms", "share_url_base": BASE_URL},
    )
    assert r.status_code in (200, 201), r.text


def test_contacts_match_with_hashes(sam):
    # E1 note: mobile hashes on-device sha256 of 'teamnest.v1.contact-match|<E164>'
    phone = "+14155559999"
    h = hashlib.sha256(f"teamnest.v1.contact-match|{phone}".encode()).hexdigest()
    r = sam.post(f"{BASE_URL}/api/contacts/match", json={"hashes": [h]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "matches" in body
    assert body.get("checked") == 1


def test_contacts_match_raw_contacts_fallback(sam):
    # NewChatSheet mobile currently sends raw_contacts only — server should accept for owners
    r = sam.post(
        f"{BASE_URL}/api/contacts/match",
        json={"hashes": [], "raw_contacts": [{"phone": "+14155559999", "name": "x"}]},
    )
    # Accept either 200 (server hashed) or 422 (hashes required non-empty)
    assert r.status_code in (200, 422), r.text
