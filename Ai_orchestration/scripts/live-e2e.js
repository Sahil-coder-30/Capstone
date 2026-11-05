// Live end-to-end run of Orion with the REAL model against an in-memory
// sandbox. No cluster needed. Shows whether the graph plans, codes, builds
// and reports honestly.
//
// Usage: npm run e2e:live -- "Add a Counter component with + and - buttons and render it in App"
//
// The fake sandbox implements the sidecar endpoints the tools use. Its
// "build" fails when a relative import points at a missing file, which is
// the most common hallucination.

import "dotenv/config";
import axios from "axios";
import ChatMessage from "../src/models/ChatMessage.model.js";
import * as runs from "../src/services/agentRun.service.js";

const task = process.argv.slice(2).join(" ") || "Add a Counter component with + and - buttons and render it in App.jsx";

const files = new Map(Object.entries({
  "package.json": JSON.stringify({ name: "demo", private: true, type: "module", scripts: { dev: "vite", build: "vite build" }, dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" }, devDependencies: { vite: "^6.0.0", "@vitejs/plugin-react": "^4.0.0" } }, null, 2),
  "index.html": '<!doctype html>\n<html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>\n',
  "src/main.jsx": 'import { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\nimport "./index.css";\n\ncreateRoot(document.getElementById("root")).render(<App />);\n',
  "src/App.jsx": 'export default function App() {\n  return (\n    <main className="app">\n      <h1>Hello Taksha</h1>\n    </main>\n  );\n}\n',
  "src/index.css": "body { font-family: sans-serif; margin: 0; }\n.app { padding: 2rem; }\n",
}));

const clean = (p) => String(p || "").replace(/^\.?\/+/, "").replace(/^workspace\//, "");

const resolveImport = (from, spec) => {
  const parts = from.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  const base = parts.join("/");
  return [base, `${base}.jsx`, `${base}.js`, `${base}/index.jsx`, `${base}/index.js`].find((p) => files.has(p));
};

const fakeBuild = () => {
  const errors = [];
  const deps = JSON.parse(files.get("package.json"));
  const installed = { ...deps.dependencies, ...deps.devDependencies };
  for (const [file, content] of files) {
    if (!/\.(jsx?|tsx?)$/.test(file)) continue;
    for (const [, spec] of content.matchAll(/(?:import|from)\s+["']([^"']+)["']/g)) {
      if (spec.startsWith(".")) {
        if (!resolveImport(file, spec)) errors.push(`[vite]: Rollup failed to resolve import "${spec}" from "${file}".`);
      } else {
        const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        if (!installed[pkg]) errors.push(`[vite]: Rollup failed to resolve import "${spec}" from "${file}". Is the package installed?`);
      }
    }
  }
  return errors;
};

const reply = (config, data, status = 200) => ({ data, status, statusText: "OK", headers: {}, config, request: {} });

axios.defaults.adapter = async (config) => {
  const url = new URL(config.url);
  const body = config.data ? JSON.parse(config.data) : {};
  // Stand-in for Auth's sandbox token endpoint.
  if (url.host === "auth-service") return reply(config, { token: "local-sandbox-token", expiresIn: 7200 });
  if (config.headers.Authorization !== "Bearer local-sandbox-token") {
    return reply(config, { status: "error", message: "Missing sandbox token" }, 401);
  }
  const route = url.pathname.replace("/api/agent/", "");
  switch (`${config.method} ${route}`) {
    case "get list-files":
      return reply(config, { status: "ok", files: [...files.keys()].sort() });
    case "get read-file":
      return reply(config, {
        status: "ok",
        files: (url.searchParams.get("files") || "").split(",").map(clean).map((file) =>
          files.has(file) ? { file, content: files.get(file) } : { file, error: "File not found" }),
      });
    case "post create-file":
      body.files.forEach((f) => files.set(clean(f.file), f.content));
      return reply(config, { status: "ok", results: body.files.map((f) => ({ file: clean(f.file), status: "created" })) }, 201);
    case "patch update-file":
      return reply(config, {
        status: "ok",
        results: body.updates.map((u) => (files.has(clean(u.file))
          ? (files.set(clean(u.file), u.content), { file: clean(u.file), status: "updated" })
          : { file: clean(u.file), error: "File not found" })),
      });
    case "post patch-file": {
      const file = clean(body.filePath);
      const content = files.get(file);
      if (content === undefined) return reply(config, { success: false, error: "File not found" });
      const count = content.split(body.oldStr).length - 1;
      if (count === 0) return reply(config, { success: false, error: "oldStr not found in file" });
      if (count > 1) return reply(config, { success: false, error: "oldStr is ambiguous" });
      files.set(file, content.replace(body.oldStr, body.newStr));
      return reply(config, { success: true, patched: file });
    }
    case "delete delete-file":
      body.files.forEach((f) => files.delete(clean(f)));
      return reply(config, { status: "ok", results: body.files.map((f) => ({ file: clean(f), status: "deleted" })) });
    case "get search-code": {
      const pattern = (url.searchParams.get("pattern") || "").toLowerCase();
      const results = [];
      for (const [file, content] of files) {
        content.split("\n").forEach((line, i) => line.toLowerCase().includes(pattern) && results.push({ file, line: i + 1, text: line }));
      }
      return reply(config, { status: "ok", results: results.slice(0, 20) });
    }
    case "post exec": {
      const command = body.command || "";
      const install = /npm\s+(install|i|add)\s+([^&|;]+)/.exec(command);
      if (install) {
        const pkg = JSON.parse(files.get("package.json"));
        for (const name of install[2].trim().split(/\s+/).filter((n) => !n.startsWith("-"))) pkg.dependencies[name.replace(/@[^@/]*$/, "") || name] = "latest";
        files.set("package.json", JSON.stringify(pkg, null, 2));
        return reply(config, { status: "ok", success: true, stdout: "added 1 package", stderr: "", error: null, timedOut: false });
      }
      if (/npm run build/.test(command)) {
        const errors = fakeBuild();
        return reply(config, errors.length
          ? { status: "ok", success: false, stdout: "", stderr: errors.join("\n"), error: "Command failed: vite build", timedOut: false }
          : { status: "ok", success: true, stdout: "vite v6.0.0 building for production...\n✓ built in 812ms", stderr: "", error: null, timedOut: false });
      }
      return reply(config, { status: "ok", success: true, stdout: "", stderr: "", error: null, timedOut: false });
    }
    case "get vite-runtime-errors":
      return reply(config, { success: true, logs: "VITE v6.0.0 ready in 300 ms" });
    default:
      return reply(config, { message: `No fake route for ${config.method} ${route}` }, 404);
  }
};

// No database for this script.
ChatMessage.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) });
ChatMessage.create = async () => ({ _id: { toString: () => "local" } });

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

console.log(`TASK: ${task}\n`);
const started = Date.now();
const run = await runs.startRun({
  user: { id: "local-user" },
  authToken: "local",
  projectId: "local-project",
  sandboxId: "local-sandbox",
  task,
  autoApprovePlan: true,
});
runs.attachSubscriber(run, { on() {} }, res, 0);

while (!res.writableEnded) await new Promise((r) => setTimeout(r, 500));

const final = events.find((e) => e.event === "agent:final")?.payload;
const error = events.find((e) => e.event === "agent:error")?.payload;
console.log(`\n${"=".repeat(60)}\nOUTCOME: ${final?.outcome || "error"} in ${Math.round((Date.now() - started) / 1000)}s`);
console.log(final?.text || error?.message);
console.log(`\nBUILD CHECK ON FINAL FILES: ${fakeBuild().join("; ") || "passes"}`);
console.log("\nFILES:");
for (const [file, content] of files) console.log(`--- ${file}\n${content}`);
process.exit(0);
