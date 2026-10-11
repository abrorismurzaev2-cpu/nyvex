# Release APK для RuStore

RuStore **не принимает** debug-сборки. Нужен `assembleRelease`, подписанный вашим keystore.

## Секреты GitHub (Settings → Secrets and variables → Actions)

| Secret | Описание |
|--------|----------|
| `KEYSTORE_BASE64` | Файл `.jks` / `.keystore`, закодированный: `base64 -w0 my.keystore` |
| `KEYSTORE_PASSWORD` | Пароль хранилища |
| `KEY_ALIAS` | Alias ключа |
| `KEY_PASSWORD` | Пароль ключа |

### Как получить KEYSTORE_BASE64 (на своём ПК)

```bash
# создать keystore (один раз), если ещё нет:
keytool -genkeypair -v -keystore nyvex-release.keystore -alias nyvex \
  -keyalg RSA -keysize 2048 -validity 10000

# base64 без переносов:
base64 -w0 nyvex-release.keystore > keystore.b64
# содержимое keystore.b64 → в секрет KEYSTORE_BASE64
```

**Никогда** не коммитьте `.keystore` / `.jks` и не присылайте ключ в чат.

## Сборка

1. Добавьте 4 секрета.
2. Actions → **Build Android APK** → Run workflow (или push в `main`).
3. Скачайте артефакт **`nyvex-release-apk`**.
4. Загрузите в RuStore.

## Проверка локально

```bash
jarsigner -verify -verbose -certs nyvex-release.apk
# должно быть: jar verified
# НЕ должно быть: CN=Android Debug
```
