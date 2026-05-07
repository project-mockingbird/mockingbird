#!/usr/bin/env node
// Build-time guard for the resolver-context bypass bug class. Mercurius's
// programmatic `app.graphql(query, context, variables, operationName)` does
// NOT route through the registered `context:` builder, so any direct call
// must thread a real context as the 2nd arg. Three cycles in a row landed
// the same one-line fix for this footgun:
//
//   0.7.5.0  routing fix surfaced via gql-local capture
//   0.7.6.0  handleEdgeAlias was passing `{}`         -> threaded buildResolverContext
//   0.7.6.1  graphqlExecutor closure was passing undefined -> threaded ctx
//
// The valid context shapes are:
//   - `ctx`                          (parent resolver scope)
//   - `buildResolverContext(request)`(when only `request` is in scope)
//   - any object literal that names `engine`
//
// This script scans `src/` and fails the build on:
//   - 2nd arg literal `undefined`
//   - 2nd arg literal `null`
//   - 2nd arg `{}` (empty object literal)
//   - call with fewer than 2 arguments
//
// Test files are excluded because they legitimately exercise the negative
// cases (RED-state regression anchors).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { glob } from 'glob';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const files = await glob('src/**/*.ts', {
  cwd: root,
  ignore: [
    'src/web/node_modules/**',
    'src/web/out/**',
    '**/*.test.ts',
    '**/*.d.ts',
  ],
  absolute: true,
});

// Replace line and block comments with whitespace, preserving newlines so
// line numbers stay accurate. String literals are respected so that any
// "// ..." or "slash-star ... star-slash" text inside a string survives.
// Without this, literal `app.graphql()` tokens inside doc comments get
// flagged.
function stripComments(src) {
  let out = '';
  let i = 0;
  let inStr = null;
  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      out += ch;
      if (ch === '\\' && i + 1 < src.length) {
        out += src[i + 1];
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      out += '  ';
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < src.length) {
        out += '  ';
        i += 2;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Scan a single file for app.graphql( call sites. For each match, walk the
 * argument list with paren/brace/bracket and string-literal awareness to
 * extract top-level comma-separated args, then validate the 2nd arg.
 *
 * Returns an array of { line, col, reason } violation records.
 */
function scanFile(rawContent) {
  const content = stripComments(rawContent);
  const violations = [];
  const needle = 'app.graphql(';

  let searchStart = 0;
  while (true) {
    const idx = content.indexOf(needle, searchStart);
    if (idx < 0) break;
    searchStart = idx + needle.length;

    // Skip matches that are part of a longer identifier (e.g. inside a
    // string literal or a property access like `not.app.graphql`). Look
    // back one char.
    const prev = idx > 0 ? content[idx - 1] : '';
    if (/[A-Za-z0-9_$]/.test(prev)) continue;

    // Walk forward from after the opening `(`, balancing nesting and
    // tracking string-literal state, splitting at top-level commas.
    let pos = idx + needle.length;
    let depth = 1;
    const args = [];
    let buf = '';
    let inStr = null; // '"', "'", or '`'

    while (pos < content.length && depth > 0) {
      const ch = content[pos];

      if (inStr) {
        buf += ch;
        if (ch === '\\') {
          // Consume the escape's next char verbatim.
          if (pos + 1 < content.length) buf += content[pos + 1];
          pos += 2;
          continue;
        }
        if (ch === inStr) inStr = null;
        pos++;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch;
        buf += ch;
        pos++;
        continue;
      }

      if (ch === '(' || ch === '{' || ch === '[') {
        depth++;
        buf += ch;
      } else if (ch === ')' || ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) {
          args.push(buf.trim());
          buf = '';
          break;
        }
        buf += ch;
      } else if (ch === ',' && depth === 1) {
        args.push(buf.trim());
        buf = '';
      } else {
        buf += ch;
      }
      pos++;
    }

    // Compute 1-based line / column for the diagnostic.
    const before = content.slice(0, idx);
    const line = before.split('\n').length;
    const col = idx - before.lastIndexOf('\n');

    if (args.length < 2) {
      violations.push({
        line,
        col,
        reason: `app.graphql() called with ${args.length} arg(s); needs a context shape as the 2nd parameter`,
      });
      continue;
    }

    const secondArg = args[1];
    if (secondArg === 'undefined' || secondArg === 'null' || /^\{\s*\}$/.test(secondArg)) {
      violations.push({
        line,
        col,
        reason: `app.graphql() 2nd arg is "${secondArg}"; must be ctx (parent resolver scope), buildResolverContext(request), or an object literal naming engine`,
      });
    }
  }

  return violations;
}

let total = 0;
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const violations = scanFile(content);
  if (violations.length > 0) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    for (const v of violations) {
      console.error(`${rel}:${v.line}:${v.col}: ${v.reason}`);
      total++;
    }
  }
}

if (total > 0) {
  console.error('');
  console.error(
    `${total} app.graphql() context-arg violation(s). See cycles 0.7.5.0 / 0.7.6.0 / 0.7.6.1 ` +
    `for the regression family this rule prevents.`,
  );
  process.exit(1);
}
