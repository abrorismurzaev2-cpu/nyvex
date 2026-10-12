/**
 * POST /api/webhook/yookassa
 * YooKassa HTTP notification. Verifies payment via API (not trusting body alone).
 * Activates subscription in Vercel KV for deviceId + 30 days.
 */
const PAID_MS = 30 * 24 * 60 * 60 * 1000;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 2e6) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function fetchPayment(paymentId, shopId, secretKey) {
  const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  const r = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!r.ok) throw new Error('payment fetch failed');
  return r.json();
}

async function getKv() {
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    return json(res, 500, { error: 'Not configured' });
  }

  try {
    const event = await readBody(req);
    const eventType = event?.event || event?.type;
    const object = event?.object || {};
    const paymentId = object?.id;

    if (!paymentId) {
      return json(res, 400, { error: 'No payment id' });
    }

    // Verify with YooKassa API (authoritative)
    const payment = await fetchPayment(paymentId, shopId, secretKey);
    const deviceId = String(payment?.metadata?.deviceId || '').trim();
    const status = payment?.status;

    const kv = await getKv();
    if (!kv) {
      console.error('webhook: KV not available');
      // Still ACK so YooKassa does not retry forever; client can poll payment
      return json(res, 200, { ok: true, warning: 'kv_missing' });
    }

    if (status === 'succeeded' || eventType === 'payment.succeeded') {
      if (!deviceId) {
        console.error('webhook: missing deviceId in metadata');
        return json(res, 200, { ok: true });
      }
      const now = Date.now();
      const key = `sub:${deviceId}`;
      const prev = (await kv.get(key)) || {};
      const base = prev.expiresAt && prev.expiresAt > now ? prev.expiresAt : now;
      const expiresAt = base + PAID_MS;
      await kv.set(key, {
        active: true,
        deviceId,
        expiresAt,
        paidAt: now,
        lastPaymentId: paymentId,
        plan: payment?.metadata?.plan || 'monthly',
      });
      return json(res, 200, { ok: true });
    }

    if (status === 'canceled' || eventType === 'payment.canceled') {
      if (deviceId) {
        const key = `sub:${deviceId}`;
        const prev = (await kv.get(key)) || {};
        // Do not strip remaining paid time; only mark canceled flag
        await kv.set(key, { ...prev, canceled: true, lastPaymentId: paymentId });
      }
      return json(res, 200, { ok: true });
    }

    return json(res, 200, { ok: true });
  } catch (e) {
    console.error('webhook error', e?.message || e);
    return json(res, 500, { error: 'Internal error' });
  }
}
