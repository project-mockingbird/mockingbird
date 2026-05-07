import { describe, it, expect } from 'vitest';
import { buildEngine, makeItem, buildSctFixture, addSettingsAndSctFolder, addSctItem, addPerSiteTemplate } from './_helpers.js';
import {
  findAncestorOfTemplate,
  getTenantSharedSiteRoots,
  locateSctFolder,
  resolveSctForTemplateInSite,
  readFieldViaSctOverride,
  __resetSctCachesForTest,
} from '../../../src/engine/layout/site-collection-templates.js';
import {
  BASE_TENANT_TEMPLATE_ID,
  BASE_SITE_ROOT_TEMPLATE_ID,
  FIELD_IDS,
  SHARED_SITES_FIELD_ID,
} from '../../../src/engine/constants.js';

describe('findAncestorOfTemplate', () => {
  it('returns ancestor whose template inherits from the target', () => {
    const tenantTpl = 'a0000001-0000-0000-0000-000000000000';
    const siteTpl = 'a0000002-0000-0000-0000-000000000000';
    const pageTpl = 'a0000003-0000-0000-0000-000000000000';
    const engine = buildEngine([
      makeItem({
        id: 'b0000001-0000-0000-0000-000000000000',
        path: '/sitecore/content/tenant',
        template: tenantTpl,
        sharedFields: [],
      }),
      makeItem({
        id: tenantTpl,
        path: '/sitecore/templates/tenant',
        template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
        sharedFields: [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${BASE_TENANT_TEMPLATE_ID.toUpperCase()}}` }],
      }),
      makeItem({
        id: siteTpl,
        path: '/sitecore/templates/site',
        template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
        sharedFields: [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${BASE_SITE_ROOT_TEMPLATE_ID.toUpperCase()}}` }],
      }),
      makeItem({
        id: 'b0000002-0000-0000-0000-000000000000',
        parent: 'b0000001-0000-0000-0000-000000000000',
        path: '/sitecore/content/tenant/site',
        template: siteTpl,
        sharedFields: [],
      }),
      makeItem({
        id: 'b0000003-0000-0000-0000-000000000000',
        parent: 'b0000002-0000-0000-0000-000000000000',
        path: '/sitecore/content/tenant/site/home',
        template: pageTpl,
        sharedFields: [],
      }),
    ]);
    const found = findAncestorOfTemplate(engine, '/sitecore/content/tenant/site', BASE_TENANT_TEMPLATE_ID);
    expect(found?.id).toBe('b0000001-0000-0000-0000-000000000000');
  });

  it('returns undefined when no ancestor matches', () => {
    const engine = buildEngine([
      makeItem({ id: 'b0000001-0000-0000-0000-000000000000', path: '/sitecore/content/site' }),
    ]);
    expect(findAncestorOfTemplate(engine, '/sitecore/content/site', BASE_TENANT_TEMPLATE_ID)).toBeUndefined();
  });

  it('returns undefined for unresolvable start path', () => {
    const engine = buildEngine([]);
    expect(findAncestorOfTemplate(engine, '/nonexistent', BASE_TENANT_TEMPLATE_ID)).toBeUndefined();
  });
});

describe('getTenantSharedSiteRoots', () => {
  it('returns shared site root paths excluding the current site', () => {
    const fixture = buildSctFixture({
      tenantName: 'tenant',
      sites: [
        { name: 'site', shared: ['common'] },
        { name: 'common' },
      ],
    });
    const chain = getTenantSharedSiteRoots(fixture.engine, '/sitecore/content/tenant/site');
    expect(chain).toEqual(['/sitecore/content/tenant/common']);
  });

  it('returns empty array when no tenant ancestor', () => {
    const engine = buildEngine([
      makeItem({ id: 'b0000001-0000-0000-0000-000000000000', path: '/sitecore/content/site' }),
    ]);
    expect(getTenantSharedSiteRoots(engine, '/sitecore/content/site')).toEqual([]);
  });

  it('returns empty array when SharedSites field is absent', () => {
    const fixture = buildSctFixture({
      tenantName: 'tenant',
      sites: [{ name: 'site' }],
    });
    expect(getTenantSharedSiteRoots(fixture.engine, '/sitecore/content/tenant/site')).toEqual([]);
  });

  it('drops unresolvable GUIDs from SharedSites', () => {
    const tenantTpl = 'a0000001-0000-0000-0000-000000000000';
    const siteTpl = 'a0000002-0000-0000-0000-000000000000';
    const engine = buildEngine([
      makeItem({
        id: tenantTpl,
        path: '/sitecore/templates/tenant',
        template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
        sharedFields: [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${BASE_TENANT_TEMPLATE_ID.toUpperCase()}}` }],
      }),
      makeItem({
        id: siteTpl,
        path: '/sitecore/templates/site',
        template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
        sharedFields: [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${BASE_SITE_ROOT_TEMPLATE_ID.toUpperCase()}}` }],
      }),
      makeItem({
        id: 'b0000001-0000-0000-0000-000000000000',
        path: '/sitecore/content/tenant',
        template: tenantTpl,
        sharedFields: [{ id: SHARED_SITES_FIELD_ID, hint: 'SharedSites', value: '{11111111-1111-1111-1111-111111111111}' }],
      }),
      makeItem({
        id: 'b0000002-0000-0000-0000-000000000000',
        parent: 'b0000001-0000-0000-0000-000000000000',
        path: '/sitecore/content/tenant/site',
        template: siteTpl,
      }),
    ]);
    expect(getTenantSharedSiteRoots(engine, '/sitecore/content/tenant/site')).toEqual([]);
  });
});

describe('locateSctFolder', () => {
  it('finds SCT folder via template-inheritance walk', () => {
    const fixture = buildSctFixture({
      tenantName: 'tenant',
      sites: [{ name: 'site' }],
    });
    const siteId = 'ba000010-0000-0000-0000-000000000000'; // first site per fixture convention
    const settingsId = 'be000001-0000-0000-0000-000000000000';
    const sctFolderId = 'be000002-0000-0000-0000-000000000000';

    fixture.engine.getTree().addItem(
      makeItem({
        id: settingsId,
        parent: siteId,
        path: '/sitecore/content/tenant/site/Settings',
        template: fixture.settingsTemplateId,
      }),
      '/fake/settings.yml',
    );
    fixture.engine.getTree().addItem(
      makeItem({
        id: sctFolderId,
        parent: settingsId,
        path: '/sitecore/content/tenant/site/Settings/Standard Values',
        template: fixture.sctFolderTemplateId,
      }),
      '/fake/sctfolder.yml',
    );

    const folder = locateSctFolder(fixture.engine, '/sitecore/content/tenant/site');
    expect(folder?.item.id).toBe(sctFolderId);
  });

  it('walks up from a child of the site root (JSS start-item convention)', () => {
    // Regression guard: a deployment may set `SITE_ROOT_PATH` to the JSS start
    // item (`<siteRoot>/Home`) rather than the SXA site root itself - the
    // start-item form lines up with URL-prefix stripping for route paths
    // like `/about/...`. `locateSctFolder` must walk up until it hits the
    // real `_BaseSiteRoot` ancestor before searching for Settings.
    const fixture = buildSctFixture({
      tenantName: 'tenant',
      sites: [{ name: 'site' }],
    });
    const siteId = 'ba000010-0000-0000-0000-000000000000';
    const settingsId = 'be000001-0000-0000-0000-000000000000';
    const sctFolderId = 'be000002-0000-0000-0000-000000000000';
    const homeId = 'bc000001-0000-0000-0000-000000000000';

    fixture.engine.getTree().addItem(
      makeItem({
        id: settingsId,
        parent: siteId,
        path: '/sitecore/content/tenant/site/Settings',
        template: fixture.settingsTemplateId,
      }),
      '/fake/settings.yml',
    );
    fixture.engine.getTree().addItem(
      makeItem({
        id: sctFolderId,
        parent: settingsId,
        path: '/sitecore/content/tenant/site/Settings/Standard Values',
        template: fixture.sctFolderTemplateId,
      }),
      '/fake/sctfolder.yml',
    );
    fixture.engine.getTree().addItem(
      makeItem({
        id: homeId,
        parent: siteId,
        path: '/sitecore/content/tenant/site/Home',
        template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
      }),
      '/fake/home.yml',
    );

    const folder = locateSctFolder(fixture.engine, '/sitecore/content/tenant/site/Home');
    expect(folder?.item.id).toBe(sctFolderId);
  });

  it('returns undefined when Settings child is missing', () => {
    const fixture = buildSctFixture({
      tenantName: 'tenant',
      sites: [{ name: 'site' }],
    });
    expect(locateSctFolder(fixture.engine, '/sitecore/content/tenant/site')).toBeUndefined();
  });

  it('returns undefined when SCT folder child is missing', () => {
    const fixture = buildSctFixture({
      tenantName: 'tenant',
      sites: [{ name: 'site' }],
    });
    const siteId = 'ba000010-0000-0000-0000-000000000000';
    fixture.engine.getTree().addItem(
      makeItem({
        id: 'be000001-0000-0000-0000-000000000000',
        parent: siteId,
        path: '/sitecore/content/tenant/site/Settings',
        template: fixture.settingsTemplateId,
      }),
      '/fake/settings.yml',
    );
    expect(locateSctFolder(fixture.engine, '/sitecore/content/tenant/site')).toBeUndefined();
  });

  it('returns undefined when site root is unresolvable', () => {
    const fixture = buildSctFixture({
      tenantName: 'tenant',
      sites: [{ name: 'site' }],
    });
    expect(locateSctFolder(fixture.engine, '/nonexistent')).toBeUndefined();
  });
});

describe('resolveSctForTemplateInSite — exact match', () => {
  it('returns SCT item when exact template match exists', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page');
    const sct = addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'News Article Page',
      subjectTemplateId: pageTpl,
      fields: { '4e0720e9-9d50-4ddc-87cf-ecd65e8e94c8': 'News Article Page' },
    });
    const resolved = resolveSctForTemplateInSite(fixture.engine, '/sitecore/content/tenant/site', pageTpl);
    expect(resolved?.id).toBe(sct.id);
  });

  it('returns undefined when no SCT items match', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page');
    expect(resolveSctForTemplateInSite(fixture.engine, '/sitecore/content/tenant/site', pageTpl)).toBeUndefined();
  });

  it('returns undefined when Settings or SCT folder is missing', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page');
    expect(resolveSctForTemplateInSite(fixture.engine, '/sitecore/content/tenant/site', pageTpl)).toBeUndefined();
  });
});

describe('resolveSctForTemplateInSite — base-template fallback', () => {
  it('returns base-template SCT when no exact match AND no classic SV', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const baseTpl = addPerSiteTemplate(fixture.engine, 'Base Page');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page', [baseTpl]);
    const sct = addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'Base Page',
      subjectTemplateId: baseTpl,
      fields: { '4e0720e9-9d50-4ddc-87cf-ecd65e8e94c8': 'Base Page' },
    });
    const resolved = resolveSctForTemplateInSite(fixture.engine, '/sitecore/content/tenant/site', pageTpl);
    expect(resolved?.id).toBe(sct.id);
  });

  it('exact match wins over base-template candidate', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const baseTpl = addPerSiteTemplate(fixture.engine, 'Base Page');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page', [baseTpl]);
    addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'Base Page',
      subjectTemplateId: baseTpl,
      fields: {},
    });
    const exactSct = addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'News Article Page',
      subjectTemplateId: pageTpl,
      fields: {},
    });
    const resolved = resolveSctForTemplateInSite(fixture.engine, '/sitecore/content/tenant/site', pageTpl);
    expect(resolved?.id).toBe(exactSct.id);
  });

  it('classic-SV suppression blocks base-template fallback', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const baseTpl = addPerSiteTemplate(fixture.engine, 'Base Page');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page', [baseTpl]);

    // Add a __Standard Values item for pageTpl so classic-SV suppression fires.
    fixture.engine.getTree().addItem(
      makeItem({
        id: `cc${Math.random().toString(16).slice(2, 10).padEnd(8, '0')}-0000-0000-0000-000000000000`,
        parent: pageTpl,
        path: `/sitecore/templates/test/News Article Page/__Standard Values`,
        template: pageTpl,
      }),
      '/fake/sv.yml',
    );

    addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'Base Page',
      subjectTemplateId: baseTpl,
      fields: {},
    });
    expect(resolveSctForTemplateInSite(fixture.engine, '/sitecore/content/tenant/site', pageTpl)).toBeUndefined();
  });

  it('direct-base-only: grandparent-template SCT does NOT match', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const grandTpl = addPerSiteTemplate(fixture.engine, 'Grand Page');
    const baseTpl = addPerSiteTemplate(fixture.engine, 'Base Page', [grandTpl]);
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page', [baseTpl]);

    addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'Grand Page',
      subjectTemplateId: grandTpl,
      fields: {},
    });
    // pageTpl's direct bases are [_PerSiteStandardValues, baseTpl]. grandTpl is transitive.
    // Walker should NOT find grandTpl's SCT in base-template fallback.
    expect(resolveSctForTemplateInSite(fixture.engine, '/sitecore/content/tenant/site', pageTpl)).toBeUndefined();
  });
});

describe('readFieldViaSctOverride', () => {
  const NAV_TITLE_FIELD_ID = '4e0720e9-9d50-4ddc-87cf-ecd65e8e94c8';

  it('subject-template gate: template NOT inheriting _PerSiteStandardValues returns undefined', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    // Plain template — NOT inheriting _PerSiteStandardValues.
    const plainTplId = 'ad000001-0000-0000-0000-000000000000';
    fixture.engine.getTree().addItem(
      makeItem({
        id: plainTplId,
        path: '/sitecore/templates/test/plain',
        template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
        sharedFields: [],
      }),
      '/fake/tpl.yml',
    );
    const subjectItem = makeItem({
      id: 'b000aaaa-0000-0000-0000-000000000000',
      parent: 'ba000010-0000-0000-0000-000000000000',
      path: '/sitecore/content/tenant/site/plain',
      template: plainTplId,
    });
    fixture.engine.getTree().addItem(subjectItem, '/fake/sub.yml');
    expect(readFieldViaSctOverride(fixture.engine, subjectItem, NAV_TITLE_FIELD_ID, 'en', '/sitecore/content/tenant/site')).toBeUndefined();
  });

  it('returns literal SCT value (no token expansion)', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page');
    addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'News Article Page',
      subjectTemplateId: pageTpl,
      fields: { [NAV_TITLE_FIELD_ID]: '$name' }, // literal $name — SCT should NOT expand
    });
    const subjectItem = makeItem({
      id: 'b0000099-0000-0000-0000-000000000000',
      parent: 'ba000010-0000-0000-0000-000000000000',
      path: '/sitecore/content/tenant/site/article-one',
      template: pageTpl,
    });
    fixture.engine.getTree().addItem(subjectItem, '/fake/sub.yml');
    const value = readFieldViaSctOverride(fixture.engine, subjectItem, NAV_TITLE_FIELD_ID, 'en', '/sitecore/content/tenant/site');
    expect(value).toBe('$name'); // verbatim, NOT expanded to item name
  });

  it('returns undefined for empty-string SCT value (falls through to classic cascade)', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page');
    addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'News Article Page',
      subjectTemplateId: pageTpl,
      fields: { [NAV_TITLE_FIELD_ID]: '' },
    });
    const subjectItem = makeItem({
      id: 'b0000099-0000-0000-0000-000000000000',
      parent: 'ba000010-0000-0000-0000-000000000000',
      path: '/sitecore/content/tenant/site/article-one',
      template: pageTpl,
    });
    fixture.engine.getTree().addItem(subjectItem, '/fake/sub.yml');
    expect(readFieldViaSctOverride(fixture.engine, subjectItem, NAV_TITLE_FIELD_ID, 'en', '/sitecore/content/tenant/site')).toBeUndefined();
  });

  it('returns undefined for whitespace-only SCT value', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page');
    addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'News Article Page',
      subjectTemplateId: pageTpl,
      fields: { [NAV_TITLE_FIELD_ID]: '   ' },
    });
    const subjectItem = makeItem({
      id: 'b0000099-0000-0000-0000-000000000000',
      parent: 'ba000010-0000-0000-0000-000000000000',
      path: '/sitecore/content/tenant/site/article-one',
      template: pageTpl,
    });
    fixture.engine.getTree().addItem(subjectItem, '/fake/sub.yml');
    expect(readFieldViaSctOverride(fixture.engine, subjectItem, NAV_TITLE_FIELD_ID, 'en', '/sitecore/content/tenant/site')).toBeUndefined();
  });

  it('self-reference gate: subject IS the SCT item → falls through', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page');
    const sct = addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'News Article Page',
      subjectTemplateId: pageTpl,
      fields: { [NAV_TITLE_FIELD_ID]: 'News Article Page' },
    });
    // subject item IS the SCT item itself.
    expect(readFieldViaSctOverride(fixture.engine, sct, NAV_TITLE_FIELD_ID, 'en', '/sitecore/content/tenant/site')).toBeUndefined();
  });

  it('multi-site: falls back to shared site when current has no match', () => {
    const fixture = buildSctFixture({
      tenantName: 'tenant',
      sites: [{ name: 'site', shared: ['common'] }, { name: 'common' }],
    });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/common');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page');
    addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/common',
      fileName: 'News Article Page',
      subjectTemplateId: pageTpl,
      fields: { [NAV_TITLE_FIELD_ID]: 'Common News Article' },
    });
    const subjectItem = makeItem({
      id: 'b0000099-0000-0000-0000-000000000000',
      parent: 'ba000010-0000-0000-0000-000000000000',
      path: '/sitecore/content/tenant/site/article-one',
      template: pageTpl,
    });
    fixture.engine.getTree().addItem(subjectItem, '/fake/sub.yml');
    expect(readFieldViaSctOverride(fixture.engine, subjectItem, NAV_TITLE_FIELD_ID, 'en', '/sitecore/content/tenant/site')).toBe('Common News Article');
  });

  it('multi-site: current site wins over shared site', () => {
    const fixture = buildSctFixture({
      tenantName: 'tenant',
      sites: [{ name: 'site', shared: ['common'] }, { name: 'common' }],
    });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/common');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page');
    addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'News Article Page',
      subjectTemplateId: pageTpl,
      fields: { [NAV_TITLE_FIELD_ID]: 'SITE News Article' },
    });
    addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/common',
      fileName: 'News Article Page',
      subjectTemplateId: pageTpl,
      fields: { [NAV_TITLE_FIELD_ID]: 'Common News Article' },
    });
    const subjectItem = makeItem({
      id: 'b0000099-0000-0000-0000-000000000000',
      parent: 'ba000010-0000-0000-0000-000000000000',
      path: '/sitecore/content/tenant/site/article-one',
      template: pageTpl,
    });
    fixture.engine.getTree().addItem(subjectItem, '/fake/sub.yml');
    expect(readFieldViaSctOverride(fixture.engine, subjectItem, NAV_TITLE_FIELD_ID, 'en', '/sitecore/content/tenant/site')).toBe('SITE News Article');
  });

  it('returns undefined when siteRootPath is empty', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page');
    const subjectItem = makeItem({ id: 'x0000000-0000-0000-0000-000000000000', path: '/x', template: pageTpl });
    expect(readFieldViaSctOverride(fixture.engine, subjectItem, NAV_TITLE_FIELD_ID, 'en', '')).toBeUndefined();
  });
});

describe('SCT resolution cache', () => {
  const NAV_TITLE_FIELD_ID = '4e0720e9-9d50-4ddc-87cf-ecd65e8e94c8';

  it('returns same SCT across repeated lookups for same (template, siteRoot)', () => {
    __resetSctCachesForTest();
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page');
    const sct = addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'News Article Page',
      subjectTemplateId: pageTpl,
      fields: { [NAV_TITLE_FIELD_ID]: 'News Article Page' },
    });
    const first = resolveSctForTemplateInSite(fixture.engine, '/sitecore/content/tenant/site', pageTpl);
    const second = resolveSctForTemplateInSite(fixture.engine, '/sitecore/content/tenant/site', pageTpl);
    expect(first?.id).toBe(sct.id);
    expect(second?.id).toBe(sct.id);
  });

  it('caches miss as null (repeated misses do not re-walk)', () => {
    __resetSctCachesForTest();
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page');
    const first = resolveSctForTemplateInSite(fixture.engine, '/sitecore/content/tenant/site', pageTpl);
    const second = resolveSctForTemplateInSite(fixture.engine, '/sitecore/content/tenant/site', pageTpl);
    expect(first).toBeUndefined();
    expect(second).toBeUndefined();
  });

  it('caches tenant shared-sites chain per siteRootPath', () => {
    __resetSctCachesForTest();
    const fixture = buildSctFixture({
      tenantName: 'tenant',
      sites: [{ name: 'site', shared: ['common'] }, { name: 'common' }],
    });
    const first = getTenantSharedSiteRoots(fixture.engine, '/sitecore/content/tenant/site');
    const second = getTenantSharedSiteRoots(fixture.engine, '/sitecore/content/tenant/site');
    expect(first).toEqual(['/sitecore/content/tenant/common']);
    expect(second).toEqual(['/sitecore/content/tenant/common']);
  });

  it('different engines have independent caches (WeakMap keyed)', () => {
    __resetSctCachesForTest();
    const a = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(a, '/sitecore/content/tenant/site');
    const pageTplA = addPerSiteTemplate(a.engine, 'News Article Page');
    const sctA = addSctItem({
      engine: a.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'News Article Page',
      subjectTemplateId: pageTplA,
      fields: { [NAV_TITLE_FIELD_ID]: 'A value' },
    });
    const b = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    // Engine B has no SCT — independent cache should miss.
    const foundA = resolveSctForTemplateInSite(a.engine, '/sitecore/content/tenant/site', pageTplA);
    const foundB = resolveSctForTemplateInSite(b.engine, '/sitecore/content/tenant/site', pageTplA);
    expect(foundA?.id).toBe(sctA.id);
    expect(foundB).toBeUndefined();
  });
});
