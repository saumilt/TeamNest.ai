"""LiveKit-backed audio/video calls + Whisper live transcription +
AI meeting summaries / highlights."""
import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

import call_service
import storage as storage_mod
from ai_service import EMERGENT_LLM_KEY, LlmChat, UserMessage
from deps import PROJ, db, new_id, now_iso, require_user
from models import (
    CallEnd,
    CallHighlightsRequest,
    CallStart,
    CallSummaryRequest,
    CallTranscriptEdit,
)
from services.calls_runtime import (
    generate_and_store_highlights,
    post_call_card,
    public_call,
)
from services.billing import (
    WHISPER_CREDIT_PER_MIN,
    consume_credits,
    credit_cost_for_audio_seconds,
    get_usage,
    PLANS,
)
from voice_service import transcribe_audio

router = APIRouter()


async def _gate_transcription_for_workspace(workspace_id: str, mode: str = "post_call") -> dict:
    """Returns the plan flags so endpoints can short-circuit when the plan
    doesn't allow this kind of transcription. `mode` is "live" or "post_call".

    Policy:
      - Team plan → unlimited (no charge)
      - Other plans → allowed, charged ~10 credits/min after the fact
      - We never hard-block; the credit-consume call surfaces "out of credits"
        with its own helpful error.
    """
    usage = await get_usage(workspace_id)
    plan = PLANS.get(usage["plan_id"]) or {}
    return {"plan": plan, "usage": usage}


# ----- Calls -----
@router.get("/calls/config")
async def call_config(current=Depends(require_user)):
    """Public LiveKit URL for the client. Token is fetched per-call."""
    return {
        "configured": call_service.is_configured(),
        "url": call_service.LIVEKIT_URL if call_service.is_configured() else None,
    }


@router.post("/calls/start")
async def start_call(payload: CallStart, current=Depends(require_user)):
    if not call_service.is_configured():
        raise HTTPException(503, "Calls are not configured on this server")
    chat = await db.chats.find_one(
        {"id": payload.chat_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    existing = await db.calls.find_one(
        {"chat_id": payload.chat_id, "status": "active"}, {"_id": 0}
    )
    if existing:
        token = call_service.create_access_token(
            identity=current["id"], name=current["name"], room=existing["livekit_room"]
        )
        return {
            "call": public_call(existing),
            "token": token,
            "url": call_service.LIVEKIT_URL,
            "rejoined": True,
        }

    call_id = new_id()
    room_name = f"call_{call_id}"
    # Generate a short 6-digit PIN so phone callers can join via Twilio Voice
    # → LiveKit SIP. Stored on the call doc; expires when the call ends.
    import secrets
    dial_in_pin = f"{secrets.randbelow(900000) + 100000}"
    call = {
        "id": call_id,
        "workspace_id": current["workspace_id"],
        "chat_id": payload.chat_id,
        "mode": payload.mode,
        "status": "active",
        "livekit_room": room_name,
        "dial_in_pin": dial_in_pin,
        "started_by": current["id"],
        "started_by_name": current["name"],
        "participants": [{
            "id": current["id"],
            "name": current["name"],
            "joined_at": now_iso(),
            "left_at": None,
        }],
        "started_at": now_iso(),
        "ended_at": None,
        "duration_seconds": None,
    }
    await db.calls.insert_one(call.copy())
    await post_call_card(call, "call_started")

    # Push "X is calling you" to all chat members (best-effort, fire-and-forget).
    import asyncio as _asyncio
    from services.push_service import send_to_user as _push
    chat_members = (chat.get("member_ids") or [])
    for mid in chat_members:
        if mid == current["id"]:
            continue
        _asyncio.create_task(_push(
            mid,
            f"{current.get('name') or 'Someone'} is calling",
            f"in {chat.get('name') or 'a TeamNest chat'} · {payload.mode} call",
            {"chat_id": payload.chat_id, "call_id": call_id, "type": "call_started"},
        ))

    token = call_service.create_access_token(
        identity=current["id"], name=current["name"], room=room_name
    )
    return {
        "call": public_call(call),
        "token": token,
        "url": call_service.LIVEKIT_URL,
        "rejoined": False,
    }


@router.post("/calls/{call_id}/join")
async def join_call(call_id: str, current=Depends(require_user)):
    if not call_service.is_configured():
        raise HTTPException(503, "Calls are not configured on this server")
    call = await db.calls.find_one(
        {"id": call_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not call:
        raise HTTPException(404, "Call not found")
    if call["status"] != "active":
        raise HTTPException(400, "Call has ended")
    if not any(p["id"] == current["id"] for p in call["participants"]):
        await db.calls.update_one(
            {"id": call_id},
            {"$push": {"participants": {
                "id": current["id"],
                "name": current["name"],
                "joined_at": now_iso(),
                "left_at": None,
            }}},
        )
    token = call_service.create_access_token(
        identity=current["id"], name=current["name"], room=call["livekit_room"]
    )
    return {"call": public_call(call), "token": token, "url": call_service.LIVEKIT_URL}


@router.post("/calls/{call_id}/end")
async def end_call(call_id: str, payload: CallEnd, current=Depends(require_user)):
    """Called from the client when the user leaves OR explicitly ends.

    Strategy: if the caller is the last participant or the call_started_by, end
    the whole call (delete LiveKit room, post end-card). Otherwise just mark
    this participant as left.
    """
    call = await db.calls.find_one(
        {"id": call_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not call:
        raise HTTPException(404, "Call not found")
    if call["status"] != "active":
        return public_call(call)

    await db.calls.update_one(
        {"id": call_id, "participants.id": current["id"]},
        {"$set": {"participants.$.left_at": now_iso()}},
    )

    call = await db.calls.find_one({"id": call_id}, {"_id": 0})
    still_active = [p for p in call["participants"] if not p.get("left_at")]
    is_initiator = current["id"] == call["started_by"]

    if len(still_active) == 0 or is_initiator:
        ended_at = now_iso()
        started = (
            datetime.fromisoformat(call["started_at"].replace("Z", "+00:00"))
            if "T" in call["started_at"]
            else datetime.now(timezone.utc)
        )
        ended = datetime.now(timezone.utc)
        duration = int((ended - started).total_seconds())
        update = {
            "status": "ended",
            "ended_at": ended_at,
            "duration_seconds": duration,
        }
        await db.calls.update_one({"id": call_id}, {"$set": update})
        call = await db.calls.find_one({"id": call_id}, {"_id": 0})
        await call_service.end_room(call["livekit_room"])
        await post_call_card(call, "call_ended")
        if call.get("transcript_segments") or []:
            asyncio.create_task(
                generate_and_store_highlights(call_id, current["workspace_id"])
            )
    return public_call(call)


@router.get("/calls/by-chat/{chat_id}")
async def list_calls_for_chat(chat_id: str, current=Depends(require_user)):
    chat = await db.chats.find_one(
        {"id": chat_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    items = await db.calls.find(
        {"chat_id": chat_id}, {"_id": 0}
    ).sort("started_at", -1).to_list(200)
    return items


@router.get("/calls/{call_id}")
async def get_call(call_id: str, current=Depends(require_user)):
    c = await db.calls.find_one(
        {"id": call_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not c:
        raise HTTPException(404, "Call not found")
    return c


@router.post("/webhooks/livekit")
async def livekit_webhook(request: Request):
    """LiveKit Cloud webhook receiver. Verifies signature, updates call state."""
    body = (await request.body()).decode("utf-8")
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    try:
        evt = call_service.receive_webhook(body, auth)
    except Exception as e:
        raise HTTPException(401, f"Invalid webhook signature: {e}")
    room_name = (evt.get("room") or {}).get("name") or ""
    event_type = evt.get("event") or ""
    if not room_name:
        return {"ok": True}
    call = await db.calls.find_one({"livekit_room": room_name}, {"_id": 0})
    if not call:
        return {"ok": True}
    if event_type == "room_finished" and call.get("status") == "active":
        ended_at = now_iso()
        started = (
            datetime.fromisoformat(call["started_at"].replace("Z", "+00:00"))
            if "T" in call["started_at"]
            else datetime.now(timezone.utc)
        )
        duration = int((datetime.now(timezone.utc) - started).total_seconds())
        await db.calls.update_one(
            {"id": call["id"]},
            {"$set": {"status": "ended", "ended_at": ended_at, "duration_seconds": duration}},
        )
        call = await db.calls.find_one({"id": call["id"]}, {"_id": 0})
        await post_call_card(call, "call_ended")
    elif event_type == "participant_left":
        identity = (evt.get("participant") or {}).get("identity")
        if identity:
            await db.calls.update_one(
                {"id": call["id"], "participants.id": identity, "participants.left_at": None},
                {"$set": {"participants.$.left_at": now_iso()}},
            )
    return {"ok": True}


# ----- Transcription + summaries -----
@router.post("/calls/{call_id}/upload-recording")
async def upload_call_recording(
    call_id: str,
    file: UploadFile = File(...),
    current=Depends(require_user),
):
    """Upload an audio recording for a call → transcribe with Whisper → cache on call.

    Billing: counts as "post-call" transcription. Free on Team plan. On Pro /
    Free it consumes ~10 credits/min of audio.
    """
    call = await db.calls.find_one(
        {"id": call_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not call:
        raise HTTPException(404, "Call not found")
    gate = await _gate_transcription_for_workspace(current["workspace_id"], mode="post_call")
    if not gate["plan"].get("unlimited_transcription"):
        from services.credit_governance import enforce_caps
        await enforce_caps(current["workspace_id"], current["id"], call.get("chat_id"), 10)
    data = await file.read()
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(413, "Recording larger than 50 MB")
    filename = file.filename or "call-recording.webm"
    mime = file.content_type or storage_mod.guess_mime(filename, "audio/webm")
    path = storage_mod.build_path(current["id"], filename)
    await asyncio.to_thread(storage_mod.put_object, path, data, mime)
    file_id = new_id()
    await db.files.insert_one({
        "id": file_id,
        "storage_path": path,
        "original_filename": filename,
        "content_type": mime,
        "size": len(data),
        "uploaded_by": current["id"],
        "workspace_id": current["workspace_id"],
        "created_at": now_iso(),
        "kind": "call_recording",
        "is_deleted": False,
    })

    try:
        result = await transcribe_audio(data, filename=filename)
    except Exception as e:
        emsg = str(e).lower()
        if "decode" in emsg or "format" in emsg or "audio_too_short" in emsg:
            result = {"text": "", "language": None, "duration": None, "segments": None, "error": str(e)[:200]}
        else:
            raise HTTPException(500, f"Transcription failed: {e}")

    await db.calls.update_one(
        {"id": call_id},
        {"$set": {
            "recording_file_id": file_id,
            "transcript": result,
            "transcript_uploaded_at": now_iso(),
            "transcript_uploaded_by": current["id"],
        }},
    )
    # Charge for the transcription unless the workspace's plan includes
    # unlimited transcription (Team).
    plan = gate["plan"]
    if not plan.get("unlimited_transcription"):
        duration = float(result.get("duration") or 0)
        if duration > 0:
            credits = credit_cost_for_audio_seconds(duration)
            await consume_credits(
                current["workspace_id"], credits,
                source="post_call_transcription",
                user_id=current["id"],
                chat_id=call.get("chat_id"),
                meta={"call_id": call_id, "duration_seconds": duration},
            )
            result["credits_charged"] = credits
    call = await db.calls.find_one({"id": call_id}, {"_id": 0})
    return {"call": public_call(call), "transcript": result}


@router.patch("/calls/{call_id}/transcript")
async def edit_call_transcript(
    call_id: str, payload: CallTranscriptEdit, current=Depends(require_user)
):
    call = await db.calls.find_one(
        {"id": call_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not call:
        raise HTTPException(404, "Call not found")
    existing = call.get("transcript") or {}
    existing["text"] = payload.transcript_text
    existing["edited_at"] = now_iso()
    existing["edited_by"] = current["id"]
    await db.calls.update_one({"id": call_id}, {"$set": {"transcript": existing}})
    return {"transcript": existing}


async def _validate_chunk_call(call_id: str, workspace_id: str) -> dict:
    """Fetch the call doc and confirm it is still active (or freshly ended)."""
    call = await db.calls.find_one(
        {"id": call_id, "workspace_id": workspace_id}, {"_id": 0}
    )
    if not call:
        raise HTTPException(404, "Call not found")
    if call.get("status") == "active":
        return call
    ended = call.get("ended_at") or ""
    if not ended:
        return call
    try:
        ended_dt = datetime.fromisoformat(ended.replace("Z", "+00:00"))
        if (datetime.now(timezone.utc) - ended_dt).total_seconds() > 30:
            raise HTTPException(400, "Call has ended")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Call has ended")
    return call


async def _read_chunk_or_silent(file: UploadFile) -> bytes | None:
    """Return the upload bytes, or None when we should treat the chunk as silent."""
    data = await file.read()
    if not data or len(data) < 1024:
        return None
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(413, "Audio chunk too large")
    return data


async def _transcribe_chunk_safely(data: bytes, filename: str) -> str | None:
    """Run Whisper; soften decode-style errors into silent results."""
    try:
        result = await transcribe_audio(data, filename=filename)
    except Exception as e:
        emsg = str(e).lower()
        if "decode" in emsg or "format" in emsg or "audio_too_short" in emsg:
            return None
        raise HTTPException(500, f"Transcription failed: {e}")
    text = (result.get("text") or "").strip()
    if not text:
        return None
    return text, result.get("language")


async def _append_transcript_segment(call: dict, segment: dict, language: str | None):
    """Append a new transcript line to the call doc and update tail metadata."""
    new_text_line = f"{segment['speaker_name']}: {segment['text']}"
    existing = (call.get("transcript", {}) or {}).get("text", "")
    await db.calls.update_one(
        {"id": call["id"]},
        {
            "$push": {"transcript_segments": segment},
            "$set": {
                "transcript.text": existing + ("\n" if existing else "") + new_text_line,
                "transcript.language": language,
                "transcript.source": "live_chunks",
                "transcript.last_segment_at": now_iso(),
            },
        },
    )


@router.post("/calls/{call_id}/transcribe-chunk")
async def transcribe_call_chunk(
    call_id: str,
    seq: int = Form(0),
    file: UploadFile = File(...),
    current=Depends(require_user),
):
    """Live transcription path: a participant's browser uploads a short audio
    chunk (~3-5s). We run Whisper, append the text segment to the call, then
    broadcast via LiveKit data channel so every participant sees it in real
    time. Empty / silent chunks return ok=True with text='' (no broadcast).

    Live transcription is now allowed on every plan — Team gets it free; all
    others are credit-metered at ~10 credits/min (matches post-call rate).
    """
    gate = await _gate_transcription_for_workspace(current["workspace_id"], mode="live")
    call = await _validate_chunk_call(call_id, current["workspace_id"])

    data = await _read_chunk_or_silent(file)
    if data is None:
        return {"ok": True, "text": ""}

    filename = file.filename or "chunk.webm"
    transcribed = await _transcribe_chunk_safely(data, filename)
    if transcribed is None:
        return {"ok": True, "text": ""}
    text, language = transcribed

    segment = {
        "id": new_id(),
        "speaker_id": current["id"],
        "speaker_name": current["name"],
        "text": text,
        "seq": seq,
        "at": now_iso(),
    }
    await _append_transcript_segment(call, segment, language)
    # Charge for the chunk (Team plans get unlimited transcription = no charge).
    if not gate["plan"].get("unlimited_transcription"):
        # 4-second chunks → 10 credits per minute → ~0.67 credits per chunk.
        # We charge in whole credits and absorb the rounding (cheap & avoids spam).
        await consume_credits(
            current["workspace_id"], 1,
            source="live_transcription_chunk",
            user_id=current["id"],
            meta={"call_id": call_id, "seq": seq},
        )

    await call_service.publish_data(
        call["livekit_room"],
        {
            "type": "transcript_segment",
            "id": segment["id"],
            "speaker_id": segment["speaker_id"],
            "speaker_name": segment["speaker_name"],
            "text": segment["text"],
            "at": segment["at"],
        },
        topic="transcript",
    )
    return {"ok": True, "text": text, "segment": segment}


@router.get("/calls/{call_id}/transcript-segments")
async def get_transcript_segments(call_id: str, current=Depends(require_user)):
    call = await db.calls.find_one(
        {"id": call_id, "workspace_id": current["workspace_id"]},
        {"_id": 0, "transcript_segments": 1},
    )
    if not call:
        raise HTTPException(404, "Call not found")
    return {"segments": call.get("transcript_segments") or []}


@router.post("/calls/{call_id}/highlights")
async def generate_call_highlights(
    call_id: str,
    payload: CallHighlightsRequest,
    current=Depends(require_user),
):
    """Generate (or refresh) AI highlights for a call's transcript segments."""
    call = await db.calls.find_one(
        {"id": call_id, "workspace_id": current["workspace_id"]},
        {"_id": 0, "transcript_highlights": 1, "transcript_segments": 1},
    )
    if call is None:
        raise HTTPException(404, "Call not found")
    if call.get("transcript_highlights") and not payload.regenerate:
        return {"highlights": call["transcript_highlights"], "cached": True}
    highlights = await generate_and_store_highlights(call_id, current["workspace_id"])
    return {"highlights": highlights, "cached": False}


@router.get("/calls/{call_id}/highlights")
async def get_call_highlights(call_id: str, current=Depends(require_user)):
    call = await db.calls.find_one(
        {"id": call_id, "workspace_id": current["workspace_id"]},
        {"_id": 0, "transcript_highlights": 1, "highlights_generated_at": 1},
    )
    if call is None:
        raise HTTPException(404, "Call not found")
    return {
        "highlights": call.get("transcript_highlights") or [],
        "generated_at": call.get("highlights_generated_at"),
    }


@router.post("/calls/{call_id}/summary")
async def generate_call_summary(
    call_id: str,
    payload: CallSummaryRequest,
    current=Depends(require_user),
):
    """Generate (or fetch cached) AI meeting summary for a call."""
    call = await db.calls.find_one(
        {"id": call_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not call:
        raise HTTPException(404, "Call not found")

    cached = call.get("summary")
    if cached and not payload.regenerate:
        return {"summary": cached, "cached": True}

    transcript_text = _extract_transcript_text(call)
    chat_context = ""
    if not transcript_text:
        chat_context = await _collect_chat_context_around_call(call)

    source_block = await _build_summary_source_block(
        call=call,
        transcript_text=transcript_text,
        chat_context=chat_context,
        extra_context=payload.extra_context,
    )
    summary_md = await _call_summary_llm(source_block)

    summary_obj = {
        "markdown": summary_md,
        "generated_at": now_iso(),
        "generated_by": current["id"],
        "source": "transcript" if transcript_text else ("chat_context" if chat_context else "metadata"),
        "credits_charged": 20,
    }
    await db.calls.update_one({"id": call_id}, {"$set": {"summary": summary_obj}})
    # AI meeting summary uses ~20 credits per call across all plans.
    await consume_credits(
        current["workspace_id"], 20,
        source="ai_call_summary",
        user_id=current["id"],
        meta={"call_id": call_id},
    )
    # Phase 4 — auto-record call summary as memory + extract smart cards
    try:
        import asyncio
        from services.memory_rag import extract_smart_cards, record_memory
        chat = await db.chats.find_one({"id": call.get("chat_id")}, {"_id": 0})
        await record_memory(
            workspace_id=current["workspace_id"],
            source_type="call_summary",
            source_id=call_id,
            raw_content=summary_md,
            chat_id=call.get("chat_id"),
            project_folder_id=(chat or {}).get("project_folder_id"),
            title=f"Call summary: {(chat or {}).get('name') or call_id[:8]}",
            memory_type="note",
            visibility="chat",
            importance_score=0.85,
            created_by=current["id"],
        )
        asyncio.create_task(extract_smart_cards(
            workspace_id=current["workspace_id"],
            source_type="call_summary",
            source_id=call_id,
            raw_content=summary_md,
            chat_id=call.get("chat_id"),
            project_folder_id=(chat or {}).get("project_folder_id"),
            created_by=current["id"],
        ))
    except Exception:
        pass
    return {"summary": summary_obj, "cached": False}


def _extract_transcript_text(call: dict) -> str:
    t = call.get("transcript") or {}
    if isinstance(t, dict):
        return t.get("text") or ""
    return ""


async def _collect_chat_context_around_call(call: dict) -> str:
    """Pull 40 chat messages overlapping the call's start/end timestamps."""
    start = call["started_at"]
    end = call.get("ended_at") or now_iso()
    ctx_msgs = await db.messages.find(
        {
            "chat_id": call["chat_id"],
            "message_type": {"$in": ["text", "ai_answer"]},
            "deleted_at": None,
            "created_at": {"$gte": start, "$lte": end},
        },
        {"_id": 0, "body": 1, "sender_id": 1, "created_at": 1},
    ).sort("created_at", 1).to_list(40)
    if not ctx_msgs:
        return ""
    user_ids = list({m["sender_id"] for m in ctx_msgs if m["sender_id"] != "ai-system"})
    users = await db.users.find({"id": {"$in": user_ids}}, PROJ).to_list(100)
    name_by_id = {u["id"]: u["name"] for u in users}
    return "\n".join(
        f'{name_by_id.get(m["sender_id"], "AI")}: {(m.get("body") or "").strip()[:400]}'
        for m in ctx_msgs if (m.get("body") or "").strip()
    )


async def _build_summary_source_block(
    call: dict, transcript_text: str, chat_context: str, extra_context: Optional[str]
) -> str:
    """Assemble the prompt context block from transcript / chat / metadata."""
    participants = call.get("participants") or []
    participant_names = ", ".join([p.get("name", "—") for p in participants]) or "—"
    duration = call.get("duration_seconds") or 0
    chat = await db.chats.find_one({"id": call["chat_id"]}, {"_id": 0, "name": 1})
    chat_name = (chat or {}).get("name", "team chat")
    header = (
        f"Chat: {chat_name}\nParticipants: {participant_names}\nMode: {call['mode']}\n"
        f"Duration: {duration//60}m {duration%60}s\n"
    )
    if not transcript_text and not chat_context:
        block = header + "(No transcript or chat context was available — produce a brief 'meeting metadata' card.)"
    elif transcript_text:
        block = header + f"\nTRANSCRIPT:\n{transcript_text[:8000]}\n"
    else:
        block = header + f"\nCHAT MESSAGES AROUND THE CALL:\n{chat_context[:8000]}\n"
    if extra_context:
        block += f"\nADDITIONAL CONTEXT:\n{extra_context[:2000]}\n"
    return block


async def _call_summary_llm(source_block: str) -> str:
    """Send the source block to the LLM and return markdown summary."""
    prompt = (
        "Produce a structured **meeting summary** in markdown. Use exactly these sections — "
        "skip a section ONLY if there's truly nothing to put under it:\n"
        "## TL;DR\n(one sentence)\n\n"
        "## Participants\n- bullets\n\n"
        "## Key discussion points\n- bullets\n\n"
        "## Decisions\n- bullets (if any)\n\n"
        "## Open questions\n- bullets (if any)\n\n"
        "## Risks / concerns\n- bullets (if any)\n\n"
        "## Action items\n- bullets, each: **Owner — task — (due if mentioned)**\n\n"
        "## Suggested next steps\n- bullets\n\n"
        f"---\n{source_block}\n---\n"
        "Output ONLY the markdown. No preamble."
    )
    chat_llm = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"call-summary-{new_id()[:8]}",
        system_message="You are a meeting-notes assistant. Output ONLY markdown — no extra commentary.",
    ).with_model("anthropic", "claude-sonnet-4-6")
    return str(await chat_llm.send_message(UserMessage(text=prompt)))


@router.patch("/calls/{call_id}/summary")
async def edit_call_summary(
    call_id: str, payload: dict, current=Depends(require_user)
):
    call = await db.calls.find_one(
        {"id": call_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not call:
        raise HTTPException(404, "Call not found")
    summary = call.get("summary") or {}
    if "markdown" in payload:
        summary["markdown"] = payload["markdown"]
        summary["edited_at"] = now_iso()
        summary["edited_by"] = current["id"]
    await db.calls.update_one({"id": call_id}, {"$set": {"summary": summary}})
    return {"summary": summary}
