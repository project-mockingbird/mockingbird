// Find the JSS Experience Accelerator folder templates that Add-JSSTenant.ps1
// uses for per-tenant cross-cutting folders. Reports template ID, path, and
// whether it's a template item (template-of-template = 'AB86861A-...').
//
// Usage: node scripts/inspect-folder-templates.mjs
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';

const TEMPLATE_TPL = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
const data = JSON.parse(gunzipSync(readFileSync('data/registry.json.gz')).toString());
const items = data.items || data;

const wanted = new Set([
  '/sitecore/templates/Foundation/JSS Experience Accelerator/Multisite/Folders/Placeholder Settings Folder',
  '/sitecore/templates/Foundation/JSS Experience Accelerator/Multisite/Folders/Rendering Folder',
  '/sitecore/templates/Foundation/JSS Experience Accelerator/Multisite/Folders/Branches Folder',
  '/sitecore/templates/Foundation/JSS Experience Accelerator/Multisite/Folders/Settings Folder',
  '/sitecore/templates/Foundation/Experience Accelerator/Multisite/Project Folder',
]);

console.log('--- Folder templates referenced by Add-JSSTenant.ps1 ---');
const found = new Set();
for (const it of items) {
  if (wanted.has(it.path)) {
    const isTemplate = (it.template || '').toLowerCase() === TEMPLATE_TPL;
    console.log(`${it.id}  ${isTemplate ? '[TEMPLATE]' : `[template=${it.template}]`}  ${it.path}`);
    found.add(it.path);
  }
}
for (const w of wanted) {
  if (!found.has(w)) console.log(`MISSING: ${w}`);
}
