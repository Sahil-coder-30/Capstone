import { Check } from 'lucide-react';
import Button from '../ui/Button';
import { Tag } from '../ui/Badge';
import { TIER_RANK } from '../../utils/plans';
import { formatINR } from '../../utils/format';
import './PlanCard.scss';

/** One plan with its price, limits, features and the right call to action. */
export default function PlanCard({ plan, currentTier, signedIn }) {
  const isCurrent = signedIn && plan.tier === currentTier;
  const isLower = signedIn && TIER_RANK[plan.tier] < TIER_RANK[currentTier];

  let cta;
  if (plan.priceINR === 0) {
    cta = <Button block disabled>{isCurrent ? 'Current plan' : 'Included for everyone'}</Button>;
  } else if (isCurrent) {
    cta = <Button block to={`/checkout/${plan.id}`}>Extend by 30 days</Button>;
  } else {
    cta = (
      <Button block variant={plan.recommended && !isLower ? 'primary' : 'secondary'} to={`/checkout/${plan.id}`}>
        {isLower ? `Queue ${plan.name}` : `Get ${plan.name}`}
      </Button>
    );
  }

  return (
    <article className={`plancard${isCurrent ? ' is-current' : ''}${plan.recommended ? ' is-recommended' : ''}`}>
      <div className="plancard__top">
        <h3 className="plancard__name">{plan.name}</h3>
        {isCurrent ? <Tag tone="brand">Current plan</Tag> : plan.recommended && <Tag>Most chosen</Tag>}
      </div>
      <p className="plancard__summary">{plan.summary}</p>

      <div className="plancard__price">
        <span className="plancard__amount">{formatINR(plan.priceINR)}</span>
        <span className="plancard__period">{plan.priceINR ? '/ 30 days' : 'forever'}</span>
      </div>

      {cta}

      <dl className="plancard__limits">
        {plan.limits.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>

      <ul className="plancard__features">
        {plan.features.map((f) => <li key={f}><Check size={14} aria-hidden="true" /> {f}</li>)}
      </ul>
    </article>
  );
}
