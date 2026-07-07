"""Capture polished raw screenshots at iPhone 15 Pro Max resolution (1290×2796).

Story:
  01_welcome      → Landing / Welcome auth screen
  02_group_chat   → Max Brenner Expansion Team — real conversation
  03_ai_compare   → Research thread — AI side-by-side answer
  04_tasks        → Kanban with todo / in_progress / done
  05_billing      → Pricing & subscription
  06_dashboard    → Logged-in dashboard with workspace overview
"""
import asyncio
import sys
from pathlib import Path

import requests
from playwright.async_api import async_playwright

BASE = "https://nest-app-prep.preview.emergentagent.com"
RAW = Path("/app/frontend/store-assets/raw")
RAW.mkdir(parents=True, exist_ok=True)

VIEWPORT = {"width": 430, "height": 932}
DPR = 3


async def login_and_dismiss_banners(page):
    """Demo-login + bypass PWA install banner."""
    # Get demo token directly
    r = requests.post(f"{BASE}/api/auth/demo-login", timeout=30)
    token = r.json()["token"]
    # Inject auth state + PWA dismissal flag before any React loads
    await page.add_init_script(
        f"""
        localStorage.setItem('eat_token', '{token}');
        localStorage.setItem('tn:pwa-prompt-dismissed', '1');
        // Collapse the chat sidebar so the conversation fills the mobile viewport
        localStorage.setItem('chatlist:collapsed', '1');
        // Hide service-worker beforeinstallprompt entirely
        window.addEventListener('beforeinstallprompt', e => e.preventDefault());
        """
    )


async def hide_pwa_banner(page):
    """Inject CSS to hide any leftover PWA install prompt."""
    await page.add_style_tag(content="""
        [data-testid='install-prompt'],
        [data-testid='pwa-prompt'],
        .install-prompt,
        .pwa-prompt,
        [class*='InstallPrompt'] { display: none !important; }
    """)


async def capture():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport=VIEWPORT,
            device_scale_factor=DPR,
            is_mobile=True,
            has_touch=True,
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 "
                "Mobile/15E148 Safari/604.1"
            ),
        )
        page = await ctx.new_page()

        # ----- 01: Welcome (fresh, no login state) -----
        await page.goto(f"{BASE}/", wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(RAW / "01_welcome.png"))
        print("[OK] 01_welcome")

        # Now login for the remaining screens
        await login_and_dismiss_banners(page)

        # ----- 06: Dashboard -----
        await page.goto(f"{BASE}/dashboard", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2500)
        await hide_pwa_banner(page)
        await page.wait_for_timeout(500)
        await page.screenshot(path=str(RAW / "06_dashboard.png"))
        print("[OK] 06_dashboard")

        # ----- 02: Group Chat (Max Brenner) -----
        # Find chat ID first via API
        token = await page.evaluate("localStorage.getItem('eat_token')")
        r = requests.get(
            f"{BASE}/api/chats",
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
        chats = r.json()
        target = next(
            (c for c in chats if c.get("name") == "Max Brenner Expansion Team"),
            None,
        )
        if target is None:
            print("[WARN] Max Brenner chat not found, using first group chat")
            target = next((c for c in chats if c.get("type") == "group"), chats[0])

        await page.goto(f"{BASE}/chats/{target['id']}", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3500)
        await hide_pwa_banner(page)
        # Scroll to bottom so most recent messages show
        await page.evaluate(
            "document.querySelector('[data-testid*=\"messages\"], .messages-list, main')?.scrollTo({ top: 999999 })"
        )
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(RAW / "02_group_chat.png"))
        print("[OK] 02_group_chat")

        # ----- 03: AI Compare via Research page -----
        await page.goto(f"{BASE}/research", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)
        await hide_pwa_banner(page)
        await page.screenshot(path=str(RAW / "03_ai_compare.png"))
        print("[OK] 03_ai_compare")

        # ----- 04: Tasks Kanban -----
        await page.goto(f"{BASE}/tasks", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)
        await hide_pwa_banner(page)
        await page.screenshot(path=str(RAW / "04_tasks.png"))
        print("[OK] 04_tasks")

        # ----- 05: Billing -----
        await page.goto(f"{BASE}/billing", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)
        await hide_pwa_banner(page)
        await page.screenshot(path=str(RAW / "05_billing.png"))
        print("[OK] 05_billing")

        await browser.close()
        print("\n=== Done ===")
        for f in sorted(RAW.glob("*.png")):
            print(f"  {f.name}: {f.stat().st_size:,} bytes")


if __name__ == "__main__":
    try:
        asyncio.run(capture())
    except Exception as e:
        print(f"FATAL: {e}", file=sys.stderr)
        sys.exit(1)
