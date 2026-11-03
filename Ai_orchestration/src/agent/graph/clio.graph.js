// clio.graph.js
// Clio as a one-node graph: START -> clio -> END.
// No checkpointer: the controller loads chat history from MongoDB on every
// request, so a checkpointer would only duplicate it.

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { clioNode } from "../nodes/clio.node.js";

const value = (initial) => Annotation({ reducer: (_prev, next) => next, default: () => initial });

export const ClioState = Annotation.Root({
  prompt: value(""),
  history: value([]),            // earlier turns as { role, content }
  activeFile: value(""),
  activeFileContent: value(""),
  answer: value(""),
});

let clioGraph = null;

export const getClioGraph = () =>
  (clioGraph ??= new StateGraph(ClioState).addNode("clio", clioNode).addEdge(START, "clio").addEdge("clio", END).compile());
