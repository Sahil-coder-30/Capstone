/**
 * Turns the raw thinking stream into readable blocks:
 *  - paragraphs (older runs glued sentences together, e.g. "UI?I'll start")
 *  - "STATUS: done SUMMARY: ..." protocol lines become a status block
 */
export function parseThinking(raw) {
  const prepared = String(raw || '')
    .replace(/([?!])(?=[A-Z])/g, '$1\n\n')
    .replace(/\.(?=(?:STATUS:|I'll |I will |Let's |Now |Next |First ))/g, '.\n\n')
    .replace(/(?=STATUS:\s*(?:done|blocked))/gi, '\n\n');

  return prepared
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const status = /^STATUS:\s*(done|blocked)\s*\|?\s*(?:SUMMARY:\s*([\s\S]*))?$/i.exec(part);
      if (status) {
        return { type: 'status', status: status[1].toLowerCase(), summary: (status[2] || '').trim() };
      }
      return { type: 'text', text: part };
    });
}
