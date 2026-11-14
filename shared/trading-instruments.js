import { getCatalogMarket } from './market-catalog.js';

// Dollar value of one quoted price point; futures quoted in cents are scaled.
const CONTRACTS = {
  ES:[50,.25], NQ:[20,.25], YM:[5,1], RTY:[50,.1], GC:[100,.1], SI:[5000,.005],
  CL:[1000,.01], NG:[10000,.001], HG:[25000,.0005], PL:[50,.1], PA:[100,.5],
  HO:[42000,.0001], RB:[42000,.0001], BZ:[1000,.01], ZB:[1000,1/32], ZN:[1000,1/64], ZF:[1000,1/128],
  ZS:[50,.25], ZW:[50,.25], ZC:[50,.25], KE:[50,.25], LE:[400,.025], GF:[500,.025], HE:[400,.025],
  CT:[500,.01], SB:[1120,.01], KC:[375,.05], CC:[10,1], DX:[1000,.005],
  '6E':[125000,.00005], '6J':[12500000,.0000005], '6B':[62500,.0001],
  '6A':[100000,.0001], '6C':[100000,.00005], '6S':[125000,.0001],
};
const GLOBEX = new Set(['ES','NQ','YM','RTY','GC','SI','CL','NG','HG','PL','PA','HO','RB','BZ','ZB','ZN','ZF','6E','6J','6B','6A','6C','6S']);
const US_EXCHANGES = new Set(['NASDAQ','NYSE','AMEX','CBOE']);

export function getInstrument(symbol) {
  const market = getCatalogMarket(symbol);
  if (!market) return null;
  const root = symbol.replace(/=F$/, '');
  const exchange = market.tradingview_symbol.split(':')[0];
  const currency = market.currency || 'USD';
  let multiplier = 1, tick = .01, quantityStep = .001, unit = 'shares', session = 'unverified';
  if (market.asset_class === 'crypto') { unit = 'coins'; tick = Number(market.quote_increment)||.00000001; quantityStep = Number(market.quantity_increment)||.00000001; session = 'crypto'; }
  else if (market.asset_class === 'forex') { unit = 'base currency units'; tick = symbol.endsWith('JPY') ? .001 : .00001; quantityStep = 1; session = 'fx'; }
  else if (/^X(AU|AG|PT|PD)USD$/.test(symbol)) { unit = 'troy ounces'; quantityStep = .01; session = 'fx'; }
  else if (symbol.endsWith('=F')) {
    const contract = CONTRACTS[root];
    multiplier = contract?.[0] || 0; tick = contract?.[1] || .01; quantityStep = 1; unit = 'contracts';
    session = GLOBEX.has(root) ? 'globex' : 'unverified';
  } else if (US_EXCHANGES.has(exchange) && ['stock','etf'].includes(market.asset_class)) session = 'us_equity';
  else if (['US500','NAS100','SPX500','NASDAQ','DOW'].includes(symbol)) { session = 'us_equity'; unit = 'index reference units'; }
  const conversionCurrency = currency === 'GBp' || currency === 'GBX' ? 'GBP' : currency === 'USd' ? 'USD' : currency;
  const conversionSymbol = conversionCurrency === 'USD' ? null
    : getCatalogMarket(`${conversionCurrency}USD`) ? `${conversionCurrency}USD`
      : getCatalogMarket(`USD${conversionCurrency}`) ? `USD${conversionCurrency}` : null;
  const conversionSupported = conversionCurrency === 'USD' || Boolean(conversionSymbol);
  return { symbol, name:market.name, asset_class:market.asset_class, exchange, currency,
    exchange_timezone:market.asset_class==='crypto'?'UTC':({TSE:'Asia/Tokyo',TSX:'America/Toronto',LSE:'Europe/London',XETR:'Europe/Berlin',FWB:'Europe/Berlin',EURONEXT:'Europe/Paris',NSE:'Asia/Kolkata',BSE:'Asia/Kolkata',SIX:'Europe/Zurich',OSL:'Europe/Oslo',OMXSTO:'Europe/Stockholm',OMXHEX:'Europe/Helsinki',OMXCOP:'Europe/Copenhagen'})[exchange]||'America/New_York',
    multiplier, tick, quantity_step:quantityStep, unit, session,
    conversion_currency:conversionCurrency, conversion_symbol:conversionSymbol,
    currency_scale:currency === 'GBp' || currency === 'GBX' || currency === 'USd' ? .01 : 1,
    supported:multiplier > 0 && session !== 'unverified' && conversionSupported,
    unavailable_reason:!multiplier ? 'Contract specifications are not verified.' : session === 'unverified'
      ? 'Exchange/contract session calendar is not verified; quotes only.' : !conversionSupported ? 'USD conversion feed is unavailable; quotes only.' : null };
}

export function validQuantity(quantity, instrument) {
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  const steps = quantity / instrument.quantity_step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

export function validPrice(price, instrument) {
  if (!Number.isFinite(price) || price <= 0) return false;
  return Math.abs(price / instrument.tick - Math.round(price / instrument.tick)) < 1e-6;
}

export function positionPnl(position, price, rate = position.quote_to_usd || 1) {
  return (price - Number(position.entry_price)) * Number(position.quantity)
    * Number(position.contract_multiplier || 1) * rate * (position.side === 'long' ? 1 : -1);
}

export function orderPreview({ instrument, price, quantity, side, stopLoss, takeProfit, equity = 0, commissionBps = 0, rate = 1 }) {
  const valuePerPoint = instrument.multiplier * rate;
  const notional = price * quantity * valuePerPoint;
  const entryFee = notional * commissionBps / 10000;
  const stopDistance = stopLoss > 0 ? (side === 'buy' ? price - stopLoss : stopLoss - price) : null;
  const profitDistance = takeProfit > 0 ? (side === 'buy' ? takeProfit - price : price - takeProfit) : null;
  const loss = stopDistance !== null && stopDistance > 0 ? stopDistance * quantity * valuePerPoint : null;
  const profit = profitDistance !== null && profitDistance > 0 ? profitDistance * quantity * valuePerPoint : null;
  return { notional, collateral:notional, entry_fee:entryFee, required_cash:notional+entryFee,
    risk_at_stop:loss, risk_percent:loss !== null && equity > 0 ? loss/equity*100 : null,
    potential_profit:profit, reward_to_risk:loss > 0 && profit !== null ? profit/loss : null,
    warning:'Stop losses are triggers, not guaranteed exit prices. Preview excludes financing and taxes.' };
}
