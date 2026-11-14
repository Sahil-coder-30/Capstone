// Builds docs/openapi.plain.yaml from docs/openapi.yaml: the same spec with every
// comment line removed. openapi.yaml is the one you edit; run this after each edit:
//
//   node docs/openapi-strip-comments.mjs
//
// Only whole-line comments are removed. The spec has no comments after values.
// Inside a block scalar (description: |) a line starting with "#" is text, not a
// comment, so block scalars are copied as they are.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, 'openapi.yaml');
const target = path.join(here, 'openapi.plain.yaml');

const indentOf = (line) => line.length - line.trimStart().length;

export function stripComments(text) {
  const out = [];
  let blockIndent = null; // indent of the key that opened a block scalar
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (blockIndent !== null) {
      if (trimmed === '' || indentOf(line) > blockIndent) {
        out.push(line);
        continue;
      }
      blockIndent = null;
    }
    if (trimmed.startsWith('#')) continue;
    if (/:\s*[|>][-+]?\s*$/.test(line) || /^\s*-\s*[|>][-+]?\s*$/.test(line)) blockIndent = indentOf(line);
    out.push(line);
  }
  // Drop the blank lines the removed comment blocks leave behind.
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const plain = stripComments(fs.readFileSync(source, 'utf8'));
  // Self-check: no comment line may survive outside a block scalar.
  if (stripComments(plain) !== plain) throw new Error('strip is not stable');
  fs.writeFileSync(target, plain);
  console.log(`wrote ${path.relative(process.cwd(), target)}`);
}
