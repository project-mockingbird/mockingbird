import { promises as fs } from 'node:fs';
import zlib from 'node:zlib';

const buf = await fs.readFile('./data/registry.json.gz');
const json = JSON.parse(zlib.gunzipSync(buf).toString('utf-8'));

// SXA Multisite Metadata template - if it exists, has child fields _Name and _Description
// Search by name pattern.
const candidates = json.items.filter(i =>
  i.path.toLowerCase().includes('metadata') &&
  i.path.toLowerCase().includes('foundation') &&
  i.path.toLowerCase().includes('multisite')
);
console.log('Multisite-Metadata templates:', candidates.length);
for (const c of candidates) {
  console.log(`  ${c.path}  template=${c.template}`);
}

// Also search for items literally named '_Name' or '_Description' under templates.
const nameDescItems = json.items.filter(i => {
  const n = i.name.toLowerCase();
  return (n === '_name' || n === '_description') && i.path.includes('/templates/');
});
console.log('\n_Name / _Description template items (all):', nameDescItems.length);
for (const i of nameDescItems.slice(0, 30)) {
  console.log(`  ${i.path}`);
}
