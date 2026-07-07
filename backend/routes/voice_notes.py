"""Voice notes: upload, Whisper transcription, Claude summary."""
import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

import storage as storage_mod
from ai_service import EMERGENT_LLM_KEY, LlmChat, UserMessage
from deps import _broadcast_message, db, new_id, now_iso, require_user
from voice_service import transcribe_audio

router = APIRouter()


@router.post("/voice-notes")
async def upload_voice_note(
    chat_id: str = Form(...),
    duration: Optional[float] = Form(None),
    parent_message_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current=Depends(require_user),
):
    """Upload a voice note recording. Stores the audio blob and posts it as a
    message with metadata so the chat UI can render a player."""
    chat = await db.chats.find_one(
        {"id": chat_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not chat:
        raise HTTPException(404, "Chat not found")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Voice note larger than 25 MB")
    filename = file.filename or "voice.webm"
    mime = file.content_type or storage_mod.guess_mime(filename, "audio/webm")
    path = storage_mod.build_path(current["id"], filename)
    try:
        await asyncio.to_thread(storage_mod.put_object, path, data, mime)
    except Exception as exc:
        raise HTTPException(500, f"Storage upload failed: {exc}")
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
        "kind": "voice_note",
        "is_deleted": False,
    })
    msg = {
        "id": new_id(),
        "chat_id": chat_id,
        "sender_id": current["id"],
        "message_type": "voice_note",
        "body": "",
        "parent_message_id": parent_message_id,
        "metadata": {
            "file_id": file_id,
            "filename": filename,
            "duration": duration,
            "transcript": None,
        },
        "reactions": {},
        "created_at": now_iso(),
        "edited_at": None,
        "deleted_at": None,
    }
    await db.messages.insert_one(msg.copy())
    await _broadcast_message(chat_id, msg)
    return {"message": msg, "file_id": file_id}


@router.post("/voice-notes/{file_id}/transcribe")
async def transcribe_voice_note(file_id: str, current=Depends(require_user)):
    """Run Whisper on a stored voice note. Caches transcript on the message metadata."""
    f = await db.files.find_one(
        {"id": file_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not f:
        raise HTTPException(404, "Voice note not found")
    msg = await db.messages.find_one({"metadata.file_id": file_id}, {"_id": 0})
    cached = (msg or {}).get("metadata", {}).get("transcript")
    if cached:
        return {"transcript": cached, "cached": True}
    try:
        data, _ = await asyncio.to_thread(storage_mod.get_object, f["storage_path"])
        result = await transcribe_audio(
            data, filename=f.get("original_filename") or "voice.webm"
        )
    except Exception as e:
        emsg = str(e).lower()
        if "decode" in emsg or "format" in emsg or "audio_too_short" in emsg or "could not decode" in emsg:
            result = {"text": "", "language": None, "duration": None, "segments": None, "error": str(e)[:200]}
        else:
            raise HTTPException(500, f"Transcription failed: {e}")
    if msg:
        await db.messages.update_one(
            {"id": msg["id"]},
            {"$set": {"metadata.transcript": result}},
        )
    # Phase 4 — record long transcripts as memory (skip empty / very short)
    text_for_memory = (result or {}).get("text") or ""
    if len(text_for_memory.split()) >= 25 and msg:
        try:
            from services.memory_rag import record_memory
            chat = await db.chats.find_one({"id": msg.get("chat_id")}, {"_id": 0})
            await record_memory(
                workspace_id=current["workspace_id"],
                source_type="voice_note",
                source_id=file_id,
                raw_content=text_for_memory,
                chat_id=msg.get("chat_id"),
                project_folder_id=(chat or {}).get("project_folder_id"),
                title=text_for_memory[:80],
                memory_type="note",
                visibility="chat",
                importance_score=0.65,
                created_by=current["id"],
            )
        except Exception:
            pass
    return {"transcript": result, "cached": False}


@router.post("/voice-notes/{file_id}/summarize")
async def summarize_voice_note(file_id: str, current=Depends(require_user)):
    """Transcribe (if needed) then ask Claude for a tight summary + action items."""
    f = await db.files.find_one(
        {"id": file_id, "workspace_id": current["workspace_id"]}, {"_id": 0}
    )
    if not f:
        raise HTTPException(404, "Voice note not found")
    msg = await db.messages.find_one({"metadata.file_id": file_id}, {"_id": 0})
    transcript = (msg or {}).get("metadata", {}).get("transcript")
    if not transcript:
        try:
            data, _ = await asyncio.to_thread(storage_mod.get_object, f["storage_path"])
            transcript = await transcribe_audio(
                data, filename=f.get("original_filename") or "voice.webm"
            )
            if msg:
                await db.messages.update_one(
                    {"id": msg["id"]},
                    {"$set": {"metadata.transcript": transcript}},
                )
        except Exception as e:
            raise HTTPException(500, f"Transcription failed: {e}")
    text = transcript.get("text") if isinstance(transcript, dict) else str(transcript)
    if not text or not text.strip():
        return {"summary": "(no speech detected)", "transcript": transcript}
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"voice-summary-{new_id()[:8]}",
        system_message="You are a concise meeting-notes assistant for TeamNest.ai. Output ONLY markdown.",
    ).with_model("anthropic", "claude-sonnet-4-6")
    prompt = (
        "Summarize this voice note transcript in 3 sections:\n"
        "1. **TL;DR** — one sentence.\n"
        "2. **Key points** — bullets.\n"
        "3. **Action items** — bullets, each with a verb and (if mentioned) an owner.\n\n"
        f"Transcript:\n{text}"
    )
    summary = str(await chat.send_message(UserMessage(text=prompt)))
    if msg:
        await db.messages.update_one(
            {"id": msg["id"]},
            {"$set": {"metadata.summary": summary}},
        )
    return {"summary": summary, "transcript": transcript}
