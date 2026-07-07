"""System-wide billing knobs (singleton settings doc in `system_settings`).

Admin can update at runtime via PATCH /admin/credit-margin. Frontend pricing
pages fetch the live values via GET /billing/credit-pricing so updates
propagate without a deploy.

Defaults can be overridden at boot via env vars (CREDIT_MARGIN_PCT,
CREDIT_USD_PER_CREDIT).
"""
from __future__ import annotations
import os
from typing import Any, Dict

from deps import db, now_iso

_DOC_ID = "billing"

DEFAULTS: Dict[str, Any] = {
    "id": _DOC_ID,
    "credit_margin_pct": float(os.environ.get("CREDIT_MARGIN_PCT") or 0.25),
    "credit_usd_per_credit": float(os.environ.get("CREDIT_USD_PER_CREDIT") or 0.001),
    # Underlying provider unit prices in USD (latest published rates). These are
    # the "base" before margin. Updating these here is enough — the table on
    # the pricing page is fully computed from this dict + the margin.
    "provider_rates": {
        # LLM rates are per 1M tokens; image rates are per image; voice is per minute.
        "gpt_4o_mini_per_1m_in":  0.150,
        "gpt_4o_mini_per_1m_out": 0.600,
        "gpt_4o_per_1m_in":       2.500,
        "gpt_4o_per_1m_out":      10.000,
        "claude_sonnet_per_1m_in":  3.000,
        "claude_sonnet_per_1m_out": 15.000,
        "claude_opus_per_1m_in":   15.000,
        "claude_opus_per_1m_out":  75.000,
        "gemini_pro_per_1m_in":     1.250,
        "gemini_pro_per_1m_out":    5.000,
        "whisper_per_min":          0.006,
        "nano_banana_per_image":    0.039,
    },
    "credit_packs": [
        {"id": "p100",  "credits": 100,  "price_usd": 20,   "bonus_pct": 0},
        {"id": "p250",  "credits": 250,  "price_usd": 50,   "bonus_pct": 0},
        {"id": "p500",  "credits": 500,  "price_usd": 100,  "bonus_pct": 0},
        {"id": "p1250", "credits": 1250, "price_usd": 250,  "bonus_pct": 0},
        {"id": "p2500", "credits": 2500, "price_usd": 500,  "bonus_pct": 20},
        {"id": "p5000", "credits": 5000, "price_usd": 1000, "bonus_pct": 20},
    ],
    "credit_promo": {
        "enabled": True,
        "splash_title": "Credit specials",
        "banner": "Spending $500+ on credits? Big packs come with 20% bonus credits.",
        "badge": "20% more",
        "low_balance_threshold": 50,
    },
    "updated_at": now_iso(),
}


async def get_settings() -> Dict[str, Any]:
    doc = await db.system_settings.find_one({"id": _DOC_ID}, {"_id": 0})
    if not doc:
        doc = DEFAULTS.copy()
        await db.system_settings.insert_one(doc.copy())
    # Merge with DEFAULTS so new keys appear without requiring a migration.
    merged: Dict[str, Any] = DEFAULTS.copy()
    merged.update({k: v for k, v in doc.items() if v is not None})
    # provider_rates is nested — merge field-by-field too.
    rates = dict(DEFAULTS["provider_rates"])
    rates.update((doc.get("provider_rates") or {}))
    merged["provider_rates"] = rates
    return merged


async def update_settings(patch: Dict[str, Any]) -> Dict[str, Any]:
    patch = {k: v for k, v in patch.items() if k in ("credit_margin_pct", "credit_usd_per_credit", "provider_rates", "credit_packs", "credit_promo") and v is not None}
    if "credit_margin_pct" in patch:
        try:
            patch["credit_margin_pct"] = max(0.0, min(2.0, float(patch["credit_margin_pct"])))
        except (TypeError, ValueError):
            patch.pop("credit_margin_pct")
    if "credit_usd_per_credit" in patch:
        try:
            patch["credit_usd_per_credit"] = max(0.00001, min(1.0, float(patch["credit_usd_per_credit"])))
        except (TypeError, ValueError):
            patch.pop("credit_usd_per_credit")
    patch["updated_at"] = now_iso()
    await db.system_settings.update_one(
        {"id": _DOC_ID},
        {"$set": patch, "$setOnInsert": {"id": _DOC_ID}},
        upsert=True,
    )
    return await get_settings()


# ─── Public computed table for the pricing page ─────────────────────────────
def _credits(base_usd: float, margin: float, usd_per_credit: float) -> int:
    """Convert a base USD cost to credits at the configured margin."""
    final_usd = base_usd * (1 + margin)
    return max(0, int(round(final_usd / usd_per_credit)))


async def compute_pricing_table() -> Dict[str, Any]:
    """One JSON blob with everything the marketing page needs.

    Every row is *derived* from the current settings — change the margin
    in /admin and the whole table re-flows."""
    s = await get_settings()
    m = s["credit_margin_pct"]
    upc = s["credit_usd_per_credit"]
    pr = s["provider_rates"]

    # A "typical Dev OS specialist reply" is ~700 in + ~800 out tokens on
    # gpt-4o-mini. Document the assumption so admins can sanity-check it.
    reply_in = 700
    reply_out = 800
    mini_cost = (pr["gpt_4o_mini_per_1m_in"] * reply_in + pr["gpt_4o_mini_per_1m_out"] * reply_out) / 1_000_000

    rows = [
        {"key": "specialist_reply", "label": "Dev OS · @devmanager — one reply / small edit",
         "base_usd": mini_cost, "credits": _credits(mini_cost, m, upc)},
        {"key": "devmgr_round", "label": "Dev OS · @devmanager planning round",
         "base_usd": mini_cost * 1.4, "credits": _credits(mini_cost * 1.4, m, upc)},
        {"key": "dev_fanout", "label": "Dev OS · @devmanager full build (multi-file codegen)",
         "base_usd": mini_cost * 8, "credits": _credits(mini_cost * 8, m, upc)},
        {"key": "scan", "label": "Dev OS · /dev-os scan (improvement proposals)",
         "base_usd": mini_cost * 6, "credits": _credits(mini_cost * 6, m, upc)},
        {"key": "github_export", "label": "Dev OS · GitHub PR export · Vercel/Netlify deploy",
         "base_usd": 0.0, "credits": 0},
        {"key": "voice_min", "label": "Voice · 1 min Whisper transcription",
         "base_usd": pr["whisper_per_min"], "credits": _credits(pr["whisper_per_min"], m, upc)},
        {"key": "image", "label": "Image · 1 Nano Banana 1024×1024",
         "base_usd": pr["nano_banana_per_image"], "credits": _credits(pr["nano_banana_per_image"], m, upc)},
    ]

    # Decorate each row with the customer-facing USD price (base × 1+margin).
    for r in rows:
        r["user_usd"] = round(r["base_usd"] * (1 + m), 4)
        r["base_usd"] = round(r["base_usd"], 4)

    packs = [
        {"key": "starter", "label": "Starter pack", "credits": 10_000,  "price_usd": 10,  "bonus": None,         "pop": False},
        {"key": "team",    "label": "Team pack",    "credits": 60_000,  "price_usd": 50,  "bonus": "+10,000 bonus", "pop": True},
        {"key": "scale",   "label": "Scale pack",   "credits": 280_000, "price_usd": 200, "bonus": "+30% bonus",   "pop": False},
    ]

    return {
        "credit_margin_pct": m,
        "credit_usd_per_credit": upc,
        "rows": rows,
        "packs": packs,
        "updated_at": s.get("updated_at"),
        "note": "Simple usage-based pricing — credits are consumed as your AI team works.",
    }
