import { getTurnState } from '../../utils/runs.utils';
import RunItem from './RunItem';
import './MessageList.scss';

/** The scrolling conversation. `empty` is shown when there are no runs yet. */
export default function MessageList({ runs, scrollRef, empty, isStreaming, planReview, selection, onOpenFile }) {
  return (
    <div ref={scrollRef} className="orion-messages">
      {empty}
      {runs.map((run, index) => (
        <RunItem
          key={run.key}
          id={run.id}
          goal={run.goal}
          timestamp={run.timestamp}
          assistant={run.assistant}
          turnState={getTurnState(run.assistant, {
            isLatest: index === runs.length - 1,
            isStreaming,
            planReview,
          })}
          canSelect={selection.isActive && run.goal !== null}
          isSelected={selection.selectedIds.has(run.id)}
          onToggleSelect={selection.toggleRun}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}
