"""Record a 15-second app preview video for App Store / Play Store.

Apple App Store preview specs (6.7" device):
    - Resolution: 886x1920 or 1080x1920 (portrait), H.264 MP4
    - Duration: 15-30 seconds
    - Frame rate: 24-60 fps

We use Playwright's built-in video recording at 1080x1920, then transcode the
WebM output to H.264 MP4 with ffmpeg for App Store / Play Store compatibility.

The flow walks through (each step ~2-3 seconds):
    1. Welcome / sign-in page
    2. Smooth navigate to Dashboard
    3. Smooth navigate to chat (Max Brenner Expansion Team)
    4. AI compare / research threads
    5. Tasks kanban
    6. Quick scroll to show depth
"""
import asyncio
import shutil
import subprocess
import sys
from pathlib import Path

import requests
from playwright.async_api import async_playwright

BASE = "https://nest-app-prep.preview.emergentagent.com"
OUT_DIR = Path("/app/frontend/store-assets")
TMP_VIDEO_DIR = Path("/tmp/teamnest_video")
TMP_VIDEO_DIR.mkdir(parents=True, exist_ok=True)

# Apple's 6.7" preview accepts 1080x1920. Playwright record video can't change
# size later, so we set the viewport itself to 1080x1920 and skip device_scale.
RECORD_W, RECORD_H = 1080, 1920


async def record():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": RECORD_W, "height": RECORD_H},
            device_scale_factor=1,
            is_mobile=True,
            has_touch=True,
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 "
                "Mobile/15E148 Safari/604.1"
            ),
            record_video_dir=str(TMP_VIDEO_DIR),
            record_video_size={"width": RECORD_W, "height": RECORD_H},
        )

        # Pre-auth
        token = requests.post(f"{BASE}/api/auth/demo-login", timeout=20).json()["token"]
        await ctx.add_init_script(
            f"""
            localStorage.setItem('eat_token', '{token}');
            localStorage.setItem('tn:pwa-prompt-dismissed', '1');
            localStorage.setItem('chatlist:collapsed', '1');
            window.addEventListener('beforeinstallprompt', e => e.preventDefault());
            """
        )

        page = await ctx.new_page()

        # ----- Scene 1: Welcome (2.5s) -----
        await page.goto(f"{BASE}/", wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(2500)

        # ----- Scene 2: Dashboard (2.5s) -----
        await page.goto(f"{BASE}/dashboard", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2500)

        # ----- Scene 3: Group chat (3s) -----
        chats = requests.get(
            f"{BASE}/api/chats",
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        ).json()
        target = next(
            (c for c in chats if c.get("name") == "Max Brenner Expansion Team"),
            chats[0],
        )
        await page.goto(f"{BASE}/chats/{target['id']}", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)
        # Slow auto-scroll up to reveal earlier messages
        await page.evaluate(
            "const el = document.querySelector('[data-testid*=\"messages\"], main'); "
            "if (el) { let y = 0; const id = setInterval(() => { y += 60; el.scrollBy(0, -60); if (y > 600) clearInterval(id); }, 60); }"
        )
        await page.wait_for_timeout(1200)

        # ----- Scene 4: Research / AI compare (3s) -----
        await page.goto(f"{BASE}/research", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)

        # ----- Scene 5: Tasks (2.5s) -----
        await page.goto(f"{BASE}/tasks", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2500)

        # Close to flush the video file
        await ctx.close()
        await browser.close()


def transcode_to_mp4(src_webm: Path, dst_mp4: Path, target_seconds: int = 15):
    """Convert WebM → H.264 MP4, trim to target_seconds, fix moov atom front."""
    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(src_webm),
        "-t", str(target_seconds),
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-profile:v", "high",
        "-level", "4.0",
        "-movflags", "+faststart",
        "-r", "30",
        "-an",          # Apple preview must NOT have audio when using just-video
        str(dst_mp4),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def main():
    # Clean any previous run
    for f in TMP_VIDEO_DIR.glob("*.webm"):
        f.unlink()

    print("Recording 15-second walkthrough...")
    asyncio.run(record())

    # Playwright writes one .webm per page; we want the latest
    webm_files = sorted(TMP_VIDEO_DIR.glob("*.webm"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not webm_files:
        print("[FATAL] No video file produced", file=sys.stderr)
        sys.exit(1)

    src = webm_files[0]
    print(f"Raw video: {src} ({src.stat().st_size:,} bytes)")

    # Transcode for App Store / Play Store
    dst_ios = OUT_DIR / "ios" / "app_preview_6.7inch.mp4"
    dst_android = OUT_DIR / "android" / "app_preview.mp4"
    dst_ios.parent.mkdir(parents=True, exist_ok=True)
    dst_android.parent.mkdir(parents=True, exist_ok=True)

    print("Transcoding to H.264 MP4 (15-sec)...")
    transcode_to_mp4(src, dst_ios)
    # Same file works for Play Store
    shutil.copy(dst_ios, dst_android)

    # Also keep the raw WebM in raw/ for archive
    raw_dst = OUT_DIR / "raw" / "app_preview.webm"
    shutil.copy(src, raw_dst)

    print("\n=== Done ===")
    for f in [dst_ios, dst_android, raw_dst]:
        size_mb = f.stat().st_size / (1024 * 1024)
        print(f"  {f.relative_to(OUT_DIR.parent)}: {size_mb:.2f} MB")

    # Apple max size: 500 MB. Sanity check
    if dst_ios.stat().st_size > 450 * 1024 * 1024:
        print("[WARN] Video exceeds App Store soft limit", file=sys.stderr)


if __name__ == "__main__":
    main()
