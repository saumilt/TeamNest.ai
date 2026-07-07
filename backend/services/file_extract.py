"""Extract text/data from chat attachments so the AI can *research* their
contents. Supported for text extraction: pdf, docx, xlsx/xls, csv, txt, json,
md, pptx. Images are returned as bytes for vision-capable models.

Best-effort by design — a broken or unsupported file never blocks the AI reply.
"""
from __future__ import annotations

import io
import logging
from typing import Any, Dict, List

from deps import db
from storage import get_object

logger = logging.getLogger("teamnest")

MAX_FILES = 30
MAX_CHARS_PER_FILE = 6000
MAX_TOTAL_CHARS = 40000
MAX_IMAGES = 8

_IMAGE_EXT = {"png", "jpg", "jpeg", "gif", "webp"}


def _extract_pdf(data: bytes) -> str:
    import pdfplumber

    out: List[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages[:30]:
            out.append(page.extract_text() or "")
    return "\n".join(out)


def _extract_docx(data: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(data))
    parts = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
    for t in doc.tables:
        for row in t.rows:
            cells = [c.text for c in row.cells]
            if any(c.strip() for c in cells):
                parts.append(" | ".join(cells))
    return "\n".join(parts)


def _extract_xlsx(data: bytes) -> str:
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    out: List[str] = []
    try:
        for ws in wb.worksheets[:10]:
            out.append(f"# Sheet: {ws.title}")
            for r_i, row in enumerate(ws.iter_rows(values_only=True)):
                if r_i > 500:
                    out.append("… (rows truncated)")
                    break
                cells = ["" if v is None else str(v) for v in row]
                if any(c.strip() for c in cells):
                    out.append(" | ".join(cells))
    finally:
        wb.close()
    return "\n".join(out)


def _extract_pptx(data: bytes) -> str:
    from pptx import Presentation

    prs = Presentation(io.BytesIO(data))
    out: List[str] = []
    for i, slide in enumerate(prs.slides, 1):
        if i > 60:
            break
        out.append(f"# Slide {i}")
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    txt = "".join(run.text for run in para.runs)
                    if txt.strip():
                        out.append(txt)
    return "\n".join(out)


def _extract_text(data: bytes) -> str:
    return data.decode("utf-8", "ignore")


def extract_one(rec: Dict[str, Any], data: bytes) -> Dict[str, Any]:
    """Extract a single file record's payload.

    Returns {"name", "kind": "image"|"text", "bytes"?, "text"?}.
    """
    name = rec.get("original_filename") or "file"
    ct = (rec.get("content_type") or "").lower()
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""

    if ct.startswith("image/") or ext in _IMAGE_EXT:
        return {"name": name, "kind": "image", "bytes": data}

    text = ""
    try:
        if ext == "pdf" or ct == "application/pdf":
            text = _extract_pdf(data)
        elif ext == "docx" or "wordprocessingml" in ct:
            text = _extract_docx(data)
        elif ext in ("xlsx", "xls") or "spreadsheetml" in ct or ct == "application/vnd.ms-excel":
            text = _extract_xlsx(data)
        elif ext == "pptx" or "presentationml" in ct:
            text = _extract_pptx(data)
        else:  # csv / txt / json / md / anything text-like
            text = _extract_text(data)
    except Exception as e:
        logger.warning("[file-extract] %s (.%s) failed: %s", name, ext, e)
        text = ""
    return {"name": name, "kind": "text", "text": (text or "").strip()}


async def extract_attachments(
    attachments: List[Dict[str, Any]] | None,
    workspace_id: str,
    max_files: int = MAX_FILES,
) -> Dict[str, Any]:
    """Fetch + extract every attachment referenced on a message.

    Returns {"text": str, "images": List[bytes], "names": List[str]}.
    """
    text_blocks: List[str] = []
    images: List[bytes] = []
    names: List[str] = []
    total = 0

    for a in (attachments or [])[:max_files]:
        fid = a.get("id") or a.get("file_id")
        if not fid:
            continue
        rec = await db.files.find_one(
            {"id": fid, "workspace_id": workspace_id, "is_deleted": False},
            {"_id": 0, "storage_path": 1, "content_type": 1, "original_filename": 1},
        )
        if not rec:
            continue
        try:
            data, _ = get_object(rec["storage_path"])
        except Exception:
            continue

        one = extract_one(rec, data)
        names.append(one["name"])

        if one["kind"] == "image":
            if len(images) < MAX_IMAGES:
                images.append(one["bytes"])
            continue

        txt = one.get("text") or ""
        if not txt:
            continue
        if len(txt) > MAX_CHARS_PER_FILE:
            txt = txt[:MAX_CHARS_PER_FILE] + "\n… (truncated)"
        block = f"--- {one['name']} ---\n{txt}"
        if total + len(block) > MAX_TOTAL_CHARS:
            block = block[: max(0, MAX_TOTAL_CHARS - total)] + "\n… (truncated)"
        text_blocks.append(block)
        total += len(block)
        if total >= MAX_TOTAL_CHARS:
            break

    return {"text": "\n\n".join(text_blocks), "images": images, "names": names}
