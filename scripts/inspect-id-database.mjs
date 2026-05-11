// Probe whether registry items expose a `database` field, then show
// db-by-db breakdown for the Project roots used by SXA scaffolding.
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';

const data = JSON.parse(gunzipSync(readFileSync('data/registry.json.gz')).toString());
const items = data.items || data;

const sample = items[0];
console.log(`Sample item top-level keys: ${Object.keys(sample).join(', ')}`);
console.log(`Total items: ${items.length}`);
console.log('');

const targets = new Set([
  '825b30b4-b40b-422e-9920-23a1b6bda89c',
  'fdcc1875-89ce-424f-b23e-3c0b1be0ae5b',
  '90ae357f-6171-4ea9-808c-5600b678f726',
  'f5f0fbe3-61ad-4967-a5d8-8d760331d6a1',
  '1995806f-0a84-42b5-93b0-88f0e2ff872c',
  '0af56f64-b5d7-473f-9497-1dc19265e494',
]);

for (const it of items) {
  if (targets.has((it.id || '').toLowerCase())) {
    console.log(`id=${it.id} db=${it.database ?? '(no db field)'} path=${it.path}`);
  }
}

console.log('\n--- database value distribution across all registry items ---');
const dbCounts = {};
for (const it of items) {
  const db = it.database ?? '(unset)';
  dbCounts[db] = (dbCounts[db] ?? 0) + 1;
}
for (const [db, n] of Object.entries(dbCounts)) console.log(`  ${db}: ${n}`);
