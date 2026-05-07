/**
 * Tests for SXA token expansion in lookup-sources.ts:
 *   - $partialDesigns -> <site>/Presentation/Partial Designs (PartialDesigns
 *                       field on Page Design template)
 *   - $templates      -> /sitecore/templates/Project/<tenant-name> (TemplatesMapping
 *                       field on Page Designs template)
 *
 * Plus the parameterised-source recursion that lets `DataSource=query:$X`
 * route through the query handler instead of being treated as a literal path.
 */

import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import { resolveLookupSource } from '../../src/engine/lookup-sources.js';

const NULL_GUID = '00000000-0000-0000-0000-000000000000';

const HEADLESS_TENANT_TPL = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HEADLESS_SITE_TPL = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return {
    parent: NULL_GUID,
    template: NULL_GUID,
    sharedFields: [],
    languages: [],
    ...overrides,
  };
}

function buildEngine(items: ScsItem[]): Engine {
  const engine = Object.create(Engine.prototype) as Engine;
  const tree = new ItemTree();
  for (const item of items) tree.addItem(item, `/fake/${item.id}.yml`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any).tree = tree;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any).registry = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (engine as any).options = { rootDir: '/fake' };
  return engine;
}

/**
 * Minimal SXA-shape tree:
 *   /sitecore/content/<Tenant>             template name "Headless Tenant"
 *   /sitecore/content/<Tenant>/<Site>      template name "Headless Site"
 *   /sitecore/content/<Tenant>/<Site>/Presentation/Page Designs/<Empty>
 *   /sitecore/content/<Tenant>/<Site>/Presentation/Partial Designs/<Header>
 *   /sitecore/content/<Tenant>/<Site>/Presentation/Partial Designs/<Footer>
 *   /sitecore/templates/Project/<Tenant>/<Empty Content Page>
 *   /sitecore/templates/Project/<Tenant>/<Error Page>
 *
 * Tenant ancestor name is "Foo" so `$templates` resolves to
 * /sitecore/templates/Project/Foo and that's what we walk for templates-list.
 */
function buildSxaTree() {
  const tenantTpl = makeItem({
    id: HEADLESS_TENANT_TPL,
    path: '/sitecore/templates/Foundation/Headless Tenant',
  });
  const siteTpl = makeItem({
    id: HEADLESS_SITE_TPL,
    path: '/sitecore/templates/Foundation/Headless Site',
  });

  const tenant = makeItem({
    id: '11111111-1111-1111-1111-000000000001',
    path: '/sitecore/content/Foo',
    template: HEADLESS_TENANT_TPL,
  });
  const site = makeItem({
    id: '11111111-1111-1111-1111-000000000002',
    path: '/sitecore/content/Foo/MySite',
    parent: '11111111-1111-1111-1111-000000000001',
    template: HEADLESS_SITE_TPL,
  });
  const presentation = makeItem({
    id: '11111111-1111-1111-1111-000000000003',
    path: '/sitecore/content/Foo/MySite/Presentation',
    parent: '11111111-1111-1111-1111-000000000002',
  });
  const pageDesignsRoot = makeItem({
    id: '11111111-1111-1111-1111-000000000004',
    path: '/sitecore/content/Foo/MySite/Presentation/Page Designs',
    parent: '11111111-1111-1111-1111-000000000003',
  });
  const emptyContentPage = makeItem({
    id: '11111111-1111-1111-1111-000000000005',
    path: '/sitecore/content/Foo/MySite/Presentation/Page Designs/Empty Content Page',
    parent: '11111111-1111-1111-1111-000000000004',
  });
  const partialDesignsRoot = makeItem({
    id: '11111111-1111-1111-1111-000000000006',
    path: '/sitecore/content/Foo/MySite/Presentation/Partial Designs',
    parent: '11111111-1111-1111-1111-000000000003',
  });
  const headerPartial = makeItem({
    id: '11111111-1111-1111-1111-000000000007',
    path: '/sitecore/content/Foo/MySite/Presentation/Partial Designs/Header',
    parent: '11111111-1111-1111-1111-000000000006',
  });
  const footerPartial = makeItem({
    id: '11111111-1111-1111-1111-000000000008',
    path: '/sitecore/content/Foo/MySite/Presentation/Partial Designs/Footer',
    parent: '11111111-1111-1111-1111-000000000006',
  });

  // Tenant project templates folder. Lives on a separate tree branch but
  // mockingbird's flat path-index makes that fine.
  const tenantTemplatesRoot = makeItem({
    id: '22222222-2222-2222-2222-000000000001',
    path: '/sitecore/templates/Project/Foo',
  });
  const emptyContentPageTpl = makeItem({
    id: '22222222-2222-2222-2222-000000000002',
    path: '/sitecore/templates/Project/Foo/Empty Content Page',
    parent: '22222222-2222-2222-2222-000000000001',
  });
  const errorPageTpl = makeItem({
    id: '22222222-2222-2222-2222-000000000003',
    path: '/sitecore/templates/Project/Foo/Error Page',
    parent: '22222222-2222-2222-2222-000000000001',
  });

  return {
    engine: buildEngine([
      tenantTpl, siteTpl,
      tenant, site, presentation,
      pageDesignsRoot, emptyContentPage,
      partialDesignsRoot, headerPartial, footerPartial,
      tenantTemplatesRoot, emptyContentPageTpl, errorPageTpl,
    ]),
    pageDesignsItemId: pageDesignsRoot.id,
    emptyContentPageItemId: emptyContentPage.id,
  };
}

describe('SXA token: $partialDesigns', () => {
  it('resolves a bare path-form source `$partialDesigns` to children of <site>/Presentation/Partial Designs', () => {
    const { engine, emptyContentPageItemId } = buildSxaTree();
    const result = resolveLookupSource(
      '$partialDesigns',
      emptyContentPageItemId,
      engine,
    );
    expect(result.resolved).toBe(true);
    const names = result.items.map(i => i.name).sort();
    expect(names).toEqual(['Footer', 'Header']);
  });

  it('resolves the parameterised SXA Treelist source for the PartialDesigns field', () => {
    const { engine, emptyContentPageItemId } = buildSxaTree();
    // Real shape from the OOTB registry's PartialDesigns field declaration.
    const source =
      'DataSource=query:$partialDesigns&IncludeTemplatesForSelection=Partial Design,Metadata Partial Design&IncludeTemplatesForDisplay=Partial Design,Metadata Partial Design,Partial Designs,Partial Design Folder';
    const result = resolveLookupSource(source, emptyContentPageItemId, engine);
    expect(result.resolved).toBe(true);
    const names = result.items.map(i => i.name).sort();
    expect(names).toEqual(['Footer', 'Header']);
  });
});

describe('SXA token: $templates', () => {
  it('resolves a query-form source `query:$templates` to children of /sitecore/templates/Project/<tenant-name>', () => {
    const { engine, pageDesignsItemId } = buildSxaTree();
    // Same shape used as the LEFT side of TemplatesMapping's `query:$templates||...`
    // double-source, exercised here in isolation.
    const result = resolveLookupSource('$templates', pageDesignsItemId, engine);
    expect(result.resolved).toBe(true);
    const names = result.items.map(i => i.name).sort();
    expect(names).toEqual(['Empty Content Page', 'Error Page']);
  });

  it('returns resolved:false when the tenant ancestor cannot be located', () => {
    // Build a tree with NO tenant ancestor for the context item.
    const orphan = makeItem({
      id: '99999999-9999-9999-9999-999999999999',
      path: '/sitecore/content/Orphan',
    });
    const engine = buildEngine([orphan]);
    const result = resolveLookupSource('$templates', orphan.id, engine);
    expect(result.resolved).toBe(false);
  });
});
