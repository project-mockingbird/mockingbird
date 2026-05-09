import { promises as fs } from 'node:fs';
import zlib from 'node:zlib';

const buf = await fs.readFile('./data/registry.json.gz');
const json = JSON.parse(zlib.gunzipSync(buf).toString('utf-8'));

const JSSTENANT_ID = 'b91811f1-fa8b-47f8-b131-bd2c6d5ec805';
const JSSSITE_ID = '9ed66404-64c9-4122-90e1-869cb3cea566';
const JSSSETTINGS_ID = 'ec848505-d30c-4bdc-a0aa-7cc9d320085e';
const JSSSITEDEF_ID = 'e46f3af2-39fa-4866-a157-7017c4b2a40c';

const TEMPLATE_FIELD_TPL = '455a3e98-a627-4b40-8035-e683a0331ac7';

function descendants(rootId) {
  const out = [];
  const stack = [rootId.toLowerCase()];
  while (stack.length) {
    const id = stack.pop();
    const children = json.items.filter(i => (i.parent ?? '').toLowerCase() === id);
    for (const c of children) {
      out.push(c);
      stack.push(c.id.toLowerCase());
    }
  }
  return out;
}

function listTemplateFields(rootId, label) {
  console.log(`\n--- ${label} (${rootId}) field children ---`);
  const all = descendants(rootId);
  const fields = all.filter(i => (i.template ?? '').toLowerCase() === TEMPLATE_FIELD_TPL);
  for (const f of fields) {
    const sectionPath = f.path.split('/').slice(-2, -1)[0];
    console.log(`${f.id}  [${sectionPath}]  ${f.path.split('/').pop()}`);
  }
}

listTemplateFields(JSSTENANT_ID, 'JSSTenant');
listTemplateFields(JSSSITE_ID, 'JSSSite');
listTemplateFields(JSSSETTINGS_ID, 'JSSSettings');
listTemplateFields(JSSSITEDEF_ID, 'JSSSiteDefinition');
