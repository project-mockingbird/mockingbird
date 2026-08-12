import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { cpSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');
const ICON_FIELD = '06d5295c-ed2f-4a54-9bf2-26228d113318';
// 1x1 transparent PNG (same fixture bytes used by tests/api/icons.test.ts).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

// The fixture's real serialized templates root (tests/fixtures/valid/authoring/items/templates/TemplatesRoot.yml).
// Used to bridge a synthetic registry root onto the real serialized subtree
// (see registry cross-ref notes below) so a single /api/tree call surfaces
// both a 'serialized' node (the fixture's real templates) and a 'registry'
// node (synthetic, no serialized counterpart), matching how mixed
// registry+serialized corpora behave in production.
const TEMPLATES_ROOT_ID = '3c1715fe-6a13-4fcf-0000-000000000001';
const TEMPLATE_FOLDER_TEMPLATE_ID = '0437fee2-44c9-46a6-abe9-28858d9fee8c';
const REGISTRY_ONLY_ID = '99999999-0000-0000-0000-000000000099';
const NULL_GUID = '00000000-0000-0000-0000-000000000000';

interface TreeNodeLite { id: string; source: string; children?: TreeNodeLite[] }
function findBySource(nodes: TreeNodeLite[], source: string): TreeNodeLite | undefined {
  for (const n of nodes) {
    if (n.source === source) return n;
    const hit = n.children ? findBySource(n.children, source) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

describe('POST /api/items/:id/icon', () => {
  let app: FastifyInstance;
  let tempDir: string;
  const savedSwitch = process.env.MOCKINGBIRD_ICONS;
  const savedRoot = process.env.MOCKINGBIRD_ICON_ROOT;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'scp-seticon-'));
    cpSync(FIXTURES, tempDir, { recursive: true });

    // Bake a tiny icon set so iconsEnabled() is true (mirrors tests/api/icons.test.ts).
    const iconRoot = resolve(tempDir, 'sitecore-icons');
    await mkdir(resolve(iconRoot, 'Office/32x32'), { recursive: true });
    await writeFile(resolve(iconRoot, 'Office/32x32/folder.png'), PNG_1x1);
    process.env.MOCKINGBIRD_ICON_ROOT = iconRoot;
    process.env.MOCKINGBIRD_ICONS = '1';

    // Ad-hoc registry (mirrors tests/api/routes/tree-insertable.test.ts): one
    // root item id-matches the fixture's real serialized templates root (so
    // /api/tree defers to the real serialized subtree there - see
    // buildRegistryNode's id-match short-circuit in src/api/routes/tree.ts),
    // and one independent root with no serialized counterpart at all.
    const registryPath = resolve(tempDir, 'registry.json');
    await writeFile(registryPath, JSON.stringify({
      version: '1.0',
      source: 'test',
      extractedAt: new Date().toISOString(),
      items: [
        {
          id: TEMPLATES_ROOT_ID,
          name: 'templates',
          parent: NULL_GUID,
          template: TEMPLATE_FOLDER_TEMPLATE_ID,
          path: '/sitecore/templates',
          database: 'master',
          sharedFields: {},
        },
        {
          id: REGISTRY_ONLY_ID,
          name: 'system',
          parent: NULL_GUID,
          template: TEMPLATE_FOLDER_TEMPLATE_ID,
          path: '/sitecore/system',
          database: 'master',
          sharedFields: {},
        },
      ],
    }));

    const result = await createServer({ rootDir: tempDir, registryPath });
    app = result.app;
    await result.engine.readiness.ready();
  });
  afterEach(async () => {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
    if (savedSwitch === undefined) delete process.env.MOCKINGBIRD_ICONS; else process.env.MOCKINGBIRD_ICONS = savedSwitch;
    if (savedRoot === undefined) delete process.env.MOCKINGBIRD_ICON_ROOT; else process.env.MOCKINGBIRD_ICON_ROOT = savedRoot;
  });

  async function tree(): Promise<TreeNodeLite[]> {
    const res = await app.inject({ method: 'GET', url: '/api/tree?depth=6&db=master' });
    return res.json() as TreeNodeLite[];
  }

  it('writes __Icon as a shared field on a serialized item', async () => {
    const target = findBySource(await tree(), 'serialized');
    expect(target).toBeDefined();
    const res = await app.inject({
      method: 'POST', url: `/api/items/${target!.id}/icon`,
      payload: { icon: 'Office/32x32/folder.png' },
    });
    expect(res.statusCode).toBe(200);
    const detail = res.json() as { sharedFields: Array<{ id: string; value: string }> };
    const written = detail.sharedFields.find(f => f.id.toLowerCase() === ICON_FIELD);
    expect(written?.value).toBe('Office/32x32/folder.png');
  });

  it('400s an empty icon', async () => {
    const target = findBySource(await tree(), 'serialized');
    const res = await app.inject({ method: 'POST', url: `/api/items/${target!.id}/icon`, payload: { icon: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('400s a registry-only item', async () => {
    const reg = findBySource(await tree(), 'registry');
    expect(reg).toBeDefined();
    const res = await app.inject({ method: 'POST', url: `/api/items/${reg!.id}/icon`, payload: { icon: 'Office/32x32/folder.png' } });
    expect(res.statusCode).toBe(400);
  });

  it('404s an unknown id', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/items/deadbeef-0000-0000-0000-000000000000/icon', payload: { icon: 'Office/32x32/x.png' } });
    expect(res.statusCode).toBe(404);
  });

  it('404s when the switch is off', async () => {
    process.env.MOCKINGBIRD_ICONS = '0';
    const target = findBySource(await tree(), 'serialized');
    const res = await app.inject({ method: 'POST', url: `/api/items/${target!.id}/icon`, payload: { icon: 'Office/32x32/folder.png' } });
    expect(res.statusCode).toBe(404);
  });
});
