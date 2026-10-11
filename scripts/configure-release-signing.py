#!/usr/bin/env python3
"""Patch Capacitor android/app/build.gradle for release signing."""
from pathlib import Path
import os
import re

gradle = Path("android/app/build.gradle")
t = gradle.read_text()
store_file = str(Path(os.environ["GITHUB_WORKSPACE"]) / "nyvex-release.keystore").replace("\\", "/")

signing_block = f"""
    signingConfigs {{
        release {{
            storeFile file("{store_file}")
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }}
    }}
"""

if "signingConfigs" not in t:
    if "buildTypes" in t:
        t = t.replace("buildTypes", signing_block + "\n    buildTypes", 1)
    else:
        t = re.sub(
            r"(defaultConfig\s*\{[\s\S]*?\n\s*\})",
            r"\1\n" + signing_block,
            t,
            count=1,
        )

release_bt = """
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
            signingConfig signingConfigs.release
        }
"""

t2, n = re.subn(
    r"release\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}",
    release_bt.strip(),
    t,
    count=1,
)
if n == 0:
    t2 = re.sub(r"(buildTypes\s*\{)", r"\1\n" + release_bt, t, count=1)
t = t2

pr = Path("android/app/proguard-rules.pro")
if not pr.exists():
    pr.write_text(
        "# NYVEX Capacitor / WebView\n"
        "-keep class com.getcapacitor.** { *; }\n"
        "-dontwarn com.getcapacitor.**\n"
        "-keepattributes *Annotation*\n"
    )

gradle.write_text(t)
print("--- relevant lines ---")
for i, line in enumerate(t.splitlines(), 1):
    low = line.lower()
    if any(k in low for k in ("signing", "minify", "release", "version", "shrink")):
        print(f"{i}: {line}")
