# Payments (YooKassa)

**Never put `YOOKASSA_SECRET_KEY` or shop secret in this folder.**

Frontend may only call **your backend**:
- `POST /api/create-payment`
- `GET /api/subscription-status`

Prices must be enforced on the server (290.00 RUB), not taken from the client.

See root `.env.example` and `SECURITY.md`.
