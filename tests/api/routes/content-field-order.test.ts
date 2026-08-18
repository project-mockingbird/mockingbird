/**
 * Route test: a CONTENT item's /template-schema must order each section's
 * fields the way the content tree does (the section's __Subitems Sorting
 * comparer), not in raw tree-insertion order.
 *
 * Bug: the 0.15.0 `sortFieldsLikeTree` fix was applied only to `builderSections`
 * (template items). Content-item detail panes rendered `getTemplateSchema`'s
 * raw order, which - for fields with no explicit __Sortorder - fell to the
 * child-discovery order and diverged from the tree (surfaced as a reversed
 * field list in the detail pane).
 *
 * Fixture reproduces the inherited case: a content item whose template inherits
 * the fields from a base template, with the field items registered in
 * REVERSE-alphabetical order.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Engine } from '../../../src/engine/index.js';
import { ItemTree } from '../../../src/engine/tree.js';
import type { ScsItem } from '../../../src/engine/types.js';
import { registerItemRoutes } from '../../../src/api/routes/items.js';
import { clearTemplateSchemaCache } from '../../../src/engine/template-schema.js';

const NULL_GUID = '00000000-0000-0000-0000-000000000000';
const TEMPLATE_TEMPLATE_ID = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
const SECTION_TEMPLATE_ID = 'e269fbb5-3750-427a-9149-7aa950b49301';
const FIELD_TEMPLATE_ID = '455a3e98-a627-4b40-8035-e683a0331ac7';
const STANDARD_TEMPLATE_ID = '1930bbeb-7805-471a-a3be-4858ac7cf696';
const BASE_TEMPLATE_FIELD = '12c33f3f-86c5-43a5-aeb4-5598cec45116';

const BASE_TPL = 'b0000000-0000-0000-0000-000000000001'; // base template with the section + fields
const DERIVED_TPL = 'd0000000-0000-0000-0000-000000000001'; // template that inherits it
const SECTION_ID = 'a0000000-0000-0000-0000-000000000001';
const CONTENT_ID = 'c0000000-0000-0000-0000-000000000001';

function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return { parent: NULL_GUID, template: NULL_GUID, sharedFields: [], languages: [], ...overrides };
}

function field(id: string, name: string): ScsItem {
  return makeItem({
    id,
    path: `/sitecore/templates/Feature/_Widget/Widget Content/${name}`,
    parent: SECTION_ID,
    template: FIELD_TEMPLATE_ID,
  });
}

function buildEngine(): Engine {
  // Fields registered REVERSE-alphabetically so the raw child order is the
  // inverse of the tree's (name-ascending) order.
  const items: ScsItem[] = [
    makeItem({
      id: BASE_TPL,
      path: '/sitecore/templates/Feature/_Widget',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{ id: BASE_TEMPLATE_FIELD, hint: '__Base template', value: `{${STANDARD_TEMPLATE_ID.toUpperCase()}}` }],
    }),
    makeItem({
      id: SECTION_ID,
      path: '/sitecore/templates/Feature/_Widget/Widget Content',
      parent: BASE_TPL,
      template: SECTION_TEMPLATE_ID,
    }),
    field('f0000000-0000-0000-0000-000000000005', 'Field5'),
    field('f0000000-0000-0000-0000-000000000004', 'Field4'),
    field('f0000000-0000-0000-0000-000000000003', 'Field3'),
    field('f0000000-0000-0000-0000-000000000002', 'Field2'),
    field('f0000000-0000-0000-0000-000000000001', 'Field1'),
    makeItem({
      id: DERIVED_TPL,
      path: '/sitecore/templates/Feature/Widget Type A',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{ id: BASE_TEMPLATE_FIELD, hint: '__Base template', value: `{${BASE_TPL.toUpperCase()}}` }],
    }),
    makeItem({
      id: CONTENT_ID,
      path: '/sitecore/content/acme/Data/Widgets/First Widget',
      template: DERIVED_TPL,
    }),
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
  // treeGeneration is a getter over tree.generation - no manual set needed.
  return engine;
}

describe('GET /api/items/:id/template-schema - content-item field order', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    clearTemplateSchemaCache();
    app = Fastify();
    registerItemRoutes(app, buildEngine());
  });

  afterEach(async () => {
    await app.close();
  });

  it('orders an inherited section\'s fields like the tree (name-ascending on sortorder ties)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/items/${CONTENT_ID}/template-schema` });
    expect(res.statusCode).toBe(200);
    const schema = res.json() as { sections: Array<{ name: string; fields: Array<{ name: string }> }> };
    const section = schema.sections.find(s => s.name === 'Widget Content');
    expect(section).toBeDefined();
    expect(section!.fields.map(f => f.name)).toEqual([
      'Field1',
      'Field2',
      'Field3',
      'Field4',
      'Field5',
    ]);
  });
});
