# NYVEX

Локальный AI-чат в браузере (PWA). Модель запускается на устройстве (WebGPU / WASM). Данные — только в localStorage.

## Структура

```
nyvex/
├── index.html          # лендинг
├── app.html            # чат + auth + loading
├── css/                # модульные стили
├── js/                 # ES-модули (core, auth, ai, chat, ui)
├── legal/              # privacy, terms, cookies, data
├── assets/
├── manifest.json
├── service-worker.js
├── package.json
├── capacitor.config.json
└── LICENSE
```

## Запуск (веб)

```bash
cd nyvex
npx --yes serve -l 5173 .
```

Откройте `http://localhost:5173` (лендинг) или `/app.html` (чат).

Нужен современный браузер. Первый запуск скачает модель (~сотни МБ, кэшируется).

## PWA

- `manifest.json` + иконки в `assets/icons/`
- `service-worker.js` — offline shell
- Зарегистрируйте SW (уже можно добавить в `main.js`):

```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}
```

## Юридическое

- `/legal/privacy.html` — конфиденциальность  
- `/legal/terms.html` — условия (13+)  
- `/legal/cookies.html` — cookie  
- `/legal/data.html` — согласие на обработку  
- Cookie-баннер + чекбоксы при регистрации  

## Сборка APK (Capacitor)

```bash
npm install
npx cap add android
npx cap sync
npx cap open android
# в Android Studio: Build → Generate Signed Bundle / APK
# или: cd android && ./gradlew assembleRelease
```

APK: `android/app/build/outputs/apk/release/`.

Требуются Android SDK / JDK.

## Важно

- **Без математического решальника** — только чат с LLM.
- Модель: локальная ONNX-модель через Transformers.js.
- Нет серверной аналитики и трекинга.
- MIT License.
