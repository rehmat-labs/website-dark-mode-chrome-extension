"""Generate the extension icons (moon on a rounded square).

Run:  python tools/make_icons.py
Writes icons/icon-<size>.png (active) and icons/icon-off-<size>.png (inactive).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "icons"
S = 1024  # draw large, then downscale for smooth edges


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def make(active: bool) -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Background: vertical gradient inside a rounded square
    top, bottom = ((67, 56, 202), (17, 24, 39)) if active else ((110, 110, 120), (45, 45, 52))
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp(top, bottom, y / S) + (255,))
    mask = Image.new("L", (S, S), 0)
    pad = int(S * 0.04)
    ImageDraw.Draw(mask).rounded_rectangle([pad, pad, S - pad, S - pad], radius=int(S * 0.22), fill=255)
    img.paste(grad, (0, 0), mask)

    # Crescent moon: full disc minus an offset disc
    moon_col = (253, 224, 71, 255) if active else (200, 200, 205, 255)
    cx, cy, r = S * 0.47, S * 0.53, S * 0.29
    moon = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(moon)
    md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    ox, oy, orr = cx + r * 0.55, cy - r * 0.42, r * 0.92
    md.ellipse([ox - orr, oy - orr, ox + orr, oy + orr], fill=0)

    if active:  # soft glow behind the moon
        glow = moon.filter(ImageFilter.GaussianBlur(S * 0.03))
        glow_layer = Image.new("RGBA", (S, S), (253, 224, 71, 0))
        glow_layer.putalpha(glow.point(lambda v: int(v * 0.45)))
        img.alpha_composite(glow_layer)

    moon_layer = Image.new("RGBA", (S, S), moon_col)
    moon_layer.putalpha(moon)
    img.alpha_composite(moon_layer)

    # Two little stars
    star_col = (255, 255, 255, 235) if active else (220, 220, 225, 200)
    d = ImageDraw.Draw(img)
    for sx, sy, sr in [(0.72, 0.30, 0.045), (0.80, 0.52, 0.028)]:
        x, y, rr = S * sx, S * sy, S * sr
        thin = rr * 0.28
        d.polygon([(x, y - rr), (x + thin, y - thin), (x + rr, y), (x + thin, y + thin),
                   (x, y + rr), (x - thin, y + thin), (x - rr, y), (x - thin, y - thin)], fill=star_col)
    return img


def main():
    OUT.mkdir(exist_ok=True)
    for active, prefix in [(True, "icon"), (False, "icon-off")]:
        big = make(active)
        for size in (16, 32, 48, 128):
            big.resize((size, size), Image.LANCZOS).save(OUT / f"{prefix}-{size}.png")
    print("Icons written to", OUT)


if __name__ == "__main__":
    main()
