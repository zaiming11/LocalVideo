"""Generate the four demo posters used by the browser preview.

The demo videos themselves are produced from these posters with ffmpeg by
tools/generate_demo.ps1. Keeping the artwork vector-ish and deterministic makes
the preview look the same on every machine.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "static" / "demo" / "posters"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1280, 720
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_REG = r"C:\Windows\Fonts\msyh.ttc"
FONT_LATIN = r"C:\Windows\Fonts\arialbd.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size, index=0)
    except Exception:
        return ImageFont.truetype(path, size)


def gradient(top: str, bottom: str, angle: float = 0.0) -> Image.Image:
    """A smooth linear gradient with an optional diagonal angle (degrees)."""
    y = np.linspace(0.0, 1.0, H, dtype=np.float32)[:, None]
    x = np.linspace(0.0, 1.0, W, dtype=np.float32)[None, :]
    t = np.clip(y + (x - 0.5) * math.tan(math.radians(angle)), 0, 1)
    c0 = np.array(tuple(int(top[i : i + 2], 16) for i in (1, 3, 5)), dtype=np.float32)
    c1 = np.array(tuple(int(bottom[i : i + 2], 16) for i in (1, 3, 5)), dtype=np.float32)
    arr = c0[None, None, :] * (1 - t[:, :, None]) + c1[None, None, :] * t[:, :, None]
    return Image.fromarray(arr.astype(np.uint8), "RGB")


def glow_layer(size: tuple[int, int], color: tuple[int, int, int], blur: int = 90) -> Image.Image:
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    return layer.filter(ImageFilter.GaussianBlur(blur))


def add_radial_glow(base: Image.Image, center: tuple[int, int], radius: int,
                    color: tuple[int, int, int], opacity: int = 190) -> Image.Image:
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x, y = center
    for i in range(radius, 0, -4):
        a = int(opacity * (1 - i / radius) ** 2.2)
        d.ellipse((x - i, y - i, x + i, y + i), fill=(*color, a))
    layer = layer.filter(ImageFilter.GaussianBlur(48))
    return Image.alpha_composite(base.convert("RGBA"), layer)


def add_grain(img: Image.Image, amount: float = 7.0) -> Image.Image:
    rng = np.random.default_rng(42)
    noise = rng.normal(0, amount, (H, W, 1)).repeat(3, axis=2)
    arr = np.asarray(img).astype(np.float32) + noise
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def add_vignette(img: Image.Image, strength: float = 0.55) -> Image.Image:
    yy, xx = np.mgrid[0:H, 0:W]
    cx, cy = W / 2, H / 2
    dist = np.sqrt(((xx - cx) / (W * 0.62)) ** 2 + ((yy - cy) / (H * 0.62)) ** 2)
    v = np.clip(1 - strength * np.clip(dist - 0.55, 0, 1) ** 1.4, 0, 1)
    arr = np.asarray(img).astype(np.float32) * v[:, :, None]
    return Image.fromarray(arr.astype(np.uint8), "RGB")


def spaced_text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str,
                fnt: ImageFont.FreeTypeFont, fill: tuple[int, int, int, int],
                tracking: int = 5) -> int:
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + tracking
    return x


def base_frame(top: str, bottom: str, angle: float = 0.0) -> Image.Image:
    return gradient(top, bottom, angle).convert("RGBA")


def stamp(img: Image.Image, number: str, title: str, latin: str,
          meta: str, accent: tuple[int, int, int], title_color=(246, 247, 242)) -> Image.Image:
    img = img.convert("RGBA")
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # top brand line
    d.text((64, 50), "LOCAL", font=font(FONT_LATIN, 16), fill=(255, 255, 255, 150))
    d.text((64, 74), "CINEMA", font=font(FONT_LATIN, 16), fill=(255, 255, 255, 70))
    d.line((134, 62, 232, 62), fill=(255, 255, 255, 55), width=1)

    # huge index number
    idx_font = font(FONT_LATIN, 240)
    d.text((W - 230, H - 330), number, font=idx_font, fill=(255, 255, 255, 18))

    # text block
    d.text((64, H - 238), title, font=font(FONT_BOLD, 92), fill=(*title_color, 255))
    spaced_text(d, (68, H - 128), latin, font(FONT_LATIN, 19), (255, 255, 255, 190), 7)
    d.line((68, H - 88, 172, H - 88), fill=(*accent, 230), width=3)
    d.text((68, H - 70), meta, font=font(FONT_REG, 17), fill=(255, 255, 255, 135))

    # corner badge
    badge = "4K  ·  20s"
    bf = font(FONT_LATIN, 14)
    tw = d.textlength(badge, font=bf)
    d.rounded_rectangle((W - 72 - tw - 32, 48, W - 64, 86), radius=19,
                        fill=(0, 0, 0, 70), outline=(255, 255, 255, 55), width=1)
    d.text((W - 72 - tw - 16, 58), badge, font=bf, fill=(255, 255, 255, 185))

    out = Image.alpha_composite(img, layer)
    return out.convert("RGB")


def night_flight() -> Image.Image:
    img = base_frame("#040814", "#062E3B", -10)
    rng = random.Random(7)
    stars = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(stars)
    for _ in range(240):
        x, y = rng.randrange(W), rng.randrange(0, int(H * 0.78))
        r = rng.choice([1, 1, 1, 2])
        a = rng.randrange(40, 190)
        sd.ellipse((x, y, x + r, y + r), fill=(220, 245, 255, a))
    img = Image.alpha_composite(img, stars)

    # planet / orb
    orb = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(orb)
    cx, cy, r = 962, 238, 92
    for i in range(r, 0, -2):
        t = 1 - i / r
        od.ellipse((cx - i, cy - i, cx + i, cy + i),
                   fill=(int(41 + 20 * t), int(163 + 45 * t), int(173 + 40 * t), 255))
    img = Image.alpha_composite(img, orb)
    img = add_radial_glow(img, (cx, cy), 190, (60, 225, 210), 135)

    # light streaks
    streak = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(streak)
    for i in range(9):
        x = 140 + i * 120
        sd.line((x - 310, H + 60, x + 420, -80), fill=(120, 255, 235, 18), width=2)
    streak = streak.filter(ImageFilter.GaussianBlur(1.5))
    img = Image.alpha_composite(img, streak)

    # horizon glow
    img = add_radial_glow(img, (300, 690), 420, (16, 92, 108), 150)
    img = add_grain(img.convert("RGB"), 6)
    img = add_vignette(img, 0.6)
    return stamp(img, "01", "夜航", "NIGHT FLIGHT", "SCI-FI  ·  深空漂流  ·  第 1 集", (193, 255, 114))


def sunset_coast() -> Image.Image:
    img = base_frame("#250A1C", "#FFB06A", 6)
    # sun
    img = add_radial_glow(img, (864, 330), 260, (255, 205, 120), 240)
    d = ImageDraw.Draw(img)
    d.ellipse((800, 266, 928, 394), fill=(255, 231, 177, 255))
    # sea
    sea = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sea)
    for y in range(410, H, 10):
        a = int(45 + (y - 410) / (H - 410) * 80)
        sd.rectangle((0, y, W, y + 4), fill=(255, 139, 112, a))
    img = Image.alpha_composite(img, sea.filter(ImageFilter.GaussianBlur(2)))
    # coastline silhouettes
    sil = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sil)
    sd.polygon([(0, 600), (180, 510), (320, 560), (500, 470), (690, 545), (860, 505),
                (1050, 575), (1280, 500), (1280, 720), (0, 720)], fill=(43, 16, 32, 235))
    sd.polygon([(0, 655), (230, 590), (430, 650), (640, 585), (900, 655), (1120, 600),
                (1280, 640), (1280, 720), (0, 720)], fill=(22, 9, 20, 250))
    img = Image.alpha_composite(img, sil)
    # sun reflection
    refl = Image.new("RGBA", img.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(refl)
    for i in range(22):
        y = 410 + i * 13
        w = 24 + i * 4
        rd.rounded_rectangle((864 - w, y, 864 + w, y + 3), radius=2,
                             fill=(255, 221, 160, max(12, 120 - i * 5)))
    img = Image.alpha_composite(img, refl.filter(ImageFilter.GaussianBlur(1.2)))
    img = add_grain(img.convert("RGB"), 5)
    img = add_vignette(img, 0.45)
    return stamp(img, "02", "日落海岸", "SUNSET COAST", "TRAVEL  ·  公路与海  ·  第 2 集", (255, 196, 120))


def neon_pulse() -> Image.Image:
    img = base_frame("#080416", "#230B3E", 0)
    img = add_radial_glow(img, (920, 170), 280, (115, 30, 190), 170)
    img = add_radial_glow(img, (270, 250), 260, (0, 180, 205), 125)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    horizon = 430
    vx = W // 2
    for i in range(-12, 13):
        x = vx + i * 140
        d.line((vx + i * 22, horizon, x, H), fill=(72, 238, 226, 52), width=2)
    for i in range(12):
        y = horizon + int((i / 12) ** 1.8 * (H - horizon))
        d.line((0, y, W, y), fill=(244, 74, 210, 40), width=1)
    # glowing skyline
    skyline = [(0, 390), (90, 390), (90, 320), (150, 320), (150, 380), (245, 380),
               (245, 280), (290, 280), (290, 360), (380, 360), (380, 330), (470, 330),
               (470, 250), (515, 250), (515, 380), (610, 380), (610, 300), (680, 300),
               (680, 370), (780, 370), (780, 235), (830, 235), (830, 390), (930, 390),
               (930, 320), (1010, 320), (1010, 380), (1100, 380), (1100, 285),
               (1150, 285), (1150, 390), (1280, 390)]
    d.polygon(skyline + [(1280, H), (0, H)], fill=(10, 5, 23, 235))
    # neon edge
    d.line(skyline, fill=(120, 245, 255, 110), width=2)
    img = Image.alpha_composite(img, layer)
    # magenta flare
    img = add_radial_glow(img, (1010, 360), 170, (255, 40, 190), 120)
    img = add_grain(img.convert("RGB"), 6)
    img = add_vignette(img, 0.58)
    return stamp(img, "03", "霓虹脉搏", "NEON PULSE", "CITY  ·  午夜频率  ·  第 3 集", (244, 114, 255))


def valley_dawn() -> Image.Image:
    img = base_frame("#06130F", "#B9E5C0", 0)
    img = add_radial_glow(img, (930, 205), 300, (240, 248, 180), 220)
    # mountains
    layers = [
        ([(0, 470), (180, 380), (360, 470), (560, 360), (760, 470), (980, 390), (1280, 470)], (0.70, 0.55, 0.45)),
        ([(0, 540), (240, 450), (470, 540), (720, 435), (980, 540), (1280, 470)], (0.32, 0.45, 0.36)),
        ([(0, 620), (260, 550), (520, 620), (800, 540), (1080, 620), (1280, 575)], (0.13, 0.24, 0.19)),
    ]
    for pts, color in layers:
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        poly = list(pts)
        poly += [(W, H), (0, H)]
        d.polygon(poly, fill=(*[int(c * 255) for c in color], 255))
        img = Image.alpha_composite(img, layer)
    # fog bands
    fog = Image.new("RGBA", img.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(fog)
    for y, a in [(480, 42), (540, 55), (610, 65)]:
        fd.ellipse((-200, y - 60, W + 200, y + 80), fill=(220, 240, 210, a))
    img = Image.alpha_composite(img, fog.filter(ImageFilter.GaussianBlur(38)))
    # birds
    d = ImageDraw.Draw(img)
    for x, y, s in [(760, 300, 7), (800, 280, 5), (830, 310, 4)]:
        d.arc((x - s, y - s, x + s, y + s), 200, 340, fill=(30, 50, 40, 180), width=2)
    img = add_grain(img.convert("RGB"), 5)
    img = add_vignette(img, 0.38)
    return stamp(img, "04", "山谷晨光", "VALLEY DAWN", "NATURE  ·  雾散之前  ·  第 4 集", (198, 255, 155))


def main() -> None:
    for name, fn in [
        ("night-flight", night_flight),
        ("sunset-coast", sunset_coast),
        ("neon-pulse", neon_pulse),
        ("valley-dawn", valley_dawn),
    ]:
        img = fn()
        path = OUT / f"{name}.jpg"
        img.save(path, "JPEG", quality=90, subsampling=0, optimize=True)
        print(f"wrote {path} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
