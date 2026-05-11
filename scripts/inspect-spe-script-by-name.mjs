// Find an SPE script item by name (case-insensitive) and dump every long
// string-shaped field on it. Lets us pull Add-JSSTenant.ps1 (or any sibling
// like Add-JSSTenantFolder) out of the registry for line-by-line reading.
//
// Usage: node scripts/inspect-spe-script-by-name.mjs Add-JSSTenant
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';

const needle = (process.argv[2] || 'Add-JSSTenant').toLowerCase();
const data = JSON.parse(gunzipSync(readFileSync('data/registry.json.gz')).toString());
const items = data.items || data;

const matches = items.filter(it => {
  const name = (it.name || it.path?.split('/').pop() || '').toLowerCase();
  return name.includes(needle);
});

console.log(`Found ${matches.length} item(s) matching "${needle}":`);
for (const it of matches) {
  console.log(`\n========== ${it.path} (id ${it.id}, template ${it.template}) ==========`);
  // Shared fields
  const shared = it.sharedFields || {};
  for (const [k, v] of Object.entries(shared)) {
    if (typeof v === 'string' && v.length > 80) {
      console.log(`-- shared field ${k} (${v.length} chars) --`);
      console.log(v);
    }
  }
  // Versioned fields
  for (const lang of (it.languages || [])) {
    for (const ver of (lang.versions || [])) {
      for (const [k, v] of Object.entries(ver.fields || {})) {
        if (typeof v === 'string' && v.length > 80) {
          console.log(`-- versioned field ${k} (lang=${lang.language} v=${ver.version}, ${v.length} chars) --`);
          console.log(v);
        }
      }
    }
  }
}
