import 'dotenv/config.js';
import { createClient } from '@supabase/supabase-js';
import { reconcileTraderCopierMetrics } from '../api-handlers/copier-metrics.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, key);

async function reconcile() {
  const { data: closedTraders, error: traderError } = await supabase.from('traders').select('id, name').eq('is_active', false);
  if (traderError) throw traderError;
  for (const trader of closedTraders || []) {
    const { error: followError } = await supabase.from('user_follows').update({ is_copying: false, updated_at: new Date().toISOString() }).eq('trader_id', trader.id).eq('is_copying', true);
    if (followError) throw followError;

    const { data: state, error: stateError } = await supabase.from('trader_simulation_state').select('config').eq('trader_id', trader.id).maybeSingle();
    if (stateError) throw stateError;
    if (state) {
      const eventId = `${trader.id}:0`;
      const { error: snapshotError } = await supabase.from('synthetic_equity_snapshots').upsert({
        trader_id: trader.id,
        event_id: eventId,
        tick_index: 0,
        snapshot_at: new Date().toISOString(),
        equity: Number(state.config?.startingEquity) || 100000,
        daily_return: 0,
      }, { onConflict: 'event_id' });
      if (snapshotError) throw snapshotError;
    }
    await reconcileTraderCopierMetrics(supabase, trader.id);
    console.log(`${trader.name}: closed relationships reconciled`);
  }

  const { data: apex, error: apexError } = await supabase.from('traders').select('id, bio, specialty').ilike('name', 'Apex Traders').maybeSingle();
  if (apexError) throw apexError;
  if (apex) {
    const { error: metadataError } = await supabase.from('traders').update({
      bio: 'Multi-asset macro trader focused on energy, metals, and cross-market momentum.',
      specialty: 'Multi-asset macro trading',
      updated_at: new Date().toISOString(),
    }).eq('id', apex.id);
    if (metadataError) throw metadataError;
    console.log('Apex Traders: metadata aligned with macro asset configuration');
  }
}

reconcile().catch((error) => { console.error(error); process.exit(1); });
