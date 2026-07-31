"""Knowledge ingestion: turn an uploaded .zip (or single file) into a searchable
knowledge source. Unzips, extracts text per file (reusing the attachment
extractor), OCRs images best-effort, chunks the text with tiktoken, and stores
chunks in `knowledge_chunks` for retrieval.

Runs as a background task; failures are captured on the source, never crash the
request that started ingestion.
"""
from __future__ import annotations

import asyncio
import io
import os
import tempfile
import zipfile
from typing import List

import tiktoken

from ai_service import vision_extract_text
from deps import db, logger, new_id, now_iso
from services.embeddings import embed_texts, embeddings_enabled
from services.file_extract import extract_one
from storage import get_object

# ── Tunables (keep ingestion bounded in time / cost / memory) ────────────────
MAX_ENTRY_BYTES = 30 * 1024 * 1024      # skip individual files larger than 30MB
MAX_IMAGES_OCR = 20                     # OCR at most N images per source
MAX_IMAGE_OCR_BYTES = 6 * 1024 * 1024   # skip OCR for very large images
MAX_CHUNKS = 8000                       # hard cap on chunks per source
MAX_TEXT_PER_FILE = 300_000             # chars kept per file before chunking
CHUNK_TOKENS = 700
CHUNK_OVERLAP = 80

_IMAGE_EXT = {"png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff"}
_SKIP_PREFIXES = ("__MACOSX/", ".git/")

try:
    _enc = tiktoken.get_encoding("cl100k_base")
except Exception:  # pragma: no cover
    _enc = None


def _chunk_text(text: str) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []
    if _enc is None:
        # Fallback: ~4 chars/token heuristic windows.
        step = CHUNK_TOKENS * 4
        return [text[i:i + step] for i in range(0, len(text), step)]
    toks = _enc.encode(text)
    out: List[str] = []
    i = 0
    stride = max(1, CHUNK_TOKENS - CHUNK_OVERLAP)
    while i < len(toks):
        out.append(_enc.decode(toks[i:i + CHUNK_TOKENS]))
        i += stride
    return out


def _is_skippable(name: str) -> bool:
    if name.endswith("/"):
        return True
    base = name.rsplit("/", 1)[-1]
    if base.startswith("."):
        return True
    return any(name.startswith(p) or f"/{p}" in name for p in _SKIP_PREFIXES)


async def ensure_indexes() -> None:
    try:
        await db.knowledge_chunks.create_index([("source_id", 1), ("text", "text")])
        await db.knowledge_chunks.create_index([("chat_id", 1)])
        await db.knowledge_sources.create_index([("workspace_id", 1), ("created_at", -1)])
    except Exception as e:  # pragma: no cover
        logger.warning("[knowledge] index create failed: %s", e)


async def _iter_zip_entries(zip_path: str):
    """Yield (name, bytes) for each real file in the zip, one at a time."""
    def _list():
        with zipfile.ZipFile(zip_path) as zf:
            return [i for i in zf.infolist() if not i.is_dir()]

    infos = await asyncio.to_thread(_list)
    for info in infos:
        if _is_skippable(info.filename) or info.file_size > MAX_ENTRY_BYTES:
            yield info.filename, None
            continue

        def _read(n=info.filename):
            with zipfile.ZipFile(zip_path) as zf:
                return zf.read(n)

        try:
            data = await asyncio.to_thread(_read)
        except Exception as e:
            logger.warning("[knowledge] read %s failed: %s", info.filename, e)
            data = None
        yield info.filename, data


async def _extract_entry(name: str, data: bytes, ocr_budget: List[int]) -> str:
    """Return extracted text for one file (OCR for images within budget)."""
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    rec = {"original_filename": name, "content_type": ""}
    one = await asyncio.to_thread(extract_one, rec, data)
    if one.get("kind") == "image":
        if ocr_budget[0] <= 0 or len(data) > MAX_IMAGE_OCR_BYTES:
            return ""
        ocr_budget[0] -= 1
        try:
            return (await vision_extract_text(one.get("bytes") or data)) or ""
        except Exception as e:
            logger.warning("[knowledge] OCR %s failed: %s", name, e)
            return ""
    return one.get("text") or ""


async def ingest_source(source_id: str) -> None:
    """Background entrypoint — processes a knowledge source end to end."""
    src = await db.knowledge_sources.find_one({"id": source_id}, {"_id": 0})
    if not src:
        return
    await ensure_indexes()
    file_rec = await db.files.find_one({"id": src["file_id"]}, {"_id": 0})
    if not file_rec:
        await db.knowledge_sources.update_one(
            {"id": source_id},
            {"$set": {"status": "failed", "error": "Source file not found", "updated_at": now_iso()}},
        )
        return

    tmp_path = None
    total_chunks = 0
    total_files = 0
    indexed_files = 0
    ocr_budget = [MAX_IMAGES_OCR]
    try:
        data, _ = await asyncio.to_thread(get_object, file_rec["storage_path"])
        is_zip = (src.get("source_type") == "zip") or file_rec.get("original_filename", "").lower().endswith(".zip")

        if is_zip:
            fd, tmp_path = tempfile.mkstemp(suffix=".zip")
            os.close(fd)
            with open(tmp_path, "wb") as fh:
                fh.write(data)
            del data  # free the in-memory copy; read entries from disk

            # Count entries for progress.
            def _count():
                with zipfile.ZipFile(tmp_path) as zf:
                    return sum(1 for i in zf.infolist() if not i.is_dir())
            entry_total = max(1, await asyncio.to_thread(_count))

            processed = 0
            async for name, entry_bytes in _iter_zip_entries(tmp_path):
                processed += 1
                total_files += 1
                kf_id = new_id()
                ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
                text = ""
                skipped = None
                if entry_bytes is None:
                    skipped = "too_large_or_unreadable"
                else:
                    text = await _extract_entry(name, entry_bytes, ocr_budget)
                    if not text:
                        skipped = "no_text_extracted"

                await db.knowledge_files.insert_one({
                    "id": kf_id, "source_id": source_id,
                    "workspace_id": src["workspace_id"], "path": name, "ext": ext,
                    "size": len(entry_bytes or b""), "text_len": len(text),
                    "indexed": bool(text), "skipped_reason": skipped,
                    "created_at": now_iso(),
                })
                if text:
                    indexed_files += 1
                    total_chunks += await _store_chunks(src, kf_id, name, text[:MAX_TEXT_PER_FILE], total_chunks)

                if processed % 5 == 0 or processed == entry_total:
                    await db.knowledge_sources.update_one(
                        {"id": source_id},
                        {"$set": {
                            "progress": min(99, int(processed / entry_total * 100)),
                            "file_count": total_files, "chunk_count": total_chunks,
                            "updated_at": now_iso(),
                        }},
                    )
                if total_chunks >= MAX_CHUNKS:
                    logger.warning("[knowledge] chunk cap hit for %s", source_id)
                    break
        else:
            # Single (non-zip) file.
            total_files = 1
            kf_id = new_id()
            name = file_rec.get("original_filename", "file")
            ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            text = await _extract_entry(name, data, ocr_budget)
            await db.knowledge_files.insert_one({
                "id": kf_id, "source_id": source_id, "workspace_id": src["workspace_id"],
                "path": name, "ext": ext, "size": len(data or b""),
                "text_len": len(text), "indexed": bool(text),
                "skipped_reason": None if text else "no_text_extracted",
                "created_at": now_iso(),
            })
            if text:
                indexed_files = 1
                total_chunks = await _store_chunks(src, kf_id, name, text[:MAX_TEXT_PER_FILE], 0)

        await db.knowledge_sources.update_one(
            {"id": source_id},
            {"$set": {
                "status": "ready", "progress": 100,
                "file_count": total_files, "indexed_file_count": indexed_files,
                "chunk_count": total_chunks, "error": None, "updated_at": now_iso(),
            }},
        )
        logger.info("[knowledge] source %s ready: %s files, %s chunks", source_id, total_files, total_chunks)
    except Exception as e:
        logger.exception("[knowledge] ingest failed for %s: %s", source_id, e)
        await db.knowledge_sources.update_one(
            {"id": source_id},
            {"$set": {"status": "failed", "error": str(e)[:400], "updated_at": now_iso()}},
        )
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass


async def _store_chunks(src: dict, file_id: str, path: str, text: str, start_index: int) -> int:
    chunks = _chunk_text(text)
    if not chunks:
        return 0
    vectors: list = []
    if embeddings_enabled():
        try:
            vectors = await embed_texts(chunks)
        except Exception as e:
            logger.warning("[knowledge] embedding failed for %s: %s", path, e)
            vectors = []
    docs = []
    for idx, ch in enumerate(chunks):
        doc = {
            "id": new_id(), "source_id": src["id"], "workspace_id": src["workspace_id"],
            "chat_id": src.get("chat_id"), "file_id": file_id, "file_path": path,
            "chunk_index": start_index + idx, "text": ch, "created_at": now_iso(),
        }
        if vectors and idx < len(vectors):
            doc["embedding"] = vectors[idx]
        docs.append(doc)
    if docs:
        await db.knowledge_chunks.insert_many(docs)
    return len(docs)
