# Встроенная модель в APK

## Поведение

| Платформа | Модель |
|-----------|--------|
| **Android APK** | Локально `assets/models/skjortan/MiniCPM5-1B-ONNX/` внутри APK |
| **Веб / PWA** | Скачивание с HuggingFace + resume/кэш |

## Сборка

GitHub Actions при `assembleRelease`:

1. `huggingface-cli` / `hf_hub_download` → `www/assets/models/...`
2. `npx cap sync android` копирует в APK assets
3. Артефакт + **GitHub Release** `nyvex-release.apk`

Ссылка:

https://github.com/abrorismurzaev2-cpu/nyvex/releases/latest/download/nyvex-release.apk

## Размер

~0.9–1.2 ГБ. RuStore допускает до 5 ГБ.

Модель **не коммитится** в git (см. `.gitignore`).
