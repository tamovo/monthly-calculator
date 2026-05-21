const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function handleGet(env) {
  const row = await env.DB.prepare(
    'SELECT currency, mortgage, recurring_costs, account_templates FROM settings WHERE id = 1'
  ).first();

  const months = await env.DB.prepare(
    'SELECT month_key, data FROM months ORDER BY month_key'
  ).all();

  const monthData = {};
  for (const m of months.results) {
    monthData[m.month_key] = JSON.parse(m.data);
  }

  return Response.json({
    currency:         row?.currency                           ?? '£',
    mortgage:         row?.mortgage                           ?? 0,
    recurringCosts:   JSON.parse(row?.recurring_costs         ?? '[]'),
    accountTemplates: JSON.parse(row?.account_templates       ?? '[]'),
    data:             monthData,
  });
}

async function handlePost(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.data || typeof body.data !== 'object') {
    return Response.json({ ok: false, error: 'Missing or invalid data key' }, { status: 400 });
  }

  await env.DB.prepare(`
    INSERT INTO settings (id, currency, mortgage, recurring_costs, account_templates)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      currency          = excluded.currency,
      mortgage          = excluded.mortgage,
      recurring_costs   = excluded.recurring_costs,
      account_templates = excluded.account_templates
  `).bind(
    body.currency                        ?? '£',
    body.mortgage                        ?? 0,
    JSON.stringify(body.recurringCosts   ?? []),
    JSON.stringify(body.accountTemplates ?? []),
  ).run();

  const now = new Date().toISOString();
  for (const [monthKey, monthData] of Object.entries(body.data)) {
    const hasExpenses = (monthData.accounts ?? []).some(a => (a.expenses ?? []).length > 0);
    const hasPersonal = (monthData.personal ?? []).length > 0;

    if (hasExpenses || hasPersonal) {
      await env.DB.prepare(`
        INSERT INTO months (month_key, data, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(month_key) DO UPDATE SET
          data       = excluded.data,
          updated_at = excluded.updated_at
      `).bind(monthKey, JSON.stringify(monthData), now).run();
    } else {
      await env.DB.prepare('DELETE FROM months WHERE month_key = ?').bind(monthKey).run();
    }
  }

  return Response.json({ ok: true });
}

export async function onRequest({ request, env }) {
  // Normalise binding name to DB regardless of wrangler.toml variable name
  const db = env.monthly_calculator_db ?? env.DB;
  const normEnv = { ...env, DB: db };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  let res;
  if      (request.method === 'GET')  res = await handleGet(normEnv);
  else if (request.method === 'POST') res = await handlePost(request, normEnv);
  else                                res = new Response('Method Not Allowed', { status: 405 });

  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}
