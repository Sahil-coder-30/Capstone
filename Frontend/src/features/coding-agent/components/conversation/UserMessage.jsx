import { formatTime } from '../../utils/runs.utils';
import './UserMessage.scss';

/** The task as the user wrote it. */
export default function UserMessage({ text, timestamp }) {
  const time = formatTime(timestamp);
  return (
    <div className="orion-user-message">
      <p className="orion-user-message__bubble">{text}</p>
      {time && <time className="orion-user-message__time">{time}</time>}
    </div>
  );
}
