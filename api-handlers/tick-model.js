// Pure applyTick model extracted for unit testing without requiring DB client imports
export function applyTick(m) {
  // Tunable volatility: per-market override via m.volatility, otherwise fallback by asset class
  const baseVol = m?.volatility ? Number(m.volatility) : (m.asset_class === 'crypto' ? 0.004 : m.asset_class === 'forex' ? 0.0008 : 0.0016);

  // Hidden drift: small persistent bias per-market (admin configurable via markets.hidden_drift)
  const hiddenDrift = m?.hidden_drift ? Number(m.hidden_drift) : 0.0; // e.g. 0.002 for slight upward bias

  // Momentum approximation: use change_24h as a coarse momentum signal (percent)
  const momentumStrength = 0.3; // tuneable constant (smaller => less momentum influence)
  const momentum = (Number(m.change_24h || 0) / 100) * momentumStrength * (Math.random() * 0.6 + 0.7);

  // Mean-reversion: pull towards the 24h mid (high+low)/2 if available
  const meanReversionStrength = 0.25; // positive => stronger pull towards mean
  const high24 = Number(m.high_24h || m.price || 0);
  const low24 = Number(m.low_24h || m.price || 0);
  const mean = (high24 + low24) > 0 ? (high24 + low24) / 2 : Number(m.price || 0);
  const meanRev = mean > 0 ? ((mean - Number(m.price || 0)) / mean) * meanReversionStrength * (Math.random() * 0.6 + 0.7) : 0;

  // Random shock scaled by volatility (adds unpredictability)
  const shock = (Math.random() - 0.5) * baseVol * (1 + Math.random() * 0.5);

  // Combine components: hidden drift, momentum, mean reversion, and random shock
  const change = hiddenDrift + momentum + meanRev + shock;

  const price = Math.max(0.00000001, Number(m.price) * (1 + change));

  return {
    id: m.id,
    price,
    change_24h: Number(m.change_24h) + change * 100 * 0.15,
    high_24h: Math.max(Number(m.high_24h || price), price),
    low_24h: Math.min(Number(m.low_24h || price), price),
  };
}
