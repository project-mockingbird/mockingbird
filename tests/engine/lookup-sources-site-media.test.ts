/**
 * Tests for `query:$siteMedia` resolution. The resolver reads the
 * `SiteMediaLibrary` field on the site item (SXA Site template field per
 * `Sitecore.XA.Foundation.Multisite.Templates.Site.Fields.SiteMediaLibrary`)
 * and returns the referenced media-library item(s).
 */

import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import { resolveLookupSource } from '../../src/engine/lookup-sources.js';
import { SITE_MEDIA_LIBRARY_FIELD_ID } from '../../src/engine/constants.js';

const NULL_GUID = '00000000-0000-0000-0000-000000000000';
const SITE_TPL_ID = 'cccc0000-0000-0000-0000-000000000001';
const CONTEXT_ITEM_ID = 'aaaa0000-0000-0000-0000-000000000001';
const SITE_ITEM_ID = 'bbbb0000-0000-0000-0000-000000000001';
const MEDIA_A_ID = 'dddd0000-0000-0000-0000-000000000001';
const MEDIA_B_ID = 'dddd0000-0000-0000-0000-000000000002';

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
 * Build a content tree shaped like the Headless Site one: site item under content
 * with `SiteMediaLibrary` pointing at media-library items, plus a context
 * item nested under the site so the ancestor walk finds the site.
 */
function buildFixture(opts: {
  siteMediaLibraryValue?: string;
  contextUnderSite?: boolean;
}): Engine {
  const items: ScsItem[] = [];

  // Template item whose name ends in "Site" so findAncestorByTemplateNameSuffix
  // matches the site item.
  items.push(makeItem({
    id: SITE_TPL_ID,
    path: '/sitecore/templates/Project/Headless Site',
  }));

  // /sitecore/content
  items.push(makeItem({
    id: '0de95ae4-41ab-4d01-9eb0-67441b7c2450',
    path: '/sitecore/content',
  }));

  // The site item itself
  const siteFields: { id: string; value: string }[] = [];
  if (opts.siteMediaLibraryValue !== undefined) {
    siteFields.push({ id: SITE_MEDIA_LIBRARY_FIELD_ID, value: opts.siteMediaLibraryValue });
  }
  items.push(makeItem({
    id: SITE_ITEM_ID,
    path: '/sitecore/content/example-site',
    parent: '0de95ae4-41ab-4d01-9eb0-67441b7c2450',
    template: SITE_TPL_ID,
    sharedFields: siteFields,
  }));

  // Context item
  const ctxParent = opts.contextUnderSite ? SITE_ITEM_ID : '0de95ae4-41ab-4d01-9eb0-67441b7c2450';
  const ctxPath = opts.contextUnderSite
    ? '/sitecore/content/example-site/SomePage'
    : '/sitecore/content/Outside';
  items.push(makeItem({
    id: CONTEXT_ITEM_ID,
    path: ctxPath,
    parent: ctxParent,
  }));

  // Media library items the SiteMediaLibrary field can reference.
  items.push(makeItem({
    id: MEDIA_A_ID,
    path: '/sitecore/media library/Project/SiteA',
  }));
  items.push(makeItem({
    id: MEDIA_B_ID,
    path: '/sitecore/media library/Project/SiteB',
  }));

  return buildEngine(items);
}

describe('resolveLookupSource: query:$siteMedia', () => {
  it('returns the items referenced by SiteMediaLibrary on the site', () => {
    const engine = buildFixture({
      contextUnderSite: true,
      siteMediaLibraryValue: `{${MEDIA_A_ID.toUpperCase()}}|{${MEDIA_B_ID.toUpperCase()}}`,
    });
    const result = resolveLookupSource('query:$siteMedia', CONTEXT_ITEM_ID, engine);
    expect(result.resolved).toBe(true);
    const ids = result.items.map((i) => i.id).sort();
    expect(ids).toEqual([MEDIA_A_ID, MEDIA_B_ID].sort());
  });

  it('matches case-insensitively (query:$SITEMEDIA, query:$siteMedia)', () => {
    const engine = buildFixture({
      contextUnderSite: true,
      siteMediaLibraryValue: `{${MEDIA_A_ID.toUpperCase()}}`,
    });
    expect(resolveLookupSource('query:$SITEMEDIA', CONTEXT_ITEM_ID, engine).items).toHaveLength(1);
    expect(resolveLookupSource('query:$sitemedia', CONTEXT_ITEM_ID, engine).items).toHaveLength(1);
  });

  it('returns an empty list when SiteMediaLibrary is missing', () => {
    const engine = buildFixture({ contextUnderSite: true });
    const result = resolveLookupSource('query:$siteMedia', CONTEXT_ITEM_ID, engine);
    expect(result.resolved).toBe(true);
    expect(result.items).toEqual([]);
  });

  it('returns an empty list when the context item has no site ancestor', () => {
    const engine = buildFixture({
      contextUnderSite: false,
      siteMediaLibraryValue: `{${MEDIA_A_ID.toUpperCase()}}`,
    });
    const result = resolveLookupSource('query:$siteMedia', CONTEXT_ITEM_ID, engine);
    expect(result.resolved).toBe(true);
    expect(result.items).toEqual([]);
  });

  it('returns an empty list when contextItemId is missing', () => {
    const engine = buildFixture({
      contextUnderSite: true,
      siteMediaLibraryValue: `{${MEDIA_A_ID.toUpperCase()}}`,
    });
    const result = resolveLookupSource('query:$siteMedia', undefined, engine);
    expect(result.resolved).toBe(true);
    expect(result.items).toEqual([]);
  });

  it('skips referenced ids that do not resolve to a known item', () => {
    const engine = buildFixture({
      contextUnderSite: true,
      siteMediaLibraryValue: `{${MEDIA_A_ID.toUpperCase()}}|{99999999-9999-9999-9999-999999999999}`,
    });
    const result = resolveLookupSource('query:$siteMedia', CONTEXT_ITEM_ID, engine);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(MEDIA_A_ID);
  });
});
