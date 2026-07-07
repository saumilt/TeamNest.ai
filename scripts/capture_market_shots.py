"""Regenerate Template Marketplace thumbnail screenshots.

The original thumbnails in backend/static/market_shots/*.png were captured while
the demo apps rendered blank (the `#app-view` `hidden`-attribute bug, now fixed
in services/dev_preview_shim.py). This script re-captures each approved template
demo *after login* so the cards show the real app.

Run:  python3 /app/scripts/capture_market_shots.py
"""
import asyncio
import os
import sys
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient
from playwright.async_api import async_playwright

BASE = os.environ.get("PUBLIC_BACKEND_URL", "https://nest-app-prep.preview.emergentagent.com")
SHOTS_DIR = Path("/app/backend/static/market_shots")
VIEWPORT = {"width": 1280, "height": 800}


async def capture_one(page, template_id: str, out_path: Path) -> bool:
    url = f"{BASE}/api/market/templates/{template_id}/demo/index.html"
    try:
        await page.goto(url, wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(1200)
        # Fill demo credentials if the login form is present, then sign in.
        try:
            await page.fill("input[type=email]", "demo@example.com", timeout=4000)
            await page.fill("input[type=password]", "demo", timeout=4000)
        except Exception:
            pass
        clicked = False
        for sel in [
            "#login-btn",
            "#signin-btn",
            "button[type=submit]",
            "button:has-text('Sign in')",
            "button:has-text('Log in')",
            "button:has-text('Login')",
        ]:
            try:
                loc = page.locator(sel).first
                if await loc.count() > 0:
                    await loc.click(force=True, timeout=3000)
                    clicked = True
                    break
            except Exception:
                continue
        if not clicked:
            try:
                await page.locator("input[type=password]").first.press("Enter")
            except Exception:
                pass
        # Wait for the app view to become visible (shim reconciles the hidden attr).
        try:
            await page.wait_for_function(
                "() => { const a=document.getElementById('app-view');"
                " return a && getComputedStyle(a).display!=='none'; }",
                timeout=8000,
            )
        except Exception:
            pass
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(out_path), full_page=False)
        return True
    except Exception as e:
        print(f"[FAIL] {template_id} -> {out_path.name}: {e}", file=sys.stderr)
        return False


async def main():
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[
        os.environ.get("DB_NAME", "test_database")
    ]
    rows = await db.mkt_templates.find(
        {"status": "approved"}, {"_id": 0, "id": 1, "screenshot_file": 1, "name": 1}
    ).to_list(200)

    # One capture per unique screenshot_file (some templates share a file).
    seen: dict[str, str] = {}
    for r in rows:
        sf = r.get("screenshot_file")
        if sf and sf not in seen:
            seen[sf] = r["id"]

    SHOTS_DIR.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport=VIEWPORT, device_scale_factor=1)
        page = await ctx.new_page()
        ok = 0
        for sf, tid in seen.items():
            if await capture_one(page, tid, SHOTS_DIR / sf):
                sz = (SHOTS_DIR / sf).stat().st_size
                print(f"[OK] {sf} ({sz:,} bytes) from {tid}")
                ok += 1
        await browser.close()
        print(f"\n=== Captured {ok}/{len(seen)} thumbnails ===")


if __name__ == "__main__":
    asyncio.run(main())
