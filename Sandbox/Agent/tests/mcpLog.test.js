// The MCP log line must never print secrets from a command.

import { test } from "node:test";
import assert from "node:assert/strict";
import { argSummary } from "../src/mcp/server.js";

test("argSummary masks secrets and keeps the useful part", () => {
  assert.equal(argSummary({ command: "npm install axios" }), "npm install axios");
  assert.equal(argSummary({ command: "API_KEY=abc123 npm run dev" }), "API_KEY=*** npm run dev");
  assert.equal(argSummary({ command: "curl -H 'Authorization: Bearer xyz' x" }), "curl -H 'Authorization: Bearer *** x");
  assert.equal(argSummary({ command: "cli --token s3cret go" }), "cli --token *** go");
  assert.equal(argSummary({ command: "echo nvapi-SECRET" }), "echo nvapi-***");
  assert.equal(argSummary({ files: [{ file: "src/App.jsx", content: "password=x" }] }), "src/App.jsx");
});
