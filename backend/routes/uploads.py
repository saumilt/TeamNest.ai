"""File upload / download via Emergent Object Storage."""
import os
import tempfile
from typing import Optional

from fastapi import (
    APIRouter, Depends, File, Form, Header, HTTPException, Query, Request,
    Response, UploadFile,
)
from pydantic import BaseModel

from auth_utils import decode_token
from deps import PROJ, db, logger, new_id, now_iso, require_user
from storage import (
    build_part_path, build_path, delete_object, get_object, guess_mime,
    put_object, put_object_file,
)

router = APIRouter()

ALLOWED_EXT = {
    "jpg", "jpeg", "png", "gif", "webp",       # images
    "pdf", "csv", "txt", "json", "md",          # docs / data
    "docx", "xlsx", "xls", "pptx",              # office
    "mp4", "mp3",                                # media
}
# Chunked uploads also accept .zip archives (parsed into a knowledge source).
CHUNKED_ALLOWED_EXT = ALLOWED_EXT | {"zip"}
MAX_UPLOAD_SIZE = 30 * 1024 * 1024  # 30MB (single-request path)
MAX_CHUNKED_SIZE = 1024 * 1024 * 1024  # 1GB (chunked path — infra ceiling may be lower)
MAX_PART_SIZE = 12 * 1024 * 1024  # 12MB per part (client uses ~8MB)
CLIENT_PART_SIZE = 8 * 1024 * 1024


@router.post("/uploads")
async def upload_file(
    file: UploadFile = File(...),
    chat_id: Optional[str] = Form(None),
    project_folder_id: Optional[str] = Form(None),
    current=Depends(require_user),
):
    data = await file.read()
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(413, "File too large (max 30MB)")
    filename = file.filename or "file.bin"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported file type: .{ext}")
    content_type = guess_mime(filename, file.content_type or "")
    path = build_path(current["id"], filename)
    try:
        result = put_object(path, data, content_type)
    except Exception as e:
        logger.exception("Upload failed: %s", e)
        raise HTTPException(500, "Upload failed")

    # Auto-link the file to the chat's project folder so it shows up under the
    # project's "Documents" tab automatically. Explicit project_folder_id wins.
    if not project_folder_id and chat_id:
        chat = await db.chats.find_one(
            {"id": chat_id, "workspace_id": current["workspace_id"]},
            {"_id": 0, "project_folder_id": 1},
        )
        if chat:
            project_folder_id = chat.get("project_folder_id")

    record = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "uploaded_by": current["id"],
        "storage_path": result["path"],
        "original_filename": filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "is_image": content_type.startswith("image/"),
        "is_deleted": False,
        "chat_id": chat_id,
        "project_folder_id": project_folder_id,
        "created_at": now_iso(),
    }
    await db.files.insert_one(record.copy())
    return {
        "id": record["id"],
        "url": f"/api/files/{record['id']}",
        "filename": filename,
        "content_type": content_type,
        "size": record["size"],
        "is_image": record["is_image"],
        "project_folder_id": project_folder_id,
    }


# ─── Chunked / resumable upload (large files up to ~1GB, incl. .zip) ─────────
class ChunkInit(BaseModel):
    filename: str
    size: int
    total_parts: int
    chat_id: Optional[str] = None
    project_folder_id: Optional[str] = None


@router.post("/uploads/chunked/init")
async def chunked_init(payload: ChunkInit, current=Depends(require_user)):
    """Open a chunked upload session. The client then PUTs each part and calls
    /complete to assemble + store the final object."""
    filename = payload.filename or "file.bin"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    if ext not in CHUNKED_ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported file type: .{ext}")
    if payload.size <= 0 or payload.size > MAX_CHUNKED_SIZE:
        raise HTTPException(413, "File too large (max 1GB)")
    if payload.total_parts < 1 or payload.total_parts > 8000:
        raise HTTPException(400, "Invalid part count")
    upload_id = new_id()
    await db.upload_sessions.insert_one({
        "id": upload_id,
        "workspace_id": current["workspace_id"],
        "user_id": current["id"],
        "filename": filename,
        "ext": ext,
        "content_type": guess_mime(filename, ""),
        "total_size": payload.size,
        "total_parts": payload.total_parts,
        "received": [],
        "chat_id": payload.chat_id,
        "project_folder_id": payload.project_folder_id,
        "status": "open",
        "created_at": now_iso(),
    })
    return {"upload_id": upload_id, "part_size": CLIENT_PART_SIZE}


@router.put("/uploads/chunked/{upload_id}/part/{index}")
async def chunked_part(
    upload_id: str, index: int, request: Request,
    b64: int = Query(0), current=Depends(require_user),
):
    sess = await db.upload_sessions.find_one(
        {"id": upload_id, "user_id": current["id"]}, {"_id": 0}
    )
    if not sess or sess.get("status") != "open":
        raise HTTPException(404, "Upload session not found")
    if index < 0 or index >= sess["total_parts"]:
        raise HTTPException(400, "Invalid part index")
    raw = await request.body()
    if not raw:
        raise HTTPException(400, "Empty part")
    # Mobile clients send base64 text (?b64=1) since RN can't easily stream raw
    # binary; web sends raw octet-stream.
    if b64:
        import base64 as _b64
        try:
            data = _b64.b64decode(raw)
        except Exception:
            raise HTTPException(400, "Invalid base64 part")
    else:
        data = raw
    if len(data) > MAX_PART_SIZE:
        raise HTTPException(413, "Part too large")
    try:
        put_object(build_part_path(upload_id, index), data, "application/octet-stream")
    except Exception as e:
        logger.exception("Chunk store failed: %s", e)
        raise HTTPException(500, "Chunk store failed")
    await db.upload_sessions.update_one(
        {"id": upload_id}, {"$addToSet": {"received": index}}
    )
    return {"index": index, "ok": True}


@router.post("/uploads/chunked/{upload_id}/complete")
async def chunked_complete(upload_id: str, current=Depends(require_user)):
    sess = await db.upload_sessions.find_one(
        {"id": upload_id, "user_id": current["id"]}, {"_id": 0}
    )
    if not sess:
        raise HTTPException(404, "Upload session not found")
    if sess.get("status") == "done":
        raise HTTPException(400, "Upload already completed")
    total = sess["total_parts"]
    if len(set(sess.get("received", []))) != total:
        missing = total - len(set(sess.get("received", [])))
        raise HTTPException(400, f"Upload incomplete — {missing} part(s) missing")
    await db.upload_sessions.update_one({"id": upload_id}, {"$set": {"status": "completing"}})

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{sess['ext']}")
    tmp_path = tmp.name
    tmp.close()
    try:
        with open(tmp_path, "wb") as out:
            for i in range(total):
                data, _ = get_object(build_part_path(upload_id, i))
                out.write(data)
        size = os.path.getsize(tmp_path)
        final_path = build_path(current["id"], sess["filename"])
        put_object_file(final_path, tmp_path, sess["content_type"])
    except Exception as e:
        logger.exception("Assembly/upload failed: %s", e)
        await db.upload_sessions.update_one({"id": upload_id}, {"$set": {"status": "open"}})
        raise HTTPException(500, "Could not finalize the upload")
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
    for i in range(total):
        delete_object(build_part_path(upload_id, i))

    project_folder_id = sess.get("project_folder_id")
    chat_id = sess.get("chat_id")
    if not project_folder_id and chat_id:
        chat = await db.chats.find_one(
            {"id": chat_id, "workspace_id": current["workspace_id"]},
            {"_id": 0, "project_folder_id": 1},
        )
        if chat:
            project_folder_id = chat.get("project_folder_id")

    content_type = sess["content_type"]
    record = {
        "id": new_id(),
        "workspace_id": current["workspace_id"],
        "uploaded_by": current["id"],
        "storage_path": final_path,
        "original_filename": sess["filename"],
        "content_type": content_type,
        "size": size,
        "is_image": content_type.startswith("image/"),
        "is_archive": sess["ext"] == "zip",
        "is_deleted": False,
        "chat_id": chat_id,
        "project_folder_id": project_folder_id,
        "created_at": now_iso(),
    }
    await db.files.insert_one(record.copy())
    await db.upload_sessions.update_one({"id": upload_id}, {"$set": {"status": "done"}})
    return {
        "id": record["id"],
        "url": f"/api/files/{record['id']}",
        "filename": record["original_filename"],
        "content_type": content_type,
        "size": size,
        "is_image": record["is_image"],
        "is_archive": record["is_archive"],
        "project_folder_id": project_folder_id,
    }


@router.post("/uploads/chunked/{upload_id}/abort")
async def chunked_abort(upload_id: str, current=Depends(require_user)):
    sess = await db.upload_sessions.find_one(
        {"id": upload_id, "user_id": current["id"]}, {"_id": 0}
    )
    if sess:
        for i in range(sess.get("total_parts", 0)):
            delete_object(build_part_path(upload_id, i))
        await db.upload_sessions.update_one(
            {"id": upload_id}, {"$set": {"status": "aborted"}}
        )
    return {"ok": True}


@router.get("/files/{file_id}")
async def download_file(
    file_id: str,
    auth: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    """Accept token via Authorization header OR ?auth= query param (for <img src>)."""
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
    elif auth:
        token = auth
    user_id = decode_token(token) if token else None
    if not user_id:
        raise HTTPException(401, "Invalid token")
    record = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(404, "File not found")
    user = await db.users.find_one({"id": user_id}, PROJ)
    if not user or user["workspace_id"] != record["workspace_id"]:
        raise HTTPException(403, "Forbidden")
    try:
        data, ct = get_object(record["storage_path"])
    except Exception as e:
        logger.exception("Download failed: %s", e)
        raise HTTPException(500, "Download failed")
    return Response(
        content=data,
        media_type=record.get("content_type", ct),
        headers={"Content-Disposition": f'inline; filename="{record["original_filename"]}"'},
    )
