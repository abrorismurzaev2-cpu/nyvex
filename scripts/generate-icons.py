#!/usr/bin/env python3
"""Generate NYVEX orbital PWA icons."""
from PIL import Image, ImageDraw
import math, os

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons')
os.makedirs(OUT, exist_ok=True)

def lerp(a, b, t):
    return int(a + (b - a) * t)

def draw_icon(size, padding_ratio=0.0, corner_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    radius = int(size * corner_ratio)
    base = Image.new("RGBA", (size, size))
    px = base.load()
    c1, c2 = (124, 92, 255), (0, 217, 255)
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1)) if size > 1 else 0
            px[x, y] = (lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), 255)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    base.putalpha(mask)
    img = Image.alpha_composite(img, base)
    draw = ImageDraw.Draw(img)
    pad = int(size * padding_ratio)
    cx = cy = size / 2
    usable = size - 2 * pad
    scale = usable * 0.60
    rx, ry = scale * 0.48, scale * 0.17
    stroke = max(2, int(size * 0.035))
    angle = math.radians(-28)
    pts = []
    for i in range(72):
        a = 2 * math.pi * i / 72
        x, y = rx * math.cos(a), ry * math.sin(a)
        xr = x * math.cos(angle) - y * math.sin(angle)
        yr = x * math.sin(angle) + y * math.cos(angle)
        pts.append((cx + xr, cy + yr))
    for i in range(len(pts)):
        draw.line([pts[i], pts[(i + 1) % len(pts)]], fill=(255, 255, 255, 240), width=stroke)
    half = scale * 0.42
    draw.line([(cx, cy - half), (cx, cy + half)], fill=(255, 255, 255, 240), width=stroke)
    core_r = max(3, int(size * 0.055))
    for g in range(4, 0, -1):
        gr = core_r + g * max(1, size // 64)
        draw.ellipse([cx - gr, cy - gr, cx + gr, cy + gr], fill=(255, 255, 255, 40 + g * 20))
    draw.ellipse([cx - core_r, cy - core_r, cx + core_r, cy + core_r], fill=(255, 255, 255, 255))
    return img

draw_icon(192).save(f"{OUT}/icon-192.png")
draw_icon(512).save(f"{OUT}/icon-512.png")
draw_icon(512, padding_ratio=0.20).save(f"{OUT}/icon-maskable-512.png")
draw_icon(180).save(f"{OUT}/apple-touch-icon.png")
draw_icon(32).save(f"{OUT}/favicon-32.png")
try:
    draw_icon(32).save(f"{OUT}/favicon.ico", format="ICO", sizes=[(32, 32)])
except Exception:
    pass
print("OK", OUT)
