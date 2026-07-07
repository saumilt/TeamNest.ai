"""QuickBooks Online OAuth 2.0 + minimal write-back.

Per-workspace token storage in `qbo_connections` collection. Token refresh
runs lazily on every API call. Sandbox-only in this release.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from deps import db, new_id, now_iso, require_user
from routes.ai_employees import log_employee_activity

router = APIRouter()

QUICKBOOKS_CLIENT_ID = os.environ.get("QUICKBOOKS_CLIENT_ID") or ""
QUICKBOOKS_CLIENT_SECRET = os.environ.get("QUICKBOOKS_CLIENT_SECRET") or ""
QUICKBOOKS_REDIRECT_URI = os.environ.get("QUICKBOOKS_REDIRECT_URI") or ""
QUICKBOOKS_ENVIRONMENT = os.environ.get("QUICKBOOKS_ENVIRONMENT", "sandbox")
QUICKBOOKS_SCOPES = os.environ.get("QUICKBOOKS_SCOPES", "com.intuit.quickbooks.accounting")

SANDBOX_BASE_URL = "https://sandbox-quickbooks.api.intuit.com"
PROD_BASE_URL = "https://quickbooks.api.intuit.com"


def _base_url() -> str:
    return SANDBOX_BASE_URL if QUICKBOOKS_ENVIRONMENT == "sandbox" else PROD_BASE_URL


def _resolve_redirect_uri(request: Request) -> str:
    """Resolve redirect_uri. Always prefers QUICKBOOKS_REDIRECT_URI from
    env. If blank, falls back to the public REACT_APP_BACKEND_URL so the URI
    matches what's registered in the Intuit developer portal — Intuit
    rejects internal cluster hostnames."""
    if QUICKBOOKS_REDIRECT_URI:
        return QUICKBOOKS_REDIRECT_URI
    public_base = os.environ.get("PUBLIC_BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL") or str(request.base_url).rstrip("/")
    public_base = public_base.rstrip("/")
    return f"{public_base}/api/qbo/callback"


def _get_auth_client(request: Request):
    from intuitlib.client import AuthClient
    return AuthClient(
        client_id=QUICKBOOKS_CLIENT_ID,
        client_secret=QUICKBOOKS_CLIENT_SECRET,
        redirect_uri=_resolve_redirect_uri(request),
        environment=QUICKBOOKS_ENVIRONMENT,
    )


@router.get("/qbo/auth")
async def qbo_auth_start(request: Request, current=Depends(require_user)):
    """Return the Intuit consent URL for the frontend to redirect to. The
    `state` carries the workspace ID so the callback can attribute the
    connection to the right workspace."""
    if not QUICKBOOKS_CLIENT_ID or not QUICKBOOKS_CLIENT_SECRET:
        raise HTTPException(503, "QuickBooks integration is not configured.")
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only owners/admins can connect QuickBooks.")
    from intuitlib.enums import Scopes
    client = _get_auth_client(request)
    state = current["workspace_id"]
    # Map the string scope env var to enum values.
    scope_enums = [Scopes.ACCOUNTING] if "accounting" in QUICKBOOKS_SCOPES else []
    url = client.get_authorization_url(scope_enums, state_token=state)
    return {"authorization_url": url}


@router.get("/qbo/callback")
async def qbo_callback(
    request: Request,
    code: Optional[str] = Query(None),
    realmId: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """OAuth callback. Intuit redirects here with ?code=&realmId=&state="""
    if error:
        return RedirectResponse(f"/employees?qbo_error={error}")
    if not code or not realmId or not state:
        raise HTTPException(400, "Missing code, realmId, or state")
    workspace_id = state

    client = _get_auth_client(request)
    try:
        client.get_bearer_token(code, realm_id=realmId)
    except Exception as e:
        raise HTTPException(500, f"Token exchange failed: {e}")

    now = datetime.now(timezone.utc)
    record = {
        "id": new_id(),
        "workspace_id": workspace_id,
        "realm_id": realmId,
        "access_token": client.access_token,
        "refresh_token": client.refresh_token,
        "access_token_expires_at": (now + timedelta(seconds=int(client.expires_in or 3600))).isoformat(),
        "refresh_token_expires_at": (now + timedelta(seconds=int(client.x_refresh_token_expires_in or 8640000))).isoformat(),
        "environment": QUICKBOOKS_ENVIRONMENT,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.qbo_connections.update_one(
        {"workspace_id": workspace_id},
        {"$set": record},
        upsert=True,
    )
    await log_employee_activity(
        workspace_id=workspace_id, employee_key="bookkeeper",
        actor_id="qbo-system", kind="qbo_connected",
        summary=f"Connected QuickBooks {QUICKBOOKS_ENVIRONMENT} (realm {realmId})",
    )
    return RedirectResponse("/bookkeeper?qbo=connected")


async def _get_valid_token(workspace_id: str, request: Request) -> tuple[str, str]:
    conn = await db.qbo_connections.find_one({"workspace_id": workspace_id}, {"_id": 0})
    if not conn:
        raise HTTPException(412, "QuickBooks is not connected. Connect from the Bookkeeper page.")
    now = datetime.now(timezone.utc)
    exp = datetime.fromisoformat(conn["access_token_expires_at"].replace("Z", "+00:00"))
    if now < exp - timedelta(minutes=2):
        return conn["access_token"], conn["realm_id"]
    # Refresh.
    client = _get_auth_client(request)
    client.refresh_token = conn["refresh_token"]
    try:
        client.refresh()
    except Exception as e:
        raise HTTPException(401, f"QuickBooks token refresh failed: {e}. Reconnect.")
    new_now = datetime.now(timezone.utc)
    await db.qbo_connections.update_one(
        {"workspace_id": workspace_id},
        {"$set": {
            "access_token": client.access_token,
            "refresh_token": client.refresh_token,
            "access_token_expires_at": (new_now + timedelta(seconds=int(client.expires_in or 3600))).isoformat(),
            "refresh_token_expires_at": (new_now + timedelta(seconds=int(client.x_refresh_token_expires_in or 8640000))).isoformat(),
            "updated_at": now_iso(),
        }},
    )
    return client.access_token, conn["realm_id"]


@router.get("/qbo/status")
async def qbo_status(current=Depends(require_user)):
    conn = await db.qbo_connections.find_one(
        {"workspace_id": current["workspace_id"]}, {"_id": 0, "access_token": 0, "refresh_token": 0}
    )
    if not conn:
        return {"connected": False, "server_environment": QUICKBOOKS_ENVIRONMENT}
    stored_env = conn.get("environment") or "sandbox"
    env_mismatch = stored_env != QUICKBOOKS_ENVIRONMENT
    return {
        "connected": True,
        "realm_id": conn.get("realm_id"),
        "environment": stored_env,
        "server_environment": QUICKBOOKS_ENVIRONMENT,
        "env_mismatch": env_mismatch,
        "connected_at": conn.get("created_at"),
    }


@router.post("/qbo/disconnect")
async def qbo_disconnect(request: Request, current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Only admins can disconnect QuickBooks.")
    conn = await db.qbo_connections.find_one({"workspace_id": current["workspace_id"]}, {"_id": 0})
    if not conn:
        return {"ok": True, "note": "not_connected"}
    try:
        client = _get_auth_client(request)
        client.revoke(token=conn["refresh_token"])
    except Exception:
        pass  # always remove local record
    await db.qbo_connections.delete_one({"workspace_id": current["workspace_id"]})
    return {"ok": True}


@router.post("/qbo/sync-pending")
async def qbo_sync_pending(request: Request, current=Depends(require_user)):
    """Push the pending_qb_sync queue into QuickBooks Online as Purchase entries.

    Each pending entry becomes one Purchase posted against a default bank
    account (the first Bank-type account on the chart of accounts). The
    expense line uses the AI-suggested category if it maps to a real
    account; otherwise falls back to 'Other'.
    """
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Admins only")
    access_token, realm_id = await _get_valid_token(current["workspace_id"], request)

    # 1. List accounts to map category names → account IDs.
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    accounts_resp = requests.get(
        f"{_base_url()}/v3/company/{realm_id}/query?query=SELECT * FROM Account",
        headers=headers, timeout=30,
    )
    if accounts_resp.status_code != 200:
        raise HTTPException(502, f"QB accounts query failed: {accounts_resp.text}")
    qb_accounts = accounts_resp.json().get("QueryResponse", {}).get("Account", [])
    name_to_id = {a["Name"]: a["Id"] for a in qb_accounts}
    bank_accounts = [a for a in qb_accounts if a.get("AccountType") == "Bank"]
    expense_accounts = [a for a in qb_accounts if a.get("AccountType") == "Expense"]
    if not bank_accounts or not expense_accounts:
        raise HTTPException(400, "Sandbox company needs at least one Bank and one Expense account.")
    default_bank_id = bank_accounts[0]["Id"]
    default_expense_id = expense_accounts[0]["Id"]

    pending = await db.bk_pending_qb_sync.find(
        {"workspace_id": current["workspace_id"], "status": "pending_sync"},
        {"_id": 0},
    ).to_list(200)
    if not pending:
        return {"ok": True, "pushed": 0}

    pushed, failed = 0, []
    for entry in pending:
        category_account_id = name_to_id.get(entry.get("account") or "", default_expense_id)
        # If suggested category is not a real QB account name, fall back.
        if entry.get("account") not in name_to_id:
            category_account_id = default_expense_id

        amount = abs(float(entry["amount"]))
        purchase = {
            "TxnDate": entry.get("date"),
            "PaymentType": "Cash",  # Cash + AccountRef bank = expense paid from bank
            "AccountRef": {"value": default_bank_id},
            "PrivateNote": f"AI Bookkeeper · {entry.get('description','')[:140]}",
            "Line": [{
                "Amount": amount,
                "DetailType": "AccountBasedExpenseLineDetail",
                "AccountBasedExpenseLineDetail": {
                    "AccountRef": {"value": category_account_id},
                },
                "Description": entry.get("description", "")[:1000],
            }],
        }
        resp = requests.post(
            f"{_base_url()}/v3/company/{realm_id}/purchase",
            headers={**headers, "Content-Type": "application/json"},
            json=purchase, timeout=30,
        )
        if resp.status_code in (200, 201):
            qb_id = resp.json().get("Purchase", {}).get("Id")
            await db.bk_pending_qb_sync.update_one(
                {"id": entry["id"]},
                {"$set": {"status": "synced_real", "synced_at": now_iso(), "qb_purchase_id": qb_id}},
            )
            pushed += 1
        else:
            failed.append({"id": entry["id"], "error": resp.text[:200]})

    await log_employee_activity(
        workspace_id=current["workspace_id"], employee_key="bookkeeper",
        actor_id=current["id"], kind="qbo_sync_pushed",
        summary=f"Pushed {pushed} entries to QuickBooks (failed: {len(failed)})",
        metadata={"pushed": pushed, "failed_count": len(failed)},
    )
    return {"ok": True, "pushed": pushed, "failed": failed}
