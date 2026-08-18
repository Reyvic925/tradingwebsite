import supabase from './api-handlers/db-client.js';
import { DEMO_TOKEN, DEMO_USER_ID } from './api-handlers/dev-db.js';
import createInvestmentHandler from './api-handlers/investment-create.js';
import roiCronHandler from './api-handlers/cron-roi-simulator.js';
import withdrawalRequestHandler from './api-handlers/withdrawal-request.js';
import adminRoiHandler from './api-handlers/admin-roi-approvals.js';

process.env.CRON_SECRET = 'local-test-secret';
process.env.ADMIN_SECRET = 'local-admin-secret';

function makeRes() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end(data) {
      this.body = data;
      return this;
    },
  };
}

function log(label, value) {
  console.log(label, JSON.stringify(value));
}

async function ensureDemoState() {
  const { data: profiles } = await supabase.from('profiles').select('*').eq('user_id', DEMO_USER_ID).limit(1);
  if (!profiles || profiles.length === 0) {
    await supabase.from('profiles').insert({
      user_id: DEMO_USER_ID,
      email: 'demo@apex.local',
      full_name: 'Local Demo Trader',
      role: 'admin',
      tier: 'Starter',
      locked_balance: 0,
    });
  }

  const { data: wallets } = await supabase.from('wallets').select('*').eq('user_id', DEMO_USER_ID).eq('currency', 'USD').limit(1);
  if (!wallets || wallets.length === 0) {
    await supabase.from('wallets').insert({
      user_id: DEMO_USER_ID,
      currency: 'USD',
      available: 10000,
      reserved: 0,
      locked_balance: 0,
    });
  }

  const { data: tiers } = await supabase.from('investment_tiers').select('*');
  if (!tiers || tiers.length === 0) {
    await supabase.from('investment_tiers').insert([
      { name: 'Silver', tier_level: 1, percent_return: 350, duration_days: 7, min_investment: 250, max_investment: 2000, roi_min: 15, roi_max: 22, volatility_min: 5, volatility_max: 10, simulation_enabled: true },
      { name: 'Gold', tier_level: 2, percent_return: 450, duration_days: 10, min_investment: 2000, max_investment: 5000, roi_min: 18, roi_max: 28, volatility_min: 6, volatility_max: 12, simulation_enabled: true },
      { name: 'Platinum', tier_level: 3, percent_return: 550, duration_days: 15, min_investment: 5000, max_investment: 15000, roi_min: 20, roi_max: 30, volatility_min: 7, volatility_max: 14, simulation_enabled: true },
      { name: 'Diamond', tier_level: 4, percent_return: 650, duration_days: 21, min_investment: 15000, max_investment: 50000, roi_min: 22, roi_max: 35, volatility_min: 8, volatility_max: 16, simulation_enabled: true },
    ]);
  }
}

async function main() {
  await ensureDemoState();

  const { data: tierRows } = await supabase.from('investment_tiers').select('*').order('tier_level', { ascending: true });
  const tier = tierRows[0];

  await supabase.from('investments').delete().eq('user_id', DEMO_USER_ID);
  await supabase.from('withdrawals').delete().eq('user_id', DEMO_USER_ID);

  const createReq = {
    method: 'POST',
    headers: { authorization: `Bearer ${DEMO_TOKEN}` },
    body: { tier_id: tier.id, amount: 1000 },
  };
  const createRes = makeRes();
  await createInvestmentHandler(createReq, createRes);
  log('CREATE_STATUS', createRes.statusCode);
  log('CREATE_BODY', createRes.body);

  const created = createRes.body;
  const createdId = created.id;
  const startedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const endedAt = new Date(Date.now() - 60 * 1000).toISOString();
  await supabase.from('investments').update({
    start_date: startedAt,
    end_date: endedAt,
    current_value: 1000,
    status: 'active',
  }).eq('id', createdId);

  const walletBeforeCron = (await supabase.from('wallets').select('*').eq('user_id', DEMO_USER_ID).eq('currency', 'USD').limit(1)).data[0];
  log('WALLET_BEFORE_CRON', walletBeforeCron);

  const cronReq = {
    method: 'GET',
    headers: { 'x-cron-secret': 'local-test-secret' },
    query: {},
  };
  const cronRes = makeRes();
  await roiCronHandler(cronReq, cronRes);
  log('CRON_STATUS', cronRes.statusCode);
  log('CRON_BODY', cronRes.body);

  const afterCronInvestment = (await supabase.from('investments').select('*').eq('id', createdId).limit(1)).data[0];
  const afterCronProfile = (await supabase.from('profiles').select('*').eq('user_id', DEMO_USER_ID).limit(1)).data[0];
  log('AFTER_CRON_INVESTMENT', afterCronInvestment);
  log('AFTER_CRON_PROFILE', afterCronProfile);

  const withdrawReq = {
    method: 'POST',
    headers: { authorization: `Bearer ${DEMO_TOKEN}` },
    body: { type: 'roi', investment_id: createdId, amount: 50, currency: 'USD' },
  };
  const withdrawRes = makeRes();
  await withdrawalRequestHandler(withdrawReq, withdrawRes);
  log('WITHDRAW_STATUS', withdrawRes.statusCode);
  log('WITHDRAW_BODY', withdrawRes.body);

  const adminReq = {
    method: 'POST',
    headers: { 'x-admin-secret': 'local-admin-secret' },
    body: { id: withdrawRes.body.id, action: 'approve', admin_notes: 'approved' },
  };
  const adminRes = makeRes();
  await adminRoiHandler(adminReq, adminRes);
  log('ADMIN_STATUS', adminRes.statusCode);
  log('ADMIN_BODY', adminRes.body);

  const finalProfile = (await supabase.from('profiles').select('*').eq('user_id', DEMO_USER_ID).limit(1)).data[0];
  const finalWallet = (await supabase.from('wallets').select('*').eq('user_id', DEMO_USER_ID).eq('currency', 'USD').limit(1)).data[0];
  log('FINAL_PROFILE', finalProfile);
  log('FINAL_WALLET', finalWallet);

  const ok = cronRes.statusCode === 200 && withdrawRes.statusCode === 201 && adminRes.statusCode === 200;
  console.log('FLOW_OK', ok);
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error('FLOW_FAILED', err);
  process.exit(1);
});
