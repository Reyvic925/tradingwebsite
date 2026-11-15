export function assertExecutionQuote(quote, at = Date.now(), { maxAgeMs } = {}) {
  const executionAt = typeof at === 'number' ? at : Date.parse(at);
  const quotedAt = Date.parse(quote?.quote_updated_at);
  const ageLimit = maxAgeMs ?? quote?.quote_max_age_ms ?? (quote?.price_source === 'Coinbase' ? 90000 : 20 * 60000);
  if (!Number.isFinite(executionAt) || !Number.isFinite(quotedAt)
    || !Number.isFinite(quote?.price) || quote.price <= 0 || !quote.price_source?.trim()
    || quote.quote_stale || quotedAt > executionAt + 1000 || executionAt - quotedAt > ageLimit
    || new Date(quotedAt).toISOString().slice(0, 10) !== new Date(executionAt).toISOString().slice(0, 10)) {
    throw new Error('A fresh, same-date provider quote is required for execution.');
  }
  return quote;
}
