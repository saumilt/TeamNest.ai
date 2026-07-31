"""Retrieval + Q&A over knowledge sources.

Uses a MongoDB text index for lexical retrieval (scales without an embedding
step); falls back to the first chunks when a query has no keyword matches.
Answers are synthesised by the chosen LLM (Claude Sonnet 4.6 default, GPT-5.5)
strictly from the retrieved excerpts, with source citations.
"""
from __future__ import annotations

from typing import List, Optional

from ai_service import complete
from deps import db, logger
from services.embeddings import cosine_top_k, embed_query, embeddings_enabled

# Ask param -> internal MODEL_CONFIG key.
ASK_MODELS = {"claude": "claude", "chatgpt": "chatgpt"}
DEFAULT_ASK_MODEL = "claude"

_ANSWER_SYSTEM = (
    "You are a knowledge assistant. Answer the user's question using ONLY the "
    "provided document excerpts. Cite the source file name inline in square "
    "brackets like [report.pdf]. If the answer is not contained in the excerpts, "
    "say you could not find it in the uploaded documents. Be concise and specific."
)


async def _semantic_search(match: dict, question: str, k: int):
    """Vector retrieval via OpenAI embeddings; returns None when unavailable so
    the caller can fall back to keyword search."""
    if not embeddings_enabled():
        return None
    try:
        qv = await embed_query(question)
        if not qv:
            return None
        rows = await db.knowledge_chunks.find(
            {**match, "embedding": {"$exists": True}},
            {"_id": 0, "text": 1, "file_path": 1, "chunk_index": 1, "embedding": 1},
        ).limit(5000).to_list(5000)
        if not rows:
            return None
        return cosine_top_k(qv, rows, k)
    except Exception as e:
        logger.warning("[knowledge] semantic search failed: %s", e)
        return None


async def _text_search(match: dict, question: str, k: int) -> List[dict]:
    try:
        cur = db.knowledge_chunks.find(
            {**match, "$text": {"$search": question}},
            {"_id": 0, "text": 1, "file_path": 1, "chunk_index": 1,
             "score": {"$meta": "textScore"}},
        ).sort([("score", {"$meta": "textScore"})]).limit(k)
        rows = await cur.to_list(k)
        if rows:
            return rows
    except Exception as e:
        logger.warning("[knowledge] text search failed: %s", e)
    # Fallback: first chunks of the source(s).
    cur = db.knowledge_chunks.find(
        match, {"_id": 0, "text": 1, "file_path": 1, "chunk_index": 1},
    ).sort([("chunk_index", 1)]).limit(k)
    return await cur.to_list(k)


async def _retrieve(match: dict, question: str, k: int) -> List[dict]:
    """Semantic retrieval first (if embeddings available + present), else keyword."""
    sem = await _semantic_search(match, question, k)
    if sem:
        return sem
    return await _text_search(match, question, k)


def _build_prompt(question: str, chunks: List[dict]) -> str:
    excerpts = "\n\n---\n\n".join(
        f"[{c.get('file_path', 'file')}]\n{(c.get('text') or '')[:1500]}" for c in chunks
    )
    return (
        f"Question: {question}\n\n"
        f"Document excerpts:\n\n{excerpts}\n\n"
        "Answer the question using only these excerpts and cite file names."
    )


async def ask_source(source_id: str, question: str, model: str = DEFAULT_ASK_MODEL, k: int = 8) -> dict:
    chunks = await _retrieve({"source_id": source_id}, question, k)
    if not chunks:
        return {"answer": "This source has no indexed content yet.", "citations": [], "model": model}
    model_key = ASK_MODELS.get(model, DEFAULT_ASK_MODEL)
    answer = await complete(_ANSWER_SYSTEM, _build_prompt(question, chunks), model_key=model_key)
    citations = [
        {"file_path": c.get("file_path"), "chunk_index": c.get("chunk_index"),
         "snippet": (c.get("text") or "")[:240]}
        for c in chunks
    ]
    return {"answer": str(answer), "citations": citations, "model": model}


async def knowledge_context(chat_id: str, question: str, k: int = 5) -> Optional[str]:
    """Top excerpts from knowledge sources attached to a chat — injected into
    the chat @ai prompt so the AI can answer over uploaded ZIP contents."""
    if not chat_id:
        return None
    src_ids = await db.knowledge_sources.distinct(
        "id", {"chat_id": chat_id, "status": "ready"}
    )
    if not src_ids:
        return None
    chunks = await _retrieve({"source_id": {"$in": src_ids}}, question, k)
    if not chunks:
        return None
    excerpts = "\n\n".join(
        f"[{c.get('file_path', 'file')}]\n{(c.get('text') or '')[:1200]}" for c in chunks
    )
    return (
        "[Relevant excerpts from documents uploaded to this chat — use these to "
        "answer, and cite the file name when you rely on them.]\n" + excerpts
    )
