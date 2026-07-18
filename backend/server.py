"""TeamNest.ai - FastAPI backend (bootstrap).

The actual route handlers live in `routes/<domain>.py`. This file wires them all
together under a single `/api` router, configures CORS, owns the WebSocket
endpoint, and runs startup / shutdown tasks (demo seeder, object storage init).
"""
import logging
import os

from fastapi import APIRouter, FastAPI, Query, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware

from auth_utils import decode_token
from deps import (  # noqa: F401 - re-exported for tests/back-compat
    _next_badge,
    _referral_badge,
    client,
    db,
    ensure_personal_ai_chat,
    logger as _logger,
    public_user,
)
from routes import (
    admin,
    superadmin,
    ai,
    ai_employees,
    ai_employee_builder,
    ai_employee_marketplace,
    builder_program,
    ai_threads,
    approvals,
    auth,
    billing,
    connectors,
    enterprise,
    learned_memory,
    bookkeeper,
    calls,
    changelog,
    chat_ai_settings,
    chats,
    dashboard,
    decisions,
    devices,
    exports,
    folders,
    imports,
    integrations,
    invites,
    launch,
    launch_admin,
    memory,
    mfa,
    notifications,
    notifications_feed,
    plaid,
    contacts,
    dev_gates,
    dev_os,
    dev_os_builders,
    dev_os_files,
    dev_os_preview,
    dev_os_tasks,
    dev_publish,
    template_market,
    profile,
    public,
    quickbooks,
    share,
    sms,
    social,
    tasks,
    twilio_voice,
    uploads,
    voice_notes,
    workspace,
    workspace_ai,
)
from seed import seed_demo, seed_market_templates
from services.workspace_membership import migrate_legacy_users
from storage import init_storage
from ws_manager import manager

logging.basicConfig(level=logging.INFO)
logger = _logger  # alias for any old references

app = FastAPI(title="TeamNest.ai API")
api = APIRouter(prefix="/api")

# Mount each domain router under /api. Order is mostly cosmetic since each
# module owns disjoint paths.
api.include_router(public.router)        # `/` health + /public/snapshot
api.include_router(auth.router)
api.include_router(profile.router)
api.include_router(workspace.router)
api.include_router(folders.router)
api.include_router(chats.router)
api.include_router(ai.router)
api.include_router(share.router)         # AI research /share endpoints
api.include_router(tasks.router)
api.include_router(dashboard.router)
api.include_router(uploads.router)
api.include_router(integrations.router)
api.include_router(invites.router)
api.include_router(launch.router)
api.include_router(launch_admin.router)
api.include_router(voice_notes.router)
api.include_router(approvals.router)
api.include_router(exports.router)
api.include_router(admin.router)
api.include_router(superadmin.router)
api.include_router(billing.router)
api.include_router(calls.router)
api.include_router(devices.router)
api.include_router(memory.router)
api.include_router(ai_threads.router)
api.include_router(imports.router)
api.include_router(decisions.router)
api.include_router(notifications.router)
api.include_router(changelog.router)
api.include_router(ai_employees.router)
api.include_router(ai_employee_builder.router)
api.include_router(ai_employee_marketplace.router)
api.include_router(builder_program.router)
api.include_router(notifications_feed.router)
api.include_router(bookkeeper.router)
api.include_router(quickbooks.router)
api.include_router(plaid.router)
api.include_router(contacts.router)
api.include_router(sms.router)
api.include_router(social.router)
api.include_router(mfa.router)
api.include_router(chat_ai_settings.router)
api.include_router(twilio_voice.router)
api.include_router(dev_os.router)
api.include_router(dev_os_tasks.router)
api.include_router(dev_os_files.router)
api.include_router(dev_os_builders.router)
api.include_router(dev_os_preview.router)
api.include_router(dev_publish.router)
api.include_router(template_market.router)
api.include_router(dev_gates.router)
api.include_router(workspace_ai.router)
api.include_router(connectors.router)
api.include_router(enterprise.router)
api.include_router(learned_memory.router)

app.include_router(api)

# ===== CORS =====
# When credentials are sent (httpOnly auth cookies), browsers refuse `*` origins.
# Read explicit origins from CORS_ORIGINS; default to the well-known preview +
# production hosts. The fallback `*` is kept only for local dev where credentials
# aren't required.
_cors_env = os.environ.get("CORS_ORIGINS")
if _cors_env:
    _cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
    _cors_allow_credentials = True
else:
    _cors_origins = ["*"]
    _cors_allow_credentials = False
app.add_middleware(
    CORSMiddleware,
    allow_credentials=_cors_allow_credentials,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===== WEBSOCKET =====
@app.websocket("/api/ws/{chat_id}")
async def ws_endpoint(websocket: WebSocket, chat_id: str, token: str = Query(...)):
    user_id = decode_token(token)
    if not user_id:
        await websocket.close(code=4401)
        return
    chat = await db.chats.find_one({"id": chat_id, "member_ids": user_id})
    if not chat:
        await websocket.close(code=4404)
        return
    await manager.connect(chat_id, user_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            event = data.get("event")
            if event == "typing":
                await manager.broadcast(
                    chat_id,
                    {"event": "typing", "data": {"user_id": user_id, "typing": data.get("typing", True)}},
                )
            elif event == "ping":
                await websocket.send_json({"event": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(chat_id, user_id, websocket)
    except Exception as e:
        logger.exception("WS error: %s", e)
        manager.disconnect(chat_id, user_id, websocket)


@app.websocket("/api/ws/dev-os-presence/{project_id}")
async def dev_os_presence_ws(websocket: WebSocket, project_id: str, token: str = Query(...)):
    """Live presence + cursor stream for Dev OS Plan / Kanban / Bugs tabs."""
    from services.dev_os_presence import presence_ws
    await presence_ws(websocket, project_id, token)


# ===== STARTUP / SHUTDOWN =====
@app.on_event("startup")
async def startup():
    import asyncio as _asyncio

    # Run one-time bootstrap (demo seed, market templates, legacy migration,
    # object-storage init) OFF the readiness critical path. On a fresh
    # production DB the seed is large and runs over network latency, and
    # init_storage() is a blocking `requests` call — doing these inline made
    # the container fail its readiness probe (deployment timeout). Scheduling
    # them as a background task lets uvicorn bind and report ready immediately.
    async def _bootstrap():
        try:
            await seed_demo(db)
        except Exception as e:
            logger.warning("Seed skipped: %s", e)
        try:
            await seed_market_templates(db)
        except Exception as e:
            logger.warning("Market template seed skipped: %s", e)
        try:
            await migrate_legacy_users(db)
        except Exception as e:
            logger.warning("Multi-workspace migration skipped: %s", e)
        try:
            # init_storage() uses synchronous `requests`; run it in a thread so
            # it never blocks the event loop.
            await _asyncio.to_thread(init_storage)
        except Exception as e:
            logger.warning("Storage init failed: %s", e)

    _asyncio.create_task(_bootstrap())
    logger.info("[startup] bootstrap (seed/migrate/storage) scheduled in background")

    # Kick off the task-reminder background loop. It runs forever, wakes once
    # an hour, fires DM + push at T-3d, T-1d, T-0, and T+1d milestones.
    try:
        import asyncio as _asyncio
        from services.task_reminders import reminder_loop as _rl
        _asyncio.create_task(_rl())
        logger.info("[startup] task reminder loop scheduled (1h tick)")
    except Exception as e:
        logger.warning("Task reminder loop failed to start: %s", e)

    try:
        import asyncio as _asyncio
        from services.dev_os_nightly_scan import nightly_scan_loop as _ns
        _asyncio.create_task(_ns())
        logger.info("[startup] Dev OS nightly scan loop scheduled (1h tick, 22h cooldown)")
    except Exception as e:
        logger.warning("Dev OS nightly scan loop failed to start: %s", e)

    try:
        import asyncio as _asyncio
        from services.seller_digest import weekly_digest_loop as _sd
        _asyncio.create_task(_sd())
        logger.info("[startup] seller weekly digest loop scheduled (1h tick, 7d cadence)")
    except Exception as e:
        logger.warning("Seller weekly digest loop failed to start: %s", e)

    try:
        import asyncio as _asyncio
        from routes.template_market import reconcile_pending_market_payments as _mr

        async def _market_reconciler():
            while True:
                try:
                    await _mr()
                except Exception:
                    logger.exception("market payment reconciler tick failed")
                await _asyncio.sleep(30)

        _asyncio.create_task(_market_reconciler())
        logger.info("[startup] market payment reconciler scheduled (30s tick)")
    except Exception as e:
        logger.warning("Market payment reconciler failed to start: %s", e)


@app.on_event("shutdown")
async def shutdown():
    client.close()
