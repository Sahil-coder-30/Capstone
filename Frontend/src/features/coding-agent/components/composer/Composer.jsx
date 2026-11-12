import { useImperativeHandle } from 'react';
import { ArrowUp, Paperclip, Square } from 'lucide-react';
import { useComposer } from '../../Hooks/useComposer';
import IconButton from '../shared/IconButton';
import Notice from '../shared/Notice';
import AttachmentChips from './AttachmentChips';
import FileSuggestions from './FileSuggestions';
import './Composer.scss';

const getPlaceholder = ({ isOffline, isPaused, isStreaming, isBusyElsewhere }) => {
  if (isOffline) return 'Start the sandbox to chat with Orion';
  if (isBusyElsewhere) return 'Orion is busy in another chat';
  if (isPaused) return 'Review the plan above to continue';
  if (isStreaming) return 'Orion is working…';
  return 'Ask Orion to build or fix something';
};

/**
 * Owns its own input state so typing does not re-render the conversation.
 * `ref` exposes setDraft for the empty state prompts.
 */
export default function Composer({ ref, files, readFile, onSend, onStop, isStreaming, isPaused, isOffline, isBusyElsewhere = false }) {
  const isLocked = isStreaming || isPaused || isOffline || isBusyElsewhere;
  const {
    input, attachments, mention, isPickerOpen, textareaRef, rootRef, setDraft,
    handleChange, handleKeyDown, closeMention, togglePicker,
    pickMention, pickFromMenu, removeAttachment, submit,
  } = useComposer({ files, readFile, onSend, disabled: isLocked });

  useImperativeHandle(ref, () => ({ setDraft }), [setDraft]);

  return (
    <div className="orion-composer" ref={rootRef}>
      {isOffline && (
        <Notice variant="offline">Sandbox is offline. Start it to work with Orion.</Notice>
      )}

      <form className="orion-composer__box" onSubmit={submit}>
        {mention && (
          <FileSuggestions
            items={mention.items}
            activeIndex={mention.activeIndex}
            onPick={pickMention}
          />
        )}
        {isPickerOpen && <FileSuggestions items={files || []} onPick={pickFromMenu} />}

        {attachments.length > 0 && (
          <AttachmentChips files={attachments} onRemove={removeAttachment} />
        )}

        <textarea
          ref={textareaRef}
          className="orion-composer__input"
          aria-label="Message Orion"
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={closeMention}
          placeholder={getPlaceholder({ isOffline, isPaused, isStreaming, isBusyElsewhere })}
          disabled={isLocked}
          rows={1}
        />

        <div className="orion-composer__toolbar">
          <IconButton
            label="Attach a file"
            onClick={togglePicker}
            disabled={isLocked}
            aria-expanded={isPickerOpen}
          >
            <Paperclip size={14} />
          </IconButton>
          <span className="orion-composer__hint">@ to attach</span>

          {isStreaming || isPaused ? (
            <IconButton label="Stop Orion" className="orion-composer__action" onClick={onStop}>
              <Square size={11} fill="currentColor" />
            </IconButton>
          ) : (
            <IconButton
              type="submit"
              label="Send"
              className="orion-composer__action orion-composer__action--send"
              disabled={isLocked || !input.trim()}
            >
              <ArrowUp size={15} />
            </IconButton>
          )}
        </div>
      </form>
    </div>
  );
}
