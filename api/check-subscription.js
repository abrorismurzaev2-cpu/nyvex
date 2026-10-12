/**
 * GET /api/check-subscription?deviceId=NYVX-...
 */
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(body));
}

function parseQuery(req) {
  try {
    const raw = req.url || '';
    const q = raw.includes('?') ? raw.split('?')[1] : '';
    const params = {};
    for (const part of q.split('&')) {
      if (!part) continue;
      const [k, v] = part.split('=');
      params[decodeURIComponent(k || '')] = decodeURIComponent(v || '');
    }
    return params;
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

    const params = parseQuery(req);
    const deviceId = String(params.deviceId || '').trim();
    const paymentId = String(params.paymentId || '').trim();

    if (!deviceId || deviceId.length < 8) {
      return json(res, 400, { active: false, error: 'Invalid deviceId' });
    }

    // KV optional
    try {
      const { kv } = await import('@vercel/kv');
      const row = await kv.get(`sub:${deviceId}`);
      if (row && row.active && row.expiresAt && row.expiresAt > Date.now()) {
        return json(res, 200, {
          active: true,
          expiresAt: row.expiresAt,
          paidAt: row.paidAt || null,
        });
      }
    } catch (e) {
      // no KV linked yet — continue
    }

    if (paymentId && process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY) {
      try {
        const shopId = process.env.YOOKASSA_SHOP_ID;
        const secretKey = process.env.YOOKASSA_SECRET_KEY;
        if (shopId !== 'placeholder_to_fill' && secretKey !== 'placeholder_to_fill') {
          const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
          const r = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
            headers: { Authorization: `Basic ${auth}` },
          });
          if (r.ok) {
            const payment = await r.json();
            if (
              payment.status === 'succeeded' &&
              String(payment.metadata?.deviceId || '') === deviceId
            ) {
              const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
              return json(res, 200, { active: true, expiresAt, paidAt: Date.now() });
            }
          }
        }
      } catch (e) {
        // ignore
      }
    }

    return json(res, 200, { active: false });
  } catch (e) {
    console.error('check-subscription', e?.message || e);
    return json(res, 200, { active: false, error: 'unavailable' });
  }
}
