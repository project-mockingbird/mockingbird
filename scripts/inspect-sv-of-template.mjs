// Inspect __Standard Values of a given template item: lists every shared
// AND versioned field with its value.
//
// Usage: node scripts/inspect-sv-of-template.mjs <templateId>
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';

const data = JSON.parse(gunzipSync(readFileSync('data/registry.json.gz')).toString());
const items = data.items || data;
const byId = new Map(items.map(it => [it.id.toLowerCase(), it]));
const childrenOf = new Map();
for (const it of items) {
  const p = (it.parent || '').toLowerCase();
  if (!p) continue;
  if (!childrenOf.has(p)) childrenOf.set(p, []);
  childrenOf.get(p).push(it);
}

const templateId = (process.argv[2] || '').toLowerCase();
if (!templateId) { console.error('usage: node inspect-sv-of-template.mjs <templateId>'); process.exit(1); }

const tpl = byId.get(templateId);
if (!tpl) { console.error(`Template not found: ${templateId}`); process.exit(1); }
console.log(`Template: ${tpl.path} (${tpl.id}) db=${tpl.database}`);

const kids = childrenOf.get(templateId) || [];
const sv = kids.find(c => c.name === '__Standard Values');
if (!sv) {
  console.log('  NO __Standard Values child item');
  process.exit(0);
}
console.log(`  __Standard Values: ${sv.id}`);

console.log('  Shared fields:');
for (const [id, val] of Object.entries(sv.sharedFields ?? {})) {
  const trim = typeof val === 'string' && val.length > 200 ? val.slice(0, 200) + '...' : val;
  console.log(`    ${id} = ${trim}`);
}

for (const lang of sv.languages ?? []) {
  for (const ver of lang.versions ?? []) {
    console.log(`  Versioned (${lang.language} v${ver.version}):`);
    for (const [id, val] of Object.entries(ver.fields ?? {})) {
      const trim = typeof val === 'string' && val.length > 200 ? val.slice(0, 200) + '...' : val;
      console.log(`    ${id} = ${trim}`);
    }
  }
}
