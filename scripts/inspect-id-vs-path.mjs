// Look up registry items by id AND by path. Helps detect duplicates where
// two distinct ids both claim the same path.
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';

const data = JSON.parse(gunzipSync(readFileSync('data/registry.json.gz')).toString());
const items = data.items || data;

const targetIds = new Set((process.argv.slice(2)).map(s => s.toLowerCase()));
const targetPath = '/sitecore/templates/Project';

console.log(`--- registry items with id in ${[...targetIds].join(', ')} ---`);
for (const it of items) {
  if (targetIds.has((it.id || '').toLowerCase())) {
    console.log(`  id=${it.id} path=${it.path} template=${it.template} name=${it.name}`);
  }
}

console.log(`\n--- registry items at path ${targetPath} (exact match) ---`);
for (const it of items) {
  if (it.path === targetPath) {
    console.log(`  id=${it.id} path=${it.path} template=${it.template} name=${it.name}`);
  }
}
