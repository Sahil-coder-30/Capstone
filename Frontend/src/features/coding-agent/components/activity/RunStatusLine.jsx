import StatusIcon from '../shared/StatusIcon';
import './RunStatusLine.scss';

/** One line that says what the run is doing now, or how it ended. */
export default function RunStatusLine({ status }) {
  return (
    <div className={`orion-run-status orion-run-status--${status.tone}`} role="status" aria-live="polite">
      <StatusIcon status={status.tone} />
      <p className="orion-run-status__text">
        <span className="orion-run-status__title">{status.title}</span>
        {status.detail && <span className="orion-run-status__detail"> {status.detail}</span>}
      </p>
    </div>
  );
}
