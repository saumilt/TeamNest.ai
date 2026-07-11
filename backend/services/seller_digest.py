"""Weekly "Your store performance" digest for marketplace sellers.

Once a week, every seller with at least one Published listing gets a digest of
their AI-employee store performance over the last 7 days:

  • New installs this week + lifetime installs
  • Revenue this week + lifetime revenue
  • Top-performing listing this week

Delivery: an in-app notification (bell feed — web + mobile) always, plus a
transactional email via Mailgun when the seller has an email on file and the
provider is configured. Sellers with zero activity still get a gentle
"quiet week" nudge.

Scheduling mirrors the other background loops in `server.py`: the loop wakes
hourly but only fires when ~7 days have elapsed since the last run, tracked via
a soft lock in the `scheduler_state` collection (idempotent across nodes).
"""
import asyncio
from datetime import datetime, timedelta, timezone

from deps import db, logger, now_iso

JOB_ID = "seller_weekly_digest"
WEEK_SECONDS = 7 * 24 * 3600


def _parse(dt):
    if not dt:
        return None
    try:
        return datetime.fromisoformat(str(dt).replace("Z", "+00:00"))
    except Exception:
        return None


async def compute_seller_digest(seller_user_id: str, cutoff_iso: str):
    """Return the per-seller digest dict, or None if the seller has no
    Published listing (so they shouldn't receive a digest)."""
    listings = await db.ai_employee_marketplace_listings.find(
        {"creator_user_id": seller_user_id, "status": "Published"},
        {"_id": 0, "id": 1, "title": 1},
    ).to_list(500)
    if not listings:
        return None

    licenses = await db.ai_employee_marketplace_licenses.find(
        {"creator_user_id": seller_user_id},
        {"_id": 0, "listing_id": 1, "listing_title": 1, "price_paid": 1, "created_at": 1},
    ).to_list(50000)

    total_installs = len(licenses)
    total_revenue = round(sum(float(l.get("price_paid", 0) or 0) for l in licenses), 2)

    week = [l for l in licenses if str(l.get("created_at", "")) >= cutoff_iso]
    week_installs = len(week)
    week_revenue = round(sum(float(l.get("price_paid", 0) or 0) for l in week), 2)

    # Top listing this week by install count (tiebreak: revenue).
    by_listing: dict[str, dict] = {}
    for l in week:
        row = by_listing.setdefault(
            l.get("listing_id") or "",
            {"title": l.get("listing_title") or "(untitled)", "installs": 0, "revenue": 0.0},
        )
        row["installs"] += 1
        row["revenue"] += float(l.get("price_paid", 0) or 0)
    top = max(
        by_listing.values(),
        key=lambda r: (r["installs"], r["revenue"]),
        default=None,
    )

    return {
        "listings_count": len(listings),
        "total_installs": total_installs,
        "total_revenue": total_revenue,
        "week_installs": week_installs,
        "week_revenue": week_revenue,
        "top_listing_name": (top or {}).get("title"),
        "top_listing_installs": (top or {}).get("installs", 0),
        "had_activity": week_installs > 0,
    }


def _notif_body(d: dict) -> str:
    if d["had_activity"]:
        parts = [f"{d['week_installs']} new install(s) this week"]
        if d["week_revenue"] > 0:
            parts.append(f"${d['week_revenue']:.2f} earned")
        if d.get("top_listing_name"):
            parts.append(f"top: {d['top_listing_name']}")
        head = " · ".join(parts)
    else:
        head = "A quiet week — no new installs. Refresh a listing or share it to get seen."
    return f"{head}. Lifetime: {d['total_installs']} installs · ${d['total_revenue']:.2f}."


def _email_html(seller_name: str, d: dict) -> str:
    name = seller_name or "there"
    top_row = (
        f"<tr><td style='padding:6px 0;color:#6b7280'>Top listing this week</td>"
        f"<td style='padding:6px 0;text-align:right;font-weight:700'>{d['top_listing_name']} "
        f"({d['top_listing_installs']})</td></tr>"
        if d.get("top_listing_name") else ""
    )
    nudge = (
        "" if d["had_activity"]
        else "<p style='color:#6b7280;font-size:14px'>No new installs this week — "
             "try refreshing your listing copy or sharing it with your network.</p>"
    )
    return f"""\
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 4px;color:#09090b">Your store performance</h2>
  <p style="margin:0 0 20px;color:#6b7280;font-size:14px">Hi {name}, here's your last 7 days on the AI Employee Marketplace.</p>
  <table style="width:100%;border-collapse:collapse;font-size:15px;color:#09090b">
    <tr><td style="padding:6px 0;color:#6b7280">New installs this week</td><td style="padding:6px 0;text-align:right;font-weight:700">{d['week_installs']}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Revenue this week</td><td style="padding:6px 0;text-align:right;font-weight:700">${d['week_revenue']:.2f}</td></tr>
    {top_row}
    <tr><td colspan="2" style="border-top:1px solid #e5e7eb;padding-top:8px"></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Lifetime installs</td><td style="padding:6px 0;text-align:right">{d['total_installs']}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Lifetime revenue</td><td style="padding:6px 0;text-align:right">${d['total_revenue']:.2f}</td></tr>
  </table>
  {nudge}
  <a href="https://teamnest.ai/ai-builder/marketplace/mine" style="display:inline-block;margin-top:20px;background:#fbbf24;color:#09090b;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:999px">Open your store →</a>
</div>"""


async def send_weekly_digests(send_email: bool = True) -> dict:
    """Compute + deliver a digest to every seller with a Published listing.

    Returns a summary dict. Delivery is best-effort per seller so one failure
    doesn't abort the batch.
    """
    from routes.notifications_feed import create_notification

    cutoff_iso = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    seller_ids = await db.ai_employee_marketplace_listings.distinct(
        "creator_user_id", {"status": "Published"}
    )

    email_provider = None
    if send_email:
        try:
            from services import mailgun_service
            if mailgun_service._configured():
                email_provider = mailgun_service
        except Exception:
            email_provider = None

    notified = 0
    emailed = 0
    for sid in seller_ids:
        if not sid:
            continue
        try:
            d = await compute_seller_digest(sid, cutoff_iso)
            if d is None:
                continue
            await create_notification(
                user_id=sid,
                ntype="store_digest",
                title="Your store performance — this week",
                body=_notif_body(d),
                meta={
                    "week_installs": d["week_installs"],
                    "week_revenue": d["week_revenue"],
                    "top_listing_name": d.get("top_listing_name"),
                    "link": "/ai-builder/marketplace/mine",
                },
            )
            notified += 1

            if email_provider:
                seller = await db.users.find_one(
                    {"id": sid}, {"_id": 0, "email": 1, "name": 1}
                ) or {}
                if seller.get("email"):
                    res = await email_provider.send_email(
                        to=[seller["email"]],
                        subject="Your store performance — this week",
                        html=_email_html(seller.get("name"), d),
                        tags={"source": "seller_weekly_digest"},
                    )
                    if res.get("ok"):
                        emailed += 1
        except Exception as e:
            logger.warning("[seller-digest] failed for seller %s: %s", sid, e)

    logger.info("[seller-digest] sellers=%d notified=%d emailed=%d", len(seller_ids), notified, emailed)
    return {"sellers": len(seller_ids), "notified": notified, "emailed": emailed}


async def _due() -> bool:
    doc = await db.scheduler_state.find_one({"id": JOB_ID}, {"_id": 0, "last_run_at": 1})
    last = _parse((doc or {}).get("last_run_at"))
    if not last:
        return True
    return (datetime.now(timezone.utc) - last).total_seconds() >= WEEK_SECONDS


async def weekly_digest_loop(interval_seconds: int = 3600):
    """Run forever. Wakes hourly; fires only when ~7 days have elapsed."""
    await asyncio.sleep(90)  # jitter past other startup loops
    while True:
        try:
            if await _due():
                # Claim the run first so parallel nodes don't double-send.
                await db.scheduler_state.update_one(
                    {"id": JOB_ID}, {"$set": {"last_run_at": now_iso()}}, upsert=True
                )
                await send_weekly_digests()
        except Exception as e:
            logger.exception("[seller-digest] tick crashed: %s", e)
        await asyncio.sleep(interval_seconds)
