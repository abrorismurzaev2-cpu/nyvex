#!/usr/bin/env python3
from pathlib import Path
from PIL import Image
import re

im = Image.open("assets/icons/icon-512.png").convert("RGBA")
densities = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
res = Path("android/app/src/main/res")
for folder, size in densities.items():
    d = res / folder
    d.mkdir(parents=True, exist_ok=True)
    icon = im.resize((size, size), Image.Resampling.LANCZOS)
    for name in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
        icon.save(d / name)

gradle = Path("android/app/build.gradle")
if gradle.exists():
    t = gradle.read_text()
    t = re.sub(r"versionCode\s+\d+", "versionCode 28", t)
    t = re.sub(r'versionName\s+"[^"]*"', 'versionName "2.5.0"', t)
    gradle.write_text(t)
    print("version 2.1.1 / code 23")
print("icons ok")
