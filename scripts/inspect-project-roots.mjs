// Audit the 5+ Project root paths used by SXA Headless scaffolding for
// duplicate-id collisions in the OOTB registry. Reports id, template,
// and a marker for each candidate at each known Project path.
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';

const data = JSON.parse(gunzipSync(readFileSync('data/registry.json.gz')).toString());
const items = data.items || data;

const paths = [
  '/sitecore/templates/Project',
  '/sitecore/media library/Project',
  '/sitecore/layout/Placeholder Settings/Project',
  '/sitecore/layout/Renderings/Project',
  '/sitecore/system/Settings/Project',
  '/sitecore/templates/Branches/Project',
];

// SPE script's canonical IDs (Add-JSSTenant.ps1 lines 50-55).
const speCanonical = {
  '/sitecore/templates/Project': '825b30b4-b40b-422e-9920-23a1b6bda89c',
  '/sitecore/media library/Project': '90ae357f-6171-4ea9-808c-5600b678f726',
  '/sitecore/layout/Placeholder Settings/Project': 'f5f0fbe3-61ad-4967-a5d8-8d760331d6a1',
  '/sitecore/layout/Renderings/Project': '1995806f-0a84-42b5-93b0-88f0e2ff872c',
  '/sitecore/system/Settings/Project': '0af56f64-b5d7-473f-9497-1dc19265e494',
  '/sitecore/templates/Branches/Project': 'a1f6469d-16e1-4a5f-9e49-1aad869a5d11',
};

for (const path of paths) {
  const hits = items.filter(it => it.path === path);
  const canonical = speCanonical[path];
  console.log(`--- ${path} (${hits.length} hits in registry; SPE canonical=${canonical}) ---`);
  for (const it of hits) {
    const marker = it.id.toLowerCase() === canonical.toLowerCase() ? '  <- CANONICAL' : '';
    console.log(`  id=${it.id} template=${it.template}${marker}`);
  }
  if (hits.length === 0) console.log('  (none)');
}
