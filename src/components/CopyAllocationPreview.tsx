import { valueCopy } from '../../shared/copy-risk.js';
import { formatMoney } from '../lib/format';

export default function CopyAllocationPreview({ allocation, multiplier, feePercent, stopLoss, takeProfit, drawdown }: {
  allocation: number; multiplier: number; feePercent: number; stopLoss: number; takeProfit: number; drawdown: number;
}) {
  if (!Number.isFinite(allocation) || allocation <= 0 || !Number.isFinite(stopLoss) || !Number.isFinite(takeProfit)) return null;
  const follow = { allocated_amount: allocation, current_value: allocation, fee_high_water: allocation,
    peak_value: allocation, leverage_multiplier: multiplier, stop_loss_percent: stopLoss, take_profit_percent: takeProfit };
  const scenarios = [-10, -5, 5, 10];
  if (Number.isFinite(drawdown) && drawdown > 0 && !scenarios.includes(-drawdown)) scenarios.unshift(-drawdown);
  return <section className="mt-4 rounded-xl border border-amber-200/20 bg-amber-200/[0.03] p-3">
    <h3 className="text-sm font-medium text-amber-100">Allocation preview</h3>
    <p className="mt-2 text-xs leading-relaxed text-gray-400">Illustrative strategy returns at {multiplier}x trade size. Performance fees use the initial high-water mark. Trading costs, position exposure and the return path change actual results.</p>
    <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs tabular-nums">
      <thead className="text-gray-400"><tr><th className="py-2 pr-2">Strategy move</th><th className="pr-2">Performance fee</th><th>Copy value</th></tr></thead>
      <tbody>{scenarios.map(move => {
        const result = valueCopy(follow, move / 100, feePercent);
        return <tr key={move} className="border-t border-white/10">
          <td className="py-2 pr-2"><span className={move < 0 ? 'text-rose-300' : 'text-emerald-300'}>{move > 0 ? '+' : ''}{move.toFixed(1)}%</span>
            {move === -drawdown && <span className="block text-[10px] text-gray-500">Recorded max drawdown</span>}</td>
          <td className="pr-2 text-gray-300">{formatMoney(result.fee)}</td>
          <td className="text-white">{formatMoney(result.value)}{result.reason && <span className="block text-[10px] text-amber-200">{result.reason === 'drawdown_limit' ? 'Drawdown trigger crossed' : 'Profit target reached'}</span>}</td>
        </tr>;
      })}</tbody>
    </table></div>
  </section>;
}
