import { Check, Minus } from 'lucide-react';
import { FEATURE_MATRIX, PLANS } from '../../utils/plans';
import './CompareTable.scss';

const Cell = ({ value }) => {
  if (value === true) return <Check size={16} className="compare__yes" aria-label="Included" />;
  if (value === false) return <Minus size={16} className="compare__no" aria-label="Not included" />;
  return <span>{value}</span>;
};

/** Full feature matrix with the current plan's column highlighted. */
export default function CompareTable({ currentTier }) {
  return (
    <div className="compare">
      <table>
        <caption className="sr-only">Plan comparison</caption>
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">Feature</span></th>
            {PLANS.map((p) => (
              <th scope="col" key={p.id} className={p.tier === currentTier ? 'is-current' : ''}>
                {p.name}
                {p.tier === currentTier && <span className="compare__you">Your plan</span>}
              </th>
            ))}
          </tr>
        </thead>
        {FEATURE_MATRIX.map((group) => (
          <tbody key={group.group}>
            <tr className="compare__group"><th scope="rowgroup" colSpan={PLANS.length + 1}>{group.group}</th></tr>
            {group.rows.map(([label, ...values]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {values.map((v, i) => (
                  <td key={PLANS[i].id} className={PLANS[i].tier === currentTier ? 'is-current' : ''}><Cell value={v} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
