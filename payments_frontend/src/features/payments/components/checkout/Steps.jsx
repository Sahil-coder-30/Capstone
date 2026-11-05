import { Check } from 'lucide-react';
import './Steps.scss';

const STEPS = ['Choose plan', 'Review', 'Pay', 'Done'];

/** Horizontal progress for the checkout. `current` is 0-based. */
export default function Steps({ current }) {
  return (
    <ol className="steps" aria-label="Checkout progress">
      {STEPS.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={label} className={`steps__item is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="steps__dot">{state === 'done' ? <Check size={12} /> : i + 1}</span>
            <span className="steps__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
