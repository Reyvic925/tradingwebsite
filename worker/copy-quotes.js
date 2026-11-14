import { getCatalogMarket } from '../shared/market-catalog.js';
import { getMarketQuote } from './market-quotes.js';

// Strategy symbols predate the verified market catalog.
const ALIASES = { DAX40: 'GER40', SPX500: 'US500', CAC40: 'FRA40' };
export async function loadCopyQuotes(assets, quoteProvider = getMarketQuote) {
  const entries = await Promise.all([...new Set(assets)].map(async asset => {
    const symbol = ALIASES[asset] || asset.replaceAll('-', '');
    const market = getCatalogMarket(symbol) || (['NASDAQ', 'FRA40'].includes(symbol) ? { symbol, asset_class: 'indices' } : null);
    if (!market) return [asset, null];
    try {
      const quote = await quoteProvider(market);
      if (!quote || quote.quote_stale) return [asset, null];
      return [asset, quote];
    } catch {
      return [asset, null];
    }
  }));
  return Object.fromEntries(entries.filter(([, quote]) => quote));
}
