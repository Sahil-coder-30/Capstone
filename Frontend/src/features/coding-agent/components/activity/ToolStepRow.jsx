import { memo } from 'react';
import { formatTargets, getStepVerb } from '../../utils/toolSteps.utils';
import StatusIcon from '../shared/StatusIcon';
import './ToolStepRow.scss';

/** One tool call. A step on a single file opens that file when clicked. */
function ToolStepRow({ step, onOpenFile }) {
  const target = formatTargets(step.targets);
  const canOpen = step.isFile && step.tool !== 'deleteFile' && step.targets.length === 1;
  const content = (
    <>
      <StatusIcon status={step.status} size={11} />
      <span className="orion-tool-step__verb">{getStepVerb(step)}</span>
      {target && <span className="orion-tool-step__target" title={step.targets.join(', ')}>{target}</span>}
    </>
  );

  return (
    <li>
      {canOpen ? (
        <button
          type="button"
          className="orion-tool-step orion-tool-step--link"
          onClick={() => onOpenFile(step.targets[0])}
        >
          {content}
        </button>
      ) : (
        <div className="orion-tool-step">{content}</div>
      )}
    </li>
  );
}

export default memo(ToolStepRow);
