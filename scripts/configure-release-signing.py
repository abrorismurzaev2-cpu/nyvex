#!/usr/bin/env python3
"""Patch Capacitor android/app/build.gradle for release signing + large onnx assets."""
from pathlib import Path
import os
import re

gradle = Path("android/app/build.gradle")
t = gradle.read_text()
store_file = str(Path(os.environ["GITHUB_WORKSPACE"]) / "nyvex-release.keystore").replace("\\", "/")

t = re.sub(r"\n\s*signingConfigs\s*\{[\s\S]*?\n\s*\}\n", "\n", t)

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
    if re.search(r"buildTypes\s*\{", t):
        t = re.sub(r"(buildTypes\s*\{)", signing_block + r"\n    \1", t, count=1)
    else:
        t = re.sub(
            r"(defaultConfig\s*\{[\s\S]*?\n\s*\})",
            r"\1\n" + signing_block,
            t,
            count=1,
        )


def patch_build_types(text):
    m = re.search(r"buildTypes\s*\{", text)
    if not m:
        return text
    start = m.end()
    depth = 1
    i = start
    while i < len(text) and depth:
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
        i += 1
    block = text[start : i - 1]
    release_body = """
        release {
            minifyEnabled false
            shrinkResources false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
            signingConfig signingConfigs.release
        }
"""
    block2, n = re.subn(
        r"release\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}",
        release_body.strip(),
        block,
        count=1,
    )
    if n == 0:
        block2 = release_body + block
    return text[:start] + block2 + text[i - 1 :]


t = patch_build_types(t)

if "noCompress" not in t:
    inject = """
    aaptOptions {
        noCompress 'onnx', 'bin'
    }
    androidResources {
        noCompress += ['onnx', 'bin']
    }
"""
    t = re.sub(r"(android\s*\{)", r"\1\n" + inject, t, count=1)

pr = Path("android/app/proguard-rules.pro")
if not pr.exists():
    pr.write_text(
        "-keep class com.getcapacitor.** { *; }\n"
        "-dontwarn com.getcapacitor.**\n"
    )

gradle.write_text(t)
print("Patched", gradle)

props = Path("android/gradle.properties")
if props.exists():
    pt = props.read_text()
    line = "org.gradle.jvmargs=-Xmx6g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8"
    if "org.gradle.jvmargs" in pt:
        pt = re.sub(r"org\.gradle\.jvmargs=.*", line, pt)
    else:
        pt += "\n" + line + "\n"
    props.write_text(pt)
    print("Patched", props)
