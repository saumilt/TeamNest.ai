"""Template Marketplace — public app store, seller submissions, admin review,
Stripe checkout (one-time + monthly) with a 70/30 seller/platform split."""
import logging
import os
import re
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from deps import db, is_super_admin, new_id, now_iso, require_user

router = APIRouter()
logger = logging.getLogger("teamnest")

PLATFORM_FEE = 0.30
SHOTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "market_shots")

DEFAULT_CATEGORIES = [
    ("saas", "SaaS"), ("crm", "CRM"), ("finance", "Finance"),
    ("internal", "Internal Tools"), ("marketplace", "Marketplace"),
    ("community", "Community"), ("healthcare", "Healthcare"),
    ("ai", "AI"), ("other", "Other"),
]

_MIME_BY_EXT = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
}


def _is_platform_admin(current: Dict[str, Any]) -> bool:
    emails = os.environ.get("PLATFORM_ADMIN_EMAILS", "")
    allowed = {e.strip().lower() for e in emails.split(",") if e.strip()}
    return (current.get("email") or "").lower() in allowed


def _require_admin(current: Dict[str, Any]) -> None:
    """Platform admins (PLATFORM_ADMIN_EMAILS) and super admins can curate."""
    if not (_is_platform_admin(current) or is_super_admin(current)):
        raise HTTPException(403, "Platform admin only")


def _public(t: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": t["id"], "name": t["name"], "tagline": t.get("tagline", ""),
        "description": t.get("description", ""), "category": t.get("category"),
        "pricing": t.get("pricing") or {"model": "free", "price_usd": 0},
        "creator_name": t.get("creator_name", "TeamNest"),
        "installs": t.get("installs", 0), "status": t.get("status"),
        "featured": bool(t.get("featured")),
        "has_screenshot": bool(t.get("screenshot_file")),
        "created_at": t.get("created_at"),
    }


class TemplateSubmit(BaseModel):
    project_id: str
    name: str = Field(min_length=2, max_length=80)
    tagline: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=2000)
    category: str = Field(default="other", max_length=30)
    pricing_model: str = Field(pattern="^(free|one_time|monthly)$")
    price_usd: float = Field(default=0, ge=0, le=10000)


class PayoutAccount(BaseModel):
    stripe_account_id: str = Field(pattern=r"^acct_[A-Za-z0-9]+$")


class ReviewDecision(BaseModel):
    notes: str = ""


class CheckoutStart(BaseModel):
    origin_url: str


# ─── Public store ─────────────────────────────────────────────────────────
async def _ensure_categories() -> None:
    if await db.mkt_categories.count_documents({}) == 0:
        for i, (slug, label) in enumerate(DEFAULT_CATEGORIES):
            await db.mkt_categories.insert_one({
                "id": new_id(), "slug": slug, "label": label,
                "order": i, "active": True, "created_at": now_iso(),
            })


@router.get("/market/categories")
async def list_categories():
    """Public: active marketplace categories, ordered."""
    await _ensure_categories()
    rows = await db.mkt_categories.find(
        {"active": True}, {"_id": 0}
    ).sort("order", 1).to_list(100)
    return {"categories": rows}


@router.get("/market/templates")
async def list_market_templates(category: str = ""):
    filt: Dict[str, Any] = {"status": "approved"}
    if category and category.lower() != "all":
        filt["category"] = category.lower()
    rows = await db.mkt_templates.find(filt, {"_id": 0, "files": 0}) \
        .sort([("featured", -1), ("installs", -1), ("created_at", -1)]).to_list(200)
    return {"templates": [_public(t) for t in rows]}


@router.get("/market/templates/{template_id}")
async def get_market_template(template_id: str):
    t = await db.mkt_templates.find_one({"id": template_id}, {"_id": 0, "files": 0})
    if not t:
        raise HTTPException(404, "Template not found")
    await db.mkt_templates.update_one({"id": template_id}, {"$inc": {"views": 1}})
    return _public(t)


@router.get("/market/templates/{template_id}/screenshot")
async def market_template_screenshot(template_id: str):
    t = await db.mkt_templates.find_one({"id": template_id}, {"_id": 0, "screenshot_file": 1})
    if not t or not t.get("screenshot_file"):
        raise HTTPException(404, "No screenshot")
    path = os.path.join(SHOTS_DIR, os.path.basename(t["screenshot_file"]))
    if not os.path.exists(path):
        raise HTTPException(404, "No screenshot")
    return FileResponse(path, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=3600"})


@router.get("/market/templates/{template_id}/demo/{file_path:path}")
async def market_template_demo(template_id: str, file_path: str = ""):
    t = await db.mkt_templates.find_one({"id": template_id}, {"_id": 0, "files": 1})
    if not t:
        raise HTTPException(404, "Template not found")
    path = file_path or "index.html"
    by_path = {f["path"]: f for f in (t.get("files") or [])}
    f = by_path.get(f"frontend/{path}") or by_path.get(path)
    if not f:
        raise HTTPException(404, "File not found in demo")
    ext = "." + f["path"].rsplit(".", 1)[1].lower() if "." in f["path"] else ""
    content = f.get("content") or ""
    if ext == ".html":
        from services.dev_preview_shim import _inject_login_shim, PREVIEW_HEADERS
        content = _inject_login_shim(content)
        return Response(content=content, media_type="text/html; charset=utf-8",
                        headers=PREVIEW_HEADERS)
    return Response(content=content, media_type=_MIME_BY_EXT.get(ext, "text/plain; charset=utf-8"))


# ─── Seller ───────────────────────────────────────────────────────────────
@router.post("/market/templates")
async def submit_template(payload: TemplateSubmit, current=Depends(require_user)):
    project = await db.dev_projects.find_one(
        {"id": payload.project_id, "workspace_id": current["workspace_id"]}, {"_id": 0},
    )
    if not project:
        raise HTTPException(404, "Project not found")
    files = await db.dev_code_files.find(
        {"project_id": payload.project_id},
        {"_id": 0, "path": 1, "kind": 1, "role": 1, "content": 1},
    ).to_list(200)
    if not files:
        raise HTTPException(400, "This project has no code files yet — build it first")
    if payload.pricing_model != "free" and payload.price_usd <= 0:
        raise HTTPException(400, "Set a price greater than 0, or choose Free")
    # Platform flag: when template approval is NOT required, auto-publish the
    # submission so it appears in the marketplace immediately.
    from services.platform_settings import flag
    approval_required = await flag("require_template_approval")
    status = "submitted" if approval_required else "approved"
    doc = {
        "id": new_id(),
        "name": payload.name.strip(),
        "tagline": payload.tagline.strip(),
        "description": payload.description.strip(),
        "category": payload.category.strip().lower(),
        "pricing": {"model": payload.pricing_model,
                    "price_usd": round(payload.price_usd, 2) if payload.pricing_model != "free" else 0},
        "files": {f["path"]: f for f in files} and list({f["path"]: f for f in files}.values()),
        "source_project_id": payload.project_id,
        "creator_user_id": current["id"],
        "creator_workspace_id": current["workspace_id"],
        "creator_name": current.get("name") or current.get("email", "Seller"),
        "status": status,
        "review_notes": "" if approval_required else "Auto-approved (approval disabled by platform admin)",
        "installs": 0,
        "screenshot_file": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.mkt_templates.insert_one(doc.copy())
    return {k: v for k, v in doc.items() if k != "files"}


@router.get("/market/mine")
async def my_templates(current=Depends(require_user)):
    from collections import defaultdict
    from datetime import datetime, timedelta, timezone
    rows = await db.mkt_templates.find(
        {"creator_user_id": current["id"]}, {"_id": 0, "files": 0},
    ).sort("created_at", -1).to_list(100)
    earnings = await db.mkt_earnings.find(
        {"seller_user_id": current["id"]}, {"_id": 0},
    ).to_list(1000)
    total = sum(e.get("amount_cents", 0) for e in earnings)
    pending = sum(e.get("amount_cents", 0) for e in earnings if e.get("status") == "pending")
    acct = await db.mkt_payout_accounts.find_one({"user_id": current["id"]}, {"_id": 0})

    # Per-template revenue/sales + 30-day revenue trend.
    by_day: Dict[str, int] = defaultdict(int)
    by_tpl: Dict[str, Dict[str, int]] = defaultdict(lambda: {"revenue_cents": 0, "sales": 0})
    for e in earnings:
        by_day[(e.get("created_at") or "")[:10]] += e.get("amount_cents", 0)
        tid = e.get("template_id") or "?"
        by_tpl[tid]["revenue_cents"] += e.get("amount_cents", 0)
        by_tpl[tid]["sales"] += 1
    today = datetime.now(timezone.utc)
    days = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(29, -1, -1)]
    trend = [{"date": d, "cents": by_day.get(d, 0)} for d in days]

    templates = []
    for t in rows:
        stats = by_tpl.get(t["id"], {"revenue_cents": 0, "sales": 0})
        views = t.get("views", 0)
        installs = t.get("installs", 0)
        templates.append(dict(
            _public(t),
            review_notes=t.get("review_notes", ""),
            views=views,
            sales=stats["sales"],
            revenue_cents=stats["revenue_cents"],
            conversion_pct=round(installs / views * 100, 1) if views else None,
        ))
    return {
        "templates": templates,
        "earnings": {
            "total_cents": total, "pending_cents": pending, "sales_count": len(earnings),
            "payout_account": (acct or {}).get("stripe_account_id"),
        },
        "trend": trend,
    }


@router.post("/market/payout-account")
async def set_payout_account(payload: PayoutAccount, current=Depends(require_user)):
    await db.mkt_payout_accounts.update_one(
        {"user_id": current["id"]},
        {"$set": {"stripe_account_id": payload.stripe_account_id,
                  "simulated": payload.stripe_account_id.startswith("acct_sim"),
                  "updated_at": now_iso()},
         "$setOnInsert": {"user_id": current["id"], "created_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


# ─── Stripe Connect onboarding ────────────────────────────────────────────
def _stripe_mode() -> str:
    """'emergent' when running on the shared Emergent test key (Checkout-only
    proxy — no Connect endpoints), 'real' when a real Stripe key is set."""
    key = os.environ.get("STRIPE_API_KEY") or ""
    return "emergent" if key.startswith("sk_test_emergent") else "real"


def _stripe_sdk():
    import stripe as _stripe_mod
    _stripe_mod.api_key = os.environ.get("STRIPE_API_KEY")
    if _stripe_mode() == "emergent":
        _stripe_mod.api_base = "https://integrations.emergentagent.com/stripe"
    return _stripe_mod


class OnboardStart(BaseModel):
    origin_url: str


@router.post("/market/payout-account/onboard")
async def payout_onboard(payload: OnboardStart, current=Depends(require_user)):
    """Seller taps 'Connect with Stripe'. Real key → Express account +
    hosted onboarding link. Emergent test key → simulated connected account
    (Connect isn't supported by the shared test proxy) so the full payout
    flow stays testable end-to-end."""
    import asyncio as _aio
    if _stripe_mode() == "emergent":
        acct_id = "acct_sim" + new_id().replace("-", "")[:16]
        await db.mkt_payout_accounts.update_one(
            {"user_id": current["id"]},
            {"$set": {"stripe_account_id": acct_id, "simulated": True,
                      "payouts_enabled": True, "details_submitted": True,
                      "updated_at": now_iso()},
             "$setOnInsert": {"user_id": current["id"], "created_at": now_iso()}},
            upsert=True,
        )
        return {"simulated": True, "account_id": acct_id,
                "note": "Test mode — a simulated payout account was connected. "
                        "Real Stripe onboarding activates when the platform runs on its own Stripe key."}

    _stripe_mod = _stripe_sdk()
    acct_doc = await db.mkt_payout_accounts.find_one({"user_id": current["id"]}, {"_id": 0})
    acct_id = (acct_doc or {}).get("stripe_account_id")
    try:
        if not acct_id or (acct_doc or {}).get("simulated"):
            acct = await _aio.to_thread(
                _stripe_mod.Account.create,
                type="express",
                capabilities={"transfers": {"requested": True}},
                metadata={"teamnest_user_id": current["id"]},
            )
            acct_id = (acct.to_dict() if hasattr(acct, "to_dict") else dict(acct))["id"]
            await db.mkt_payout_accounts.update_one(
                {"user_id": current["id"]},
                {"$set": {"stripe_account_id": acct_id, "simulated": False,
                          "payouts_enabled": False, "details_submitted": False,
                          "updated_at": now_iso()},
                 "$setOnInsert": {"user_id": current["id"], "created_at": now_iso()}},
                upsert=True,
            )
        link = await _aio.to_thread(
            _stripe_mod.AccountLink.create,
            account=acct_id,
            refresh_url=f"{payload.origin_url}/market/mine?onboard=refresh",
            return_url=f"{payload.origin_url}/market/mine?onboard=done",
            type="account_onboarding",
        )
        url = (link.to_dict() if hasattr(link, "to_dict") else dict(link))["url"]
        return {"simulated": False, "account_id": acct_id, "url": url}
    except Exception as e:
        logger.warning("[market] Connect onboarding failed for %s: %s", current["id"], e)
        raise HTTPException(502, f"Stripe Connect onboarding failed: {str(e)[:140]}")


@router.get("/market/payout-account/status")
async def payout_account_status(current=Depends(require_user)):
    import asyncio as _aio
    acct = await db.mkt_payout_accounts.find_one({"user_id": current["id"]}, {"_id": 0})
    if not acct:
        return {"connected": False}
    out = {
        "connected": True,
        "account_id": acct.get("stripe_account_id"),
        "simulated": bool(acct.get("simulated")),
        "payouts_enabled": bool(acct.get("payouts_enabled")),
        "details_submitted": bool(acct.get("details_submitted")),
    }
    if not acct.get("simulated") and _stripe_mode() == "real":
        try:
            _stripe_mod = _stripe_sdk()
            a = await _aio.to_thread(_stripe_mod.Account.retrieve, acct["stripe_account_id"])
            d = a.to_dict() if hasattr(a, "to_dict") else dict(a)
            out["payouts_enabled"] = bool(d.get("payouts_enabled"))
            out["details_submitted"] = bool(d.get("details_submitted"))
            await db.mkt_payout_accounts.update_one(
                {"user_id": current["id"]},
                {"$set": {"payouts_enabled": out["payouts_enabled"],
                          "details_submitted": out["details_submitted"],
                          "updated_at": now_iso()}},
            )
        except Exception as e:
            out["status_error"] = str(e)[:120]
    return out


# ─── Admin review ─────────────────────────────────────────────────────────
@router.get("/market/admin/queue")
async def review_queue(current=Depends(require_user)):
    if not _is_platform_admin(current):
        raise HTTPException(403, "Platform admin only")
    rows = await db.mkt_templates.find({"status": "submitted"}, {"_id": 0}) \
        .sort("created_at", 1).to_list(100)
    return {"templates": [
        dict(_public(t), files_count=len(t.get("files") or []),
             review_notes=t.get("review_notes", "")) for t in rows
    ]}


@router.post("/market/admin/templates/{template_id}/approve")
async def approve_template(template_id: str, payload: ReviewDecision, current=Depends(require_user)):
    if not _is_platform_admin(current):
        raise HTTPException(403, "Platform admin only")
    r = await db.mkt_templates.update_one(
        {"id": template_id, "status": "submitted"},
        {"$set": {"status": "approved", "review_notes": payload.notes.strip(),
                  "reviewed_by": current["id"], "reviewed_at": now_iso(), "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "No submitted template with that id")
    return {"ok": True, "status": "approved"}


@router.post("/market/admin/templates/{template_id}/reject")
async def reject_template(template_id: str, payload: ReviewDecision, current=Depends(require_user)):
    if not _is_platform_admin(current):
        raise HTTPException(403, "Platform admin only")
    r = await db.mkt_templates.update_one(
        {"id": template_id, "status": "submitted"},
        {"$set": {"status": "rejected", "review_notes": payload.notes.strip(),
                  "reviewed_by": current["id"], "reviewed_at": now_iso(), "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "No submitted template with that id")
    return {"ok": True, "status": "rejected"}


# ─── Admin curation: featured + categories ──────────────────────────────────
class FeatureToggle(BaseModel):
    featured: bool


class CategoryCreate(BaseModel):
    label: str = Field(min_length=1, max_length=40)


class CategoryUpdate(BaseModel):
    label: Optional[str] = Field(default=None, max_length=40)
    active: Optional[bool] = None
    order: Optional[int] = None


@router.get("/market/admin/templates")
async def admin_list_templates(current=Depends(require_user)):
    """Approved templates for curation (featured-first)."""
    _require_admin(current)
    rows = await db.mkt_templates.find({"status": "approved"}, {"_id": 0, "files": 0}) \
        .sort([("featured", -1), ("installs", -1), ("created_at", -1)]).to_list(200)
    return {"templates": [_public(t) for t in rows]}


@router.post("/market/admin/templates/{template_id}/feature")
async def feature_template(template_id: str, payload: FeatureToggle, current=Depends(require_user)):
    _require_admin(current)
    r = await db.mkt_templates.update_one(
        {"id": template_id, "status": "approved"},
        {"$set": {"featured": payload.featured, "updated_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "No approved template with that id")
    return {"ok": True, "featured": payload.featured}


@router.get("/market/admin/categories")
async def admin_list_categories(current=Depends(require_user)):
    _require_admin(current)
    await _ensure_categories()
    rows = await db.mkt_categories.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    return {"categories": rows}


@router.post("/market/admin/categories")
async def create_category(payload: CategoryCreate, current=Depends(require_user)):
    _require_admin(current)
    slug = re.sub(r"[^a-z0-9]+", "-", payload.label.strip().lower()).strip("-") or "category"
    if await db.mkt_categories.find_one({"slug": slug}):
        raise HTTPException(400, "A category with that name already exists")
    order = await db.mkt_categories.count_documents({})
    doc = {"id": new_id(), "slug": slug, "label": payload.label.strip(),
           "order": order, "active": True, "created_at": now_iso()}
    await db.mkt_categories.insert_one(doc.copy())
    return {k: v for k, v in doc.items()}


@router.patch("/market/admin/categories/{cat_id}")
async def update_category(cat_id: str, payload: CategoryUpdate, current=Depends(require_user)):
    _require_admin(current)
    patch = {k: v for k, v in payload.dict().items() if v is not None}
    if "label" in patch:
        patch["label"] = patch["label"].strip()
    if not patch:
        return {"ok": True}
    r = await db.mkt_categories.update_one({"id": cat_id}, {"$set": patch})
    if r.matched_count == 0:
        raise HTTPException(404, "Category not found")
    return {"ok": True}


@router.delete("/market/admin/categories/{cat_id}")
async def delete_category(cat_id: str, current=Depends(require_user)):
    _require_admin(current)
    r = await db.mkt_categories.delete_one({"id": cat_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Category not found")
    return {"ok": True}



# ─── Install ──────────────────────────────────────────────────────────────
async def _has_access(t: Dict[str, Any], current: Dict[str, Any]) -> bool:
    pricing = t.get("pricing") or {}
    if pricing.get("model", "free") == "free":
        return True
    if t.get("creator_user_id") == current["id"]:
        return True
    q = {"template_id": t["id"], "buyer_user_id": current["id"], "payment_status": "paid"}
    if pricing["model"] == "monthly":
        q["period_end"] = {"$gt": now_iso()}
    return await db.mkt_purchases.find_one(q, {"_id": 0, "id": 1}) is not None


async def create_project_from_template(t: Dict[str, Any], user: Dict[str, Any]) -> str:
    """Copy a marketplace template into a new dev project for this user.
    Returns the new project id. Caller is responsible for access checks."""
    project = {
        "id": new_id(),
        "workspace_id": user["workspace_id"],
        "created_by": user["id"],
        "name": t["name"],
        "description": t.get("tagline", ""),
        "target_users": "",
        "problem": t.get("description") or t.get("tagline", ""),
        "source": "market_template",
        "template_id": None,
        "market_template_id": t["id"],
        "related_chat_id": None,
        "plan": {"product_brief": t.get("description") or t.get("tagline", ""),
                 "summary": f"{t['name']} — installed from the Template Store.",
                 "milestones": []},
        "status": "prototype_ready",
        "version": "v0.1.0",
        "health": "stable",
        "test_coverage": 0,
        "open_proposals": 0,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.dev_projects.insert_one(project.copy())
    for f in t.get("files") or []:
        await db.dev_code_files.insert_one({
            "id": new_id(),
            "workspace_id": user["workspace_id"],
            "project_id": project["id"],
            "path": f["path"],
            "kind": f.get("kind", "text"),
            "role": f.get("role", "template"),
            "content": f.get("content", ""),
            "size_bytes": len((f.get("content") or "").encode("utf-8")),
            "llm_status": "template",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })
    await db.mkt_templates.update_one({"id": t["id"]}, {"$inc": {"installs": 1}})
    return project["id"]


@router.post("/market/templates/{template_id}/install")
async def install_template(template_id: str, current=Depends(require_user)):
    t = await db.mkt_templates.find_one({"id": template_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Template not found")
    if t.get("status") != "approved" and t.get("creator_user_id") != current["id"] and not _is_platform_admin(current):
        raise HTTPException(404, "Template not available")
    if not await _has_access(t, current):
        raise HTTPException(402, "payment_required")
    project_id = await create_project_from_template(t, current)
    return {"project_id": project_id}


# ─── Stripe checkout ─────────────────────────────────────────────────────
def _stripe(request: Request):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(503, "Payments are not configured")
    host_url = str(request.base_url)
    return StripeCheckout(api_key=api_key, webhook_url=f"{host_url}api/webhook/stripe")


async def _session_status_with_retry(session_id: str, attempts: int = 6) -> Optional[Dict[str, Any]]:
    """The emergent Stripe proxy is load-balanced across backing accounts, so a
    retrieve can intermittently miss the session — retry until it lands."""
    import asyncio
    import stripe as _stripe_mod
    last_err: Optional[Exception] = None
    for i in range(attempts):
        try:
            s = await asyncio.to_thread(_stripe_mod.checkout.Session.retrieve, session_id)
            data = s.to_dict() if hasattr(s, "to_dict") else dict(s)
            return {"status": data.get("status") or "open",
                    "payment_status": data.get("payment_status") or "unpaid"}
        except Exception as e:
            last_err = e
            await asyncio.sleep(1.2)
    logger.warning("[market] session status retries exhausted %s: %s", session_id, last_err)
    return None


@router.post("/market/templates/{template_id}/checkout")
async def market_checkout(template_id: str, payload: CheckoutStart, request: Request, current=Depends(require_user)):
    from emergentintegrations.payments.stripe.checkout import CheckoutSessionRequest
    t = await db.mkt_templates.find_one({"id": template_id}, {"_id": 0, "files": 0})
    if not t or t.get("status") != "approved":
        raise HTTPException(404, "Template not found")
    pricing = t.get("pricing") or {}
    amount = float(pricing.get("price_usd") or 0)
    if pricing.get("model", "free") == "free" or amount <= 0:
        raise HTTPException(400, "This template is free — install it directly")
    origin = payload.origin_url.rstrip("/")
    success_url = f"{origin}/market/install/{template_id}?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/market/install/{template_id}"
    metadata = {"template_id": template_id, "buyer_user_id": current["id"],
                "pricing_model": pricing["model"], "source": "template_market"}
    session_url = session_id = None
    is_subscription = False
    if pricing["model"] == "monthly":
        # Real recurring Stripe subscription via inline recurring price_data.
        import stripe as _stripe_mod
        _stripe_mod.api_key = os.environ.get("STRIPE_API_KEY")
        if "sk_test_emergent" in (_stripe_mod.api_key or ""):
            _stripe_mod.api_base = "https://integrations.emergentagent.com/stripe"
        try:
            session = _stripe_mod.checkout.Session.create(
                mode="subscription",
                payment_method_types=["card"],
                line_items=[{
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": int(round(amount * 100)),
                        "recurring": {"interval": "month"},
                        "product_data": {"name": f"{t['name']} — monthly template license"},
                    },
                    "quantity": 1,
                }],
                success_url=success_url,
                cancel_url=cancel_url,
                metadata=metadata,
                customer_email=current.get("email"),
            )
            session_url, session_id = session.url, session.id
            is_subscription = True
        except Exception as e:
            logger.warning("[market] subscription checkout failed, falling back to one-time: %s", e)
    if not session_id:
        stripe_checkout = _stripe(request)
        session = await stripe_checkout.create_checkout_session(CheckoutSessionRequest(
            amount=amount, currency="usd",
            success_url=success_url, cancel_url=cancel_url,
            metadata=metadata,
        ))
        session_url, session_id = session.url, session.session_id
    await db.payment_transactions.insert_one({
        "id": new_id(),
        "session_id": session_id,
        "amount": amount,
        "currency": "usd",
        "user_id": current["id"],
        "email": current.get("email"),
        "template_id": template_id,
        "pricing_model": pricing["model"],
        "is_subscription": is_subscription,
        "payment_status": "initiated",
        "status": "open",
        "processed": False,
        "metadata": {"source": "template_market"},
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    return {"url": session_url, "session_id": session_id}


async def _finalize_paid_session(session_id: str) -> None:
    """Idempotent: on first confirmation of payment, record purchase + 70% seller earnings."""
    r = await db.payment_transactions.update_one(
        {"session_id": session_id, "processed": {"$ne": True}},
        {"$set": {"processed": True, "updated_at": now_iso()}},
    )
    if r.modified_count == 0:
        return
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    t = await db.mkt_templates.find_one({"id": txn["template_id"]}, {"_id": 0, "files": 0})
    if not t:
        return
    amount_cents = int(round(txn["amount"] * 100))
    fee_cents = int(round(amount_cents * PLATFORM_FEE))
    seller_cents = amount_cents - fee_cents
    purchase = {
        "id": new_id(),
        "template_id": t["id"],
        "buyer_user_id": txn["user_id"],
        "buyer_email": txn.get("email"),
        "seller_user_id": t.get("creator_user_id"),
        "amount_cents": amount_cents,
        "platform_fee_cents": fee_cents,
        "seller_earnings_cents": seller_cents,
        "pricing_model": txn.get("pricing_model", "one_time"),
        "payment_status": "paid",
        "session_id": session_id,
        "created_at": now_iso(),
    }
    if purchase["pricing_model"] == "monthly":
        from datetime import datetime, timedelta, timezone
        purchase["period_end"] = (datetime.now(timezone.utc) + timedelta(days=31)).isoformat()
        purchase["stripe_subscription_id"] = txn.get("stripe_subscription_id")
    await db.mkt_purchases.insert_one(purchase.copy())
    if t.get("creator_user_id") and t.get("creator_user_id") != "teamnest":
        await db.mkt_earnings.insert_one({
            "id": new_id(),
            "seller_user_id": t["creator_user_id"],
            "template_id": t["id"],
            "purchase_id": purchase["id"],
            "amount_cents": seller_cents,
            "status": "pending",
            "payout_method": "stripe_connect",
            "created_at": now_iso(),
        })
    logger.info("[market] purchase finalized session=%s template=%s", session_id, t["id"])


@router.get("/market/checkout/status/{session_id}")
async def market_checkout_status(session_id: str, request: Request, current=Depends(require_user)):
    txn = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": current["id"]}, {"_id": 0},
    )
    if not txn:
        raise HTTPException(404, "Unknown checkout session")
    # DB first — the webhook (or reconciler) may already have confirmed it.
    if txn.get("payment_status") == "paid" or txn.get("processed"):
        await _finalize_paid_session(session_id)
        return {"status": "complete", "payment_status": "paid", "template_id": txn["template_id"]}
    _stripe(request)  # configures the stripe module (key + proxy base)
    status = await _session_status_with_retry(session_id)
    if status is None:
        # Session not visible yet on the proxy — report last known state.
        return {"status": txn.get("status", "open"),
                "payment_status": txn.get("payment_status", "initiated"),
                "template_id": txn["template_id"]}
    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {"status": status["status"], "payment_status": status["payment_status"],
                  "updated_at": now_iso()}},
    )
    if status["payment_status"] == "paid":
        await _finalize_paid_session(session_id)
    return {"status": status["status"], "payment_status": status["payment_status"],
            "template_id": txn["template_id"]}


@router.post("/market/admin/payout-run")
async def payout_run(current=Depends(require_user)):
    """Platform admin: transfer pending seller earnings via Stripe Connect.
    Sellers without a payout account are skipped; failed transfers stay pending."""
    if not _is_platform_admin(current):
        raise HTTPException(403, "Platform admin only")
    import asyncio
    _stripe_mod = _stripe_sdk()
    simulated_mode = _stripe_mode() == "emergent"
    pending = await db.mkt_earnings.find({"status": "pending"}, {"_id": 0}).to_list(1000)
    by_seller: Dict[str, list] = {}
    for e in pending:
        by_seller.setdefault(e["seller_user_id"], []).append(e)
    results = []
    for seller_id, rows in by_seller.items():
        total_cents = sum(r["amount_cents"] for r in rows)
        acct = await db.mkt_payout_accounts.find_one({"user_id": seller_id}, {"_id": 0})
        if not acct:
            results.append({"seller_user_id": seller_id, "amount_cents": total_cents,
                            "status": "skipped", "reason": "no payout account"})
            continue
        simulated = simulated_mode or bool(acct.get("simulated"))
        try:
            if simulated:
                # Emergent test proxy has no Connect Transfer endpoint —
                # settle the ledger with a clearly-flagged simulated transfer.
                transfer_id = "tr_sim" + new_id().replace("-", "")[:18]
            else:
                tr = await asyncio.to_thread(
                    _stripe_mod.Transfer.create,
                    amount=total_cents, currency="usd",
                    destination=acct["stripe_account_id"],
                    description="TeamNest template earnings payout",
                )
                transfer_id = (tr.to_dict() if hasattr(tr, "to_dict") else dict(tr)).get("id")
            await db.mkt_earnings.update_many(
                {"seller_user_id": seller_id, "status": "pending"},
                {"$set": {"status": "paid", "transfer_id": transfer_id,
                          "simulated": simulated, "paid_at": now_iso()}},
            )
            await db.mkt_payouts.insert_one({
                "id": new_id(), "seller_user_id": seller_id, "amount_cents": total_cents,
                "transfer_id": transfer_id, "earnings_count": len(rows),
                "simulated": simulated,
                "created_by": current["id"], "created_at": now_iso(),
            })
            results.append({"seller_user_id": seller_id, "amount_cents": total_cents,
                            "status": "paid", "transfer_id": transfer_id,
                            "simulated": simulated})
        except Exception as e:
            results.append({"seller_user_id": seller_id, "amount_cents": total_cents,
                            "status": "failed", "reason": str(e)[:160]})
    paid = sum(1 for r in results if r["status"] == "paid")
    return {"results": results, "sellers": len(results), "paid": paid,
            "mode": "simulated (test mode)" if simulated_mode else "live"}


# NOTE: the shared Stripe webhook lives in routes/billing.py (/webhook/stripe)
# and dispatches template-market sessions to _finalize_paid_session above.


async def reconcile_pending_market_payments() -> int:
    """Background sweep: the emergent Stripe proxy is load-balanced, so session
    retrieval only intermittently lands on the right backing account. Keep
    retrying recent unpaid market transactions until one confirms."""
    from datetime import datetime, timedelta, timezone
    import stripe as _stripe_mod
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        return 0
    _stripe_mod.api_key = api_key
    if "sk_test_emergent" in api_key:
        _stripe_mod.api_base = "https://integrations.emergentagent.com/stripe"
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    pending = await db.payment_transactions.find(
        {"$or": [{"template_id": {"$exists": True}}, {"credits_to_add": {"$exists": True}},
                 {"hosting_tier": {"$exists": True}}],
         "processed": {"$ne": True},
         "payment_status": {"$in": ["initiated", "unpaid", "open"]},
         "created_at": {"$gt": cutoff}},
        {"_id": 0, "session_id": 1, "template_id": 1, "credits_to_add": 1, "hosting_tier": 1},
    ).to_list(50)
    confirmed = 0
    for txn in pending:
        status = await _session_status_with_retry(txn["session_id"], attempts=2)
        if status and status["payment_status"] == "paid":
            await db.payment_transactions.update_one(
                {"session_id": txn["session_id"]},
                {"$set": {"status": status["status"], "payment_status": "paid",
                          "updated_at": now_iso()}},
            )
            if txn.get("credits_to_add"):
                from routes.billing import _finalize_credit_topup
                await _finalize_credit_topup(txn["session_id"])
            elif txn.get("hosting_tier"):
                from routes.billing import _finalize_hosting_upgrade
                await _finalize_hosting_upgrade(txn["session_id"])
            else:
                await _finalize_paid_session(txn["session_id"])
            confirmed += 1
    if confirmed:
        logger.info("[market] reconciler confirmed %s payment(s)", confirmed)
    return confirmed
