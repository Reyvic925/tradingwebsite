import 'dotenv/config.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase configuration. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function clean() {
  const { data: invalidRows, error: selectError } = await supabase
    .from('traders')
    .select('id, name, total_return, monthly_return, win_rate_trades, max_drawdown, asset_focus, is_active')
    .or('total_return.lt.-200,total_return.gt.5000,monthly_return.lt.-100,monthly_return.gt.2000,win_rate_trades.lt.0,win_rate_trades.gt.100,max_drawdown.lt.0,max_drawdown.gt.100');

  if (selectError) throw selectError;

  const invalidIds = (invalidRows || []).map((row) => row.id);

  if (!invalidIds.length) {
    console.log('No invalid trader rows found.');
    return;
  }

  const { error: updateError } = await supabase
    .from('traders')
    .update({
      is_active: false,
      total_return: null,
      monthly_return: null,
      updated_at: new Date().toISOString(),
    })
    .in('id', invalidIds);

  if (updateError) throw updateError;

  console.log(`Removed ${invalidIds.length} invalid trader records from active publication.`);
}

clean().catch((error) => {
  console.error(error);
  process.exit(1);
});
