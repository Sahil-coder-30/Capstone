import { Activity, CalendarDays, Coins, CreditCard, Gauge, Hash, Layers, Wallet } from 'lucide-react';
import { Kpi, KpiGrid, Delta } from '../ui/Kpi';
import Meter from '../ui/Meter';
import useAccount from '../../Hooks/useAccount';
import { useNow } from '../../Hooks/common.hooks';
import { refillText, remainingTone } from '../../utils/stats';
import { formatCompact, formatDate, formatDuration, formatINR, formatNumber } from '../../utils/format';

/** Eight headline numbers for the selected range plus account totals. */
export default function DashboardKpis({ range, totals, days, deltas, spend }) {
  const { plan, activeSlot, windowLeft, windowTotal, refillAt, lowerLimit } = useAccount();
  const now = useNow();
  const activeDays = days.filter((d) => d.requests > 0).length;
  const half = range - Math.floor(range / 2);
  const avgPerReq = totals.totalRequests ? Math.round(totals.totalTokens / totals.totalRequests) : 0;

  return (
    <KpiGrid cols={4}>
      <Kpi
        icon={Layers}
        label="Current plan"
        value={plan.name}
        unit={plan.priceINR ? `${formatINR(plan.priceINR)} / 30d` : null}
        foot={activeSlot ? `Ends ${formatDate(activeSlot.validUntil)} · ${activeSlot.daysRemaining} days left` : 'Free forever'}
      />
      <Kpi icon={Gauge} label="AI credits available" value={formatNumber(windowLeft)} unit={`/ ${formatNumber(windowTotal)}`}
        foot={refillText({ left: windowLeft, total: windowTotal, refillAt, now, formatDuration })}
      >
        <Meter value={windowLeft} max={windowTotal} tone={remainingTone(windowLeft, windowTotal, lowerLimit)} size="sm" label="Credits left" />
      </Kpi>
      <Kpi icon={Hash} label={`Tokens · ${range} days`} value={formatCompact(totals.totalTokens)}
        foot={deltas.tokens != null ? <Delta value={deltas.tokens} suffix={`vs previous ${half} days`} /> : `${formatNumber(totals.totalTokens)} tokens`}
      />
      <Kpi icon={Activity} label={`AI requests · ${range} days`} value={formatNumber(totals.totalRequests)}
        foot={deltas.requests != null ? <Delta value={deltas.requests} suffix={`vs previous ${half} days`} /> : 'Across all agents'}
      />
      <Kpi icon={Coins} label={`Credits used · ${range} days`} value={formatNumber(totals.totalCreditsDeducted)}
        foot={`${formatNumber(Math.round((totals.totalCreditsDeducted || 0) / Math.max(1, range)))} per day on average`}
      />
      <Kpi icon={Activity} label="Avg tokens per request" value={formatNumber(avgPerReq)}
        foot={`${formatCompact(totals.promptTokens)} in · ${formatCompact(totals.completionTokens)} out`}
      />
      <Kpi icon={CalendarDays} label="Active days" value={activeDays} unit={`/ ${range}`}
        foot={`${Math.round((activeDays / Math.max(1, range)) * 100)}% of days had AI usage`}
      />
      <Kpi icon={Wallet} label="Total spent" value={formatINR(spend.totalPaid)}
        foot={<><CreditCard size={12} style={{ verticalAlign: '-2px' }} /> {spend.paidCount} paid · {spend.failedCount} failed</>}
      />
    </KpiGrid>
  );
}
