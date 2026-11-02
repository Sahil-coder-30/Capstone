import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_SUGGESTIONS = 8;
const AT_MENTION = /(?:^|\s)@([^\s]*)$/;

/** Input, file attachments and the @ file menu of the composer. */
export function useComposer({ files, readFile, onSend, disabled }) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]); // [{ name, path, content }]
  const [mention, setMention] = useState(null);       // { items, activeIndex, start, length }
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const textareaRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [input]);

  useEffect(() => {
    if (!isPickerOpen) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !rootRef.current?.contains(e.target)) {
        setIsPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [isPickerOpen]);

  const setDraft = useCallback((text) => {
    setInput(text);
    textareaRef.current?.focus();
  }, []);

  const handleChange = (e) => {
    const value = e.target.value;
    setInput(value);

    const cursor = e.target.selectionStart;
    const match = value.slice(0, cursor).match(AT_MENTION);
    if (!match || !files?.length) {
      setMention(null);
      return;
    }
    const query = match[1];
    const items = files
      .filter((file) => file.toLowerCase().includes(query.toLowerCase()))
      .slice(0, MAX_SUGGESTIONS);
    setMention(items.length ? { items, activeIndex: 0, start: cursor - query.length - 1, length: query.length + 1 } : null);
  };

  const attachFile = async (path) => {
    const content = await readFile(path);
    setAttachments((prev) => (
      prev.some((file) => file.path === path)
        ? prev
        : [...prev, { name: path.split('/').pop(), path, content }]
    ));
  };

  const removeAttachment = (path) => {
    setAttachments((prev) => prev.filter((file) => file.path !== path));
  };

  const pickMention = (path) => {
    if (mention) {
      const { start, length } = mention;
      setInput((prev) => prev.slice(0, start) + prev.slice(start + length));
      setMention(null);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(start, start);
      });
    }
    attachFile(path);
  };

  const pickFromMenu = (path) => {
    setIsPickerOpen(false);
    attachFile(path);
  };

  const submit = (e) => {
    e?.preventDefault();
    if (!input.trim() || disabled) return;
    onSend(input, attachments);
    setInput('');
    setAttachments([]);
    setMention(null);
  };

  const moveMention = (step) => {
    setMention((prev) => ({
      ...prev,
      activeIndex: (prev.activeIndex + step + prev.items.length) % prev.items.length,
    }));
  };

  const handleKeyDown = (e) => {
    if (mention) {
      if (e.key === 'ArrowDown') moveMention(1);
      else if (e.key === 'ArrowUp') moveMention(-1);
      else if (e.key === 'Enter') pickMention(mention.items[mention.activeIndex]);
      else if (e.key === 'Escape') setMention(null);
      else return;
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) submit(e);
  };

  return {
    input,
    attachments,
    mention,
    isPickerOpen,
    textareaRef,
    rootRef,
    setDraft,
    handleChange,
    handleKeyDown,
    closeMention: () => setMention(null),
    togglePicker: () => setIsPickerOpen((open) => !open),
    pickMention,
    pickFromMenu,
    removeAttachment,
    submit,
  };
}
