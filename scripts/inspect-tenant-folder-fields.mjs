import { promises as fs } from 'node:fs';
import zlib from 'node:zlib';

const buf = await fs.readFile('./data/registry.json.gz');
const json = JSON.parse(zlib.gunzipSync(buf).toString('utf-8'));

const TEMPLATE_FIELD_TPL = '455a3e98-a627-4b40-8035-e683a0331ac7';

const targetNames = new Set([
  'PlaceholderSettingsFolder',
  'RenderingsFolder',
  'BranchesFolder',
  'SettingsFolder',
  'TemplatesFolder',
  'MediaLibrary',
  'Modules',
  'Templates',
  'SharedMediaLibrary',
  'SiteTemplate',
  'SiteName',
  'StartItem',
  'HostName',
  'VirtualFolder',
  'Language',
  'Environment',
  'POS',
  'GenerateThumbnails',
]);

console.log('--- Field-template items whose leaf name is one of the targets ---');
for (const it of json.items) {
  if ((it.template ?? '').toLowerCase() !== TEMPLATE_FIELD_TPL) continue;
  const leaf = it.path.split('/').pop();
  if (!targetNames.has(leaf)) continue;
  console.log(`${it.id}  ${it.path}`);
}
