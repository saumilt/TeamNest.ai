#!/usr/bin/env python3
"""Build a short (~20s) portrait promo video for TeamNest.ai from the generated
iOS store screenshots, with an intro + outro title card. Output: 1080x1920 MP4.
"""
import os
import subprocess
from playwright.sync_api import sync_playwright

BASE = "/app/frontend/public/store-assets"
IOS = f"{BASE}/ios"
OUT = f"{BASE}/promo"
TMP = "/tmp/promo_work"
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)

FONTS = ('<link href="https://fonts.googleapis.com/css2?family=Poppins:wght=600;700;800&family=Sora:wght@400;600&display=swap" rel="stylesheet">')
BG = ("radial-gradient(700px 500px at 20% 0%, rgba(250,204,21,.20), transparent 60%),"
      "radial-gradient(700px 600px at 100% 100%, rgba(52,211,153,.16), transparent 55%),"
      "linear-gradient(180deg,#0b0b10,#050506)")

INTRO = f"""<!doctype html><html><head><meta charset='utf-8'>{FONTS}<style>
*{{margin:0;box-sizing:border-box}}
.c{{width:1080px;height:1920px;background:{BG};display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;padding:0 90px;text-align:center}}
.logo{{width:150px;height:150px;border-radius:36px;background:linear-gradient(135deg,#facc15,#f59e0b);display:grid;place-items:center;font-weight:800;color:#09090b;font-size:64px;box-shadow:0 30px 80px rgba(250,204,21,.4);margin-bottom:50px}}
h1{{color:#fff;font-weight:800;font-size:78px;letter-spacing:-2px}}
h1 em{{font-style:normal;background:linear-gradient(90deg,#facc15,#34d399);-webkit-background-clip:text;background-clip:text;color:transparent}}
p{{color:#a1a1aa;font-family:'Sora';font-size:34px;margin-top:32px;line-height:1.4}}
</style></head><body><div class='c'><div class='logo'>TN</div>
<h1>TeamNest<em>.ai</em></h1><p>Team chat, AI research &amp; building &mdash;<br>all in one app.</p></div></body></html>"""

OUTRO = f"""<!doctype html><html><head><meta charset='utf-8'>{FONTS}<style>
*{{margin:0;box-sizing:border-box}}
.c{{width:1080px;height:1920px;background:{BG};display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;padding:0 90px;text-align:center}}
.logo{{width:130px;height:130px;border-radius:32px;background:linear-gradient(135deg,#facc15,#f59e0b);display:grid;place-items:center;font-weight:800;color:#09090b;font-size:56px;margin-bottom:44px}}
h1{{color:#fff;font-weight:800;font-size:70px;letter-spacing:-1.5px;line-height:1.1}}
h1 em{{font-style:normal;background:linear-gradient(90deg,#facc15,#34d399);-webkit-background-clip:text;background-clip:text;color:transparent}}
.pill{{margin-top:56px;display:flex;gap:20px}}
.badge{{border:1px solid #33333b;background:rgba(255,255,255,.05);color:#e4e4e7;font-family:'Sora';font-size:30px;padding:18px 34px;border-radius:999px}}
.url{{color:#facc15;font-family:'Sora';font-size:32px;margin-top:48px;font-weight:600}}
</style></head><body><div class='c'><div class='logo'>TN</div>
<h1>Your team, <em>supercharged</em><br>by AI.</h1>
<div class='pill'><div class='badge'>&#63743; App Store</div><div class='badge'>&#9654; Google Play</div></div>
<div class='url'>teamnest.ai</div></div></body></html>"""


def render_card(html, path):
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1080, "height": 1920}, device_scale_factor=1)
        pg.set_content(html, wait_until="networkidle")
        pg.wait_for_timeout(300)
        pg.screenshot(path=path, clip={"x": 0, "y": 0, "width": 1080, "height": 1920})
        b.close()


def clip(src, dst, dur):
    vf = (f"scale=1080:1920:force_original_aspect_ratio=decrease,"
          f"pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x08080b,"
          f"fade=t=in:st=0:d=0.4,fade=t=out:st={dur-0.4:.2f}:d=0.4,format=yuv420p")
    subprocess.run(["ffmpeg", "-y", "-loop", "1", "-t", str(dur), "-i", src,
                    "-vf", vf, "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", dst],
                   check=True, capture_output=True)


def main():
    render_card(INTRO, f"{TMP}/00-intro.png")
    render_card(OUTRO, f"{TMP}/zz-outro.png")

    order = [(f"{TMP}/00-intro.png", 2.6)]
    for name in ["01-chats", "02-chat", "03-research", "04-tasks", "05-you"]:
        order.append((f"{IOS}/{name}.png", 3.0))
    order.append((f"{TMP}/zz-outro.png", 2.8))

    clips = []
    for i, (src, dur) in enumerate(order):
        dst = f"{TMP}/clip_{i:02d}.mp4"
        clip(src, dst, dur)
        clips.append(dst)

    listfile = f"{TMP}/list.txt"
    with open(listfile, "w") as f:
        for c in clips:
            f.write(f"file '{c}'\n")

    out = f"{OUT}/teamnest-promo.mp4"
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listfile,
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
                   check=True, capture_output=True)
    print("VIDEO:", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
