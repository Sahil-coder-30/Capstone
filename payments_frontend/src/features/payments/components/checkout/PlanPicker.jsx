import { PAID_PLANS } from '../../utils/plans';
import { formatINR } from '../../utils/format';
import './PlanPicker.scss';

/** Radio cards for the paid plans. */
export default function PlanPicker({ value, currentTier, onChange, disabled }) {
  return (
    <div className="planpick" role="radiogroup" aria-label="Plan">
      {PAID_PLANS.map((p) => (
        <label key={p.id} className={`planpick__opt${value === p.id ? ' is-selected' : ''}`}>
          <input
            type="radio"
            name="plan"
            value={p.id}
            checked={value === p.id}
            disabled={disabled}
            onChange={() => onChange(p.id)}
          />
          <span className="planpick__radio" aria-hidden="true" />
          <span className="planpick__text">
            <strong>
              Taksha AI {p.name}
              {p.tier === currentTier && <em>Your plan</em>}
            </strong>
            <span>{p.limits.slice(0, 2).map(([, v]) => v).join(' · ')}</span>
          </span>
          <span className="planpick__price">{formatINR(p.priceINR)}<small> / 30 days</small></span>
        </label>
      ))}
    </div>
  );
}
