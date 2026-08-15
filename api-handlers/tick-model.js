// Pure applyTick model extracted for unit testing without requiring DB client imports
export function applyTick(m) {
  const assetClass = m?.asset_class || 'equity';
  const baseVol = m?.volatility ? Number(m.volatility) : (assetClass === 'crypto' ? 0.0054 : assetClass === 'forex' ? 0.0016 : 0.0028);

  const hiddenDrift = Number(m?.hidden_drift ?? 0);
  const momentumStrength = assetClass === 'crypto' ? 0.38 : assetClass === 'forex' ? 0.14 : 0.24;
  const momentum = (Number(m.change_24h || 0) / 100) * momentumStrength * (Math.random() * 0.75 + 0.75);

  const high24 = Number(m.high_24h || m.price || 0);
  const low24 = Number(m.low_24h || m.price || 0);
  const mean = (high24 + low24) > 0 ? (high24 + low24) / 2 : Number(m.price || 0);
  const meanReversionStrength = assetClass === 'crypto' ? 0.28 : assetClass === 'forex' ? 0.15 : 0.22;
  const meanRev = mean > 0 ? ((mean - Number(m.price || 0)) / mean) * meanReversionStrength * (Math.random() * 0.8 + 0.7) : 0;

  const sentimentShock = (Math.random() - 0.5) * baseVol * 1.5;
  const institutionalBurst = (Math.random() > 0.88 ? 1 : -1) * baseVol * (0.9 + Math.random() * 1.4);
  const shock = (Math.random() - 0.5) * baseVol * (1 + Math.random() * 0.6);

  const rawChange = hiddenDrift + momentum + meanRev + sentimentShock + institutionalBurst + shock;
  const maxStep = assetClass === 'crypto' ? 0.04 : assetClass === 'forex' ? 0.012 : 0.018;
  const change = Math.max(-maxStep, Math.min(maxStep, rawChange));

  const price = Math.max(0.00000001, Number(m.price) * (1 + change));
  const spreadPct = assetClass === 'crypto' ? 0.0018 : assetClass === 'forex' ? 0.0007 : 0.0012;

  return {
    id: m.id,
    price,
    change_24h: Number(Number(m.change_24h || 0) + change * 100 * 0.18),
    high_24h: Math.max(Number(m.high_24h || price), price * (1 + spreadPct * 0.35)),
    low_24h: Math.min(Number(m.low_24h || price), price * (1 - spreadPct * 0.35)),
    spread_pct: Number((spreadPct * (1 + Math.random() * 0.6)).toFixed(6)),
    volume: Math.max(10, Number(m.volume || 0) * (0.8 + Math.random() * 0.9)),
    liquidity: Math.random() > 0.7 ? 'high' : Math.random() > 0.2 ? 'normal' : 'thin',
  };
}
