import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import zlib from 'node:zlib';

const buf = await fs.readFile('./data/registry.json.gz');
const json = JSON.parse(zlib.gunzipSync(buf).toString('utf-8'));
console.log('Registry items:', json.items.length);

const templates = {
  TenantSetup: '141df88e-7156-4d2e-a004-c8c1a7c51e9d',
  SiteSetup: '292ccfcd-7790-4692-856b-76014b8038e7',
  HeadlessTenantSetup: 'f036b5e0-37fb-4537-9d36-ef84e5bd41b7',
  HeadlessSiteSetup: 'bed31d6f-d968-45a9-b54e-12d7f977d861',
  TenantSetupRoot: 'a3a8d75b-fc54-4cd3-94f3-91f5e3e5fa27', // approximate; will probe
  SiteSetupRoot: '74af5db0-9f0d-4b1e-a86a-2c3deb01c7e3', // approximate
};

const buckets = Object.fromEntries(Object.keys(templates).map(k => [k, []]));
for (const item of json.items) {
  for (const [name, id] of Object.entries(templates)) {
    if ((item.template || '').toLowerCase() === id) buckets[name].push(item);
  }
}
for (const [name, list] of Object.entries(buckets)) {
  console.log(`\n--- ${name}: ${list.length} ---`);
  for (const item of list.slice(0, 30)) {
    console.log(`  ${item.path}`);
  }
}
