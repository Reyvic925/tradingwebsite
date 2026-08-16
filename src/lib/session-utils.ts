/**
 * Session Utilities for Copy Trading System
 * Handles session eligibility checks and market status
 */

/**
 * Check if a trader is eligible to trade in the current time window
 * @param trader - Trader object with session_type
 * @returns boolean - true if trader should be active
 */
export function isTraderEligible(trader: Record<string, any>): boolean {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat

  // Weekends: Only crypto trades
  if (utcDay === 0 || utcDay === 6) {
    return trader.session_type === 'crypto';
  }

  // Weekdays: Check session hours
  switch (trader.session_type) {
    case 'asia':
      // Asia session: 22:00 - 07:00 UTC (Hong Kong, Tokyo, Singapore)
      return utcHours >= 22 || utcHours <= 7;
    
    case 'london':
      // London session: 08:00 - 17:00 UTC
      return utcHours >= 8 && utcHours < 17;
    
    case 'nyc':
      // NYC session: 13:00 - 22:00 UTC (9 AM - 6 PM EST)
      return utcHours >= 13 && utcHours < 22;
    
    case 'crypto':
      // Crypto trades 24/7
      return true;
    
    default:
      return false;
  }
}

/**
 * Get market status for a session type
 * @param sessionType - Type of session
 * @returns object - { status: 'Live' | 'Closed', hoursUntilOpen?: number }
 */
export function getMarketStatus(sessionType: string): Record<string, any> {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcDay = now.getUTCDay();

  if (sessionType === 'crypto') {
    return { status: 'Live', label: '🟢 Trading 24/7' };
  }

  if (utcDay === 0 || utcDay === 6) {
    if (sessionType === 'crypto') {
      return { status: 'Live', label: '🟢 Crypto Live' };
    }
    return { status: 'Closed', label: '⏳ Market Closed (Weekend)' };
  }

  const isEligible = isTraderEligible({ session_type: sessionType });
  
  if (isEligible) {
    return { status: 'Live', label: `🟢 ${sessionType.toUpperCase()} Live` };
  } else {
    return { status: 'Closed', label: `⏳ ${sessionType.toUpperCase()} Closed` };
  }
}

/**
 * Get session info display text
 * @param sessionType - Type of session
 * @returns string - Friendly session name
 */
export function getSessionLabel(sessionType: string): string {
  switch (sessionType) {
    case 'asia':
      return 'Asia Session';
    case 'london':
      return 'London Session';
    case 'nyc':
      return 'NYC Session';
    case 'crypto':
      return 'Crypto 24/7';
    default:
      return sessionType;
  }
}

/**
 * Calculate realistic market movement with drift and volatility
 * @param trader - Trader with drift and volatility settings
 * @returns number - Change percentage
 */
export function calculateMarketChange(trader: Record<string, any>): number {
  const random = Math.random() * 2 - 1;
  
  // Random spike (2% chance of a 5% move)
  const spike = Math.random() > 0.98 ? (Math.random() * 2 - 1) * 0.05 : 0;
  
  // Combine drift, volatility, and spike
  const changePercent = trader.drift + (trader.volatility * random) + spike;
  
  return changePercent;
}

/**
 * Calculate quantity for a trade given PnL delta
 * @param pnlDelta - Change in equity
 * @param price - Current asset price
 * @param entryPrice - Entry price for the position
 * @returns number - Quantity to trade
 */
export function calculateTradeQuantity(pnlDelta: number, price: number, entryPrice: number): number {
  const priceDiff = Math.abs(price - entryPrice);
  if (priceDiff === 0) return 0;
  
  return Math.abs(pnlDelta) / priceDiff;
}

/**
 * Generate a realistic entry price based on current price and PnL direction
 * @param currentPrice - Current market price
 * @param changePercent - Price change percentage
 * @param isProfit - Whether this is a profitable trade
 * @returns number - Entry price
 */
export function generateRealisticEntryPrice(currentPrice: number, changePercent: number, isProfit: boolean): number {
  if (isProfit) {
    // For profit: bought at lower price
    return currentPrice * (1 - Math.abs(changePercent) * 0.8);
  } else {
    // For loss: sold/shorted at higher price
    return currentPrice * (1 + Math.abs(changePercent) * 0.8);
  }
}

/**
 * Fetch real price data for an asset
 * Falls back to simulated price if real data unavailable
 * @param symbol - Asset symbol (e.g., 'BTC-USD', 'AAPL')
 * @returns Promise<number> - Current price
 */
export async function fetchAssetPrice(symbol: string): Promise<number> {
  try {
    // Try to fetch real price from API (implement based on your data source)
    // For now, return simulated price
    return getSimulatedPrice(symbol);
  } catch (error) {
    console.error(`Failed to fetch price for ${symbol}:`, error);
    return getSimulatedPrice(symbol);
  }
}

/**
 * Get simulated price for an asset
 * @param symbol - Asset symbol
 * @returns number - Simulated price
 */
export function getSimulatedPrice(symbol: string): number {
  // Deterministic simulation based on symbol
  const hash = symbol.split('').reduce((acc: number, char: string) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  
  const basePrice = 100 + Math.abs(hash % 500);
  const variation = Math.random() * 10 - 5; // ±5% variation
  
  return basePrice + variation;
}

/**
 * Check if user should be notified about position status
 * @param pnlPercent - PnL percentage
 * @param stopLoss - Stop loss percentage
 * @param takeProfit - Take profit percentage
 * @returns object - { shouldNotify: boolean, reason?: string }
 */
export function checkNotificationTrigger(pnlPercent: number, stopLoss: number, takeProfit: number): Record<string, any> {
  if (pnlPercent <= -stopLoss) {
    return { shouldNotify: true, reason: 'stop_loss', message: `⚠️ Stop-Loss triggered at ${pnlPercent.toFixed(2)}%` };
  }
  
  if (pnlPercent >= takeProfit) {
    return { shouldNotify: true, reason: 'take_profit', message: `🎉 Take-Profit reached at ${pnlPercent.toFixed(2)}%!` };
  }
  
  // Warning if close to stop loss (80% of SL)
  if (pnlPercent <= -(stopLoss * 0.8)) {
    return { shouldNotify: true, reason: 'warning', message: `⚠️ Approaching Stop-Loss (${pnlPercent.toFixed(2)}% of -${stopLoss}%)` };
  }
  
  return { shouldNotify: false };
}

/**
 * Calculate user level based on total PnL
 * @param totalPnL - User's total profit/loss
 * @returns number - User level
 */
export function calculateUserLevel(totalPnL: number): number {
  const level = Math.floor(Math.sqrt(Math.max(0, totalPnL) / 100)) + 1;
  return Math.min(level, 100); // Cap at level 100
}

/**
 * Get badge based on achievements
 * @param userStats - User statistics
 * @returns string[] - Array of earned badge names
 */
export function getAchievedBadges(userStats: Record<string, any>): string[] {
  const badges = [];
  
  if (userStats.totalFollows >= 1) badges.push('first_copy');
  if (userStats.totalPnL >= 1000) badges.push('thousand_dollar');
  if (userStats.totalPnL >= 10000) badges.push('ten_thousand');
  if (userStats.winRate >= 70) badges.push('accuracy_master');
  if (userStats.maxStreak >= 5) badges.push('streak_master');
  if (userStats.totalTrades >= 100) badges.push('trader_century');
  if (userStats.totalFollows >= 10) badges.push('social_butterfly');
  
  return badges;
}
