import { promises as fs } from 'node:fs';
import zlib from 'node:zlib';

const buf = await fs.readFile('./data/registry.json.gz');
const json = JSON.parse(zlib.gunzipSync(buf).toString('utf-8'));

// Get template IDs for the action types - these are TEMPLATE items under
// /sitecore/templates/Foundation/Experience Accelerator/Scaffolding/Actions/
// and Foundation/JSS Experience Accelerator/Scaffolding/Actions/ for JSS variants.
const actionTemplatePaths = [
  '/sitecore/templates/Foundation/Experience Accelerator/Scaffolding/Actions/Base/AddItem',
  '/sitecore/templates/Foundation/Experience Accelerator/Scaffolding/Actions/Base/EditTenantTemplate',
  '/sitecore/templates/Foundation/Experience Accelerator/Scaffolding/Actions/Base/EditSiteItem',
  '/sitecore/templates/Foundation/Experience Accelerator/Scaffolding/Actions/Base/ExecuteScript',
  '/sitecore/templates/Foundation/JSS Experience Accelerator/Scaffolding/Actions/Tenant/EditTenantTemplate',
  '/sitecore/templates/Foundation/JSS Experience Accelerator/Scaffolding/Actions/Tenant/AddItem',
  '/sitecore/templates/Foundation/JSS Experience Accelerator/Scaffolding/Actions/Site/AddItem',
  '/sitecore/templates/Foundation/JSS Experience Accelerator/Scaffolding/Actions/Site/EditSiteItem',
  '/sitecore/templates/Foundation/JSS Experience Accelerator/Scaffolding/Actions/Site/ExecuteScript',
  '/sitecore/templates/Foundation/JSS Experience Accelerator/Scaffolding/Actions/Tenant/ExecuteScript',
];
console.log('--- Action template IDs ---');
for (const p of actionTemplatePaths) {
  const item = json.items.find(i => i.path === p);
  console.log(`${item?.id ?? 'NOT FOUND'}  ${p}`);
}

// Field IDs - the actual field-definition items at
// .../Actions/Base/<Action>/_<FieldGroup>/Action/<FieldName>
const fieldPaths = [
  '/sitecore/templates/Foundation/Experience Accelerator/Scaffolding/Actions/Base/AddItem/_Name/Action/Name',
  '/sitecore/templates/Foundation/Experience Accelerator/Scaffolding/Actions/Base/AddItem/_Template/Action/Template',
  '/sitecore/templates/Foundation/Experience Accelerator/Scaffolding/Actions/Base/AddItem/_Fields/Action/Fields',
  '/sitecore/templates/Foundation/Experience Accelerator/Scaffolding/Actions/Base/EditTenantTemplate/_EditType/Action/EditType',
  '/sitecore/templates/Foundation/Experience Accelerator/Scaffolding/Actions/Base/EditTenantTemplate/_Arguments/Action/Arguments',
  '/sitecore/templates/Foundation/Experience Accelerator/Scaffolding/Actions/Base/EditSiteItem/_EditType/Action/EditType',
  '/sitecore/templates/Foundation/Experience Accelerator/Scaffolding/Actions/Base/EditSiteItem/_Arguments/Action/Arguments',
];
console.log('\n--- Action field IDs ---');
for (const p of fieldPaths) {
  const item = json.items.find(i => i.path === p);
  console.log(`${item?.id ?? 'NOT FOUND'}  ${p}`);
}

// Also probe AddItem _Location and ExecuteScript _Script if they exist
const probePaths = json.items
  .filter(i => i.path.includes('/Scaffolding/Actions/Base/') && i.path.split('/').pop() && /^[A-Z]/.test(i.path.split('/').pop()) && !i.path.endsWith('/Action'))
  .map(i => i.path)
  .filter(p => p.endsWith('/Location') || p.endsWith('/Script') || p.endsWith('/Template') || p.endsWith('/Name') || p.endsWith('/Fields') || p.endsWith('/EditType') || p.endsWith('/Arguments'));
console.log('\n--- Probe field paths under Actions/Base ---');
for (const p of probePaths) {
  const item = json.items.find(i => i.path === p);
  console.log(`${item?.id ?? '?'}  ${p}`);
}
