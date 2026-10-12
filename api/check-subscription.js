/**
 * GET /api/check-subscription?deviceId=NYVX-...
 * Optional: &paymentId=... to verify via YooKassa if KV lag
 */
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(body));
}

async function getKv() {
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch {
    return null;
  }
}

async function fetchPayment(paymentId, shopId, secretKey) {
  const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  const r = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!r.ok) return null;
  return r.json();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const url = new URL(req.url, 'http://localhost');
  const deviceId = String(url.searchParams.get('deviceId') || '').trim();
  const paymentId = String(url.searchParams.get('paymentId') || '').trim();

  if (!deviceId || deviceId.length < 8) {
    return json(res, 400, { active: false, error: 'Invalid deviceId' });
  }

  try {
    const kv = await getKv();
    if (kv) {
      const row = await kv.get(`sub:${deviceId}`);
      if (row && row.active && row.expiresAt && row.expiresAt > Date.now()) {
        return json(res, 200, {
          active: true,
          expiresAt: row.expiresAt,
          paidAt: row.paidAt || null,
        });
      }
    }

    // Fallback: verify paymentId with YooKassa and activate if succeeded
    if (paymentId && process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY) {
      const payment = await fetchPayment(
        paymentId,
        process.env.YOOKASSA_SHOP_ID,
        process.env.YOOKASSA_SECRET_KEY
      );
      if (
        payment &&
        payment.status === 'succeeded' &&
        String(payment.metadata?.deviceId || '') === deviceId
      ) {
        const PAID_MS = 30 * 24 * 60 * 60 * 1000;
        const expiresAt = Date.now() + PAID_MS;
        if (kv) {
          await kv.set(`sub:${deviceId}`, {
            active: true,
            deviceId,
            expiresAt,
            paidAt: Date.now(),
            lastPaymentId: paymentId,
            plan: 'monthly',
          });
        }
        return json(res, 200, { active: true, expiresAt, paidAt: Date.now() });
      }
    }

    return json(res, 200, { active: false });
  } catch (e) {
    console.error('check-subscription', e?.message || e);
    return json(res, 500, { active: false, error: 'Internal error' });
  }
}
