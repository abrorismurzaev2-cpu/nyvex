/**
 * POST /api/create-payment
 * Body: { deviceId, plan?: 'monthly' }
 * Price is fixed on server: 290.00 RUB
 */
import { randomUUID } from 'crypto';

const PRICE = '290.00';
const CURRENCY = 'RUB';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error('body too large'));
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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return json(res, 204, {});
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');

  if (!shopId || !secretKey) {
    return json(res, 500, { error: 'Payment is not configured' });
  }
  if (!appUrl) {
    return json(res, 500, { error: 'APP_URL is not configured' });
  }

  try {
    const body = await readBody(req);
    const deviceId = String(body.deviceId || '').trim();
    const plan = body.plan === 'monthly' ? 'monthly' : 'monthly';

    if (!deviceId || deviceId.length < 8 || deviceId.length > 64) {
      return json(res, 400, { error: 'Invalid deviceId' });
    }

    const idempotenceKey = randomUUID();
    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');

    const payload = {
      amount: { value: PRICE, currency: CURRENCY },
      capture: true,
      save_payment_method: true,
      description: 'NYVEX Pro — 30 дней',
      confirmation: {
        type: 'redirect',
        return_url: `${appUrl}/payment-success.html?deviceId=${encodeURIComponent(deviceId)}`,
      },
      metadata: {
        deviceId,
        plan,
      },
    };

    const ykRes = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotenceKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await ykRes.json().catch(() => ({}));
    if (!ykRes.ok) {
      console.error('yookassa create-payment failed', ykRes.status, data?.code || data?.type || '');
      return json(res, 502, { error: 'Payment provider error' });
    }

    const confirmationUrl = data?.confirmation?.confirmation_url;
    if (!confirmationUrl) {
      return json(res, 502, { error: 'No confirmation URL' });
    }

    return json(res, 200, {
      confirmationUrl,
      paymentId: data.id,
    });
  } catch (e) {
    console.error('create-payment error', e?.message || e);
    return json(res, 500, { error: 'Internal error' });
  }
}
