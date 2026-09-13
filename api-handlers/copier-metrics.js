export async function reconcileTraderCopierMetrics(supabase, traderId) {
  const { data: trader, error: traderLookupError } = await supabase
    .from('traders')
    .select('synthetic_copiers_current, synthetic_copiers_all_time, synthetic_under_management')
    .eq('id', traderId)
    .limit(1);
  if (traderLookupError) throw traderLookupError;

  const { data: follows, error: followsError } = await supabase
    .from('user_follows')
    .select('user_id, is_copying, current_value, allocated_amount')
    .eq('trader_id', traderId);
  if (followsError) throw followsError;

  const active = (follows || []).filter((follow) => follow.is_copying === true);
  const realAllTime = new Set((follows || []).map((follow) => follow.user_id)).size;
  const synthetic = trader?.[0] || {};
  const syntheticCurrent = Math.max(0, Number(synthetic.synthetic_copiers_current) || 0);
  const syntheticAllTime = Math.max(syntheticCurrent, Number(synthetic.synthetic_copiers_all_time) || 0);
  const syntheticAum = Math.max(0, Number(synthetic.synthetic_under_management) || 0);
  const activeAum = active.reduce(
    (sum, follow) => sum + Number(follow.current_value || follow.allocated_amount || 0),
    0,
  );
  const metrics = {
    followers: syntheticCurrent + active.length,
    copiers_current: syntheticCurrent + active.length,
    copiers_all_time: syntheticAllTime + realAllTime,
    under_management: Number((syntheticAum + activeAum).toFixed(2)),
  };
  const { error: traderError } = await supabase
    .from('traders')
    .update(metrics)
    .eq('id', traderId);
  if (traderError) throw traderError;
  return metrics;
}