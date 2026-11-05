import { ArrowUpRight, CalendarClock } from 'lucide-react';
import Panel from '../ui/Panel';
import Meter from '../ui/Meter';
import Button from '../ui/Button';
import KeyValues from '../ui/KeyValues';
import { Tag } from '../ui/Badge';
import useAccount from '../../Hooks/useAccount';
import { useNow } from '../../Hooks/useLoad';
import { cycleProgress } from '../../utils/stats';
import { capitalize, formatCompact, formatDate, formatINR, formatNumber, formatShortDate } from '../../utils/format';
import './SubscriptionCard.scss';

/** Current plan, period progress, limits and the queue of upcoming plans. */
export default function SubscriptionCard({ showAction = true }) {
  const { plan, tier, caps, activeSlot, queued, windowTotal } = useAccount();
  const now = useNow();
  const cycle = cycleProgress(activeSlot, now);

  return (
    <Panel
      title="Subscription"
      action={<Tag tone={activeSlot ? 'ok' : undefined}>{activeSlot ? 'Active' : 'Free'}</Tag>}
      className="subcard"
    >
      <div className="subcard__plan">
        <span className="subcard__name">Taksha AI {plan.name}</span>
        <span className="subcard__price">
          {plan.priceINR ? <>{formatINR(plan.priceINR)} <small>/ 30 days</small></> : 'No charge'}
        </span>
      </div>

      {cycle && (
        <div className="subcard__cycle">
          <div className="subcard__cycle-row">
            <span>Day {cycle.day} of {cycle.length}</span>
            <span>{activeSlot.daysRemaining} days left</span>
          </div>
          <Meter value={cycle.day} max={cycle.length} tone="neutral" label="Plan period elapsed" />
          <div className="subcard__cycle-row subcard__cycle-row--muted">
            <span>{formatDate(activeSlot.validFrom)}</span>
            <span>{formatDate(activeSlot.validUntil)}</span>
          </div>
        </div>
      )}

      <KeyValues
        items={[
          ['AI credit balance', formatNumber(windowTotal)],
          ['Token limit', caps.monthlyTokenCap
            ? `${formatCompact(caps.monthlyTokenCap)} / month`
            : caps.dailyTokenCap ? `${formatCompact(caps.dailyTokenCap)} / day` : 'No cap'],
          ['Requests per minute', caps.requestsPerMinute ?? '—'],
        ]}
      />

      <div className="subcard__queue">
        <span className="subcard__queue-title"><CalendarClock size={14} /> Up next</span>
        {queued.length === 0 ? (
          <p className="subcard__muted">
            {activeSlot ? `Nothing queued. You move to Free on ${formatDate(activeSlot.validUntil)}.` : 'No paid plan queued.'}
          </p>
        ) : (
          <ul className="subcard__queue-list">
            {queued.map((q) => (
              <li key={q.id}>
                <strong>{capitalize(q.tier)}</strong>
                <span>{formatShortDate(q.validFrom)} – {formatDate(q.validUntil)}</span>
                <span className="subcard__days">{q.daysRemaining} days</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAction && (
        <Button to="/plans" block iconRight={ArrowUpRight} className="subcard__action">
          {tier === 'max' ? 'Extend plan' : 'Upgrade plan'}
        </Button>
      )}
    </Panel>
  );
}
