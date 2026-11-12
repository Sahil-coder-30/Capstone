import Drawer from '../ui/Drawer';
import KeyValues from '../ui/KeyValues';
import SplitBar from '../charts/SplitBar';
import { agentLabel } from '../../utils/stats';
import { capitalize, formatDateTime, formatNumber } from '../../utils/format';
import './RequestDrawer.scss';

/** Full details of one AI request. */
export default function RequestDrawer({ event, onClose }) {
  return (
    <Drawer open={Boolean(event)} title="AI request" subtitle={event ? formatDateTime(event.createdAt) : ''} onClose={onClose}>
      {event && (
        <div className="reqdrawer">
          <div className="reqdrawer__total">
            <strong>{formatNumber(event.totalTokens)}</strong>
            <span>tokens · {formatNumber(event.creditsDeducted)} credits</span>
          </div>
          {event.creditsDiscounted > 0 && (
            <p className="reqdrawer__discount">
              {formatNumber(event.creditsDiscounted)} credits · Platform discount −{formatNumber(event.creditsDiscounted)} · Charged 0.
              Taksha pays for chat memory upkeep.
            </p>
          )}

          <SplitBar parts={[
            { label: 'Prompt', value: Number(event.promptTokens) || 0 },
            { label: 'Completion', value: Number(event.completionTokens) || 0 },
          ]}
          />

          <h3 className="reqdrawer__heading">Details</h3>
          <KeyValues items={[
            ['Agent', agentLabel(event.agentType)],
            ['Model', <span className="mono" key="m">{event.modelId || '—'}</span>],
            ['Provider', capitalize(event.provider || event.company) || '—'],
            ['Plan at the time', capitalize(event.subscription) || '—'],
            ['Time', formatDateTime(event.createdAt)],
          ]}
          />

          <h3 className="reqdrawer__heading">References</h3>
          <KeyValues items={[
            ['Request ID', <span className="mono" key="r">{event.requestId || '—'}</span>],
            ['Project ID', <span className="mono" key="p">{event.projectId || '—'}</span>],
            event.chatId && ['Chat ID', <span className="mono" key="c">{event.chatId}</span>],
          ]}
          />
        </div>
      )}
    </Drawer>
  );
}
