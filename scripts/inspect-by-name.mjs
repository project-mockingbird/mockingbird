// Quick name-search across the registry.
// Usage: node scripts/inspect-by-name.mjs "JSS Site Folder"
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';

const data = JSON.parse(gunzipSync(readFileSync('data/registry.json.gz')).toString());
const items = data.items || data;
const needle = (process.argv.slice(2).join(' ') || '').toLowerCase();
if (!needle) { console.error('usage: node inspect-by-name.mjs <name>'); process.exit(1); }

for (const it of items) {
  if ((it.name || '').toLowerCase() === needle) {
    console.log(`${it.id}  db=${it.database}  template=${it.template}  ${it.path}`);
  }
}
