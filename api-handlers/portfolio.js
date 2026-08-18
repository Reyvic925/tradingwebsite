import supabase from './db-client.js';
import { getUsdWallet, requireUser as authUser, first } from './helpers.js';

async function requireUser(req) {
  return authUser(supabase, req);
}

function calculateInvestmentROI(investment, transactions = []) {
  const roiTransactions = (transactions || [])
    .filter((t) => t.type === 'gain' || t.type === 'loss')
    .reduce((sum, t) => sum + (t.type === 'gain' ? t.amount : -t.amount), 0);
  
  const totalGain = roiTransactions + (Number(investment.current_value || 0) - Number(investment.amount || 0));
  return ((totalGain / Number(investment.amount || 1)) * 100).toFixed(2);
}

function calculatePortfolioStats(investments = []) {
  const totalInvested = investments.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
  const totalValue = investments.reduce((sum, inv) => sum + Number(inv.current_value || 0), 0);
  const totalROI = totalValue - totalInvested;
  const totalROIPercent = totalInvested > 0 ? ((totalROI / totalInvested) * 100).toFixed(2) : '0.00';
  const activeCount = investments.filter((inv) => inv.status === 'active').length;
  const completedCount = investments.filter((inv) => inv.status === 'completed').length;

  // Calculate volatility (simplified: std dev of gains/losses)
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Get user wallet and profile
    const wallet = await getUsdWallet(supabase, user.id);
    const { data: profiles } = await supabase.from('profiles').select('*').eq('user_id', user.id).limit(1);
    const profile = first(profiles);

    // Get investments
    const { data: investments } = await supabase.from('investments').select('*').eq('user_id', user.id);

    // Get investment tiers
    const { data: tiers } = await supabase.from('investment_tiers').select('*');
    const tiersById = Object.fromEntries((tiers || []).map((t) => [t.id, t]));

    // Get all investment transactions and gain logs
    const invIds = (investments || []).map((inv) => inv.id);
    const { data: transactions } = invIds.length 
      ? await supabase.from('investment_transactions').select('*').in('investment_id', invIds)
      : { data: [] };

    const { data: gainLogs } = await supabase.from('user_gain_logs').select('*').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(20);

    // Get withdrawals
    const { data: withdrawals } = await supabase.from('withdrawals').select('*').eq('user_id', user.id);

    // Enrich investments with details
    const investmentsDetail = (investments || []).map((inv) => {
      const invTransactions = (transactions || []).filter((t) => t.investment_id === inv.id);
      const roi = calculateInvestmentROI(inv, invTransactions);
      const hasWithdrawal = (withdrawals || []).some((w) => w.investment_id === inv.id);
      const hasPendingWithdrawal = (withdrawals || []).some((w) => w.investment_id === inv.id && w.status === 'pending');
      const hasConfirmedWithdrawal = (withdrawals || []).some((w) => w.investment_id === inv.id && ['approved', 'completed'].includes(w.status));

      return {
        id: inv.id,
        fundId: inv.plan_name,
        fundName: inv.plan_name,
        planName: inv.plan_name,
        initialAmount: inv.amount,
        currentValue: inv.current_value,
        roi: parseFloat(roi),
        startDate: inv.start_date,
        endDate: inv.end_date,
        status: inv.status === 'active' && new Date(inv.end_date) <= new Date() ? 'completed' : inv.status,
        roiWithdrawn: inv.roi_withdrawn || hasWithdrawal,
        roiWithdrawalPending: hasPendingWithdrawal,
        roiWithdrawalConfirmed: hasConfirmedWithdrawal,
        transactionCount: invTransactions.length,
        lastTransactions: invTransactions.slice(-5),
        tier: tiersById[inv.tier_id],
      };
    });

    // Calculate portfolio summary
    const summary = calculatePortfolioStats(investments || []);

    // Get recent activity
    const recentActivity = [
      ...(investments || []).map((inv) => ({
        type: 'investment',
        description: `Investment of $${inv.amount} in ${inv.plan_name}`,
        amount: inv.amount,
        date: inv.created_at,
      })),
      ...(withdrawals || []).map((w) => ({
        type: 'withdrawal',
        description: `Withdrawal of $${w.amount} (${w.status})`,
        amount: w.amount,
        date: w.created_at,
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    return res.status(200).json({
      investments: investmentsDetail,
      summary,
      userInfo: {
        name: profile?.full_name || user.email,
        tier: profile?.tier || 'Starter',
        depositBalance: Number(wallet?.available || 0),
        availableBalance: Number(wallet?.available || 0),
        lockedBalance: Number(profile?.locked_balance || 0),
      },
      performanceData: investmentsDetail.map((inv) => ({
        date: inv.startDate,
        value: inv.currentValue,
        invested: inv.initialAmount,
      })),
      recentActivity,
      userGainLogs: gainLogs || [],
    });
  } catch (err) {
    console.error('[portfolio] error', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
