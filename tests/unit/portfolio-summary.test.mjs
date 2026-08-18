import assert from 'assert';

// Test portfolio stats calculation
function calculatePortfolioStats(investments = []) {
  const totalInvested = investments.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
  const totalValue = investments.reduce((sum, inv) => sum + Number(inv.current_value || 0), 0);
  const totalROI = totalValue - totalInvested;
  const totalROIPercent = totalInvested > 0 ? ((totalROI / totalInvested) * 100).toFixed(2) : '0.00';
  const activeCount = investments.filter((inv) => inv.status === 'active').length;
  const completedCount = investments.filter((inv) => inv.status === 'completed').length;

  const gains = investments.filter((inv) => Number(inv.current_value) > Number(inv.amount));
  const volatility = (gains.length / Math.max(1, investments.length) * 100).toFixed(2);

  return {
    totalInvested,
    totalValue,
    totalROI,
    totalROIPercent,
    activeInvestments: activeCount,
    completedInvestments: completedCount,
    volatility,
  };
}

const stats = calculatePortfolioStats([
  { amount: 1000, current_value: 1200, status: 'active' },
  { amount: 500, current_value: 700, status: 'completed' },
]);

assert.equal(stats.totalInvested, 1500);
assert.equal(stats.totalValue, 1900);
assert.equal(stats.totalROI, 400);
assert.equal(stats.activeInvestments, 1);
assert.equal(stats.completedInvestments, 1);

console.log('PORTFOLIO SUMMARY OK');
