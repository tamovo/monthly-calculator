const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function verifyToken(token, clientId) {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
  );
  if (!res.ok) return null;
  const info = await res.json();
  if (info.aud !== clientId) return null;
  if (parseInt(info.exp) < Math.floor(Date.now() / 1000)) return null;
  return { userId: info.sub, email: info.email };
}

async function authenticate(request, env) {
  const auth = request.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7), env.GOOGLE_CLIENT_ID);
}

async function handleGet(env, userId) {
  const row = await env.DB.prepare(
    'SELECT currency, mortgage, recurring_costs, account_templates FROM settings WHERE user_id = ?'
  ).bind(userId).first();

  const months = await env.DB.prepare(
    'SELECT month_key, data FROM months WHERE user_id = ? ORDER BY month_key'
  ).bind(userId).all();

  const monthData = {};
  for (const m of months.results) {
    monthData[m.month_key] = JSON.parse(m.data);
  }

  let accountTemplates, fixedPaymentLabel, salary, partnerName, splitRatio, fixedPaymentTemplates;
  try {
    const pt = JSON.parse(row?.account_templates ?? '[]');
    if (Array.isArray(pt)) {
      accountTemplates      = pt;
      fixedPaymentLabel     = 'Fixed Payment';
      salary                = 0;
      partnerName           = 'Partner';
      splitRatio            = 50;
      fixedPaymentTemplates = [{ id: 1, name: 'Fixed Payment', amount: 0 }];
    } else {
      accountTemplates      = pt.templates             ?? [];
      fixedPaymentLabel     = pt._label                ?? 'Fixed Payment';
      salary                = pt.salary                ?? 0;
      partnerName           = pt.partnerName           ?? 'Partner';
      splitRatio            = pt.splitRatio            ?? 50;
      fixedPaymentTemplates = pt.fixedPaymentTemplates ?? [{ id: 1, name: 'Fixed Payment', amount: 0 }];
    }
  } catch(_) {
    accountTemplates      = [];
    fixedPaymentLabel     = 'Fixed Payment';
    splitRatio            = 50;
    fixedPaymentTemplates = [{ id: 1, name: 'Fixed Payment', amount: 0 }];
  }

  return Response.json({
    currency: row?.currency ?? '£',
    mortgage: 0,
    recurringCosts: JSON.parse(row?.recurring_costs ?? '[]'),
    accountTemplates,
    fixedPaymentLabel,
    fixedPaymentTemplates,
    partnerName,
    salary,
    splitRatio,
    serverTime: new Date().toISOString(),
    data: monthData,
  });
}

async function handlePost(request, env, userId) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.data || typeof body.data !== 'object') {
    return Response.json({ ok: false, error: 'Missing or invalid data key' }, { status: 400 });
  }

  // Conflict detection: reject if another device wrote after client's last sync
  if (body.syncedAt) {
    const latest = await env.DB.prepare(
      'SELECT MAX(updated_at) as max_at FROM months WHERE user_id = ?'
    ).bind(userId).first();
    if (latest?.max_at && latest.max_at > body.syncedAt) {
      return Response.json({ ok: false, conflict: true }, { status: 409 });
    }
  }

  await env.DB.prepare(`
    INSERT INTO settings (user_id, currency, mortgage, recurring_costs, account_templates)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      currency          = excluded.currency,
      mortgage          = excluded.mortgage,
      recurring_costs   = excluded.recurring_costs,
      account_templates = excluded.account_templates
  `).bind(
    userId,
    body.currency                        ?? '£',
    body.mortgage                        ?? 0,
    JSON.stringify(body.recurringCosts ?? []),
    JSON.stringify({
      _label:                body.fixedPaymentLabel     ?? 'Fixed Payment',
      salary:                body.salary                ?? 0,
      partnerName:           body.partnerName           ?? 'Partner',
      splitRatio:            body.splitRatio            ?? 50,
      fixedPaymentTemplates: body.fixedPaymentTemplates ?? [],
      templates:             body.accountTemplates      ?? [],
    }),
  ).run();

  const now = new Date().toISOString();
  for (const [monthKey, monthData] of Object.entries(body.data)) {
    const hasExpenses      = (monthData.accounts     ?? []).some(a => (a.expenses ?? []).length > 0);
    const hasPersonal      = (monthData.personal     ?? []).length > 0;
    const hasFixedPayments = (monthData.fixedPayments ?? []).some(p => (p.amount || 0) > 0);

    if (hasExpenses || hasPersonal || hasFixedPayments) {
      await env.DB.prepare(`
        INSERT INTO months (user_id, month_key, data, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, month_key) DO UPDATE SET
          data       = excluded.data,
          updated_at = excluded.updated_at
      `).bind(userId, monthKey, JSON.stringify(monthData), now).run();
    } else {
      await env.DB.prepare(
        'DELETE FROM months WHERE user_id = ? AND month_key = ?'
      ).bind(userId, monthKey).run();
    }
  }

  return Response.json({ ok: true });
}

export async function onRequest({ request, env }) {
  const db      = env.monthly_calculator_db ?? env.DB;
  const normEnv = { ...env, DB: db };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const user = await authenticate(request, normEnv);
  if (!user) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }

  let res;
  if      (request.method === 'GET')  res = await handleGet(normEnv, user.userId);
  else if (request.method === 'POST') res = await handlePost(request, normEnv, user.userId);
  else                                res = new Response('Method Not Allowed', { status: 405 });

  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}
