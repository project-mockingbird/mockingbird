#!/usr/bin/env node
// Content tree field-usage scanner.
//
// Given one or more Sitecore field-type names (e.g. "TreelistEx",
// "Name Value List"), find every content YAML across SCS_ROOT and
// SCS_CONTENT_ROOT that has a non-empty value on a field declared
// as that type in the OOTB registry.
//
// Usage:
//   node scripts/scan-field-usages.mjs "TreelistEx" "Name Value List"
//
// Roots default to ./serialization/items and ./content/items relative
// to the current working directory; override with SCS_ROOT and
// SCS_CONTENT_ROOT env vars (which the rest of the project respects
// too). Registry path defaults to ./data/registry.json.
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = [
  path.join(process.env.SCS_ROOT ?? '.', 'serialization', 'items'),
  path.join(process.env.SCS_CONTENT_ROOT ?? './content', 'items'),
];
const REG = process.env.MOCKINGBIRD_REGISTRY ?? path.join('data', 'registry.json');
const TYPE_FID = 'ab162cc0-dc80-4abf-8871-998ee5d7ba32';

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: node scripts/scan-field-usages.mjs "<FieldType>" ["<FieldType>" ...]');
  process.exit(1);
}
const targetSet = new Set(targets.map(t => t.toLowerCase()));

if (!fs.existsSync(REG)) {
  console.error(`Registry not found at ${REG}. Set MOCKINGBIRD_REGISTRY to override.`);
  process.exit(1);
}
const reg = JSON.parse(fs.readFileSync(REG, 'utf-8'));

const fieldIdToType = new Map();
const fieldIdToPath = new Map();
for (const item of reg.items) {
  const t = item.sharedFields?.[TYPE_FID];
  if (!t || !targetSet.has(t.toLowerCase())) continue;
  const fid = item.id.toLowerCase().replace(/[{}]/g, '');
  fieldIdToType.set(fid, t);
  fieldIdToPath.set(fid, item.path);
}
console.log(`Scanning ${fieldIdToType.size} field IDs across ${ROOTS.length} root(s)...`);

const usages = new Map();
function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name.endsWith('.yml')) {
      let content;
      try { content = fs.readFileSync(p, 'utf-8'); } catch { continue; }
      const norm = content.toLowerCase().replace(/[{}]/g, '');
      for (const fid of fieldIdToType.keys()) {
        if (norm.includes(fid)) {
          if (!usages.has(fid)) usages.set(fid, []);
          usages.get(fid).push(p);
        }
      }
    }
  }
}
for (const r of ROOTS) walk(r);

const byType = new Map();
for (const [fid, files] of usages.entries()) {
  const t = fieldIdToType.get(fid);
  if (!byType.has(t)) byType.set(t, []);
  byType.get(t).push({ fid, files, declPath: fieldIdToPath.get(fid) });
}

for (const target of targets) {
  const entries = byType.get(target) ?? [];
  const totalFiles = entries.reduce((a, e) => a + e.files.length, 0);
  console.log(`\n=== ${target}: ${entries.length} field(s) referenced, ${totalFiles} file(s) ===`);
  if (entries.length === 0) { console.log('  (none)'); continue; }
  for (const e of entries.sort((a, b) => b.files.length - a.files.length)) {
    console.log(`  [${e.fid}]  ${e.declPath}`);
    console.log(`    -> ${e.files.length} usage(s):`);
    for (const f of e.files.slice(0, 6)) console.log(`       ${f.split(path.sep).join('/')}`);
    if (e.files.length > 6) console.log(`       ... and ${e.files.length - 6} more`);
  }
}
