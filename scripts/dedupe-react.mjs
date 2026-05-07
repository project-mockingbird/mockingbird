#!/usr/bin/env node
// Removes the duplicate React copy that npm install creates under
// src/web/node_modules. The root install (devDependencies in
// package.json) is the single canonical copy. Without this, vitest
// + jsdom render the web Dialog primitive against a second React,
// triggering "Invalid hook call" in radix-ui internals.
//
// Why a script instead of resolve.alias / dedupe?
// - Vite's resolve.alias doesn't reach into `.tsx` files inside
//   node_modules that radix-ui exposes via its `source` field.
// - npm 7+ auto-installs peerDependencies, so declaring react/react-dom
//   as peers in src/web/package.json doesn't actually keep them out.
// - The web build still works fine: vite walks up to root node_modules
//   for react when src/web/node_modules/react is absent.

import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const targets = [
  path.join(root, 'src', 'web', 'node_modules', 'react'),
  path.join(root, 'src', 'web', 'node_modules', 'react-dom'),
];

let removed = 0;
for (const target of targets) {
  if (existsSync(target)) {
    await rm(target, { recursive: true, force: true });
    console.log(`[dedupe-react] removed ${path.relative(root, target)}`);
    removed += 1;
  }
}
if (removed === 0) console.log('[dedupe-react] no duplicates - skipping');
