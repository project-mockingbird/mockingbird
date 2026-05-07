/**
 * Tests for `query:$linkableHomes` resolution. Mirrors SXA's
 * `Sitecore.XA.Foundation.Multisite.Services.CrossSiteLinkingService`:
 *
 *   - ItselfOnly             -> only the current site's home
 *   - LinkableSitesInTenant  -> linkable sites under the current tenant + current site
 *   - AllLinkableSites       -> all linkable sites + current site
 *   - default (missing field) -> AllLinkableSites
 *
 * Built on a programmatic Engine stub to avoid maintaining a separate
 * fixture content tree on disk; the same `Object.create(Engine.prototype)`
 * pattern lookup-sources-query.test.ts uses.
 */

import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import { resolveLookupSource } from '../../src/engine/lookup-sources.js';
import {
  BASE_SITE_DEFINITION_TEMPLATE_ID,
  BASE_SITE_ROOT_TEMPLATE_ID,
  BASE_TENANT_TEMPLATE_ID,
  SITE_FIELD_IDS,
  LINK_SETTINGS_FIELD_ID,
} from '../../src/engine/constants.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NULL_GUID = '00000000-0000-0000-0000-000000000000';
const SXA_LINKABLE_FIELD_ID = SITE_FIELD_IDS.sxaLinkable;

// Generic settings template id used by the Settings folder under each site.
// The mode resolver does NOT inheritance-check the Settings item, it just
// walks `<site>/Settings` by path - so any template id works here.
const SETTINGS_TPL_ID = 'aaaaaaaa-1111-1111-1111-000000000099';

// Template-name-suffix lookup needs registry-resolvable template items whose
// path's last segment is the template name. We seed three:
//   - "Tenant"        - so findAncestorByTemplateNameSuffix(_, 'tenant') matches _BaseTenant
//   - "Site Root"     - so findAncestorByTemplateNameSuffix(_, 'site') matches _BaseSiteRoot
//   - "Site Grouping" - cosmetic; site definition items aren't ever searched by suffix
const TEMPLATES_ROOT = '/sitecore/templates/Foundation/Multisite';

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

interface SiteSpec {
  name: string;
  tenantPath: string;
  homeId: string;
  rootId: string;
  startItemId: string;
  settingsId: string;
  groupingFolderId: string;
  groupingId: string;
  linkable: boolean;
  linkSettingsValue?: string; // raw stored value (e.g. '0' / '1' / '2' / 'AllLinkableSites' / undefined)
}

/**
 * Build a flat list of ScsItems for one tenant. Caller passes the tenant
 * id/path and a list of SiteSpec entries; this returns the tenant item plus
 * one site sub-tree per spec.
 */
function buildTenant(opts: {
  tenantId: string;
  tenantPath: string;
  parentId: string;
  sites: SiteSpec[];
}): ScsItem[] {
  const items: ScsItem[] = [];
  items.push(makeItem({
    id: opts.tenantId,
    path: opts.tenantPath,
    parent: opts.parentId,
    template: BASE_TENANT_TEMPLATE_ID,
  }));
  for (const s of opts.sites) {
    const sitePath = `${opts.tenantPath}/${s.name}`;
    items.push(makeItem({
      id: s.rootId,
      path: sitePath,
      parent: opts.tenantId,
      template: BASE_SITE_ROOT_TEMPLATE_ID,
    }));
    // Home / start item under site root
    items.push(makeItem({
      id: s.homeId,
      path: `${sitePath}/Home`,
      parent: s.rootId,
      template: NULL_GUID,
    }));
    // Settings folder
    const settingsFields: { id: string; value: string }[] = [];
    if (s.linkSettingsValue !== undefined) {
      settingsFields.push({ id: LINK_SETTINGS_FIELD_ID, value: s.linkSettingsValue });
    }
    items.push(makeItem({
      id: s.settingsId,
      path: `${sitePath}/Settings`,
      parent: s.rootId,
      template: SETTINGS_TPL_ID,
      sharedFields: settingsFields,
    }));
    // Site Grouping container + the Site Grouping item itself
    items.push(makeItem({
      id: s.groupingFolderId,
      path: `${sitePath}/Settings/Site Grouping`,
      parent: s.settingsId,
      template: NULL_GUID,
    }));
    const groupingFields: { id: string; value: string }[] = [
      { id: SITE_FIELD_IDS.siteName, value: s.name },
      { id: SITE_FIELD_IDS.startItem, value: `{${s.startItemId.toUpperCase()}}` },
      { id: SITE_FIELD_IDS.hostName, value: `${s.name.toLowerCase()}.test` },
      { id: SITE_FIELD_IDS.language, value: 'en' },
    ];
    if (s.linkable) {
      groupingFields.push({ id: SXA_LINKABLE_FIELD_ID, value: '1' });
    }
    items.push(makeItem({
      id: s.groupingId,
      path: `${sitePath}/Settings/Site Grouping/${s.name}`,
      parent: s.groupingFolderId,
      template: BASE_SITE_DEFINITION_TEMPLATE_ID,
      sharedFields: groupingFields,
    }));
  }
  return items;
}

/**
 * Build a 4-site, 2-tenant fixture used by most tests. Tenants and sites
 * use deterministic ids so individual tests can navigate without lookup.
 */
function buildMultiTenantTree(): Engine {
  // Template items for findAncestorByTemplateNameSuffix lookups.
  const tenantTpl = makeItem({
    id: BASE_TENANT_TEMPLATE_ID,
    path: `${TEMPLATES_ROOT}/Tenant`,
  });
  const siteRootTpl = makeItem({
    id: BASE_SITE_ROOT_TEMPLATE_ID,
    path: `${TEMPLATES_ROOT}/Site Root`,
  });
  const siteGroupingTpl = makeItem({
    id: BASE_SITE_DEFINITION_TEMPLATE_ID,
    path: `${TEMPLATES_ROOT}/Site Grouping`,
  });
  const settingsTpl = makeItem({
    id: SETTINGS_TPL_ID,
    path: `${TEMPLATES_ROOT}/Site Settings`,
  });

  // /sitecore/content (parent of the tenants)
  const contentRoot = makeItem({
    id: '0de95ae4-41ab-4d01-9eb0-67441b7c2450',
    path: '/sitecore/content',
  });

  const tenantA = buildTenant({
    tenantId: 'aaaa0000-0000-0000-0000-000000000001',
    tenantPath: '/sitecore/content/TenantA',
    parentId: contentRoot.id,
    sites: [
      {
        name: 'SiteA1',
        rootId:           'aaaa0000-0000-0000-0000-000000000010',
        homeId:           'aaaa0000-0000-0000-0000-000000000011',
        startItemId:      'aaaa0000-0000-0000-0000-000000000011',
        settingsId:       'aaaa0000-0000-0000-0000-000000000012',
        groupingFolderId: 'aaaa0000-0000-0000-0000-000000000013',
        groupingId:       'aaaa0000-0000-0000-0000-000000000014',
        linkable: true,
        // No LinkSettings field -> default AllLinkableSites
      },
      {
        name: 'SiteA2',
        rootId:           'aaaa0000-0000-0000-0000-000000000020',
        homeId:           'aaaa0000-0000-0000-0000-000000000021',
        startItemId:      'aaaa0000-0000-0000-0000-000000000021',
        settingsId:       'aaaa0000-0000-0000-0000-000000000022',
        groupingFolderId: 'aaaa0000-0000-0000-0000-000000000023',
        groupingId:       'aaaa0000-0000-0000-0000-000000000024',
        linkable: true,
        linkSettingsValue: '0', // ItselfOnly
      },
      {
        name: 'SiteA3',
        rootId:           'aaaa0000-0000-0000-0000-000000000030',
        homeId:           'aaaa0000-0000-0000-0000-000000000031',
        startItemId:      'aaaa0000-0000-0000-0000-000000000031',
        settingsId:       'aaaa0000-0000-0000-0000-000000000032',
        groupingFolderId: 'aaaa0000-0000-0000-0000-000000000033',
        groupingId:       'aaaa0000-0000-0000-0000-000000000034',
        linkable: false, // not linkable
        linkSettingsValue: '1', // LinkableSitesInTenant
      },
    ],
  });

  const tenantB = buildTenant({
    tenantId: 'bbbb0000-0000-0000-0000-000000000001',
    tenantPath: '/sitecore/content/TenantB',
    parentId: contentRoot.id,
    sites: [
      {
        name: 'SiteB1',
        rootId:           'bbbb0000-0000-0000-0000-000000000010',
        homeId:           'bbbb0000-0000-0000-0000-000000000011',
        startItemId:      'bbbb0000-0000-0000-0000-000000000011',
        settingsId:       'bbbb0000-0000-0000-0000-000000000012',
        groupingFolderId: 'bbbb0000-0000-0000-0000-000000000013',
        groupingId:       'bbbb0000-0000-0000-0000-000000000014',
        linkable: true,
      },
    ],
  });

  return buildEngine([
    tenantTpl,
    siteRootTpl,
    siteGroupingTpl,
    settingsTpl,
    contentRoot,
    ...tenantA,
    ...tenantB,
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveLookupSource - query:$linkableHomes', () => {
  describe('mode resolution from the per-site _LinkSettings field', () => {
    it('AllLinkableSites (default when field is absent): returns home items of every linkable site, including current', () => {
      const engine = buildMultiTenantTree();
      // Context = SiteA1's Home; SiteA1 has no LinkSettings field so default = AllLinkableSites.
      const result = resolveLookupSource(
        'query:$linkableHomes',
        'aaaa0000-0000-0000-0000-000000000011',
        engine,
      );
      expect(result.resolved).toBe(true);
      // Linkable sites: SiteA1 (current, linkable), SiteA2 (linkable), SiteB1 (linkable, cross-tenant).
      // SiteA3 NOT linkable -> excluded.
      const paths = result.items.map(i => i.path).sort();
      expect(paths).toEqual([
        '/sitecore/content/TenantA/SiteA1/Home',
        '/sitecore/content/TenantA/SiteA2/Home',
        '/sitecore/content/TenantB/SiteB1/Home',
      ]);
    });

    it('AllLinkableSites: explicit "2" value matches the integer enum encoding', () => {
      const engine = buildMultiTenantTree();
      // Override SiteA1's settings to explicitly say AllLinkableSites
      const settings = engine.getItemById('aaaa0000-0000-0000-0000-000000000012')!;
      settings.item.sharedFields.push({ id: LINK_SETTINGS_FIELD_ID, value: '2' });
      const result = resolveLookupSource(
        'query:$linkableHomes',
        'aaaa0000-0000-0000-0000-000000000011',
        engine,
      );
      const paths = result.items.map(i => i.path).sort();
      expect(paths).toEqual([
        '/sitecore/content/TenantA/SiteA1/Home',
        '/sitecore/content/TenantA/SiteA2/Home',
        '/sitecore/content/TenantB/SiteB1/Home',
      ]);
    });

    it('AllLinkableSites: symbolic name is also accepted', () => {
      const engine = buildMultiTenantTree();
      const settings = engine.getItemById('aaaa0000-0000-0000-0000-000000000012')!;
      settings.item.sharedFields.push({ id: LINK_SETTINGS_FIELD_ID, value: 'AllLinkableSites' });
      const result = resolveLookupSource(
        'query:$linkableHomes',
        'aaaa0000-0000-0000-0000-000000000011',
        engine,
      );
      expect(result.items).toHaveLength(3);
    });

    it('ItselfOnly: returns just the current site\'s home item', () => {
      const engine = buildMultiTenantTree();
      // Context = SiteA2/Home (LinkSettings='0')
      const result = resolveLookupSource(
        'query:$linkableHomes',
        'aaaa0000-0000-0000-0000-000000000021',
        engine,
      );
      expect(result.resolved).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].path).toBe('/sitecore/content/TenantA/SiteA2/Home');
    });

    it('LinkableSitesInTenant: returns linkable sites within the current tenant only, plus current', () => {
      const engine = buildMultiTenantTree();
      // Context = SiteA3/Home (LinkSettings='1', linkable=false)
      const result = resolveLookupSource(
        'query:$linkableHomes',
        'aaaa0000-0000-0000-0000-000000000031',
        engine,
      );
      expect(result.resolved).toBe(true);
      // TenantA contains SiteA1 (linkable), SiteA2 (linkable), SiteA3 (not linkable but current)
      // TenantB.SiteB1 is linkable but outside the current tenant -> excluded.
      const paths = result.items.map(i => i.path).sort();
      expect(paths).toEqual([
        '/sitecore/content/TenantA/SiteA1/Home',
        '/sitecore/content/TenantA/SiteA2/Home',
        '/sitecore/content/TenantA/SiteA3/Home',
      ]);
    });
  });

  describe('edge cases', () => {
    it('returns [] (resolved:true) when contextItemId is undefined', () => {
      const engine = buildMultiTenantTree();
      const result = resolveLookupSource('query:$linkableHomes', undefined, engine);
      expect(result.resolved).toBe(true);
      expect(result.items).toEqual([]);
    });

    it('returns [] (resolved:true) when context item is unknown', () => {
      const engine = buildMultiTenantTree();
      const result = resolveLookupSource(
        'query:$linkableHomes',
        '99999999-9999-9999-9999-999999999999',
        engine,
      );
      expect(result.resolved).toBe(true);
      expect(result.items).toEqual([]);
    });

    it('returns [] (resolved:true) when context item lives outside any discovered site', () => {
      const engine = buildMultiTenantTree();
      // contentRoot has no enclosing _BaseSiteRoot ancestor.
      const result = resolveLookupSource(
        'query:$linkableHomes',
        '0de95ae4-41ab-4d01-9eb0-67441b7c2450',
        engine,
      );
      expect(result.resolved).toBe(true);
      expect(result.items).toEqual([]);
    });

    it('is case-insensitive on the token', () => {
      const engine = buildMultiTenantTree();
      const result = resolveLookupSource(
        'QUERY:$LINKABLEHOMES',
        'aaaa0000-0000-0000-0000-000000000011',
        engine,
      );
      expect(result.resolved).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('non-bare form (`query:$linkableHomes/Foo`) is NOT special-cased and falls through', () => {
      const engine = buildMultiTenantTree();
      const result = resolveLookupSource(
        'query:$linkableHomes/Foo',
        'aaaa0000-0000-0000-0000-000000000011',
        engine,
      );
      // The standard query handler doesn't recognise $linkableHomes as a path
      // token, so it returns resolved:false. The exact reason text is
      // implementation detail; assert resolved:false suffices.
      expect(result.resolved).toBe(false);
    });
  });
});
