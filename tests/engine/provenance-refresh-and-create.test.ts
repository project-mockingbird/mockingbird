import { describe, it, expect, afterEach } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { refreshItem } from '../../src/engine/refresh-item.js';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';

const registryFixture = resolve(__dirname, '../../data/registry.json.gz');

// OOTB Template template (registry-backed) - used as the create templateId.
const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
const FOLDER_TEMPLATE_ID = '0437fee2-44c9-46a6-abe9-28858d9fee8c';

const Z_ID = 'cccc0000-0000-0000-0000-00000000000c';
const ETEST_ID = 'cccc0000-0000-0000-0000-00000000000e';
const DATA_ID = 'cccc0000-0000-0000-0000-00000000000d';

function yaml(id: string, parent: string, path: string): string {
  return `---
ID: "{${id.toUpperCase()}}"
Parent: "{${parent.toUpperCase()}}"
Template: "{${FOLDER_TEMPLATE_ID.toUpperCase()}}"
Path: ${path}
`;
}

function module(namespace: string): string {
  const isContent = namespace === 'C';
  return JSON.stringify({
    namespace,
    items: {
      path: 'serialization',
      includes: [
        {
          name: 'items',
          path: '/sitecore/content/test',
          // Consumer shape (fix 0863506): the authoring seed only owns the
          // node itself (SingleItem), the content layer owns the whole subtree
          // (ItemAndDescendants). So a deep descendant routes to content.
          scope: isContent ? 'ItemAndDescendants' : 'SingleItem',
          allowedPushOperations: isContent ? 'CreateUpdateAndDelete' : 'CreateOnly',
        },
      ],
    },
  });
}

/**
 * Two-layer workspace mirroring the consumer shape: an "authoring" layer
 * rooted at the workspace root and a "content" layer rooted at a NESTED
 * `migration/` subdirectory. Both includes cover `/sitecore/content/test`;
 * the content layer is stronger (CreateUpdateAndDelete) so it wins. The whole
 * content subtree (Z) lives in the content layer's files.
 *
 * Nested roots are the crux: a content file is under BOTH layer roots, so the
 * provenance derivation must pick the deeper (content) root by longest prefix.
 */
function buildWorkspace() {
  const ws = mkdtempSync(join(tmpdir(), 'mb-prov-rc-'));

  // Authoring layer at the workspace root (no items needed for this test).
  writeFileSync(join(ws, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(join(ws, 'a.module.json'), module('A'));
  mkdirSync(join(ws, 'serialization', 'items'), { recursive: true });

  // Content layer nested under migration/.
  const content = join(ws, 'migration');
  mkdirSync(join(content, 'serialization', 'items'), { recursive: true });
  writeFileSync(join(content, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
  writeFileSync(join(content, 'c.module.json'), module('C'));
  // Z exists at open time -> in the tree with content provenance.
  writeFileSync(
    join(content, 'serialization', 'items', 'Z.yml'),
    yaml(Z_ID, '00000000-0000-0000-0000-000000000000', '/sitecore/content/test/Z'),
  );

  return { ws, content };
}

let ws: string | null = null;
let engine: Engine | null = null;

afterEach(async () => {
  if (engine) { await engine.close(); engine = null; }
  if (ws) { rmSync(ws, { recursive: true, force: true }); ws = null; }
});

describe('provenance: refresh-surfaced and created items keep the correct layer (multi-layer, nested roots)', () => {
  it('refresh stamps a newly-surfaced subtree with the content layer (Bug 2), and a child created under it stays content, not the authoring fallback (Bug 3)', async () => {
    const built = buildWorkspace();
    ws = built.ws;
    // Mirror the consumer boot: startInit loads the registry (no rootDir), then
    // a multi-layer workspace is opened via boot-replay.
    engine = new Engine({ rootDir: undefined, watch: false, registryPath: registryFixture });
    await engine.startInit();
    await engine.readiness.ready();
    await engine.openWorkspace([
      { sitecoreJsonPath: join(built.ws, 'sitecore.json'), name: 'authoring' },
      { sitecoreJsonPath: join(built.content, 'sitecore.json'), name: 'content' },
    ]);

    // Z is present at open with content provenance (sanity).
    expect(engine.getItemProvenance(Z_ID)?.winnerLayer).toBe('content');

    // After open, e-test + Data land on the content layer's disk (as fix
    // 0863663 places new items), but NOT in the warm tree/cache yet.
    const itemsDir = join(built.content, 'serialization', 'items');
    mkdirSync(join(itemsDir, 'Z', 'e-test'), { recursive: true });
    writeFileSync(join(itemsDir, 'Z', 'e-test.yml'), yaml(ETEST_ID, Z_ID, '/sitecore/content/test/Z/e-test'));
    writeFileSync(join(itemsDir, 'Z', 'e-test', 'Data.yml'), yaml(DATA_ID, ETEST_ID, '/sitecore/content/test/Z/e-test/Data'));

    // Before refresh they are absent.
    expect(engine.getItemById(ETEST_ID)).toBeUndefined();

    // Refresh surfaces them.
    await refreshItem(engine, { itemId: Z_ID });
    expect(engine.getItemById(ETEST_ID)).toBeDefined();
    expect(engine.getItemById(DATA_ID)).toBeDefined();

    // Bug 2: refreshed items must carry provenance (the content layer), not null.
    expect(engine.getItemProvenance(ETEST_ID)?.winnerLayer).toBe('content');
    expect(engine.getItemProvenance(DATA_ID)?.winnerLayer).toBe('content');

    // Bug 3: a child created under the (content) Data must be stamped content -
    // its file lives under the content root - NOT the authoring layer (_layers[0]).
    const res = await engine.insertItem({ parentId: DATA_ID, templateId: TEMPLATE_TEMPLATE_ID, name: 'IFrame Content' });
    expect(engine.getItemProvenance(res.rootItemId)?.winnerLayer).toBe('content');
  });
});
