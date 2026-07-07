"""File upload / download via Emergent Object Storage."""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, Response, UploadFile

from auth_utils import decode_token
from deps import PROJ, db, logger, new_id, now_iso, require_user
from storage import build_path, get_object, guess_mime, put_object

router = APIRouter()

ALLOWED_EXT = {"jpg", "jpeg", "png", "gif", "webp", "pdf", "csv", "txt", "json", "mp4", "mp3"}
MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20MB


@router.post("/uploads")
async def upload_file(
    file: UploadFile = File(...),
    chat_id: Optional[str] = Form(None),
    project_folder_id: Optional[str] = Form(None),
    current=Depends(require_user),
):
    data = await file.read()
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(413, "File too large (max 20MB)")
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
