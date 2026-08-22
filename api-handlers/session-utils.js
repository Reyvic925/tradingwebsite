/**
 * Runtime-safe helpers for the server-side copy-trading cron handler.
 */

export function isTraderEligible(trader) {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcDay = now.getUTCDay();

  if (utcDay === 0 || utcDay === 6) {
    return trader.session_type === 'crypto';
  }

  switch (trader.session_type) {
    case 'asia':
      return utcHours >= 22 || utcHours <= 7;
    case 'london':
      return utcHours >= 8 && utcHours < 17;
    case 'nyc':
      return utcHours >= 13 && utcHours < 22;
    case 'crypto':
      return true;
    default:
      return false;
  }
}

export function calculateMarketChange(trader) {
  const random = Math.random() * 2 - 1;
  const spike = Math.random() > 0.98 ? (Math.random() * 2 - 1) * 0.05 : 0;
  return trader.drift + (trader.volatility * random) + spike;
}

export function generateRealisticEntryPrice(currentPrice, changePercent, isProfit) {
  return isProfit
    ? currentPrice * (1 - Math.abs(changePercent) * 0.8)
    : currentPrice * (1 + Math.abs(changePercent) * 0.8);
}

export function checkNotificationTrigger(pnlPercent, stopLoss, takeProfit) {
  if (pnlPercent <= -stopLoss) {
    return { shouldNotify: true, reason: 'stop_loss', message: `Stop-Loss triggered at ${pnlPercent.toFixed(2)}%` };
  }

  if (pnlPercent >= takeProfit) {
    return { shouldNotify: true, reason: 'take_profit', message: `Take-Profit reached at ${pnlPercent.toFixed(2)}%!` };
  }

  if (pnlPercent <= -(stopLoss * 0.8)) {
    return { shouldNotify: true, reason: 'warning', message: `Approaching Stop-Loss (${pnlPercent.toFixed(2)}% of -${stopLoss}%)` };
  }

  return { shouldNotify: false };
}
