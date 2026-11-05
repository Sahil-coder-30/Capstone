// Live end-to-end run of Orion: the REAL model, the REAL sandbox sidecar
// (Sandbox/Agent: owner-token auth + certified MCP tools) on a temp
// workspace, and a throwaway RSA key standing in for the Auth service.
// No cluster needed. Needs `npm install` in Sandbox/Agent once.
//
// Usage: npm run e2e:live -- "Add a Counter component with + and - buttons and render it in App"
//
// The workspace's "build" runs check-build.mjs: it fails when a relative
// import points at a missing file or a package is not in package.json, the
// most common hallucinations.

import "dotenv/config";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import jwt from "jsonwebtoken";
import ChatMessage from "../src/models/ChatMessage.model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = path.resolve(here, "../../Sandbox/Agent");
const PORT = 39400;
const OWNER = "local-user";
const SANDBOX_ID = "local-sandbox";

const task = process.argv.slice(2).join(" ") || "Add a Counter component with + and - buttons and render it in App.jsx";

// ── Temp workspace ──────────────────────────────────────────────────────────
const root = fs.mkdtempSync(path.join(os.tmpdir(), "taksha-e2e-"));
const workspace = path.join(root, "workspace");
const seed = {
  "package.json": JSON.stringify({
    name: "demo",
    private: true,
    type: "module",
    scripts: { build: `node ${path.join(here, "check-build.mjs")}` },
    dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
    devDependencies: { vite: "^6.0.0", "@vitejs/plugin-react": "^4.0.0" },
  }, null, 2),
  "index.html": '<!doctype html>\n<html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>\n',
  "src/main.jsx": 'import { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\nimport "./index.css";\n\ncreateRoot(document.getElementById("root")).render(<App />);\n',
  "src/App.jsx": 'export default function App() {\n  return (\n    <main className="app">\n      <h1>Hello Taksha</h1>\n    </main>\n  );\n}\n',
  "src/index.css": "body { font-family: sans-serif; margin: 0; }\n.app { padding: 2rem; }\n",
};
for (const [file, content] of Object.entries(seed)) {
  fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true });
  fs.writeFileSync(path.join(workspace, file), content);
}
fs.writeFileSync(path.join(root, "vite.log"), "VITE v6.0.0 ready in 300 ms\n");

// ── Real sidecar ────────────────────────────────────────────────────────────
Object.assign(process.env, {
  WORKSPACE_DIR: workspace,
  VITE_LOG_FILE: path.join(root, "vite.log"),
  SANDBOX_ID,
  OWNER_USER_ID: OWNER,
  MCP_ALLOWED_HOSTS: `127.0.0.1:${PORT}`,
  SANDBOX_URL_TEMPLATE: `http://127.0.0.1:${PORT}`,
});
delete process.env.SANDBOX_TOOL_TRANSPORT;

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "auth-rsa-v1" };
const { createTokenVerifier } = await import(path.join(AGENT_DIR, "src/auth/verifyToken.js"));
const { setVerifierForTesting } = await import(path.join(AGENT_DIR, "src/auth/middleware.js"));
setVerifierForTesting(createTokenVerifier({ ownerId: OWNER, sandboxId: SANDBOX_ID, fetchJwks: async () => ({ keys: [jwk] }) }));
const sidecar = (await import(path.join(AGENT_DIR, "src/app.js"))).default;
await new Promise((resolve) => sidecar.listen(PORT, "127.0.0.1", resolve));

// ── Stand-in for Auth's POST /api/auth/sandbox-token ────────────────────────
const realAdapter = axios.defaults.adapter;
axios.defaults.adapter = async (config) => {
  if (new URL(config.url).host !== "auth-service") return axios.getAdapter(realAdapter)(config);
  const { sandboxId } = JSON.parse(config.data);
  const token = jwt.sign({ sub: OWNER, id: OWNER, sbx: sandboxId }, privateKey, {
    algorithm: "RS256", keyid: "auth-rsa-v1", issuer: "auth.takshacodespace.in", audience: "taksha-sandbox", expiresIn: "2h",
  });
  return { data: { token, expiresIn: 7200 }, status: 200, statusText: "OK", headers: {}, config, request: {} };
};

// No database for this script.
ChatMessage.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) });
ChatMessage.create = async () => ({ _id: { toString: () => "local" } });

const runs = await import("../src/services/agentRun.service.js");

const events = [];
const res = {
  writableEnded: false,
  destroyed: false,
  write(chunk) {
    for (const frame of String(chunk).split("\n\n")) {
      const event = /^event: (.+)$/m.exec(frame)?.[1];
      const data = /^data: (.+)$/m.exec(frame)?.[1];
      if (!event) continue;
      const payload = data ? JSON.parse(data) : {};
      events.push({ event, payload });
      if (event === "agent:status" && payload.detail) console.log(`  [${payload.node || payload.phase}] ${payload.detail}`);
      if (event === "agent:tool_start") console.log(`    tool ${payload.toolName} ${payload.input.slice(0, 100)}`);
      if (event === "agent:plan_review") {
        console.log("\nPLAN:");
        for (const s of payload.plan.steps) console.log(`  ${s.id}. ${s.title} [${s.activeFiles.join(", ")}]`);
        if (payload.warnings.length) console.log(`  warnings: ${payload.warnings.join(" | ")}`);
        console.log("");
      }
    }
    return true;
  },
  end() {
    this.writableEnded = true;
  },
};

console.log(`TASK: ${task}\nWORKSPACE: ${workspace}\n`);
const started = Date.now();
const run = await runs.startRun({
  user: { id: OWNER },
  authToken: "local-user-access-token",
  projectId: "local-project",
  sandboxId: SANDBOX_ID,
  task,
  autoApprovePlan: true,
});
runs.attachSubscriber(run, { on() {} }, res, 0);

while (!res.writableEnded) await new Promise((r) => setTimeout(r, 500));

const final = events.find((e) => e.event === "agent:final")?.payload;
const error = events.find((e) => e.event === "agent:error")?.payload;
console.log(`\n${"=".repeat(60)}\nOUTCOME: ${final?.outcome || "error"} in ${Math.round((Date.now() - started) / 1000)}s`);
console.log(final?.text || error?.message);

const { execSync } = await import("child_process");
let buildCheck;
try {
  buildCheck = execSync("npm run build --silent", { cwd: workspace, encoding: "utf8" }).trim();
} catch (err) {
  buildCheck = `FAILS\n${err.stdout || err.message}`;
}
console.log(`\nBUILD CHECK ON FINAL FILES: ${buildCheck}`);
console.log("\nFILES:");
for (const file of execSync("find . -type f -not -path './node_modules/*'", { cwd: workspace, encoding: "utf8" }).trim().split("\n").sort()) {
  console.log(`--- ${file.slice(2)}\n${fs.readFileSync(path.join(workspace, file), "utf8")}`);
}
process.exit(0);
