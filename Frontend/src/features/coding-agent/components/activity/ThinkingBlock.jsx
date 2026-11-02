import { useEffect, useMemo, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatInline } from '../../../../components/Markdown';
import { parseThinking } from '../../utils/thinking.utils';
import StatusIcon from '../shared/StatusIcon';
import './ThinkingBlock.scss';

/** The model's reasoning. Open and following the text while live, folded after. */
export default function ThinkingBlock({ text, isLive, isOpen, onToggle }) {
  const bodyRef = useRef(null);
  const blocks = useMemo(() => parseThinking(text), [text]);

  useEffect(() => {
    if (isLive && isOpen && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [text, isLive, isOpen]);

  if (!blocks.length) return null;

  const firstText = blocks.find((block) => block.type === 'text')?.text || '';
  const preview = firstText.replace(/\s+/g, ' ').slice(0, 90);

  return (
    <div className={`orion-thinking ${isOpen ? 'orion-thinking--open' : ''}`}>
      <button type="button" className="orion-thinking__toggle" onClick={onToggle} aria-expanded={isOpen}>
        <span className="orion-thinking__label">{isLive ? 'Thinking' : 'Thought process'}</span>
        {!isOpen && <span className="orion-thinking__preview">{preview}</span>}
        <ChevronDown size={12} className="orion-thinking__chevron" aria-hidden="true" />
      </button>
      {isOpen && (
        <div ref={bodyRef} className="orion-thinking__body">
          {blocks.map((block, index) => (block.type === 'status' ? (
            <div key={index} className="orion-thinking__status">
              <StatusIcon status={block.status === 'done' ? 'success' : 'warning'} />
              <span>{formatInline(block.summary || (block.status === 'done' ? 'Done' : 'Blocked'))}</span>
            </div>
          ) : (
            <p key={index} className="orion-thinking__para">{formatInline(block.text)}</p>
          )))}
        </div>
      )}
    </div>
  );
}
