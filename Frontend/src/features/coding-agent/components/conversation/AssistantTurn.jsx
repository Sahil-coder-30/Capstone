import { useMemo, useState } from 'react';
import { parseMarkdownToReact } from '../../../../components/Markdown';
import { useCopyCode } from '../../Hooks/useCopyCode';
import { getRunStatus } from '../../utils/liveStatus.utils';
import { getPlanPhases } from '../../utils/runs.utils';
import { buildToolSteps, getChangedFiles } from '../../utils/toolSteps.utils';
import ChangedFiles from '../activity/ChangedFiles';
import PhaseList from '../activity/PhaseList';
import RunStatusLine from '../activity/RunStatusLine';
import ThinkingBlock from '../activity/ThinkingBlock';
import ToolStepList from '../activity/ToolStepList';
import Notice from '../shared/Notice';
import './AssistantTurn.scss';

/** Everything Orion produced for one task. */
export default function AssistantTurn({ assistant, turnState, onOpenFile }) {
  const [thinkingChoice, setThinkingChoice] = useState(null);
  const { copiedIdx, copy } = useCopyCode();

  const isLive = turnState === 'live';
  const isThinkingOpen = thinkingChoice ?? isLive;

  const steps = useMemo(
    () => buildToolSteps(assistant.toolLogs, { live: isLive || turnState === 'paused' }),
    [assistant.toolLogs, isLive, turnState],
  );
  const changedFiles = useMemo(() => getChangedFiles(steps), [steps]);
  const phases = useMemo(() => getPlanPhases(assistant.steps, { isLive }), [assistant.steps, isLive]);
  const report = useMemo(
    () => parseMarkdownToReact(assistant.text, { copiedCodeIdx: copiedIdx, copyToClipboard: copy }),
    [assistant.text, copiedIdx, copy],
  );

  const status = getRunStatus(assistant.streamState, steps, turnState);
  const isFailed = turnState === 'failed';
  const isBlank = turnState === 'finished' && !assistant.text && !status;

  return (
    <div className="orion-turn">
      <ThinkingBlock
        text={assistant.thinking}
        isLive={isLive}
        isOpen={isThinkingOpen}
        onToggle={() => setThinkingChoice(!isThinkingOpen)}
      />
      {phases.length > 0 && turnState !== 'paused' && <PhaseList phases={phases} />}
      {steps.length > 0 && <ToolStepList steps={steps} onOpenFile={onOpenFile} />}
      {report && <div className="orion-turn__report">{report}</div>}
      {changedFiles.length > 0 && !isLive && <ChangedFiles files={changedFiles} onOpenFile={onOpenFile} />}
      {isBlank && <p className="orion-turn__blank">This run ended without a report.</p>}
      {status && <RunStatusLine status={status} />}
      {isFailed && <Notice variant="error">{assistant.error || 'Orion could not finish this run.'}</Notice>}
    </div>
  );
}
