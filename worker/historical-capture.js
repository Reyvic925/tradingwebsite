import { Buffer } from 'node:buffer';

// Only the fixed public provider archives needed by unresolved historical records are fetched.
export async function capturePendingHistoricalData(env) {
  const row = await env.DB.prepare("SELECT symbol,date(traded_at) day FROM trader_trades WHERE price_review_status='awaiting_history' AND symbol IN ('BRENT','WTI','XAU-USD') ORDER BY traded_at LIMIT 1").first();
  if (!row || !/^\d{4}-\d{2}-\d{2}$/.test(row.day)) return;
  const id = `${row.symbol}:${row.day}`;
  const prior = await env.DB.prepare("SELECT repair_json FROM trade_price_audit WHERE entity='provider_capture' AND record_id=?").bind(id).first();
  const previous = JSON.parse(prior?.repair_json || '{}');
  if (previous.status === 200 || previous.attempts >= 3 || previous.retry_at > Date.now()) return;
  const instrument = { BRENT: 'BRENTCMDUSD', WTI: 'LIGHTCMDUSD', 'XAU-USD': 'XAUUSD' }[row.symbol];
  const [year, month, day] = row.day.split('-');
  const url = `https://datafeed.dukascopy.com/datafeed/${instrument}/${year}/${String(Number(month) - 1).padStart(2, '0')}/${day}/BID_candles_min_1.bi5`;
  const capture = { url, attempts: (previous.attempts || 0) + 1, status: 0, retry_at: Date.now() + 60000 };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    capture.status = response.status;
    if (response.ok) {
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 0 && bytes.byteLength <= 1000000) capture.payload = Buffer.from(bytes).toString('base64');
      else capture.status = 502;
    } else if (response.status === 403 || response.status === 404) capture.attempts = 3;
    else if (response.status === 429) {
      const delay = Number(response.headers.get('retry-after'));
      if (Number.isFinite(delay) && delay > 0) capture.retry_at = Date.now() + Math.max(60000, delay * 1000);
    }
  } catch { capture.status = 503; }
  await env.DB.prepare("INSERT INTO trade_price_audit (entity,record_id,original_json,repair_json) VALUES ('provider_capture',?,'{}',?) ON CONFLICT(entity,record_id) DO UPDATE SET repair_json=excluded.repair_json")
    .bind(id, JSON.stringify(capture)).run();
}
