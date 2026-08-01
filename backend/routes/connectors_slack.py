"""Slack connector (workspace-level) — status, channel list, config, test post.
Owner/admin only. The bot token lives in server env (SLACK_BOT_TOKEN)."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import require_user
from services import slack_service as slack

router = APIRouter()


def _require_admin(current):
    if current.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Owner/admin only")


@router.get("/connectors/slack/status")
async def slack_status(current=Depends(require_user)):
    _require_admin(current)
    cfg = await slack.get_config(current["workspace_id"])
    if not slack.configured():
        return {"configured": False, "connected": False, "config": cfg}
    auth = await slack.auth_test()
    return {
        "configured": True,
        "connected": bool(auth.get("ok")),
        "team": auth.get("team"),
        "bot_user": auth.get("user"),
        "error": None if auth.get("ok") else auth.get("error"),
        "config": cfg,
    }


@router.get("/connectors/slack/channels")
async def slack_channels(current=Depends(require_user)):
    _require_admin(current)
    if not slack.configured():
        raise HTTPException(400, "Slack is not configured on the server.")
    return {"channels": await slack.list_channels()}


class SlackConfigPatch(BaseModel):
    enabled: Optional[bool] = None
    default_channel_id: Optional[str] = None
    default_channel_name: Optional[str] = None
    post_ai_answers: Optional[bool] = None
    post_budget_alerts: Optional[bool] = None


@router.put("/connectors/slack/config")
async def slack_set_config(patch: SlackConfigPatch, current=Depends(require_user)):
    _require_admin(current)
    cfg = await slack.set_config(current["workspace_id"], patch.model_dump(exclude_none=True))
    return {"ok": True, "config": cfg}


@router.post("/connectors/slack/test")
async def slack_test(current=Depends(require_user)):
    _require_admin(current)
    if not slack.configured():
        raise HTTPException(400, "Slack is not configured on the server.")
    cfg = await slack.get_config(current["workspace_id"])
    if not cfg.get("default_channel_id"):
        raise HTTPException(400, "Pick a default channel first.")
    res = await slack.post_message(
        cfg["default_channel_id"],
        f":wave: *TeamNest is connected!* Test message from {current.get('name') or 'an admin'}.",
    )
    if not res.get("ok"):
        raise HTTPException(502, f"Slack error: {res.get('error')}")
    return {"ok": True, "channel": cfg.get("default_channel_name")}
