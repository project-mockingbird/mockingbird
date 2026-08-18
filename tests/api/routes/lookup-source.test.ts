/**
 * Route-level test for /api/lookup-source: the `kind` query param must map to
 * the engine's flat-select (matched-node) semantics for Droplink/Droplist,
 * while omitting it (or a tree-rooted kind) keeps the child-descent default.
 *
 * Uses a stub Engine (Object.create + ItemTree) registered on a bare Fastify
 * instance - the route logic under test is just the param plumbing, so no
 * on-disk fixture is needed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Engine } from '../../../src/engine/index.js';
import { ItemTree } from '../../../src/engine/tree.js';
import type { ScsItem } from '../../../src/engine/types.js';
import { registerLookupSourceRoutes } from '../../../src/api/routes/lookup-source.js';

const NULL_GUID = '00000000-0000-0000-0000-000000000000';
const SITE_TPL = 'cccccccc-cccc-cccc-cccc-000000000003';
const SECTION_FOLDER_TPL = 'dddddddd-dddd-dddd-dddd-000000000004';
const GROUP_FOLDER_TPL = 'eeeeeeee-eeee-eeee-eeee-000000000005';

function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return { parent: NULL_GUID, template: NULL_GUID, sharedFields: [], languages: [], ...overrides };
}

function buildEngine(): { engine: Engine; contextId: string } {
  const items: ScsItem[] = [
    makeItem({ id: SITE_TPL, path: '/sitecore/templates/Foundation/Headless Site' }),
    makeItem({ id: SECTION_FOLDER_TPL, path: '/sitecore/templates/Feature/Widget Section Folder' }),
    makeItem({ id: GROUP_FOLDER_TPL, path: '/sitecore/templates/Feature/Widget Group Folder' }),
    makeItem({ id: '10000000-0000-0000-0000-000000000001', path: '/sitecore/content/acme', template: SITE_TPL }),
    makeItem({ id: '10000000-0000-0000-0000-000000000002', path: '/sitecore/content/acme/Data', parent: '10000000-0000-0000-0000-000000000001' }),
    makeItem({ id: '10000000-0000-0000-0000-000000000003', path: '/sitecore/content/acme/Data/Widget Section', parent: '10000000-0000-0000-0000-000000000002', template: SECTION_FOLDER_TPL }),
    makeItem({ id: '10000000-0000-0000-0000-000000000004', path: '/sitecore/content/acme/Data/Widget Section/Active Widget', parent: '10000000-0000-0000-0000-000000000003' }),
    makeItem({ id: '10000000-0000-0000-0000-000000000005', path: '/sitecore/content/acme/Data/Widget Section/All Widgets', parent: '10000000-0000-0000-0000-000000000003', template: GROUP_FOLDER_TPL }),
    makeItem({ id: '10000000-0000-0000-0000-000000000006', path: '/sitecore/content/acme/Data/Widget Section/All Widgets/First Widget', parent: '10000000-0000-0000-0000-000000000005' }),
    makeItem({ id: '10000000-0000-0000-0000-000000000007', path: '/sitecore/content/acme/Data/Widget Section/All Widgets/Second Widget', parent: '10000000-0000-0000-0000-000000000005' }),
  ];
  const engine = Object.create(Engine.prototype) as Engine;
  const tree = new ItemTree();
  for (const it of items) tree.addItem(it, `/fake/${it.id}.yml`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any).tree = tree;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any).registry = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any).options = { rootDir: '/fake' };
  return { engine, contextId: '10000000-0000-0000-0000-000000000004' };
}

const SOURCE =
  "query:$site/*[@@name='Data']/*[@@templatename='Widget Section Folder']/*[@@templatename='Widget Group Folder']";

describe('GET /api/lookup-source - kind param', () => {
  let app: FastifyInstance;
  let contextId: string;

  beforeEach(() => {
    const built = buildEngine();
    contextId = built.contextId;
    app = Fastify();
    registerLookupSourceRoutes(app, built.engine);
  });

  afterEach(async () => {
    await app.close();
  });

  it('kind=Droplink returns the matched folder node (flat-select semantics)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/lookup-source?source=${encodeURIComponent(SOURCE)}&contextId=${contextId}&kind=Droplink`,
    });
    expect(res.statusCode).toBe(200);
    const names = (res.json() as Array<{ name: string }>).map(i => i.name);
    expect(names).toEqual(['All Widgets']);
  });

  it('no kind keeps the child-descent default (tree-rooted behavior)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/lookup-source?source=${encodeURIComponent(SOURCE)}&contextId=${contextId}`,
    });
    expect(res.statusCode).toBe(200);
    const names = (res.json() as Array<{ name: string }>).map(i => i.name).sort();
    expect(names).toEqual(['First Widget', 'Second Widget']);
  });
});
