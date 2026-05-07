import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import {
  REDIRECT_MAP_TEMPLATE_ID,
  REDIRECT_MAP_GROUPING_TEMPLATE_ID,
  REDIRECT_FIELD_IDS,
} from '../../src/engine/constants.js';
import { resolveRedirects } from '../../src/engine/redirects/index.js';

function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return {
    parent: '00000000-0000-0000-0000-000000000000',
    template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
    sharedFields: [],
    languages: [],
    ...overrides,
  };
}

function buildEngine(items: ScsItem[]): Engine {
  const engine = Object.create(Engine.prototype) as Engine;
  const tree = new ItemTree();
  for (const item of items) tree.addItem(item, `/fake/${item.id}.yml`);
  (engine as any).tree = tree;
  (engine as any).registry = null;
  (engine as any).options = { rootDir: '/fake' };
  return engine;
}

const SITE_ROOT = '/sitecore/content/tenant/site/Home';

// Build a minimal site + Redirects container skeleton.
function makeSiteSkeleton(): ScsItem[] {
  return [
    makeItem({
      id: 'ccccdddd-cccc-cccc-cccc-cccccccccccc',
      path: '/sitecore/content/tenant',
    }),
    makeItem({
      id: 'aaaaaaaa-site-0000-0000-000000000000',
      parent: 'ccccdddd-cccc-cccc-cccc-cccccccccccc',
      path: '/sitecore/content/tenant/site',
    }),
    makeItem({
      id: 'aaaaaaaa-home-0000-0000-000000000000',
      parent: 'aaaaaaaa-site-0000-0000-000000000000',
      path: SITE_ROOT,
    }),
    makeItem({
      id: 'aaaaaaaa-sett-0000-0000-000000000000',
      parent: 'aaaaaaaa-site-0000-0000-000000000000',
      path: '/sitecore/content/tenant/site/Settings',
    }),
    makeItem({
      id: 'aaaaaaaa-rdrs-0000-0000-000000000000',
      parent: 'aaaaaaaa-sett-0000-0000-000000000000',
      path: '/sitecore/content/tenant/site/Settings/Redirects',
    }),
  ];
}

function makeRedirectMap(
  id: string,
  parentId: string,
  parentPath: string,
  name: string,
  urlMapping: string,
  extras: Partial<Record<keyof typeof REDIRECT_FIELD_IDS, string>> = {},
): ScsItem {
  const shared: Array<{ id: string; hint: string; value: string }> = [
    { id: REDIRECT_FIELD_IDS.urlMapping, hint: 'UrlMapping', value: urlMapping },
  ];
  if (extras.redirectType !== undefined) {
    shared.push({ id: REDIRECT_FIELD_IDS.redirectType, hint: 'RedirectType', value: extras.redirectType });
  }
  if (extras.preserveQueryString !== undefined) {
    shared.push({ id: REDIRECT_FIELD_IDS.preserveQueryString, hint: 'PreserveQueryString', value: extras.preserveQueryString });
  }
  if (extras.preserveLanguage !== undefined) {
    shared.push({ id: REDIRECT_FIELD_IDS.preserveLanguage, hint: 'PreserveLanguage', value: extras.preserveLanguage });
  }
  return makeItem({
    id,
    parent: parentId,
    path: `${parentPath}/${name}`,
    template: REDIRECT_MAP_TEMPLATE_ID,
    sharedFields: shared,
  });
}

describe('resolveRedirects', () => {
  it('returns [] when no Redirects container exists for the site', () => {
    const engine = buildEngine(makeSiteSkeleton().slice(0, 3)); // no /Settings/Redirects
    expect(resolveRedirects(engine, 'site', SITE_ROOT)).toEqual([]);
  });

  it('returns [] when the Redirects container has no Redirect Map children', () => {
    const engine = buildEngine(makeSiteSkeleton());
    expect(resolveRedirects(engine, 'site', SITE_ROOT)).toEqual([]);
  });

  it('returns [] when siteName does not match the site root', () => {
    const items = makeSiteSkeleton();
    items.push(makeRedirectMap(
      'aaaaaaaa-rdm1-0000-0000-000000000000',
      'aaaaaaaa-rdrs-0000-0000-000000000000',
      '/sitecore/content/tenant/site/Settings/Redirects',
      'Vanity',
      '%2fold=%2Fnew',
    ));
    const engine = buildEngine(items);
    expect(resolveRedirects(engine, 'othersite', SITE_ROOT)).toEqual([]);
  });

  it('parses a single Redirect Map with one pattern=target pair', () => {
    const items = makeSiteSkeleton();
    items.push(makeRedirectMap(
      'aaaaaaaa-rdm1-0000-0000-000000000000',
      'aaaaaaaa-rdrs-0000-0000-000000000000',
      '/sitecore/content/tenant/site/Settings/Redirects',
      'Vanity',
      '%2fold=%2Fnew',
      { redirectType: 'Redirect301' },
    ));
    const result = resolveRedirects(buildEngine(items), 'site', SITE_ROOT);
    expect(result).toEqual([
      {
        pattern: '/old',
        target: '/new',
        redirectType: 'REDIRECT_301',
        isQueryStringPreserved: false,
        isLanguagePreserved: false,
        locale: '',
      },
    ]);
  });

  it('parses multiple pattern=target pairs from a single UrlMapping field', () => {
    const items = makeSiteSkeleton();
    items.push(makeRedirectMap(
      'aaaaaaaa-rdm1-0000-0000-000000000000',
      'aaaaaaaa-rdrs-0000-0000-000000000000',
      '/sitecore/content/tenant/site/Settings/Redirects',
      '404s',
      '%2fa=%2F1&%2fb=%2F2&%2fc=%2F3',
      { redirectType: 'Redirect301' },
    ));
    const result = resolveRedirects(buildEngine(items), 'site', SITE_ROOT);
    expect(result.map(r => [r.pattern, r.target])).toEqual([
      ['/a', '/1'],
      ['/b', '/2'],
      ['/c', '/3'],
    ]);
  });

  it('maps all three RedirectType enum values', () => {
    const items = makeSiteSkeleton();
    items.push(makeRedirectMap('rdm-301', 'aaaaaaaa-rdrs-0000-0000-000000000000', '/sitecore/content/tenant/site/Settings/Redirects', 'm301',
      '%2fa=%2F1', { redirectType: 'Redirect301' }));
    items.push(makeRedirectMap('rdm-302', 'aaaaaaaa-rdrs-0000-0000-000000000000', '/sitecore/content/tenant/site/Settings/Redirects', 'm302',
      '%2fb=%2F2', { redirectType: 'Redirect302' }));
    items.push(makeRedirectMap('rdm-srv', 'aaaaaaaa-rdrs-0000-0000-000000000000', '/sitecore/content/tenant/site/Settings/Redirects', 'mserv',
      '%2fc=%2F3', { redirectType: 'ServerTransfer' }));
    const result = resolveRedirects(buildEngine(items), 'site', SITE_ROOT);
    const types = result.map(r => r.redirectType);
    expect(types).toContain('REDIRECT_301');
    expect(types).toContain('REDIRECT_302');
    expect(types).toContain('REDIRECT_SERVER_TRANSFER');
  });

  it('defaults redirectType to REDIRECT_301 when the field is absent', () => {
    const items = makeSiteSkeleton();
    items.push(makeRedirectMap(
      'rdm-default',
      'aaaaaaaa-rdrs-0000-0000-000000000000',
      '/sitecore/content/tenant/site/Settings/Redirects',
      'noType',
      '%2fa=%2F1',
    ));
    const result = resolveRedirects(buildEngine(items), 'site', SITE_ROOT);
    expect(result[0].redirectType).toBe('REDIRECT_301');
  });

  it('reads preserve flags when set to "1"', () => {
    const items = makeSiteSkeleton();
    items.push(makeRedirectMap(
      'rdm-flags',
      'aaaaaaaa-rdrs-0000-0000-000000000000',
      '/sitecore/content/tenant/site/Settings/Redirects',
      'flags',
      '%2fa=%2F1',
      { redirectType: 'Redirect301', preserveQueryString: '1', preserveLanguage: '1' },
    ));
    const r = resolveRedirects(buildEngine(items), 'site', SITE_ROOT)[0];
    expect(r.isQueryStringPreserved).toBe(true);
    expect(r.isLanguagePreserved).toBe(true);
  });

  it('walks through Redirect Map Grouping folders to find nested Redirect Maps', () => {
    const items = makeSiteSkeleton();
    items.push(makeItem({
      id: 'aaaaaaaa-grup-0000-0000-000000000000',
      parent: 'aaaaaaaa-rdrs-0000-0000-000000000000',
      path: '/sitecore/content/tenant/site/Settings/Redirects/Legacy',
      template: REDIRECT_MAP_GROUPING_TEMPLATE_ID,
    }));
    items.push(makeRedirectMap(
      'rdm-nested',
      'aaaaaaaa-grup-0000-0000-000000000000',
      '/sitecore/content/tenant/site/Settings/Redirects/Legacy',
      'Archived',
      '%2fx=%2FY',
      { redirectType: 'Redirect301' },
    ));
    const result = resolveRedirects(buildEngine(items), 'site', SITE_ROOT);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ pattern: '/x', target: '/Y' });
  });

  it('skips empty pairs in UrlMapping (e.g. trailing &)', () => {
    const items = makeSiteSkeleton();
    items.push(makeRedirectMap(
      'rdm-empty',
      'aaaaaaaa-rdrs-0000-0000-000000000000',
      '/sitecore/content/tenant/site/Settings/Redirects',
      'empties',
      '%2fa=%2F1&&%2fb=%2F2&',
      { redirectType: 'Redirect301' },
    ));
    const result = resolveRedirects(buildEngine(items), 'site', SITE_ROOT);
    expect(result).toHaveLength(2);
  });

  it('decodes URL-encoded characters in both pattern and target', () => {
    const items = makeSiteSkeleton();
    // `%2fa%2fb=%2Fx%2Fy` → pattern '/a/b', target '/x/y'
    items.push(makeRedirectMap(
      'rdm-enc',
      'aaaaaaaa-rdrs-0000-0000-000000000000',
      '/sitecore/content/tenant/site/Settings/Redirects',
      'encoded',
      '%2fa%2fb=%2Fx%2Fy',
      { redirectType: 'Redirect301' },
    ));
    const result = resolveRedirects(buildEngine(items), 'site', SITE_ROOT);
    expect(result[0]).toMatchObject({ pattern: '/a/b', target: '/x/y' });
  });
});
