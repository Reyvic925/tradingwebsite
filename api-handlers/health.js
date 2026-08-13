export default async function handler(req, res) {
  try {
    // Attempt to load the DB client; it will throw if server-side env vars are missing
    const db = (await import('./db-client.js')).default;

    // Check presence of key env vars
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? true : false,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? true : false,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? true : false,
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ? true : false,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? true : false,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? true : false,
      VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID ? true : false,
      VITE_GOOGLE_AUTH_PROXY: process.env.VITE_GOOGLE_AUTH_PROXY ? true : false,
    };

    // Try lightweight queries to prove connectivity and schema
    const checks = {};
    try {
      const { data: f, error: fErr } = await db.from('features').select('id').limit(1);
      checks.features = fErr ? { ok: false, message: String(fErr.message || fErr) } : { ok: true, sample: f || [] };
    } catch (err) {
      checks.features = { ok: false, message: String(err?.message || err) };
    }

    try {
      const { data: m, error: mErr } = await db.from('markets').select('id').limit(1);
      checks.markets = mErr ? { ok: false, message: String(mErr.message || mErr) } : { ok: true, sample: m || [] };
    } catch (err) {
      checks.markets = { ok: false, message: String(err?.message || err) };
    }

    try {
      const { data: t, error: tErr } = await db.from('ticker_trades').select('id').limit(1);
      checks.ticker_trades = tErr ? { ok: false, message: String(tErr.message || tErr) } : { ok: true, sample: t || [] };
    } catch (err) {
      checks.ticker_trades = { ok: false, message: String(err?.message || err) };
    }

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ env, checks }, null, 2));
  } catch (err) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(err?.message || err) }));
  }
}
