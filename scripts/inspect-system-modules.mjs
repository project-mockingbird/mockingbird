import { promises as fs } from 'node:fs';
import zlib from 'node:zlib';

const buf = await fs.readFile('./data/registry.json.gz');
const json = JSON.parse(zlib.gunzipSync(buf).toString('utf-8'));

const HEADLESS_TENANT_SETUP = 'f036b5e0-37fb-4537-9d36-ef84e5bd41b7';
const FIELD_IS_SYSTEM_MODULE = '06d2c562-9229-4779-8807-e2a5fd2990d4';
const FIELD_INCLUDE_BY_DEFAULT = '11488836-d40f-40d4-beb4-1d31da7b1470';

console.log('--- HeadlessTenantSetup items: IsSystemModule + IncludeByDefault flags ---');
for (const it of json.items) {
  if ((it.template ?? '').toLowerCase() !== HEADLESS_TENANT_SETUP) continue;
  const fields = it.sharedFields ?? {};
  const isSys = fields[FIELD_IS_SYSTEM_MODULE] ?? '';
  const incDef = fields[FIELD_INCLUDE_BY_DEFAULT] ?? '';
  const allFieldsCount = Object.keys(fields).length;
  const childCount = json.items.filter(c => (c.parent ?? '').toLowerCase() === it.id.toLowerCase()).length;
  console.log(`${it.path.split('/').pop().padEnd(50)}  isSys=${isSys || '-'}  incDef=${incDef || '-'}  fields=${allFieldsCount}  children=${childCount}`);
}
