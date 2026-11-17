import type { ReactNode } from 'react';
import type { Trader } from '../types';

export default function ProfileMetric({ trader, metricKey, children, format = value => value.toLocaleString() }: {
  trader: Trader;
  metricKey: string;
  children: ReactNode;
  format?: (value: number) => string;
}) {
  const reported = trader.profile_metrics?.[metricKey];
  if (reported === undefined) return <>{children}</>;
  return <span>{format(reported)}<span className="mt-1 block text-[10px] font-normal text-amber-200"
    title={trader.profile_metrics_updated_at ? `Reported value updated ${trader.profile_metrics_updated_at} UTC` : 'Value supplied by an administrator'}>Admin-reported</span></span>;
}
