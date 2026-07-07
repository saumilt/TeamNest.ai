"""Generate a Google Play feature graphic (1024x500) — required for Play Store."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path("/app/frontend/store-assets/android/feature_graphic.png")

W, H = 1024, 500
YELLOW = (250, 204, 21)
BLACK = (10, 10, 10)
WHITE = (245, 245, 245)
SOFT_GRAY = (180, 180, 180)

FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"


def main():
    img = Image.new("RGB", (W, H), BLACK)
    draw = ImageDraw.Draw(img)

    # Diagonal yellow ribbon on the far right (narrower so text doesn't clip)
    ribbon = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ribbon)
    rd.polygon([(W, 0), (W, H), (W - 260, H), (W - 130, 0)], fill=YELLOW + (255,))
    ribbon = ribbon.filter(ImageFilter.GaussianBlur(0.5))
    img = Image.alpha_composite(img.convert("RGBA"), ribbon).convert("RGB")
    draw = ImageDraw.Draw(img)

    # TN logo block on the left
    logo_x, logo_y = 80, 70
    draw.rounded_rectangle([logo_x, logo_y, logo_x + 120, logo_y + 120], radius=20, fill=YELLOW)
    tn_font = ImageFont.truetype(FONT_BOLD, 64)
    bbox = draw.textbbox((0, 0), "TN", font=tn_font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text(
        (logo_x + (120 - tw) // 2, logo_y + (120 - th) // 2 - 8),
        "TN",
        font=tn_font,
        fill=BLACK,
    )

    # Title
    title_font = ImageFont.truetype(FONT_BOLD, 68)
    title = "teamnest"
    draw.text((logo_x + 150, logo_y + 18), title, font=title_font, fill=WHITE)
    # ".ai" in yellow
    bbox = draw.textbbox((0, 0), title, font=title_font)
    draw.text((logo_x + 150 + (bbox[2] - bbox[0]), logo_y + 18), ".ai", font=title_font, fill=YELLOW)

    # Sub-tagline
    sub_font = ImageFont.truetype(FONT_REG, 28)
    draw.text((logo_x + 150, logo_y + 100), "AI-NATIVE TEAM COMMS", font=sub_font, fill=SOFT_GRAY)

    # Bold headline
    headline_font = ImageFont.truetype(FONT_BOLD, 44)
    sub_headline_font = ImageFont.truetype(FONT_REG, 32)
    headline_y = 260
    draw.text((80, headline_y), "Chat, research, decide", font=headline_font, fill=WHITE)
    draw.text((80, headline_y + 56), "— with AI in every", font=headline_font, fill=WHITE)
    draw.text((80, headline_y + 112), "conversation.", font=headline_font, fill=YELLOW)

    # Right side: 3 small phone mockups overlapping (visual flair)
    raw_dir = Path("/app/frontend/store-assets/raw")
    mock_files = ["02_group_chat.png", "03_ai_compare.png", "04_tasks.png"]
    mock_w, mock_h = 160, 348
    base_x = W - 420
    base_y = 70
    for i, fname in enumerate(mock_files):
        src = Image.open(raw_dir / fname).resize((mock_w, mock_h), Image.LANCZOS)
        # Round corners
        mask = Image.new("L", (mock_w, mock_h), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, mock_w, mock_h], radius=20, fill=255)
        src_rgba = src.convert("RGBA")
        src_rgba.putalpha(mask)
        # Yellow thin border
        border = Image.new("RGBA", (mock_w, mock_h), (0, 0, 0, 0))
        ImageDraw.Draw(border).rounded_rectangle(
            [1, 1, mock_w - 2, mock_h - 2], radius=20, outline=YELLOW + (220,), width=3
        )
        x = base_x + i * 105
        y = base_y + (i % 2) * 20
        img.paste(src_rgba, (x, y), src_rgba)
        img.paste(border, (x, y), border)

    img.save(OUT, optimize=True)
    print(f"Saved {OUT} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
