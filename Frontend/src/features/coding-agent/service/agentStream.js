/**
 * Reads a Server-Sent Events response body produced by the AI Orchestration
 * service and calls onEvent({ id, event, data }) for each frame.
 *
 * fetch() is used instead of EventSource because the invoke call is a POST
 * and the access token lives in memory (EventSource cannot send headers).
 *
 * Resolves when the stream ends. Rejects on network errors, except when the
 * given AbortSignal was aborted (then it resolves quietly).
 */
export async function readAgentStream(response, onEvent, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const dispatchFrame = (frame) => {
    let id = null;
    let event = 'message';
    const dataLines = [];

    for (const line of frame.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'id') id = value;
      else if (field === 'event') event = value;
      else if (field === 'data') dataLines.push(value);
    }

    if (dataLines.length === 0) return;
    const raw = dataLines.join('\n');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    onEvent({ id: id !== null ? Number(id) : null, event, data });
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        dispatchFrame(frame);
        boundary = buffer.indexOf('\n\n');
      }
    }
    if (buffer.trim()) dispatchFrame(buffer);
  } catch (err) {
    if (signal?.aborted) return;
    throw err;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}
