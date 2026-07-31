"""Text embeddings for semantic (vector) retrieval.

Uses OpenAI `text-embedding-3-small` when OPENAI_API_KEY is set (server-side
only). If the key is absent, callers fall back to keyword retrieval, so the
feature degrades gracefully.
"""
from __future__ import annotations

import os
from typing import List

import numpy as np

from deps import logger

_MODEL = "text-embedding-3-small"
_MAX_CHARS = 8000  # trim very long chunks before embedding
_BATCH = 64
_client = None


def embeddings_enabled() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


def _get_client():
    global _client
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        return None
    if _client is None:
        from openai import AsyncOpenAI
        _client = AsyncOpenAI(api_key=key)
    return _client


async def embed_texts(texts: List[str]) -> List[List[float]]:
    client = _get_client()
    if not client or not texts:
        return []
    out: List[List[float]] = []
    for i in range(0, len(texts), _BATCH):
        batch = [(t or "")[:_MAX_CHARS] or " " for t in texts[i:i + _BATCH]]
        resp = await client.embeddings.create(model=_MODEL, input=batch)
        out.extend([d.embedding for d in resp.data])
    return out


async def embed_query(text: str) -> List[float]:
    r = await embed_texts([text])
    return r[0] if r else []


def cosine_top_k(query_vec: List[float], chunks: List[dict], k: int) -> List[dict]:
    if not query_vec:
        return []
    q = np.asarray(query_vec, dtype=np.float32)
    qn = float(np.linalg.norm(q)) or 1.0
    scored = []
    for c in chunks:
        emb = c.get("embedding")
        if not emb:
            continue
        v = np.asarray(emb, dtype=np.float32)
        vn = float(np.linalg.norm(v)) or 1.0
        scored.append((float(np.dot(q, v)) / (qn * vn), c))
    scored.sort(key=lambda x: x[0], reverse=True)
    top = []
    for _, c in scored[:k]:
        c.pop("embedding", None)
        top.append(c)
    return top
