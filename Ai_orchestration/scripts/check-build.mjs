// Stand-in for `vite build` in scripts/live-e2e.js. Run from a workspace:
// fails (exit 1) when a relative import points at a missing file or an
// imported package is not in package.json.

import fs from "fs";
import path from "path";

const cwd = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
const installed = { ...pkg.dependencies, ...pkg.devDependencies };
const errors = [];

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name.startsWith(".")) return [];
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

const resolves = (from, spec) => {
  const base = path.resolve(path.dirname(from), spec);
  return [base, `${base}.jsx`, `${base}.js`, `${base}.ts`, `${base}.tsx`, path.join(base, "index.jsx"), path.join(base, "index.js")]
    .some((p) => fs.existsSync(p) && fs.statSync(p).isFile());
};

for (const file of walk(cwd).filter((f) => /\.(jsx?|tsx?)$/.test(f))) {
  const rel = path.relative(cwd, file);
  for (const [, spec] of fs.readFileSync(file, "utf8").matchAll(/(?:import|from)\s+["']([^"']+)["']/g)) {
    if (spec.startsWith(".")) {
      if (!resolves(file, spec)) errors.push(`[vite]: Rollup failed to resolve import "${spec}" from "${rel}".`);
    } else {
      const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      if (!installed[name]) errors.push(`[vite]: Rollup failed to resolve import "${spec}" from "${rel}". Is the package installed?`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("vite v6.0.0 building for production...\n✓ built in 812ms");
