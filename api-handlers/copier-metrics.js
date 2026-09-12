export async function reconcileTraderCopierMetrics(supabase, traderId) {
  const { data: follows, error: followsError } = await supabase
    .from('user_follows')
    .select('user_id, is_copying, current_value, allocated_amount')
    .eq('trader_id', traderId);
  if (followsError) throw followsError;

  const active = (follows || []).filter((follow) => follow.is_copying === true);
  const allTime = new Set((follows || []).map((follow) => follow.user_id)).size;
  const activeAum = active.reduce(
    (sum, follow) => sum + Number(follow.current_value || follow.allocated_amount || 0),
    0,
  );
  const metrics = {
    followers: active.length,
    copiers_current: active.length,
    copiers_all_time: allTime,
    under_management: Number(activeAum.toFixed(2)),
  };
  const { error: traderError } = await supabase
    .from('traders')
    .update(metrics)
    .eq('id', traderId);
  if (traderError) throw traderError;
  return metrics;
}