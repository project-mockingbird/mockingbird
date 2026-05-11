// Resolve a template's effective insert options by walking its base
// template chain looking for __Masters (B0BF8442-6F77-4F46-A99D-E15F00A3E1F7)
// on each template's Standard Values.
//
// Usage: node scripts/inspect-template-insert-options.mjs <templateId>
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';

const TEMPLATE_TPL = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
const STANDARD_VALUES_NAME = '__Standard Values';
const MASTERS_FIELD = 'b0bf8442-6f77-4f46-a99d-e15f00a3e1f7';
const BASE_TEMPLATE_FIELD = '12c33f3f-86c5-43a5-aeb4-5598cec45116';

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

function getField(item, fieldId) {
  const f = (item.sharedFields ?? {})[fieldId] ?? (item.sharedFields ?? {})[fieldId.toLowerCase()];
  if (f !== undefined) return f;
  for (const lang of (item.languages || [])) {
    for (const ver of (lang.versions || [])) {
      const v = (ver.fields ?? {})[fieldId] ?? (ver.fields ?? {})[fieldId.toLowerCase()];
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

function findStandardValues(templateId) {
  const kids = childrenOf.get(templateId.toLowerCase()) || [];
  return kids.find(c => c.name === STANDARD_VALUES_NAME);
}

function getBaseTemplates(templateId) {
  const t = byId.get(templateId.toLowerCase());
  if (!t) return [];
  const f = getField(t, BASE_TEMPLATE_FIELD);
  if (!f) return [];
  return f.split('|').map(s => s.trim()).filter(Boolean);
}

const targetId = (process.argv[2] || '').toLowerCase();
if (!targetId) {
  console.error('usage: node inspect-template-insert-options.mjs <templateId>');
  process.exit(1);
}

const target = byId.get(targetId);
if (!target) {
  console.error(`Template not in registry: ${targetId}`);
  process.exit(1);
}
console.log(`Resolving insert options for template: ${target.path} (${target.id}) db=${target.database}`);
console.log('');

const seen = new Set();
const queue = [targetId];
while (queue.length) {
  const id = queue.shift();
  if (seen.has(id)) continue;
  seen.add(id);
  const t = byId.get(id);
  if (!t) continue;
  const sv = findStandardValues(id);
  if (sv) {
    const masters = getField(sv, MASTERS_FIELD);
    if (masters) {
      console.log(`--- Standard Values for ${t.path} has __Masters ---`);
      for (const mid of masters.split('|').map(s => s.trim()).filter(Boolean)) {
        const m = byId.get(mid.toLowerCase()) || byId.get(mid.replace(/[{}]/g, '').toLowerCase());
        const display = m ? `${m.path} (${m.template})` : '(unresolved)';
        console.log(`    ${mid} -> ${display}`);
      }
    }
  }
  for (const base of getBaseTemplates(id)) queue.push(base.toLowerCase());
}
