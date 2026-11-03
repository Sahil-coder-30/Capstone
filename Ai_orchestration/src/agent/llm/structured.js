// structured.js
// Gets a schema-validated object from the model.
//
// 1. Function calling (the model fills a tool with the schema).
// 2. If that fails, plain JSON text that is parsed and validated with zod.
//    Not every hosted model supports forced tool choice, so the fallback
//    keeps planning and review working on any model.
//
// Calls are tagged so the stream layer never shows the raw JSON to the user.

import * as z from "zod";
import { HumanMessage } from "@langchain/core/messages";
import { contentToText } from "../core/messages.js";

export const INTERNAL_TAGS = ["nostream", "orion_internal"];

const extractJson = (text) => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The model reply had no JSON object.");
  return JSON.parse(body.slice(start, end + 1));
};

export async function invokeStructured(model, schema, name, messages, config) {
  const callConfig = { signal: config?.signal, callbacks: config?.callbacks, tags: INTERNAL_TAGS };

  try {
    return await model.withStructuredOutput(schema, { name, method: "functionCalling" }).invoke(messages, callConfig);
  } catch (err) {
    if (config?.signal?.aborted) throw err;
    console.warn(`[invokeStructured] ${name}: function calling failed (${err.message}), trying JSON text`);
  }

  const instruction = new HumanMessage(
    `Reply with ONLY one JSON object named "${name}" that matches this JSON schema. No prose, no markdown.\n${JSON.stringify(z.toJSONSchema(schema))}`,
  );
  const reply = await model.invoke([...messages, instruction], callConfig);
  return schema.parse(extractJson(contentToText(reply.content)));
}
