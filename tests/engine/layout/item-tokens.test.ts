import { describe, it, expect } from 'vitest';
import { expandItemTokens } from '../../../src/engine/layout/item-tokens.js';
import {
  makeItem,
  buildEngine,
  buildSctFixture,
  addSettingsAndSctFolder,
  addSctItem,
  addPerSiteTemplate,
} from './_helpers.js';
import { buildItemValueIndex, resolveFieldValue } from '../../../src/engine/layout/item-fields.js';
import { FIELD_IDS } from '../../../src/engine/constants.js';

describe('expandItemTokens (0.4.0.11 item 4)', () => {
  // Port of Sitecore's `ExpandInitialFieldValue` processor. Substitutes
  // $-prefixed item-context tokens when invoked on SV-cascaded values.
  // Caller (resolveFieldValue in item-fields.ts) enforces the
  // cascade-only invariant — this function just expands whatever it's given.

  const DISPLAY_NAME_FIELD_ID = FIELD_IDS.displayName;

  it('$name → shared __Display Name field value', () => {
    const item = makeItem({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/content/site/Home/Tutorials/tutorial-01',
      sharedFields: [
        { id: DISPLAY_NAME_FIELD_ID, hint: '__Display Name', value: 'Tutorial Page' },
      ],
    });
    const engine = buildEngine([item]);
    expect(expandItemTokens('$name', item, engine)).toBe('Tutorial Page');
  });

  it('$name → fallback to item name from path when no display name set', () => {
    const item = makeItem({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      path: '/sitecore/content/site/Home/plain-item',
    });
    const engine = buildEngine([item]);
    expect(expandItemTokens('$name', item, engine)).toBe('plain-item');
  });

  it('$name → language-unversioned __Display Name wins over path fallback', () => {
    // The middle branch of itemDisplayName: shared is absent, language-unversioned
    // fields carry the value. Pinned as a regression guard — Sitecore's
    // Display Name can be authored as an unversioned language-scoped value.
    const item = makeItem({
      id: 'b1b1b1b1-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home/slug',
      languages: [{
        language: 'en',
        fields: [{ id: DISPLAY_NAME_FIELD_ID, hint: '__Display Name', value: 'Unversioned Name' }],
        versions: [],
      }],
    });
    const engine = buildEngine([item]);
    expect(expandItemTokens('$name', item, engine)).toBe('Unversioned Name');
  });

  it('$name → latest versioned __Display Name used when shared + unversioned absent', () => {
    // Innermost branch: walk versions latest-first. Two versions authored;
    // the higher version's value wins.
    const item = makeItem({
      id: 'b2b2b2b2-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home/slug',
      languages: [{
        language: 'en',
        fields: [],
        versions: [
          { version: 1, fields: [{ id: DISPLAY_NAME_FIELD_ID, hint: '__Display Name', value: 'v1 name' }] },
          { version: 2, fields: [{ id: DISPLAY_NAME_FIELD_ID, hint: '__Display Name', value: 'v2 name' }] },
        ],
      }],
    });
    const engine = buildEngine([item]);
    expect(expandItemTokens('$name', item, engine)).toBe('v2 name');
  });

  it('$name → cascades to template __Standard Values __Display Name (0.4.0.28)', () => {
    // Sitecore's `item.Fields["__Display Name"].Value` walks template SV when
    // the item's own value is absent. Pre-0.4.0.28 mockingbird's
    // `itemDisplayName` only walked the item's own shared+versioned fields and
    // then fell to `itemName(path)` — skipping SV entirely. This test pins
    // the cascade into the SV chain before the path fallback.
    const templateId = 'b3b3b3b3-0000-0000-0000-000000000001';
    const svId = 'b3b3b3b3-0000-0000-0000-000000000002';
    const item = makeItem({
      id: 'b3b3b3b3-0000-0000-0000-000000000010',
      template: templateId,
      path: '/sitecore/content/site/Home/slug',
      // No own __Display Name (shared or versioned).
    });
    const template = makeItem({ id: templateId, path: '/sitecore/templates/T' });
    const sv = makeItem({
      id: svId,
      parent: templateId,
      path: '/sitecore/templates/T/__Standard Values',
      sharedFields: [
        { id: DISPLAY_NAME_FIELD_ID, hint: '__Display Name', value: 'SV Display Name' },
      ],
    });
    const engine = buildEngine([template, sv, item]);
    expect(expandItemTokens('$name', item, engine)).toBe('SV Display Name');
  });

  it('$id → {UPPER-DASHED} form', () => {
    const item = makeItem({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      path: '/sitecore/content/site/Home/x',
    });
    const engine = buildEngine([item]);
    expect(expandItemTokens('$id', item, engine)).toBe('{CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC}');
  });

  it('$parentname → parent display name via tree', () => {
    const parent = makeItem({
      id: 'dddddddd-0000-0000-0000-000000000001',
      path: '/sitecore/content/site/Home/Parent Item',
      sharedFields: [
        { id: DISPLAY_NAME_FIELD_ID, hint: '__Display Name', value: 'Parent Display' },
      ],
    });
    const item = makeItem({
      id: 'dddddddd-0000-0000-0000-000000000002',
      parent: 'dddddddd-0000-0000-0000-000000000001',
      path: '/sitecore/content/site/Home/Parent Item/Child',
    });
    const engine = buildEngine([parent, item]);
    expect(expandItemTokens('$parentname', item, engine)).toBe('Parent Display');
  });

  it('$parentname → parent display name via registry fallback', () => {
    // Covers the item 3 + item 4 integration: parent is registry-only.
    const parentId = 'eeeeeeee-0000-0000-0000-000000000001';
    const item = makeItem({
      id: 'eeeeeeee-0000-0000-0000-000000000002',
      parent: parentId,
      path: '/sitecore/content/site/Home/x',
    });
    const engine = buildEngine([item]);
    (engine as any).getRegistryItem = (id: string) =>
      id.toLowerCase() === parentId.toLowerCase()
        ? { id: parentId, parent: '', template: '', path: '/x', database: 'master', sharedFields: {}, name: 'Registry Parent' }
        : undefined;
    expect(expandItemTokens('$parentname', item, engine)).toBe('Registry Parent');
  });

  it('$parentname → empty string when item.parent is empty', () => {
    // Regression guard: $parentname with no parent returns empty string
    // (matches Sitecore's Item.Parent = null behavior where display-name
    // lookup yields empty). $parentid returns match verbatim in the same
    // case — the two tokens differ in empty-parent handling, and both
    // behaviors are deliberate.
    const item = makeItem({ id: 'noparent', parent: '', path: '/sitecore/content' });
    const engine = buildEngine([item]);
    expect(expandItemTokens('$parentname', item, engine)).toBe('');
  });

  it('$parentid → parent {UPPER-DASHED}; empty item.parent returns match verbatim', () => {
    const item1 = makeItem({
      id: 'ffffffff-0000-0000-0000-000000000002',
      parent: 'ffffffff-0000-0000-0000-000000000001',
      path: '/x',
    });
    const engine1 = buildEngine([item1]);
    expect(expandItemTokens('$parentid', item1, engine1)).toBe('{FFFFFFFF-0000-0000-0000-000000000001}');

    const item2 = makeItem({ id: 'g', parent: '', path: '/x' });
    const engine2 = buildEngine([item2]);
    expect(expandItemTokens('$parentid', item2, engine2)).toBe('$parentid');
  });

  it('$date → compact yyyyMMddT000000Z form (regex-pinned)', () => {
    const item = makeItem({ id: 'h', path: '/x' });
    const engine = buildEngine([item]);
    expect(expandItemTokens('$date', item, engine)).toMatch(/^\d{8}T000000Z$/);
  });

  it('$time → compact HHmmss form (regex-pinned)', () => {
    const item = makeItem({ id: 'i', path: '/x' });
    const engine = buildEngine([item]);
    expect(expandItemTokens('$time', item, engine)).toMatch(/^\d{6}$/);
  });

  it('$now → compact yyyyMMddTHHmmssZ form (regex-pinned)', () => {
    const item = makeItem({ id: 'j', path: '/x' });
    const engine = buildEngine([item]);
    expect(expandItemTokens('$now', item, engine)).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it('multiple tokens in one string expand independently', () => {
    const item = makeItem({
      id: 'k',
      path: '/sitecore/content/site/Home/page',
    });
    const engine = buildEngine([item]);
    const result = expandItemTokens('$name on $date', item, engine);
    expect(result).toMatch(/^page on \d{8}T000000Z$/);
  });
});

describe('0.4.0.11 cascade-only expansion invariant — preserved in 0.4.0.12', () => {
  const NAV_TITLE_FIELD_ID = '4e0720e9-9d50-4ddc-87cf-ecd65e8e94c8';

  it('classic __Standard Values cascade STILL expands $name tokens (0.4.0.11 behavior)', () => {
    // Build a page template whose __Standard Values has NavigationTitle = "$name".
    // No SCT for this template — falls through to classic cascade.
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    const pageTpl = addPerSiteTemplate(fixture.engine, 'Plain Page');
    // Create __Standard Values as a child of the template item.
    const svId = 'dd000001-0000-0000-0000-000000000000';
    fixture.engine.getTree().addItem(
      makeItem({
        id: svId,
        parent: pageTpl,
        path: `/sitecore/templates/test/Plain Page/__Standard Values`,
        template: pageTpl,
        languages: [{
          language: 'en',
          fields: [],
          versions: [{
            version: 1,
            fields: [{ id: NAV_TITLE_FIELD_ID, hint: 'NavigationTitle', value: '$name' }],
          }],
        }],
      }),
      '/fake/sv.yml',
    );
    const subjectItem = makeItem({
      id: 'b0000099-0000-0000-0000-000000000000',
      parent: 'ba000010-0000-0000-0000-000000000000',
      path: '/sitecore/content/tenant/site/cascade-subject',
      template: pageTpl,
    });
    fixture.engine.getTree().addItem(subjectItem, '/fake/sub.yml');
    const index = buildItemValueIndex(subjectItem, 'en');
    const value = resolveFieldValue(
      index,
      NAV_TITLE_FIELD_ID,
      'NavigationTitle',
      subjectItem,
      'en',
      fixture.engine,
      '/sitecore/content/tenant/site',
    );
    // Classic cascade fires — $name expands to the item's name.
    expect(value).toBe('cascade-subject');
  });

  it('SCT path does NOT expand tokens — contrasts with classic cascade', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'SCT Subject');
    addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'SCT Subject',
      subjectTemplateId: pageTpl,
      fields: { [NAV_TITLE_FIELD_ID]: '$name' },
    });
    const subjectItem = makeItem({
      id: 'b00000aa-0000-0000-0000-000000000000',
      parent: 'ba000010-0000-0000-0000-000000000000',
      path: '/sitecore/content/tenant/site/sct-subject-page',
      template: pageTpl,
    });
    fixture.engine.getTree().addItem(subjectItem, '/fake/sub2.yml');
    const index = buildItemValueIndex(subjectItem, 'en');
    const value = resolveFieldValue(
      index,
      NAV_TITLE_FIELD_ID,
      'NavigationTitle',
      subjectItem,
      'en',
      fixture.engine,
      '/sitecore/content/tenant/site',
    );
    // SCT returns literal verbatim — NOT expanded.
    expect(value).toBe('$name');
  });
});
