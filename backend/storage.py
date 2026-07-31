"""Emergent object storage helper."""
import logging
import os
import uuid
from typing import Optional, Tuple

import requests

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = os.environ.get("APP_NAME", "teamnest")

logger = logging.getLogger("teamnest.storage")
_storage_key: Optional[str] = None


def init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        logger.warning("EMERGENT_LLM_KEY not set; storage disabled")
        return None
    try:
        resp = requests.post(
            f"{STORAGE_URL}/init",
            json={"emergent_key": EMERGENT_KEY},
            timeout=30,
        )
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        return _storage_key
    except Exception as e:
        logger.error("Storage init failed: %s", e)
        return None


def _reset_key():
    global _storage_key
    _storage_key = None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise RuntimeError("Storage unavailable")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 403:
        _reset_key()
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> Tuple[bytes, str]:
    key = init_storage()
    if not key:
        raise RuntimeError("Storage unavailable")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    if resp.status_code == 403:
        _reset_key()
        key = init_storage()
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def put_object_file(path: str, file_path: str, content_type: str) -> dict:
    """Stream a local file to object storage without loading it fully into
    memory — used to finalize a large chunked upload."""
    key = init_storage()
    if not key:
        raise RuntimeError("Storage unavailable")
    size = os.path.getsize(file_path)

    def _do(k):
        with open(file_path, "rb") as fh:
            return requests.put(
                f"{STORAGE_URL}/objects/{path}",
                headers={
                    "X-Storage-Key": k,
                    "Content-Type": content_type,
                    "Content-Length": str(size),
                },
                data=fh,
                timeout=900,
            )

    resp = _do(key)
    if resp.status_code == 403:
        _reset_key()
        key = init_storage()
        resp = _do(key)
    resp.raise_for_status()
    try:
        return resp.json()
    except Exception:
        return {"path": path, "size": size}


def delete_object(path: str) -> None:
    """Best-effort delete (used to clean up temporary chunk parts)."""
    key = init_storage()
    if not key:
        return
    try:
        requests.delete(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=30,
        )
    except Exception as e:  # pragma: no cover - cleanup is best-effort
        logger.warning("delete_object failed for %s: %s", path, e)


def build_part_path(upload_id: str, index: int) -> str:
    return f"{APP_NAME}/uploads/parts/{upload_id}/{int(index)}"


MIME = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf",
    "json": "application/json", "csv": "text/csv", "txt": "text/plain",
    "md": "text/markdown", "zip": "application/zip",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "mp4": "video/mp4", "mp3": "audio/mpeg",
}


def build_path(user_id: str, filename: str) -> str:
    ext = (filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin")[:8]
    return f"{APP_NAME}/uploads/{user_id}/{uuid.uuid4()}.{ext}"


def guess_mime(filename: str, fallback: str) -> str:
    ext = (filename.rsplit(".", 1)[-1].lower() if "." in filename else "")
    return MIME.get(ext, fallback or "application/octet-stream")
