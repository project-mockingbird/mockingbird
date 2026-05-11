import { promises as fs } from 'node:fs';
import zlib from 'node:zlib';

const buf = await fs.readFile('./data/registry.json.gz');
const json = JSON.parse(zlib.gunzipSync(buf).toString('utf-8'));

const targets = [
  '/sitecore/templates/Foundation/JSS Experience Accelerator/Multisite/Base/Sites/_Name/Metadata/Name',
  '/sitecore/templates/Foundation/JSS Experience Accelerator/Multisite/Base/Sites/_Description/Metadata/Description',
];

for (const path of targets) {
  const item = json.items.find(i => i.path === path);
  if (!item) {
    console.log('NOT FOUND:', path);
    continue;
  }
  console.log(`${path}`);
  console.log(`  field id: ${item.id}`);
  console.log(`  template: ${item.template}`);
}
