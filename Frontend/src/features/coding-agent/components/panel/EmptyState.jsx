import { TakshaIcon } from '../../../../components/BrandLogo';
import './EmptyState.scss';

const PROMPTS = [
  'Add a dark mode toggle to my app',
  'Build a responsive landing page with hero and pricing sections',
  'Find and fix any errors in my app',
];

/** First view of a project with no chat yet. Prompts are hidden when the composer is locked. */
export default function EmptyState({ onPickPrompt, showPrompts = true }) {
  return (
    <div className="orion-empty">
      <TakshaIcon size={28} />
      <p className="orion-empty__text">Tell Orion what to build. It plans, writes the code and checks it.</p>
      {showPrompts && (
        <div className="orion-empty__prompts">
          {PROMPTS.map((prompt) => (
            <button key={prompt} type="button" className="orion-empty__prompt" onClick={() => onPickPrompt(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
