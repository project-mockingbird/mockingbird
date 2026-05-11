// Probe whether /sitecore/templates/Branches and its children exist in
// the OOTB registry. Used to decide whether Branches/Project must be
// auto-created by the scaffolding orchestrator.
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';

const data = JSON.parse(gunzipSync(readFileSync('data/registry.json.gz')).toString());
const items = data.items || data;

const prefixes = [
  '/sitecore/templates/Branches',
  '/sitecore/system/Settings/Project',
];

for (const prefix of prefixes) {
  const hits = items
    .filter(it => it.path === prefix || it.path.startsWith(prefix + '/'))
    .map(it => `  ${it.id}  ${it.template}  ${it.path}`);
  console.log(`--- ${prefix} (${hits.length} items) ---`);
  console.log(hits.slice(0, 15).join('\n'));
  if (hits.length > 15) console.log(`  ...and ${hits.length - 15} more`);
}
