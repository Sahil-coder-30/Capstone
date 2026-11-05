import Panel from '../ui/Panel';
import Meter from '../ui/Meter';
import KeyValues from '../ui/KeyValues';
import useAccount from '../../Hooks/useAccount';
import { remainingTone, sum } from '../../utils/stats';
import { formatCompact, formatNumber } from '../../utils/format';
import './TokenLimitPanel.scss';

/** Usage against the plan's token cap (daily for Free, monthly for Pro, none for Max). */
export default function TokenLimitPanel({ days }) {
  const { caps, plan } = useAccount();
  const today = days[days.length - 1]?.tokens || 0;
  const last30 = sum(days.slice(-30), 'tokens');

  let used = 0;
  let cap = null;
  let label = '';
  if (caps.dailyTokenCap) {
    used = today; cap = caps.dailyTokenCap; label = 'Used today';
  } else if (caps.monthlyTokenCap) {
    used = last30; cap = caps.monthlyTokenCap; label = `Used in the last ${Math.min(30, days.length)} days`;
  }
  const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;

  return (
    <Panel title="Token limit" description={`${plan.name} plan`} className="tokenlimit">
      {cap ? (
        <>
          <div className="tokenlimit__big">
            <strong>{pct}%</strong>
            <span>{formatCompact(used)} of {formatCompact(cap)}</span>
          </div>
          <Meter value={used} max={cap} tone={remainingTone(cap - used, cap)} size="lg" label="Token limit used" />
          <KeyValues items={[
            [label, formatNumber(used)],
            ['Left', formatNumber(Math.max(0, cap - used))],
            ['Limit', `${formatNumber(cap)} / ${caps.dailyTokenCap ? 'day' : 'month'}`],
          ]}
          />
        </>
      ) : (
        <>
          <div className="tokenlimit__big"><strong>No cap</strong></div>
          <p className="tokenlimit__note">Your plan has no token limit. Usage is only paced by your AI credit balance.</p>
          <KeyValues items={[['Used today', formatNumber(today)], ['Last 30 days', formatNumber(last30)]]} />
        </>
      )}
    </Panel>
  );
}
