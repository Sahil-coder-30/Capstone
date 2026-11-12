// memoryAgent.js
// A small background agent that keeps an assistant's memory up to date
// after each chat turn, in one structured call on the fast model:
//   - sessionSummary: running summary of the chat (context compaction)
//   - title:          a short name for the chat
//   - projectNotes:   durable notes about the project for every chat

import * as z from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getFastModel } from "../llm/model.js";
import { invokeStructured } from "../llm/structured.js";
import { truncate, usageOf } from "../core/messages.js";

export const MEMORY_LIMITS = { summary: 1_500, notes: 2_500, title: 80 };

const MemoryUpdate = z.object({
  sessionSummary: z.string().describe("Running summary of this chat"),
  title: z.string().describe("3 to 6 word name for this chat"),
  projectNotes: z.string().describe("Durable notes about the project"),
});

const systemPrompt = (agentName) => `You maintain the memory of ${agentName}, an AI assistant in a cloud IDE for React + Vite projects.
You get the old memory and the newest chat turns. Return the updated memory.

sessionSummary (max ${MEMORY_LIMITS.summary} characters):
- Merge the old summary with the new turns.
- Keep what the user asked for, what was done (files, features), decisions, and open items.
- Drop greetings, filler and step-by-step tool detail.

title (3 to 6 words, Title Case): the main topic of the whole chat.

projectNotes (max ${MEMORY_LIMITS.notes} characters):
- Durable facts about the project that help in any future chat: stack and libraries, structure and key files, features built, conventions, the user's preferences.
- Merge with the old notes. Remove notes the new turns prove wrong. Keep notes that are still true.
- Nothing about this one chat's small talk.

Rules for all fields:
- Short plain-text bullets ("- ...").
- Only facts stated in the input. Never invent file names, APIs or results.
- Never include secrets, tokens, keys or passwords.`;

const formatTurns = (turns) =>
  turns.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${truncate(t.content, 2_000)}`).join("\n\n");

/**
 * @param {object} input
 * @param {string} input.agentName   "Orion" or "Clio"
 * @param {string} input.oldSummary
 * @param {string} input.oldNotes
 * @param {{role: string, content: string}[]} input.turns  new turns, oldest first
 * @returns {Promise<{ update: z.infer<typeof MemoryUpdate>, usage: object }>}
 */
export async function runMemoryAgent({ agentName, oldSummary, oldNotes, turns }) {
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const callbacks = [{
    handleLLMEnd(output) {
      const found = usageOf(output?.generations?.[0]?.[0]?.message) || usageOf({ usage_metadata: output?.llmOutput?.tokenUsage });
      if (!found) return;
      usage.promptTokens += found.promptTokens;
      usage.completionTokens += found.completionTokens;
      usage.totalTokens += found.totalTokens;
    },
  }];

  const update = await invokeStructured(
    getFastModel(),
    MemoryUpdate,
    "memory_update",
    [
      new SystemMessage(systemPrompt(agentName)),
      new HumanMessage([
        `OLD CHAT SUMMARY:\n${oldSummary || "(none, this is a new chat)"}`,
        `OLD PROJECT NOTES:\n${oldNotes || "(none yet)"}`,
        `NEW TURNS:\n${formatTurns(turns)}`,
      ].join("\n\n")),
    ],
    { callbacks },
  );

  return {
    update: {
      sessionSummary: truncate(update.sessionSummary.trim(), MEMORY_LIMITS.summary),
      title: update.title.replace(/\s+/g, " ").trim().slice(0, MEMORY_LIMITS.title),
      projectNotes: truncate(update.projectNotes.trim(), MEMORY_LIMITS.notes),
    },
    usage,
  };
}
