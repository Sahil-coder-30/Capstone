import Panel from '../ui/Panel';
import Meter from '../ui/Meter';
import KeyValues from '../ui/KeyValues';
import useAccount from '../../Hooks/useAccount';
import { useNow } from '../../Hooks/common.hooks';
import { refillText, remainingTone } from '../../utils/stats';
import { formatDateTime, formatDuration, formatNumber } from '../../utils/format';
import './CreditWindowCard.scss';

/**
 * The AI credit balance. It locks when it drops below the plan's lower limit
 * and comes back in full 5 hours later.
 */
export default function CreditWindowCard() {
  const { windowLeft, windowTotal, windowUsed, refillAt, lowerLimit, tokensPerCredit } = useAccount();
  const now = useNow();
  const refilling = refillAt && refillAt > now;
  const usedPct = windowTotal ? Math.round((windowUsed / windowTotal) * 100) : 0;

  return (
    <Panel title="AI credits" description="Your balance refills 5 hours after it runs low" className="creditcard">
      <div className="creditcard__big">
        <strong>{formatNumber(windowLeft)}</strong>
        <span>of {formatNumber(windowTotal)} credits left</span>
      </div>
      <Meter value={windowLeft} max={windowTotal} tone={remainingTone(windowLeft, windowTotal, lowerLimit)} size="lg" label="Credits left" />
      <KeyValues
        items={[
          ['Used', `${formatNumber(windowUsed)} (${usedPct}%)`],
          ['Status', refillText({ left: windowLeft, total: windowTotal, refillAt, now, formatDuration })],
          refilling && ['Refill time', formatDateTime(refillAt)],
          ['1 credit', `${formatNumber(tokensPerCredit)} tokens`],
        ]}
      />
      <p className="creditcard__note">
        AI requests pause when fewer than {lowerLimit} credits are left, and the full balance returns 5 hours later.
      </p>
    </Panel>
  );
}
