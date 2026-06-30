
import { Check, Copy } from 'lucide-react';

// ─── Inline markdown formatter ──────────────────────────────────────────────
export const formatInline = (line) => {
  if (!line) return '';
  // Split by bold (**...**), italic (*...*), inline code (`...`), and markdown links ([text](url))
  const parts = line.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`|\[.*?\]\(.*?\))/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="ai-chat__markdown-bold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i} className="ai-chat__markdown-italic">{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="ai-chat__inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const match = part.match(/\[(.*?)\]\((.*?)\)/);
      if (match) {
        const text = match[1];
        const url = match[2];
        return (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="ai-chat__markdown-link">
            {text}
          </a>
        );
      }
    }
    return part;
  });
};

// ─── Robust markdown block parser ───────────────────────────────────────────
export const parseMarkdownToReact = (text, { copiedCodeIdx, copyToClipboard } = {}) => {
  if (!text) return null;

  // Segment by code blocks (supporting streaming/unclosed code blocks)
  const segments = [];
  let currentIndex = 0;
  while (currentIndex < text.length) {
    const codeBlockStart = text.indexOf('```', currentIndex);
    if (codeBlockStart === -1) {
      segments.push({ type: 'text', content: text.slice(currentIndex) });
      break;
    }

    if (codeBlockStart > currentIndex) {
      segments.push({ type: 'text', content: text.slice(currentIndex, codeBlockStart) });
    }

    const contentStart = codeBlockStart + 3;
    const codeBlockEnd = text.indexOf('```', contentStart);

    if (codeBlockEnd === -1) {
      // Unclosed code block (streaming)
      segments.push({ type: 'code', content: text.slice(codeBlockStart) });
      break;
    } else {
      // Closed code block
      segments.push({ type: 'code', content: text.slice(codeBlockStart, codeBlockEnd + 3) });
      currentIndex = codeBlockEnd + 3;
    }
  }

  return segments.map((segment, index) => {
    if (segment.type === 'code') {
      const lines = segment.content.split('\n');
      const firstLine = lines[0] || '';
      const lang = firstLine.startsWith('```') ? firstLine.slice(3).trim() : '';

      let codeLines = lines.slice(1);
      if (codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === '```') {
        codeLines = codeLines.slice(0, -1);
      } else if (codeLines.length > 0 && codeLines[codeLines.length - 1].endsWith('```')) {
        codeLines[codeLines.length - 1] = codeLines[codeLines.length - 1].slice(0, -3);
      }
      const code = codeLines.join('\n');

      return (
        <div key={index} className="ai-chat__code-block animate-fade-in">
          <div className="ai-chat__code-block-header">
            <span className="ai-chat__code-block-lang">{lang || 'code'}</span>
            {copyToClipboard && (
              <button
                type="button"
                className={`ai-chat__code-block-copy ${copiedCodeIdx === index ? 'ai-chat__code-block-copy--copied' : ''}`}
                onClick={() => copyToClipboard(code, index)}
              >
                {copiedCodeIdx === index ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
              </button>
            )}
          </div>
          <pre><code>{code}</code></pre>
        </div>
      );
    }

    const lines = segment.content.split('\n');
    const blocks = [];
    let currentBlock = null;

    const flushCurrentBlock = () => {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '') {
        flushCurrentBlock();
        continue;
      }

      // Header checking
      const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
      if (headerMatch) {
        flushCurrentBlock();
        const level = headerMatch[1].length;
        blocks.push({
          type: 'header',
          level: Math.min(level, 3), // max support h3 style
          text: headerMatch[2]
        });
        continue;
      }

      // Unordered list item
      const ulMatch = trimmed.match(/^[-*]\s+(.*)/);
      if (ulMatch) {
        if (!currentBlock || currentBlock.type !== 'ul') {
          flushCurrentBlock();
          currentBlock = { type: 'ul', items: [] };
        }
        currentBlock.items.push(ulMatch[1]);
        continue;
      }

      // Ordered list item
      const olMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (olMatch) {
        if (!currentBlock || currentBlock.type !== 'ol') {
          flushCurrentBlock();
          currentBlock = { type: 'ol', items: [] };
        }
        currentBlock.items.push(olMatch[2]);
        continue;
      }

      // Paragraph line: group adjacent lines together as a single paragraph
      if (!currentBlock || currentBlock.type !== 'p') {
        flushCurrentBlock();
        currentBlock = { type: 'p', lines: [] };
      }
      currentBlock.lines.push(line);
    }
    flushCurrentBlock();

    return blocks.map((block, bIdx) => {
      const key = `${index}-${bIdx}`;
      switch (block.type) {
        case 'header': {
          const Tag = `h${block.level}`;
          return (
            <Tag key={key} className={`ai-chat__markdown-h${block.level}`}>
              {formatInline(block.text)}
            </Tag>
          );
        }
        case 'ul':
          return (
            <ul key={key} className="ai-chat__markdown-ul">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="ai-chat__markdown-li">
                  {formatInline(item)}
                </li>
              ))}
            </ul>
          );
        case 'ol':
          return (
            <ol key={key} className="ai-chat__markdown-ol">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="ai-chat__markdown-li">
                  {formatInline(item)}
                </li>
              ))}
            </ol>
          );
        case 'p':
          return (
            <p key={key} className="ai-chat__markdown-p">
              {formatInline(block.lines.join(' '))}
            </p>
          );
        default:
          return null;
      }
    });
  });
};
