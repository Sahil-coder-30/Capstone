import StatusIcon from '../shared/StatusIcon';
import './PhaseList.scss';

const SHOWS_DETAIL = new Set(['running', 'error']);

/** Progress through the approved plan. */
export default function PhaseList({ phases }) {
  return (
    <ol className="orion-phases">
      {phases.map((phase) => (
        <li key={phase.id} className={`orion-phases__item orion-phases__item--${phase.status}`}>
          <StatusIcon status={phase.status} />
          <div className="orion-phases__copy">
            <span className="orion-phases__name">{phase.name}</span>
            {SHOWS_DETAIL.has(phase.status) && phase.detail && (
              <span className="orion-phases__detail">{phase.detail}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
