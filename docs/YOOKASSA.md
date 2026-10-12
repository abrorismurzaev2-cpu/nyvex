# ЮKassa + Vercel

## Env (Vercel → Settings → Environment Variables)

- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`
- `APP_URL` = `https://abrorismurzaev2-cpu.github.io/nyvex` (return URL base)
- `CRON_SECRET` (optional)

Link **Vercel KV** to the project for subscription storage.

## Webhook in ЮKassa

URL: `https://<your-vercel-app>.vercel.app/api/webhook/yookassa`  
Events: `payment.succeeded`, `payment.canceled`

## Test

1. Vercel deploy + env set
2. In app press «Оплатить 290 ₽»
3. Pay with YooKassa test card (if test shop)
4. Return to `payment-success.html` → subscription active

## Override API host (frontend)

```js
localStorage.setItem('nyvex_api_base', 'https://your-app.vercel.app')
```
