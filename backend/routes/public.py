"""Public AI snapshot + health."""
from fastapi import APIRouter, HTTPException

from deps import db

router = APIRouter()


@router.get("/")
async def root():
    return {"status": "ok", "service": "teamnest"}


@router.get("/public/credit-pricing")
async def public_credit_pricing():
    """Open endpoint used by the marketing pricing page + Dev OS guide.
    Returns the live margin, packs, and per-task cost table. No auth so the
    page works for logged-out visitors."""
    from services.billing_settings import compute_pricing_table
    return await compute_pricing_table()



@router.get("/public/snapshot/{token}")
async def public_snapshot(token: str):
    thread = await db.ai_threads.find_one({"public_token": token}, {"_id": 0})
    if not thread:
        raise HTTPException(404, "Snapshot not found or revoked")
    responses = await db.ai_responses.find(
        {"research_thread_id": thread["id"]}, {"_id": 0}
    ).to_list(20)
    safe_responses = []
    for r in responses:
        vc = {k: len(v or []) for k, v in (r.get("votes") or {}).items()}
        safe_responses.append({
            "model_key": r.get("model_key"),
            "model_name": r.get("model_name"),
            "answer": r.get("answer"),
            "strengths": r.get("strengths"),
            "weaknesses": r.get("weaknesses"),
            "confidence_score": r.get("confidence_score"),
            "selected_as_best": r.get("selected_as_best"),
            "vote_counts": vc,
            "real": r.get("real"),
        })
    chat = await db.chats.find_one({"id": thread["chat_id"]}, {"_id": 0})
    workspace = await db.workspaces.find_one({"id": chat["workspace_id"]}, {"_id": 0}) if chat else None
    return {
        "thread": {
            "id": thread["id"],
            "question": thread["question"],
            "selected_models": thread["selected_models"],
            "final_answer": thread.get("final_answer"),
            "status": thread["status"],
            "created_at": thread["created_at"],
        },
        "responses": safe_responses,
        "workspace_name": workspace["name"] if workspace else "TeamNest",
    }
