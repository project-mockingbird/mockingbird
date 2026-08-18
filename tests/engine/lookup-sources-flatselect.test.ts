/**
 * Regression tests for the flat-select (Droplink/Droplist) query-source
 * semantics divergence.
 *
 * Real Sitecore's `getLookupSourceItems` -> `ProcessQuerySource` returns the
 * nodes a `query:` XPath MATCHES (`Axes.SelectItems`, no `/*` appended). Only
 * the plain-path form (`ProcessDefaultSource`) appends `/*` to return children.
 *
 * Mockingbird's child-axis resolver was tuned for the SXA Tag Treelist
 * convention and descends into the matched node's children (its "Convention
 * 1/2" heuristic). That is correct for the tree-rooted controls (Treelist,
 * Droptree) but wrong for the flat selects (Droplink, Droplist), which is what
 * gave a Droplink whose Source targets a folder a working dropdown in
 * Mockingbird but a "Value not in the selection list" in real CM.
 *
 * These tests pin the kernel-accurate behavior behind `opts.flatSelect`.
 */

import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import {
  resolveLookupSource,
  parseChildAxisQuery,
} from '../../src/engine/lookup-sources.js';

const NULL_GUID = '00000000-0000-0000-0000-000000000000';

const HEADLESS_SITE_TPL = 'cccccccc-cccc-cccc-cccc-000000000003';
const SECTION_FOLDER_TPL = 'dddddddd-dddd-dddd-dddd-000000000004';
const GROUP_FOLDER_TPL = 'eeeeeeee-eeee-eeee-eeee-000000000005';
const WIDGET_A_TPL = 'ffffffff-ffff-ffff-ffff-000000000006';
const WIDGET_B_TPL = 'ffffffff-ffff-ffff-ffff-000000000007';

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
 * Mirrors the real content shape that surfaced the bug:
 *
 *   /sitecore/content/acme              (template name "Headless Site")
 *     /Data
 *       /Widget Section                 (template "Widget Section Folder")
 *         /Active Widget                (the field-bearing item; context)
 *         /All Widgets                  (template "Widget Group Folder")
 *           /First Widget               (leaf, template "Widget Type A")
 *           /Second Widget              (leaf, template "Widget Type B")
 */
function buildContentTree() {
  const siteTpl = makeItem({ id: HEADLESS_SITE_TPL, path: '/sitecore/templates/Foundation/Headless Site' });
  const sectionFolderTpl = makeItem({ id: SECTION_FOLDER_TPL, path: '/sitecore/templates/Feature/Widget Section Folder' });
  const groupFolderTpl = makeItem({ id: GROUP_FOLDER_TPL, path: '/sitecore/templates/Feature/Widget Group Folder' });
  const typeATpl = makeItem({ id: WIDGET_A_TPL, path: '/sitecore/templates/Feature/Widget Type A' });
  const typeBTpl = makeItem({ id: WIDGET_B_TPL, path: '/sitecore/templates/Feature/Widget Type B' });

  const site = makeItem({
    id: '10000000-0000-0000-0000-000000000001',
    path: '/sitecore/content/acme',
    template: HEADLESS_SITE_TPL,
  });
  const data = makeItem({
    id: '10000000-0000-0000-0000-000000000002',
    path: '/sitecore/content/acme/Data',
    parent: '10000000-0000-0000-0000-000000000001',
  });
  const section = makeItem({
    id: '10000000-0000-0000-0000-000000000003',
    path: '/sitecore/content/acme/Data/Widget Section',
    parent: '10000000-0000-0000-0000-000000000002',
    template: SECTION_FOLDER_TPL,
  });
  const activeWidget = makeItem({
    id: '10000000-0000-0000-0000-000000000004',
    path: '/sitecore/content/acme/Data/Widget Section/Active Widget',
    parent: '10000000-0000-0000-0000-000000000003',
  });
  const allWidgets = makeItem({
    id: '10000000-0000-0000-0000-000000000005',
    path: '/sitecore/content/acme/Data/Widget Section/All Widgets',
    parent: '10000000-0000-0000-0000-000000000003',
    template: GROUP_FOLDER_TPL,
  });
  const firstWidget = makeItem({
    id: '10000000-0000-0000-0000-000000000006',
    path: '/sitecore/content/acme/Data/Widget Section/All Widgets/First Widget',
    parent: '10000000-0000-0000-0000-000000000005',
    template: WIDGET_A_TPL,
  });
  const secondWidget = makeItem({
    id: '10000000-0000-0000-0000-000000000007',
    path: '/sitecore/content/acme/Data/Widget Section/All Widgets/Second Widget',
    parent: '10000000-0000-0000-0000-000000000005',
    template: WIDGET_B_TPL,
  });

  return {
    engine: buildEngine([
      siteTpl, sectionFolderTpl, groupFolderTpl, typeATpl, typeBTpl,
      site, data, section, activeWidget, allWidgets,
      firstWidget, secondWidget,
    ]),
    contextId: activeWidget.id,
    allWidgetsId: allWidgets.id,
  };
}

// A source string that targets the "All Widgets" folder (a two-template-name walk).
const FOLDER_SOURCE =
  "query:$site/*[@@name='Data']/*[@@templatename='Widget Section Folder']/*[@@templatename='Widget Group Folder']";
// Corrected source (appends /* to select the folder's children).
const LEAVES_SOURCE = FOLDER_SOURCE + '/*';

describe('resolveLookupSource - flatSelect (Droplink/Droplist) query semantics', () => {
  it('returns the MATCHED folder node (not its children) for a flat select', () => {
    const { engine, contextId } = buildContentTree();
    const result = resolveLookupSource(FOLDER_SOURCE, contextId, engine, { flatSelect: true });
    expect(result.resolved).toBe(true);
    expect(result.items.map(i => i.name)).toEqual(['All Widgets']);
  });

  it('returns the folder children when the query descends with a trailing /* (flat select)', () => {
    const { engine, contextId } = buildContentTree();
    const result = resolveLookupSource(LEAVES_SOURCE, contextId, engine, { flatSelect: true });
    expect(result.resolved).toBe(true);
    expect(result.items.map(i => i.name).sort()).toEqual(['First Widget', 'Second Widget']);
  });

  it('keeps the child-descent approximation by default (tree-rooted controls unchanged)', () => {
    const { engine, contextId } = buildContentTree();
    // No opts = current Treelist/Droptree behavior: descend into the folder.
    const result = resolveLookupSource(FOLDER_SOURCE, contextId, engine);
    expect(result.resolved).toBe(true);
    expect(result.items.map(i => i.name).sort()).toEqual(['First Widget', 'Second Widget']);
  });

  it('resolves a trailing /* the same way in both modes when the matches are leaves', () => {
    const { engine, contextId } = buildContentTree();
    const flat = resolveLookupSource(LEAVES_SOURCE, contextId, engine, { flatSelect: true });
    const tree = resolveLookupSource(LEAVES_SOURCE, contextId, engine);
    expect(flat.items.map(i => i.name).sort()).toEqual(tree.items.map(i => i.name).sort());
  });

  it('returns the single matched path node for a bare-path query (flat select)', () => {
    // `query:/absolute/path` -> Sitecore `Axes.SelectItems` returns the node AT
    // that path, not its children. Plain-path sources (no `query:`) still
    // return children via ProcessDefaultSource.
    const { engine, contextId, allWidgetsId } = buildContentTree();
    const source = 'query:/sitecore/content/acme/Data/Widget Section/All Widgets';
    const result = resolveLookupSource(source, contextId, engine, { flatSelect: true });
    expect(result.resolved).toBe(true);
    expect(result.items.map(i => i.id)).toEqual([allWidgetsId]);
  });
});

describe('parseChildAxisQuery - wildcard (*) step', () => {
  it('accepts a trailing /* as an all-children step', () => {
    const result = parseChildAxisQuery("/sitecore/Foo/*[@@name='Bar']/*");
    expect(result).not.toBeNull();
    expect(result!.basePath).toBe('/sitecore/Foo');
    expect(result!.steps).toEqual([
      { kind: 'name', value: 'bar' },
      { kind: 'all', value: '' },
    ]);
  });

  it('accepts an interior /* step between predicates', () => {
    // A wildcard must follow at least one predicate; a leading `*` would be
    // absorbed into basePath, which the predicate-delimited parser does not
    // support (and no real source needs).
    const result = parseChildAxisQuery("/sitecore/Foo/*[@@name='Bar']/*/*[@@templatename='Tag']");
    expect(result).not.toBeNull();
    expect(result!.basePath).toBe('/sitecore/Foo');
    expect(result!.steps).toEqual([
      { kind: 'name', value: 'bar' },
      { kind: 'all', value: '' },
      { kind: 'templatename', value: 'tag' },
    ]);
  });
});
