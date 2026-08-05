"""Team tools: workspace-shared AI model presets + on-demand invite delivery
analytics (Mailgun events). Kept separate from the already-large workspace.py."""
import asyncio
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ai_service import MODEL_CONFIG
from deps import db, new_id, now_iso, public_user, require_user
from services import mailgun_service
from services.workspace_membership import list_workspace_members

router = APIRouter()

VALID_MODEL_KEYS = set(MODEL_CONFIG.keys())

# Smart starter presets seeded once per workspace (teams can edit/remove).
DEFAULT_PRESETS = [
    {"name": "Deep dive", "models": ["claude-opus", "chatgpt"]},
    {"name": "Fast", "models": ["gpt-4o-mini"]},
    {"name": "Research", "models": ["perplexity", "gemini"]},
]


def _preset_public(p: dict) -> dict:
    return {
        "id": p["id"],
        "name": p["name"],
        "models": p.get("models", []),
        "is_default": bool(p.get("is_default")),
        "created_by": p.get("created_by"),
        "created_by_name": p.get("created_by_name"),
    }


# ---- Model presets ---------------------------------------------------------
class PresetCreate(BaseModel):
    name: str
    models: list[str]


async def _seed_default_presets(workspace_id: str):
    ws = await db.workspaces.find_one(
        {"id": workspace_id}, {"_id": 0, "model_presets_seeded": 1}
    )
    if ws and ws.get("model_presets_seeded"):
        return
    for d in DEFAULT_PRESETS:
        await db.model_presets.insert_one({
            "id": new_id(),
            "workspace_id": workspace_id,
            "name": d["name"],
            "models": d["models"],
            "is_default": True,
            "created_by": None,
            "created_by_name": "TeamNest",
            "created_at": now_iso(),
        })
    await db.workspaces.update_one(
        {"id": workspace_id}, {"$set": {"model_presets_seeded": True}}
    )


@router.get("/workspace/model-presets")
async def list_model_presets(current=Depends(require_user)):
    ws_id = current["workspace_id"]
    await _seed_default_presets(ws_id)
    rows = await db.model_presets.find(
        {"workspace_id": ws_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    return [_preset_public(p) for p in rows]


@router.post("/workspace/model-presets")
async def create_model_preset(payload: PresetCreate, current=Depends(require_user)):
    if current.get("role") not in ("owner", "admin", "member"):
        raise HTTPException(403, "Guests and viewers cannot create presets")
    name = (payload.name or "").strip()
    if not (1 <= len(name) <= 40):
        raise HTTPException(400, "Preset name must be 1–40 characters")
    models = [m for m in (payload.models or []) if m in VALID_MODEL_KEYS]
    if not (1 <= len(models) <= 5):
        raise HTTPException(400, "Pick between 1 and 5 valid models")
    ws_id = current["workspace_id"]
    existing = await db.model_presets.find_one(
        {"workspace_id": ws_id, "name": {"$regex": f"^{name}$", "$options": "i"}},
        {"_id": 0, "id": 1},
    )
    if existing:
        raise HTTPException(400, "A preset with that name already exists")
    rec = {
        "id": new_id(),
        "workspace_id": ws_id,
        "name": name,
        "models": models,
        "is_default": False,
        "created_by": current["id"],
        "created_by_name": current.get("name") or current.get("email"),
        "created_at": now_iso(),
    }
    await db.model_presets.insert_one(rec.copy())
    return _preset_public(rec)


@router.delete("/workspace/model-presets/{preset_id}")
async def delete_model_preset(preset_id: str, current=Depends(require_user)):
    ws_id = current["workspace_id"]
    preset = await db.model_presets.find_one(
        {"id": preset_id, "workspace_id": ws_id}, {"_id": 0}
    )
    if not preset:
        raise HTTPException(404, "Preset not found")
    is_admin = current.get("role") in ("owner", "admin")
    if not is_admin and preset.get("created_by") != current["id"]:
        raise HTTPException(403, "Only the creator or an admin can delete this preset")
    await db.model_presets.delete_one({"id": preset_id, "workspace_id": ws_id})
    return {"ok": True, "id": preset_id}


# ---- Invite delivery analytics (Mailgun, on-demand + cached) ---------------
_analytics_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL_S = 60
_MAX_LOOKUPS = 40


def _iso(ts):
    if not ts:
        return None
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
    except Exception:
        return None


def _summarize(items: list) -> dict:
    opened = delivered = sent = None
    failed = None
    for it in items or []:
        ev = (it.get("event") or "").lower()
        ts = it.get("timestamp")
        if ev == "opened" and opened is None:
            opened = ts
        elif ev == "delivered" and delivered is None:
            delivered = ts
        elif ev == "accepted" and sent is None:
            sent = ts
        elif ev in ("failed", "rejected") and failed is None:
            ds = it.get("delivery-status") or {}
            failed = {
                "severity": it.get("severity") or ds.get("severity"),
                "reason": it.get("reason") or ds.get("message") or ds.get("description"),
                "ts": ts,
            }
    if opened is not None:
        status = "opened"
    elif delivered is not None:
        status = "delivered"
    elif failed and (failed.get("severity") == "permanent"):
        status = "failed"
    elif sent is not None:
        status = "sent"
    elif failed:
        status = "failed"
    else:
        status = "unknown"
    return {
        "status": status,
        "opened_at": _iso(opened),
        "delivered_at": _iso(delivered),
        "sent_at": _iso(sent),
        "failed_reason": (failed or {}).get("reason") if status == "failed" else None,
    }


@router.get("/workspace/invite-analytics")
async def invite_analytics(current=Depends(require_user)):
    """For members we've emailed, return the latest Mailgun delivery status
    (Sent / Delivered / Opened / Failed). Cached 60s per workspace."""
    ws_id = current["workspace_id"]
    if not mailgun_service._configured():
        return {"configured": False, "analytics": {}}

    cached = _analytics_cache.get(ws_id)
    if cached and (time.time() - cached[0]) < _CACHE_TTL_S:
        return {"configured": True, "analytics": cached[1], "cached": True}

    members = await list_workspace_members(ws_id)
    targets = [
        m for m in members
        if m.get("email") and (
            m.get("last_invite_sent_at")
            or m.get("status") == "invited"
            or m.get("must_change_password")
        )
    ][:_MAX_LOOKUPS]

    async def _one(m):
        res = await mailgun_service.fetch_events(m["email"])
        return m["id"], _summarize(res.get("items", []))

    results = await asyncio.gather(*[_one(m) for m in targets], return_exceptions=True)
    analytics: dict[str, dict] = {}
    for r in results:
        if isinstance(r, Exception):
            continue
        uid, summary = r
        analytics[uid] = summary

    _analytics_cache[ws_id] = (time.time(), analytics)
    return {"configured": True, "analytics": analytics}
