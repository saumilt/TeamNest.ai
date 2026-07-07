"""Frame & caption raw screenshots for App Store / Play Store submission.

Inputs:
    /app/frontend/store-assets/raw/01_welcome.png   (1290x2796)
    /app/frontend/store-assets/raw/02_group_chat.png
    ...

Outputs:
    /app/frontend/store-assets/ios/6.7inch/01_welcome.png   (1290x2796)
    /app/frontend/store-assets/ios/6.5inch/01_welcome.png   (1284x2778)
    /app/frontend/store-assets/ios/5.5inch/01_welcome.png   (1242x2208)
    /app/frontend/store-assets/android/phone/01_welcome.png (1080x1920)

Each output features:
    • Solid black background with subtle yellow accent line
    • Bold caption + sub-caption in the upper 22% of the canvas
    • The raw screenshot scaled & inset into the lower 75%, with rounded
      corners (60px) and a thin yellow border + subtle drop-shadow
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAW = Path("/app/frontend/store-assets/raw")
OUT_BASE = Path("/app/frontend/store-assets")

# (caption, sub-caption)
CAPTIONS = {
    "01_welcome":     ("Built for AI-first teams",        "Stop juggling six AI tabs"),
    "02_group_chat":  ("Chat with AI inside every thread", "Ask, decide, assign — together"),
    "03_ai_compare":  ("Ask GPT, Claude, Gemini",          "Compare answers side-by-side"),
    "04_tasks":       ("Decisions become tasks",           "@task in any message"),
    "05_billing":     ("Free forever. Pro when ready.",    "Pay as you scale"),
    "06_dashboard":   ("Your team's command center",       "Chats, AI, tasks at a glance"),
}

YELLOW = (250, 204, 21)        # #facc15
BLACK = (10, 10, 10)            # #0a0a0a
SOFT_GRAY = (180, 180, 180)
WHITE = (245, 245, 245)

FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"


def make_canvas(w, h):
    """Black canvas with a faint yellow scan-line at top-right + soft vignette."""
    img = Image.new("RGB", (w, h), BLACK)
    draw = ImageDraw.Draw(img)
    # Subtle vignette top-left to dark
    for y in range(int(h * 0.22)):
        alpha = 1 - (y / (h * 0.22))
        intensity = int(18 * alpha)
        draw.line([(0, y), (w, y)], fill=(intensity, intensity, intensity + 4))
    # Yellow accent bar bottom of caption zone
    bar_y = int(h * 0.22) - 6
    draw.rectangle([(int(w * 0.08), bar_y), (int(w * 0.18), bar_y + 4)], fill=YELLOW)
    return img


def draw_text_centered(draw, text, font, y, w, fill, max_w=None):
    """Draw text centered on x, supports wrapping."""
    if max_w is None:
        max_w = int(w * 0.84)
    # Word-wrap
    words = text.split()
    lines = []
    cur = []
    for word in words:
        trial = " ".join(cur + [word])
        bbox = draw.textbbox((0, 0), trial, font=font)
        if bbox[2] - bbox[0] > max_w and cur:
            lines.append(" ".join(cur))
            cur = [word]
        else:
            cur.append(word)
    if cur:
        lines.append(" ".join(cur))

    line_h = font.size + 8
    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font)
        line_w = bbox[2] - bbox[0]
        draw.text(((w - line_w) // 2, y + i * line_h), line, font=font, fill=fill)
    return len(lines) * line_h


def round_corners(im, radius):
    """Mask `im` (RGB) with rounded corners. Returns RGBA."""
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([(0, 0), (w, h)], radius=radius, fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out


def drop_shadow(im, radius=40, opacity=140):
    """Return a black drop-shadow image, same size as im plus margins."""
    w, h = im.size
    pad = radius * 2
    shadow = Image.new("RGBA", (w + pad, h + pad), (0, 0, 0, 0))
    mask = im.split()[-1]  # alpha
    big = Image.new("L", (w + pad, h + pad), 0)
    big.paste(mask, (pad // 2, pad // 2))
    big = big.filter(ImageFilter.GaussianBlur(radius))
    shadow.putalpha(big.point(lambda v: int(v * opacity / 255)))
    return shadow


def compose(canvas_w, canvas_h, raw: Image.Image, caption: str, sub: str) -> Image.Image:
    canvas = make_canvas(canvas_w, canvas_h)
    draw = ImageDraw.Draw(canvas)

    # ---- Caption zone (top 22% of canvas) ----
    title_size = max(56, int(canvas_w * 0.072))
    sub_size = max(28, int(canvas_w * 0.034))
    title_font = ImageFont.truetype(FONT_BOLD, title_size)
    sub_font = ImageFont.truetype(FONT_REG, sub_size)

    # Vertical layout in caption zone (0 -> 0.22*h)
    cap_top = int(canvas_h * 0.06)
    used = draw_text_centered(draw, caption, title_font, cap_top, canvas_w, WHITE)
    sub_top = cap_top + used + int(canvas_h * 0.012)
    draw_text_centered(draw, sub, sub_font, sub_top, canvas_w, YELLOW)

    # ---- Screenshot zone (lower 75%) ----
    screen_top = int(canvas_h * 0.235)
    screen_bottom_margin = int(canvas_h * 0.04)
    target_h = canvas_h - screen_top - screen_bottom_margin
    side_margin = int(canvas_w * 0.04)
    target_w = canvas_w - 2 * side_margin

    # Maintain aspect ratio of raw (1290:2796 ≈ 0.4614)
    raw_ratio = raw.width / raw.height
    if target_w / target_h > raw_ratio:
        # Too wide → fit by height
        scaled_h = target_h
        scaled_w = int(target_h * raw_ratio)
    else:
        scaled_w = target_w
        scaled_h = int(target_w / raw_ratio)
    scaled = raw.resize((scaled_w, scaled_h), Image.LANCZOS)

    # Round corners
    radius = int(scaled_w * 0.055)
    scaled_rgba = round_corners(scaled, radius)

    # Yellow 2px border
    border = Image.new("RGBA", (scaled_w, scaled_h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(border)
    bd.rounded_rectangle(
        [(1, 1), (scaled_w - 2, scaled_h - 2)],
        radius=radius,
        outline=YELLOW + (200,),
        width=3,
    )

    # Drop shadow
    shadow = drop_shadow(scaled_rgba, radius=40, opacity=180)

    # Center horizontally
    x = (canvas_w - scaled_w) // 2
    y = screen_top

    canvas_rgba = canvas.convert("RGBA")
    canvas_rgba.alpha_composite(shadow, (x - 40, y - 20))
    canvas_rgba.alpha_composite(scaled_rgba, (x, y))
    canvas_rgba.alpha_composite(border, (x, y))

    return canvas_rgba.convert("RGB")


# Target sizes per store
TARGETS = [
    # (label, output_subdir, width, height)
    ("iOS 6.7\"",  "ios/6.7inch", 1290, 2796),
    ("iOS 6.5\"",  "ios/6.5inch", 1284, 2778),
    ("iOS 5.5\"",  "ios/5.5inch", 1242, 2208),
    ("Android",    "android/phone", 1080, 1920),
]


def main():
    for screen, (caption, sub) in CAPTIONS.items():
        raw_path = RAW / f"{screen}.png"
        if not raw_path.exists():
            print(f"[SKIP] missing {raw_path.name}")
            continue
        raw = Image.open(raw_path).convert("RGB")
        for label, subdir, w, h in TARGETS:
            out_dir = OUT_BASE / subdir
            out_dir.mkdir(parents=True, exist_ok=True)
            framed = compose(w, h, raw, caption, sub)
            out_path = out_dir / f"{screen}.png"
            framed.save(out_path, optimize=True)
        print(f"[OK] {screen} → all 4 sizes")

    # Print summary
    print("\n=== Output ===")
    for label, subdir, w, h in TARGETS:
        d = OUT_BASE / subdir
        files = sorted(d.glob("*.png"))
        total = sum(f.stat().st_size for f in files)
        print(f"{label:12} ({w}x{h}): {len(files)} files, {total/1024:.0f} KB total")


if __name__ == "__main__":
    main()
