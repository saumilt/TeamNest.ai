"""TeamNest Connectors — per-user OAuth connections for AI style training.

Phase 1 (framework) + live Gmail (read-only). Each user connects their OWN
account; tokens are encrypted at rest and never returned to the client. Gmail
is read-only: we extract sent-mail writing samples, redact them, and feed them
into the existing AI-employee style-source pipeline (generate → review → save).
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from deps import db, new_id, now_iso, require_user
from services import gmail_connector as gmail
from services import m365_connector as m365
from services.connector_crypto import decrypt, encrypt
from services.connectors_registry import DEFAULT_MODE, PERMISSION_MODES, get_provider, public_registry

router = APIRouter()

PUBLIC_URL = gmail.PUBLIC_URL
STATE_TTL_MIN = 10


async def _log(account_id: Optional[str], user_id: str, workspace_id: str, provider: str,
               action: str, status: str = "ok", **extra):
    await db.connector_logs.insert_one({
        "id": new_id(), "connector_account_id": account_id, "user_id": user_id,
        "workspace_id": workspace_id, "provider": provider, "action": action,
        "status": status, "created_at": now_iso(), **extra,
    })


# ── Registry + accounts ──────────────────────────────────────────────────
@router.get("/connectors")
async def list_connectors(current=Depends(require_user)):
    accounts = await db.connector_accounts.find(
        {"user_id": current["id"]},
        {"_id": 0, "id": 1, "provider": 1, "provider_account_email": 1,
         "connection_status": 1, "permission_mode": 1, "scopes_granted": 1,
         "last_sync_at": 1, "token_status": 1, "connected_at": 1},
    ).to_list(100)
    return {
        "registry": public_registry(),
        "permission_modes": PERMISSION_MODES,
        "accounts": accounts,
    }


# ── Gmail OAuth ────────────────────────────────────────────────────────────
@router.get("/oauth/gmail/login")
async def gmail_login(current=Depends(require_user)):
    if not gmail.is_configured():
        raise HTTPException(400, "Gmail connector is not configured on the server.")
    url, state = gmail.authorization_url()
    await db.connector_oauth_state.insert_one({
        "state": state, "user_id": current["id"], "workspace_id": current["workspace_id"],
        "provider": "gmail",
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=STATE_TTL_MIN)).isoformat(),
        "created_at": now_iso(),
    })
    return {"url": url}


@router.get("/oauth/gmail/callback")
async def gmail_callback(code: Optional[str] = None, state: Optional[str] = None,
                         error: Optional[str] = None):
    dest_ok = f"{PUBLIC_URL}/connectors?connected=gmail"
    dest_err = f"{PUBLIC_URL}/connectors?error=gmail"
    if error or not code or not state:
        return RedirectResponse(dest_err)

    st = await db.connector_oauth_state.find_one({"state": state}, {"_id": 0})
    await db.connector_oauth_state.delete_many({"state": state})
    if not st:
        return RedirectResponse(dest_err)
    exp = st.get("expires_at")
    try:
        if exp and datetime.fromisoformat(exp) < datetime.now(timezone.utc):
            return RedirectResponse(dest_err)
    except Exception:
        pass

    user_id, ws = st["user_id"], st["workspace_id"]
    try:
        creds = gmail.exchange_code(code)
        email = gmail.account_email(creds)
    except Exception:
        await _log(None, user_id, ws, "gmail", "connected", status="failed")
        return RedirectResponse(dest_err)

    now = now_iso()
    existing = await db.connector_accounts.find_one(
        {"user_id": user_id, "provider": "gmail"}, {"_id": 0, "id": 1})
    acc_id = existing["id"] if existing else new_id()
    acc = {
        "id": acc_id, "workspace_id": ws, "user_id": user_id, "provider": "gmail",
        "provider_account_email": email, "connection_status": "connected",
        "permission_mode": DEFAULT_MODE, "scopes_granted": gmail.SCOPES,
        "token_status": "active", "connected_at": now, "disconnected_at": None,
        "last_sync_at": None, "updated_at": now,
    }
    if existing:
        await db.connector_accounts.update_one({"id": acc_id}, {"$set": acc})
    else:
        acc["created_at"] = now
        await db.connector_accounts.insert_one(acc.copy())

    tok = gmail.creds_to_doc(creds)
    await db.connector_oauth_tokens.update_one(
        {"connector_account_id": acc_id},
        {"$set": {
            "connector_account_id": acc_id, "user_id": user_id, "provider": "gmail",
            "access_token": encrypt(tok["access_token"] or ""),
            "refresh_token": encrypt(tok["refresh_token"] or ""),
            "token_uri": tok["token_uri"], "client_id": tok["client_id"],
            "client_secret": encrypt(tok["client_secret"] or ""),
            "expires_at": tok["expires_at"], "updated_at": now,
        }, "$setOnInsert": {"id": new_id()}},
        upsert=True,
    )
    await _log(acc_id, user_id, ws, "gmail", "connected", scopes=gmail.SCOPES, account=email)
    return RedirectResponse(dest_ok)


async def _load_creds(account_id: str, user_id: str):
    tok = await db.connector_oauth_tokens.find_one(
        {"connector_account_id": account_id, "user_id": user_id}, {"_id": 0})
    if not tok:
        raise HTTPException(404, "No token for this connection")
    return gmail.doc_to_creds({
        "access_token": decrypt(tok["access_token"]),
        "refresh_token": decrypt(tok["refresh_token"]),
        "token_uri": tok.get("token_uri"),
        "client_id": tok.get("client_id"),
        "client_secret": decrypt(tok.get("client_secret", "")),
    })


async def _load_m365_token(account_id: str, user_id: str) -> dict:
    tok = await db.connector_oauth_tokens.find_one(
        {"connector_account_id": account_id, "user_id": user_id}, {"_id": 0})
    if not tok:
        raise HTTPException(404, "No token for this connection")
    return {
        "access_token": decrypt(tok["access_token"]),
        "refresh_token": decrypt(tok["refresh_token"]),
        "token_uri": tok.get("token_uri"),
        "client_id": tok.get("client_id"),
        "expires_at": tok.get("expires_at"),
    }


# ── Microsoft 365 / Outlook OAuth (read-only, Microsoft Graph) ───────────────
@router.get("/oauth/m365/login")
async def m365_login(current=Depends(require_user)):
    if not m365.is_configured():
        raise HTTPException(400, "Microsoft 365 connector is not configured on the server.")
    url, state = m365.authorization_url()
    await db.connector_oauth_state.insert_one({
        "state": state, "user_id": current["id"], "workspace_id": current["workspace_id"],
        "provider": "m365",
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=STATE_TTL_MIN)).isoformat(),
        "created_at": now_iso(),
    })
    return {"url": url}


@router.get("/oauth/m365/callback")
async def m365_callback(code: Optional[str] = None, state: Optional[str] = None,
                        error: Optional[str] = None):
    dest_ok = f"{PUBLIC_URL}/connectors?connected=m365"
    dest_err = f"{PUBLIC_URL}/connectors?error=m365"
    if error or not code or not state:
        return RedirectResponse(dest_err)
    st = await db.connector_oauth_state.find_one({"state": state}, {"_id": 0})
    await db.connector_oauth_state.delete_many({"state": state})
    if not st:
        return RedirectResponse(dest_err)
    exp = st.get("expires_at")
    try:
        if exp and datetime.fromisoformat(exp) < datetime.now(timezone.utc):
            return RedirectResponse(dest_err)
    except Exception:
        pass

    user_id, ws = st["user_id"], st["workspace_id"]
    try:
        tok = await m365.exchange_code(code)
        email = await m365.account_email(tok["access_token"])
    except Exception:
        await _log(None, user_id, ws, "m365", "connected", status="failed")
        return RedirectResponse(dest_err)

    now = now_iso()
    existing = await db.connector_accounts.find_one(
        {"user_id": user_id, "provider": "m365"}, {"_id": 0, "id": 1})
    acc_id = existing["id"] if existing else new_id()
    acc = {
        "id": acc_id, "workspace_id": ws, "user_id": user_id, "provider": "m365",
        "provider_account_email": email, "connection_status": "connected",
        "permission_mode": DEFAULT_MODE, "scopes_granted": m365.SCOPES,
        "token_status": "active", "connected_at": now, "disconnected_at": None,
        "last_sync_at": None, "updated_at": now,
    }
    if existing:
        await db.connector_accounts.update_one({"id": acc_id}, {"$set": acc})
    else:
        acc["created_at"] = now
        await db.connector_accounts.insert_one(acc.copy())

    await db.connector_oauth_tokens.update_one(
        {"connector_account_id": acc_id},
        {"$set": {
            "connector_account_id": acc_id, "user_id": user_id, "provider": "m365",
            "access_token": encrypt(tok["access_token"] or ""),
            "refresh_token": encrypt(tok["refresh_token"] or ""),
            "token_uri": tok["token_uri"], "client_id": tok["client_id"],
            "expires_at": tok["expires_at"], "updated_at": now,
        }, "$setOnInsert": {"id": new_id()}},
        upsert=True,
    )
    await _log(acc_id, user_id, ws, "m365", "connected", scopes=m365.SCOPES, account=email)
    return RedirectResponse(dest_ok)


# ── Disconnect + logs ──────────────────────────────────────────────────────
@router.post("/connectors/accounts/{account_id}/disconnect")
async def disconnect(account_id: str, current=Depends(require_user)):
    acc = await db.connector_accounts.find_one(
        {"id": account_id, "user_id": current["id"]}, {"_id": 0, "provider": 1})
    if not acc:
        raise HTTPException(404, "Connection not found")
    await db.connector_accounts.update_one(
        {"id": account_id},
        {"$set": {"connection_status": "disconnected", "token_status": "revoked",
                  "disconnected_at": now_iso(), "updated_at": now_iso()}},
    )
    await db.connector_oauth_tokens.delete_many({"connector_account_id": account_id})
    await _log(account_id, current["id"], current["workspace_id"], acc["provider"], "disconnected")
    return {"ok": True}


@router.get("/connectors/accounts/{account_id}/logs")
async def account_logs(account_id: str, current=Depends(require_user)):
    acc = await db.connector_accounts.find_one(
        {"id": account_id, "user_id": current["id"]}, {"_id": 0, "id": 1})
    if not acc:
        raise HTTPException(404, "Connection not found")
    rows = await db.connector_logs.find(
        {"connector_account_id": account_id}, {"_id": 0},
    ).sort("created_at", -1).to_list(100)
    return {"logs": rows}


# ── Style training from Gmail ──────────────────────────────────────────────
class TrainReq(BaseModel):
    account_id: str
    employee_id: str
    days: int = 90
    max_messages: int = 40
    preview_only: bool = False


async def _save_gmail_style_source(employee_id: str, workspace_id: str, account: dict, samples: list):
    """Attach redacted Gmail samples as a (non-mock) style source, replacing any prior Gmail source."""
    await db.ai_employee_style_sources.delete_many({"employee_id": employee_id, "source": "gmail"})
    await db.ai_employee_style_sources.insert_one({
        "id": new_id(), "employee_id": employee_id, "workspace_id": workspace_id,
        "source": "gmail", "label": f"Gmail · {account.get('provider_account_email') or 'connected'}",
        "is_mock": False, "redacted": True, "samples": samples, "created_at": now_iso(),
    })


async def _save_m365_style_source(employee_id: str, workspace_id: str, account: dict, samples: list):
    """Attach redacted Microsoft 365 samples as a style source, replacing any prior M365 source."""
    await db.ai_employee_style_sources.delete_many({"employee_id": employee_id, "source": "m365"})
    await db.ai_employee_style_sources.insert_one({
        "id": new_id(), "employee_id": employee_id, "workspace_id": workspace_id,
        "source": "m365", "label": f"Microsoft 365 · {account.get('provider_account_email') or 'connected'}",
        "is_mock": False, "redacted": True, "samples": samples, "created_at": now_iso(),
    })


@router.post("/connectors/gmail/train-employee")
async def train_employee(payload: TrainReq, current=Depends(require_user)):
    """Read-only Gmail → style training. With `preview_only` (recommended), we
    pull + redact recent SENT mail and return it for REVIEW without saving —
    the user confirms via `/connectors/gmail/save-training`. Without it, samples
    are attached directly (legacy behavior)."""
    acc = await db.connector_accounts.find_one(
        {"id": payload.account_id, "user_id": current["id"], "provider": "gmail",
         "connection_status": "connected"}, {"_id": 0})
    if not acc:
        raise HTTPException(404, "Gmail connection not found")
    emp = await db.ai_employees.find_one(
        {"id": payload.employee_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1})
    if not emp:
        raise HTTPException(404, "AI employee not found")

    creds = await _load_creds(payload.account_id, current["id"])
    await _log(payload.account_id, current["id"], current["workspace_id"], "gmail",
               "training_analysis_started")
    try:
        refreshed = {}

        def _on_refresh(c):
            refreshed["doc"] = gmail.creds_to_doc(c)
        samples = gmail.fetch_sent_samples(
            creds, max_messages=payload.max_messages, days=payload.days, on_refresh=_on_refresh)
        if refreshed.get("doc"):
            await db.connector_oauth_tokens.update_one(
                {"connector_account_id": payload.account_id},
                {"$set": {"access_token": encrypt(refreshed["doc"]["access_token"] or ""),
                          "expires_at": refreshed["doc"]["expires_at"]}})
    except Exception:
        await _log(payload.account_id, current["id"], current["workspace_id"], "gmail",
                   "sync_failed", status="failed")
        raise HTTPException(502, "Could not read Gmail. Try reconnecting the account.")

    if not samples:
        raise HTTPException(400, "No suitable sent emails found in the selected range.")

    sample_texts = [s["text"] for s in samples]

    if payload.preview_only:
        # Stage for review — do NOT save as a style source yet.
        preview_id = new_id()
        await db.connector_style_previews.update_one(
            {"account_id": payload.account_id, "employee_id": payload.employee_id, "user_id": current["id"]},
            {"$set": {"preview_id": preview_id, "account_id": payload.account_id,
                      "employee_id": payload.employee_id, "user_id": current["id"],
                      "workspace_id": current["workspace_id"], "samples": sample_texts,
                      "days": payload.days, "created_at": now_iso()},
             "$setOnInsert": {"id": new_id()}},
            upsert=True,
        )
        await _log(payload.account_id, current["id"], current["workspace_id"], "gmail",
                   "training_preview_generated", records_analyzed=len(samples))
        return {
            "ok": True, "preview_only": True, "preview_id": preview_id,
            "samples_found": len(samples),
            "preview": [t[:400] for t in sample_texts],
            "note": "Review these redacted samples, then save to attach them to the employee. "
                    "We learn style, not secrets — emails were redacted before analysis.",
        }

    await _save_gmail_style_source(payload.employee_id, current["workspace_id"], acc, sample_texts)
    await db.connector_accounts.update_one(
        {"id": payload.account_id}, {"$set": {"last_sync_at": now_iso()}})
    await _log(payload.account_id, current["id"], current["workspace_id"], "gmail",
               "training_analysis_completed", records_analyzed=len(samples), redactions=len(samples))
    return {
        "ok": True,
        "samples_added": len(samples),
        "preview": [t[:280] for t in sample_texts[:3]],
        "next": f"/ai-builder/{payload.employee_id}",
        "note": "We learn style, not secrets — emails were redacted before analysis. "
                "Generate & review the style profile in the AI builder before saving.",
    }


class SaveTrainingReq(BaseModel):
    preview_id: str


@router.post("/connectors/gmail/save-training")
async def save_training(payload: SaveTrainingReq, current=Depends(require_user)):
    """Confirm a reviewed preview → attach its samples to the employee."""
    prev = await db.connector_style_previews.find_one(
        {"preview_id": payload.preview_id, "user_id": current["id"]}, {"_id": 0})
    if not prev:
        raise HTTPException(404, "Preview not found or expired — re-run the preview")
    acc = await db.connector_accounts.find_one(
        {"id": prev["account_id"], "user_id": current["id"]}, {"_id": 0})
    if not acc:
        raise HTTPException(404, "Gmail connection not found")

    await _save_gmail_style_source(prev["employee_id"], current["workspace_id"], acc, prev["samples"])
    await db.connector_accounts.update_one(
        {"id": prev["account_id"]}, {"$set": {"last_sync_at": now_iso()}})
    await db.connector_style_previews.delete_many(
        {"preview_id": payload.preview_id, "user_id": current["id"]})
    await _log(prev["account_id"], current["id"], current["workspace_id"], "gmail",
               "training_analysis_completed", records_analyzed=len(prev["samples"]),
               redactions=len(prev["samples"]))
    return {
        "ok": True, "samples_added": len(prev["samples"]),
        "next": f"/ai-builder/{prev['employee_id']}",
        "note": "Samples attached. Generate & review the style profile in the AI builder before saving.",
    }


# ── Style training from Microsoft 365 (read-only, review-before-save) ─────────
@router.post("/connectors/m365/train-employee")
async def m365_train_employee(payload: TrainReq, current=Depends(require_user)):
    """Read-only Microsoft 365 → style training. `preview_only` pulls + redacts
    recent SENT mail and returns it for review without saving; confirm via
    /connectors/m365/save-training."""
    acc = await db.connector_accounts.find_one(
        {"id": payload.account_id, "user_id": current["id"], "provider": "m365",
         "connection_status": "connected"}, {"_id": 0})
    if not acc:
        raise HTTPException(404, "Microsoft 365 connection not found")
    emp = await db.ai_employees.find_one(
        {"id": payload.employee_id, "workspace_id": current["workspace_id"]}, {"_id": 0, "id": 1})
    if not emp:
        raise HTTPException(404, "AI employee not found")

    token_doc = await _load_m365_token(payload.account_id, current["id"])
    await _log(payload.account_id, current["id"], current["workspace_id"], "m365",
               "training_analysis_started")
    try:
        refreshed = {}

        def _on_refresh(d):
            refreshed["doc"] = d
        samples = await m365.fetch_sent_samples(
            token_doc, max_messages=payload.max_messages, days=payload.days, on_refresh=_on_refresh)
        if refreshed.get("doc"):
            d = refreshed["doc"]
            await db.connector_oauth_tokens.update_one(
                {"connector_account_id": payload.account_id},
                {"$set": {"access_token": encrypt(d["access_token"] or ""),
                          "refresh_token": encrypt(d.get("refresh_token") or ""),
                          "expires_at": d["expires_at"]}})
    except Exception:
        await _log(payload.account_id, current["id"], current["workspace_id"], "m365",
                   "sync_failed", status="failed")
        raise HTTPException(502, "Could not read Microsoft 365 mail. Try reconnecting the account.")

    if not samples:
        raise HTTPException(400, "No suitable sent emails found in the selected range.")
    sample_texts = [s["text"] for s in samples]

    if payload.preview_only:
        preview_id = new_id()
        await db.connector_style_previews.update_one(
            {"account_id": payload.account_id, "employee_id": payload.employee_id, "user_id": current["id"]},
            {"$set": {"preview_id": preview_id, "account_id": payload.account_id,
                      "employee_id": payload.employee_id, "user_id": current["id"],
                      "workspace_id": current["workspace_id"], "samples": sample_texts,
                      "provider": "m365", "days": payload.days, "created_at": now_iso()},
             "$setOnInsert": {"id": new_id()}},
            upsert=True,
        )
        await _log(payload.account_id, current["id"], current["workspace_id"], "m365",
                   "training_preview_generated", records_analyzed=len(samples))
        return {
            "ok": True, "preview_only": True, "preview_id": preview_id,
            "samples_found": len(samples), "preview": [t[:400] for t in sample_texts],
            "note": "Review these redacted samples, then save to attach them to the employee. "
                    "We learn style, not secrets — emails were redacted before analysis.",
        }

    await _save_m365_style_source(payload.employee_id, current["workspace_id"], acc, sample_texts)
    await db.connector_accounts.update_one(
        {"id": payload.account_id}, {"$set": {"last_sync_at": now_iso()}})
    await _log(payload.account_id, current["id"], current["workspace_id"], "m365",
               "training_analysis_completed", records_analyzed=len(samples), redactions=len(samples))
    return {"ok": True, "samples_added": len(samples), "preview": [t[:280] for t in sample_texts[:3]],
            "next": f"/ai-builder/{payload.employee_id}",
            "note": "We learn style, not secrets — emails were redacted before analysis."}


@router.post("/connectors/m365/save-training")
async def m365_save_training(payload: SaveTrainingReq, current=Depends(require_user)):
    """Confirm a reviewed M365 preview → attach its samples to the employee."""
    prev = await db.connector_style_previews.find_one(
        {"preview_id": payload.preview_id, "user_id": current["id"]}, {"_id": 0})
    if not prev:
        raise HTTPException(404, "Preview not found or expired — re-run the preview")
    acc = await db.connector_accounts.find_one(
        {"id": prev["account_id"], "user_id": current["id"]}, {"_id": 0})
    if not acc:
        raise HTTPException(404, "Microsoft 365 connection not found")
    await _save_m365_style_source(prev["employee_id"], current["workspace_id"], acc, prev["samples"])
    await db.connector_accounts.update_one(
        {"id": prev["account_id"]}, {"$set": {"last_sync_at": now_iso()}})
    await db.connector_style_previews.delete_many(
        {"preview_id": payload.preview_id, "user_id": current["id"]})
    await _log(prev["account_id"], current["id"], current["workspace_id"], "m365",
               "training_analysis_completed", records_analyzed=len(prev["samples"]),
               redactions=len(prev["samples"]))
    return {"ok": True, "samples_added": len(prev["samples"]),
            "next": f"/ai-builder/{prev['employee_id']}",
            "note": "Samples attached. Generate & review the style profile in the AI builder before saving."}
