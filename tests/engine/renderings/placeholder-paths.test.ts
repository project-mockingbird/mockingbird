import { describe, expect, it } from 'vitest';
import { makeItem, buildEngine, seedRenderingPlaceholders } from '../layout/_helpers.js';
import { getPlaceholderPaths, discoverPlaceholderPaths } from '../../../src/engine/renderings/placeholder-paths.js';
import type { RenderingEntry } from '../../../src/engine/layout/types.js';
import { FINAL_RENDERINGS_FIELD_ID } from '../../../src/engine/layout/page-design.js';
import type { ScsItem } from '../../../src/engine/types.js';

// Default device ID used by parseRenderingXml
const DEV = 'FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3';

// Stable GUIDs for fixtures
const PAGE_ID = 'eeeeeeee-0000-0000-0000-000000000001';
const RENDERING_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const RENDERING_B = 'aaaaaaaa-0000-0000-0000-000000000002';

/** Build a minimal page item with an optional __Final Renderings XML. */
function makePage(id: string, frXml?: string): ScsItem {
  return makeItem({
    id,
    path: `/sitecore/content/site/home/page-${id.slice(0, 8)}`,
    languages: [
      {
        language: 'en',
        fields: [],
        versions: [
          {
            version: 1,
            fields: frXml
              ? [{ id: FINAL_RENDERINGS_FIELD_ID, hint: '__Final Renderings', value: frXml }]
              : [],
          },
        ],
      },
    ],
  });
}

/** Build a page item whose __Final Renderings XML is stored under a specific language. */
function makePageWithLanguage(id: string, language: string, frXml: string): ScsItem {
  return makeItem({
    id,
    path: `/sitecore/content/site/home/page-${id.slice(0, 8)}`,
    languages: [
      {
        language,
        fields: [],
        versions: [
          {
            version: 1,
            fields: [{ id: FINAL_RENDERINGS_FIELD_ID, hint: '__Final Renderings', value: frXml }],
          },
        ],
      },
    ],
  });
}

/** Wrap renderings inside a standard device block. */
function deviceBlock(inner: string): string {
  return `<r xmlns:s="http://www.sitecore.net/xmlconfig/" xmlns:p="p" p:p="1"><d id="{${DEV}}">${inner}</d></r>`;
}

/** Build a single self-closing <r> tag string. */
function rTag(opts: {
  uid: string;
  id: string;
  ph: string;
  par?: string;
}): string {
  const par = opts.par ?? '';
  return `<r uid="{${opts.uid.toUpperCase()}}" s:id="{${opts.id.toUpperCase()}}" s:ph="${opts.ph}" s:ds="" s:par="${par}" />`;
}

// ---------------------------------------------------------------------------

describe('getPlaceholderPaths', () => {
  it('returns [] for an unknown item', () => {
    const engine = buildEngine([]);
    expect(getPlaceholderPaths(engine, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toEqual([]);
  });

  it('returns [] for a page with no __Final Renderings field', () => {
    const engine = buildEngine([makePage(PAGE_ID)]);
    expect(getPlaceholderPaths(engine, PAGE_ID)).toEqual([]);
  });

  it('returns [] when called with default language but page only has de content', () => {
    const frXml = deviceBlock(
      rTag({ uid: 'uid-lang-0000-0000-0000-000000000001', id: RENDERING_A, ph: '/main/body' }),
    );
    const engine = buildEngine([makePageWithLanguage(PAGE_ID, 'de', frXml)]);
    // default language is 'en'; the item only has 'de' content - should return []
    expect(getPlaceholderPaths(engine, PAGE_ID)).toEqual([]);
  });

  it('returns paths when called with the matching language', () => {
    const frXml = deviceBlock(
      rTag({ uid: 'uid-lang-0000-0000-0000-000000000002', id: RENDERING_A, ph: '/de-main/body' }),
    );
    const engine = buildEngine([makePageWithLanguage(PAGE_ID, 'de', frXml)]);
    const result = getPlaceholderPaths(engine, PAGE_ID, 'de');
    expect(result).toEqual([{ value: '/de-main/body', source: 'in-xml' }]);
  });

  it('returns in-xml paths from the page __Final Renderings field', () => {
    const frXml = deviceBlock(
      rTag({ uid: 'uid-0001-0000-0000-0000-000000000001', id: RENDERING_A, ph: '/main/body' }) +
      rTag({ uid: 'uid-0001-0000-0000-0000-000000000002', id: RENDERING_B, ph: '/main/footer' }),
    );
    const engine = buildEngine([makePage(PAGE_ID, frXml)]);
    const result = getPlaceholderPaths(engine, PAGE_ID);
    expect(result).toEqual([
      { value: '/main/body', source: 'in-xml' },
      { value: '/main/footer', source: 'in-xml' },
    ]);
  });

  it('deduplicates in-xml paths when multiple renderings share a placeholder', () => {
    const frXml = deviceBlock(
      rTag({ uid: 'uid-0002-0000-0000-0000-000000000001', id: RENDERING_A, ph: '/main/body' }) +
      rTag({ uid: 'uid-0002-0000-0000-0000-000000000002', id: RENDERING_B, ph: '/main/body' }),
    );
    const engine = buildEngine([makePage(PAGE_ID, frXml)]);
    const result = getPlaceholderPaths(engine, PAGE_ID);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ value: '/main/body', source: 'in-xml' });
  });

  it('returns discovered paths from rendering Allowed Placeholders, dynamic-substituted', () => {
    // A Container rendering with declared placeholder key "container-{*}".
    // Placed at /main/body with DynamicPlaceholderId=2.
    const CONTAINER_ID = 'cccccccc-0000-0000-0000-000000000001';
    const frXml = deviceBlock(
      rTag({
        uid: 'uid-0003-0000-0000-0000-000000000001',
        id: CONTAINER_ID,
        ph: '/main/body',
        par: 'DynamicPlaceholderId=2',
      }),
    );
    const engine = buildEngine([makePage(PAGE_ID, frXml)]);
    seedRenderingPlaceholders(engine, CONTAINER_ID, ['container-{*}']);

    const result = getPlaceholderPaths(engine, PAGE_ID);

    // In-xml: /main/body
    expect(result).toContainEqual({ value: '/main/body', source: 'in-xml' });
    // Discovered: /main/body/container-2  (substituted with DynamicPlaceholderId=2)
    expect(result).toContainEqual({ value: '/main/body/container-2', source: 'discovered', ownerUid: 'uid-0003-0000-0000-0000-000000000001' });
    // Token form should NOT be present (substitution succeeded)
    expect(result.find(p => p.isTokenForm)).toBeUndefined();
  });

  it('marks isTokenForm=true on paths that still have tokens after substitution', () => {
    // A Container rendering with "container-{*}" placed WITHOUT DynamicPlaceholderId.
    const CONTAINER_ID = 'cccccccc-0000-0000-0000-000000000002';
    const frXml = deviceBlock(
      rTag({
        uid: 'uid-0004-0000-0000-0000-000000000001',
        id: CONTAINER_ID,
        ph: '/main/body',
        par: '',  // no DynamicPlaceholderId
      }),
    );
    const engine = buildEngine([makePage(PAGE_ID, frXml)]);
    seedRenderingPlaceholders(engine, CONTAINER_ID, ['container-{*}']);

    const result = getPlaceholderPaths(engine, PAGE_ID);

    // In-xml: /main/body
    expect(result).toContainEqual({ value: '/main/body', source: 'in-xml' });
    // Discovered: /main/body/container-{*} with isTokenForm=true
    expect(result).toContainEqual({
      value: '/main/body/container-{*}',
      source: 'discovered',
      isTokenForm: true,
      ownerUid: 'uid-0004-0000-0000-0000-000000000001',
    });
  });

  it('drops discovered paths that are already present as in-xml', () => {
    // Rendering A is placed at /foo/container-1 (in-xml).
    // Rendering B is at /foo with DynamicPlaceholderId=1 and declared key "container-{*}".
    // Substitution would produce /foo/container-1, which duplicates the in-xml entry.
    const RENDERING_AT_CONTAINER = 'dddddddd-0000-0000-0000-000000000001';
    const RENDERING_PARENT = 'dddddddd-0000-0000-0000-000000000002';
    const frXml = deviceBlock(
      rTag({ uid: 'uid-0005-0000-0000-0000-000000000001', id: RENDERING_AT_CONTAINER, ph: '/foo/container-1' }) +
      rTag({
        uid: 'uid-0005-0000-0000-0000-000000000002',
        id: RENDERING_PARENT,
        ph: '/foo',
        par: 'DynamicPlaceholderId=1',
      }),
    );
    const engine = buildEngine([makePage(PAGE_ID, frXml)]);
    seedRenderingPlaceholders(engine, RENDERING_PARENT, ['container-{*}']);

    const result = getPlaceholderPaths(engine, PAGE_ID);

    // /foo/container-1 must appear exactly once, as in-xml
    const matches = result.filter(p => p.value === '/foo/container-1');
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe('in-xml');
  });

  it('bare s:ph parent gets EnsurePrefix slash on discovered child path', () => {
    // Regression: s:ph values can be bare ("headless-main") rather than
    // slash-prefixed. joinPlaceholderPath must mirror Sitecore's EnsurePrefix('/')
    // so "headless-main" + "container-{*}" -> "/headless-main/container-N".
    const CONTAINER_ID = 'ffff0001-0000-0000-0000-000000000001';
    const frXml = deviceBlock(
      rTag({
        uid: 'uid-0007-0000-0000-0000-000000000001',
        id: CONTAINER_ID,
        ph: 'headless-main',   // bare - no leading slash
        par: 'DynamicPlaceholderId=4',
      }),
    );
    const engine = buildEngine([makePage(PAGE_ID, frXml)]);
    seedRenderingPlaceholders(engine, CONTAINER_ID, ['container-{*}']);

    const result = getPlaceholderPaths(engine, PAGE_ID);

    // in-xml path is returned verbatim (no normalization on in-xml)
    expect(result).toContainEqual({ value: 'headless-main', source: 'in-xml' });
    // discovered path must have the leading slash from EnsurePrefix
    expect(result).toContainEqual({ value: '/headless-main/container-4', source: 'discovered', ownerUid: 'uid-0007-0000-0000-0000-000000000001' });
  });

  it('returns in-xml first, then discovered sorted, then token-form sorted', () => {
    // Page with two in-xml placeholders (in document order) and two renderings
    // that each produce a discovered path. One rendering also lacks DynamicPlaceholderId
    // producing a token-form path.
    const CONTAINER_DYNA = 'eeeeeeee-0000-0000-0000-000000000002';
    const CONTAINER_TOKEN = 'eeeeeeee-0000-0000-0000-000000000003';
    const frXml = deviceBlock(
      rTag({ uid: 'uid-0006-0000-0000-0000-000000000001', id: RENDERING_A, ph: '/main/beta' }) +
      rTag({ uid: 'uid-0006-0000-0000-0000-000000000002', id: RENDERING_B, ph: '/main/alpha' }) +
      rTag({ uid: 'uid-0006-0000-0000-0000-000000000003', id: CONTAINER_DYNA, ph: '/main/beta', par: 'DynamicPlaceholderId=3' }) +
      rTag({ uid: 'uid-0006-0000-0000-0000-000000000004', id: CONTAINER_TOKEN, ph: '/main/alpha' }),
    );
    const engine = buildEngine([makePage(PAGE_ID, frXml)]);
    seedRenderingPlaceholders(engine, CONTAINER_DYNA, ['wrap-{*}']);
    seedRenderingPlaceholders(engine, CONTAINER_TOKEN, ['wrap-{*}']);

    const result = getPlaceholderPaths(engine, PAGE_ID);

    // First two: in-xml, in document order
    expect(result[0]).toEqual({ value: '/main/beta', source: 'in-xml' });
    expect(result[1]).toEqual({ value: '/main/alpha', source: 'in-xml' });

    // Next: discovered (no token form), sorted
    const discovered = result.filter(p => p.source === 'discovered' && !p.isTokenForm);
    expect(discovered).toEqual([{ value: '/main/beta/wrap-3', source: 'discovered', ownerUid: 'uid-0006-0000-0000-0000-000000000003' }]);

    // Last: token-form, sorted
    const tokenForms = result.filter(p => p.isTokenForm === true);
    expect(tokenForms).toEqual([{ value: '/main/alpha/wrap-{*}', source: 'discovered', isTokenForm: true, ownerUid: 'uid-0006-0000-0000-0000-000000000004' }]);

    // Ordering: in-xml first, then discovered, then token-form
    const inXmlIndices = result.flatMap((p, i) => p.source === 'in-xml' ? [i] : []);
    const discoveredIndices = result.flatMap((p, i) => (p.source === 'discovered' && !p.isTokenForm) ? [i] : []);
    const tokenIndices = result.flatMap((p, i) => p.isTokenForm ? [i] : []);
    expect(Math.max(...inXmlIndices)).toBeLessThan(Math.min(...discoveredIndices));
    expect(Math.max(...discoveredIndices)).toBeLessThan(Math.min(...tokenIndices));
  });
});

describe('discoverPlaceholderPaths', () => {
  it('returns in-xml placeholder paths for a supplied entry list (no own-field read)', () => {
    const engine = buildEngine([]);
    const entries: RenderingEntry[] = [
      { uid: '{U1}', renderingId: '{R1}', placeholder: 'headless-main', dataSource: '', params: {} },
    ];
    const paths = discoverPlaceholderPaths(engine, entries);
    expect(paths.map(p => p.value)).toContain('headless-main');
  });
});
