// toolLoop.js
// A small ReAct loop: the model thinks, calls tools, reads results, repeats
// until it answers without a tool call or the turn budget runs out.
//
// Why not a prebuilt agent: this loop
//   - never throws away finished work when the budget runs out (the old
//     recursion-limit error lost every message of the step),
//   - answers unknown tools and bad arguments with an error the model can
//     read instead of crashing the run,
//   - runs guards before a call and blocks repeated identical calls,
//     the most common way small models get stuck.

import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { WRITE_TOOLS } from "../tools/guards.js";
import { toolError } from "../tools/toolResult.js";

const MAX_SAME_CALL = 2;

const callKey = (call) => `${call.name}:${JSON.stringify(call.args ?? {})}`;

const errorMessage = (call, message) =>
  new ToolMessage({ tool_call_id: call.id, name: call.name, content: toolError(message), status: "error" });

/**
 * @param {object}   opts
 * @param {object}   opts.model    chat model (rate-limited)
 * @param {object[]} opts.tools    LangChain tools the model may call
 * @param {string}   opts.system   system prompt
 * @param {string}   opts.prompt   the task for this loop
 * @param {object}   opts.config   node config (callbacks, signal, sandbox id)
 * @param {number}   opts.maxTurns model turns before the loop must stop
 * @param {Function} [opts.guard]  (toolName, args) => block message | null
 * @param {object[]} [opts.history] prior messages placed before the prompt
 * @returns {Promise<{ messages: object[], finished: boolean }>}
 *   finished is false when the budget ran out before a final answer.
 */
export async function runToolLoop({ model, tools, system, prompt, config, maxTurns, guard, history = [] }) {
  const toolsByName = new Map(tools.map((t) => [t.name, t]));
  const llm = tools.length ? model.bindTools(tools) : model;
  const messages = [new SystemMessage(system), ...history, new HumanMessage(prompt)];
  const callCounts = new Map();

  const runCall = async (call) => {
    const selected = toolsByName.get(call.name);
    if (!selected) {
      return errorMessage(call, `Unknown tool "${call.name}". Available tools: ${[...toolsByName.keys()].join(", ")}.`);
    }

    const blocked = guard?.(call.name, call.args ?? {});
    if (blocked) return errorMessage(call, blocked);

    const key = callKey(call);
    const count = (callCounts.get(key) || 0) + 1;
    callCounts.set(key, count);
    if (count > MAX_SAME_CALL) {
      return errorMessage(call, `You already made this exact ${call.name} call ${MAX_SAME_CALL} times. Use the result you have, or change your approach.`);
    }

    try {
      const result = await selected.invoke({ ...call, type: "tool_call" }, config);
      // After a file changes, re-reading it is legitimate again.
      if (WRITE_TOOLS.has(call.name)) callCounts.clear();
      return result;
    } catch (err) {
      if (config?.signal?.aborted) throw err;
      return errorMessage(call, `Invalid call to ${call.name}: ${err.message}`);
    }
  };

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const reply = await llm.invoke(messages, config);
    messages.push(reply);
    if (!reply.tool_calls?.length) return { messages, finished: true };
    for (const call of reply.tool_calls) messages.push(await runCall(call));
  }

  // Budget used up: ask for the final report so the node still gets one.
  messages.push(new HumanMessage("You have used all your tool calls. Do not call any more tools. Write your final reply now, in the required format, stating honestly what is done and what is not."));
  const final = await llm.invoke(messages, config);
  messages.push(final.tool_calls?.length ? Object.assign(final, { tool_calls: [] }) : final);
  return { messages, finished: false };
}
