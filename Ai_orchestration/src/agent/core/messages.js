// messages.js
// Small helpers for reading LangChain messages and building prompt text.

export const truncate = (value, maxLength) => {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[truncated ${text.length - maxLength} chars]`;
};

/** Plain text of a message content (string or content blocks). Reasoning blocks are skipped. */
export const contentToText = (content) => {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => (typeof block === "string" ? block : block?.type === "text" ? block.text || "" : ""))
      .join("");
  }
  return typeof content === "object" ? content.text || "" : String(content);
};

const typeOf = (message) => message?._getType?.() || message?.type || message?.role;

export const isAiMessage = (message) => ["ai", "assistant"].includes(typeOf(message));
export const isToolMessage = (message) => typeOf(message) === "tool";
const isUserMessage = (message) => ["human", "user"].includes(typeOf(message));

/** Text of the last AI message that has text (skips pure tool-call turns). */
export const lastAiText = (messages = []) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (!isAiMessage(messages[i])) continue;
    const text = contentToText(messages[i].content).trim();
    if (text) return text;
  }
  return "";
};

/** Prior chat turns as a compact transcript. Keeps the most recent text. */
export const formatChatHistory = (messages = [], maxChars = 6_000) => {
  const transcript = messages
    .map((m) => {
      const text = contentToText(m.content).trim();
      return text ? `${isUserMessage(m) ? "User" : "Assistant"}: ${truncate(text, 1_500)}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  return transcript.length > maxChars ? transcript.slice(-maxChars) : transcript;
};

/** Reads token usage from a model output, whatever shape the provider uses. */
export const usageOf = (output) => {
  const usage = output?.usage_metadata || output?.response_metadata?.tokenUsage || output?.response_metadata?.usage;
  if (!usage) return null;
  const promptTokens = usage.input_tokens || usage.prompt_tokens || usage.promptTokens || 0;
  const completionTokens = usage.output_tokens || usage.completion_tokens || usage.completionTokens || 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage.total_tokens || usage.totalTokens || promptTokens + completionTokens,
  };
};
