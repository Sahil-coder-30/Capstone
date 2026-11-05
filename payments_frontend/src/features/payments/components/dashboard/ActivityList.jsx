import { Bot } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { agentLabel } from '../../utils/stats';
import { formatNumber, formatRelative, shortModel } from '../../utils/format';
import './ActivityList.scss';

/** Latest AI requests in a compact list. */
export default function ActivityList({ events, now }) {
  if (!events.length) {
    return <EmptyState icon={Bot} title="No AI requests yet" compact>Requests from the coding agent and Copilot show up here.</EmptyState>;
  }
  return (
    <ul className="activity">
      {events.map((e) => (
        <li key={e.id || e._id}>
          <div className="activity__main">
            <span className="activity__agent">{agentLabel(e.agentType)}</span>
            <span className="activity__model">{shortModel(e.modelId)}</span>
          </div>
          <div className="activity__meta">
            <span>{formatNumber(e.totalTokens)} tokens</span>
            <span className="activity__time">{formatRelative(e.createdAt, now)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
