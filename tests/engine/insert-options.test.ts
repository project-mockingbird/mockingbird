import { describe, it, expect } from 'vitest';
import { getInsertOptions } from '../../src/engine/insert-options.js';
import { FIELD_IDS, TEMPLATE_TEMPLATE_ID, BRANCH_TEMPLATE_ID } from '../../src/engine/constants.js';
import { makeItem, buildEngine, buildEngineWithRegistry } from './layout/_helpers.js';

describe('getInsertOptions', () => {
  it('returns empty array for an item with no __Masters and no template SV', () => {
    const tpl = makeItem({ id: 't1', template: TEMPLATE_TEMPLATE_ID, path: '/sitecore/templates/T1' });
    const item = makeItem({ id: 'i1', template: 't1', path: '/sitecore/content/Home', parent: 'parent' });
    const engine = buildEngine([tpl, item]);
    expect(getInsertOptions(engine, 'i1')).toEqual([]);
  });

  it('reads __Masters from item-level override first', () => {
    const childTpl = makeItem({
      id: 'pagetpl', template: TEMPLATE_TEMPLATE_ID,
      path: '/sitecore/templates/Page',
    });
    const tpl = makeItem({ id: 't1', template: TEMPLATE_TEMPLATE_ID, path: '/sitecore/templates/T1' });
    const item = makeItem({
      id: 'i1', template: 't1', parent: 'parent', path: '/sitecore/content/Home',
      sharedFields: [{ id: FIELD_IDS.masters, hint: '__Masters', value: '{PAGETPL}' }],
    });
    const engine = buildEngine([childTpl, tpl, item]);
    const opts = getInsertOptions(engine, 'i1');
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({ templateId: 'pagetpl', templateName: 'Page', kind: 'template' });
  });

  it('falls back to template SV __Masters when item has none', () => {
    const childTpl = makeItem({
      id: 'pagetpl', template: TEMPLATE_TEMPLATE_ID,
      path: '/sitecore/templates/Page',
    });
    const sv = makeItem({
      id: 'svid', template: 't1', parent: 't1',
      path: '/sitecore/templates/T1/__Standard Values',
      sharedFields: [{ id: FIELD_IDS.masters, hint: '__Masters', value: '{PAGETPL}' }],
    });
    const tpl = makeItem({
      id: 't1', template: TEMPLATE_TEMPLATE_ID, path: '/sitecore/templates/T1',
      sharedFields: [{ id: FIELD_IDS.standardValues, hint: '__Standard values', value: '{SVID}' }],
    });
    const item = makeItem({ id: 'i1', template: 't1', parent: 'parent', path: '/sitecore/content/Home' });
    const engine = buildEngine([childTpl, tpl, sv, item]);
    const opts = getInsertOptions(engine, 'i1');
    expect(opts).toHaveLength(1);
    expect(opts[0].templateId).toBe('pagetpl');
  });

  it('preserves field order and skips unresolvable GUIDs silently', () => {
    const t1 = makeItem({ id: 'aaa', template: TEMPLATE_TEMPLATE_ID, path: '/sitecore/templates/Alpha' });
    const t2 = makeItem({ id: 'bbb', template: TEMPLATE_TEMPLATE_ID, path: '/sitecore/templates/Beta' });
    const item = makeItem({
      id: 'i1', template: 'parent-tpl', parent: 'p', path: '/sitecore/content/Home',
      sharedFields: [{
        id: FIELD_IDS.masters, hint: '__Masters',
        value: '{BBB}|{ZZZ}|{AAA}',
      }],
    });
    const engine = buildEngine([t1, t2, item]);
    const opts = getInsertOptions(engine, 'i1');
    expect(opts.map(o => o.templateId)).toEqual(['bbb', 'aaa']);
  });

  it('tags branch templates by template ID', () => {
    const branchTpl = makeItem({
      id: 'branch1', template: BRANCH_TEMPLATE_ID,
      path: '/sitecore/templates/Branches/My/Branch',
    });
    const item = makeItem({
      id: 'i1', template: 't1', parent: 'p', path: '/sitecore/content/Home',
      sharedFields: [{ id: FIELD_IDS.masters, hint: '__Masters', value: '{BRANCH1}' }],
    });
    const engine = buildEngine([branchTpl, item]);
    const opts = getInsertOptions(engine, 'i1');
    expect(opts[0].kind).toBe('branch');
  });

  it('tags a branch template under non-canonical path (SXA Page Branches)', () => {
    // SXA Page Branches live under /sitecore/content/.../Presentation/Page Branches/...
    // NOT under /sitecore/templates/Branches/. Must still be detected as a branch.
    const branchTpl = makeItem({
      id: 'pagebranch1',
      template: BRANCH_TEMPLATE_ID,
      path: '/sitecore/content/SiteA/Presentation/Page Branches/My Page Branch',
    });
    const item = makeItem({
      id: 'i1', template: 't1', parent: 'p', path: '/sitecore/content/Home',
      sharedFields: [{ id: FIELD_IDS.masters, hint: '__Masters', value: '{PAGEBRANCH1}' }],
    });
    const engine = buildEngine([branchTpl, item]);
    const opts = getInsertOptions(engine, 'i1');
    expect(opts).toHaveLength(1);
    expect(opts[0].kind).toBe('branch');
  });

  // M4: registry-only template resolves via getRegistryItem fallback
  it('resolves a registry-only template via getRegistryItem fallback', () => {
    const item = makeItem({
      id: 'i1', template: 't1', parent: 'p', path: '/sitecore/content/Home',
      sharedFields: [{ id: FIELD_IDS.masters, hint: '__Masters', value: '{REG-ONLY-TEMPLATE-ID}' }],
    });
    const registryTemplate = {
      id: 'reg-only-template-id',
      name: 'OOTB Page',
      parent: 'parent-tpl',
      template: TEMPLATE_TEMPLATE_ID,
      path: '/sitecore/templates/Sample/Sample Item',
      database: 'master',
      sharedFields: {},
    };
    const engine = buildEngineWithRegistry({ tree: [item], registry: [registryTemplate] });
    const opts = getInsertOptions(engine, 'i1');
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({
      templateId: 'reg-only-template-id',
      templateName: 'OOTB Page', // from RegistryItem.name
      kind: 'template',
    });
  });

  // M5: explicit override semantics - item-level wins when BOTH item and SV are set
  it('item-level __Masters wins when both item and SV are set', () => {
    const aTpl = makeItem({ id: 'aaa', template: TEMPLATE_TEMPLATE_ID, path: '/sitecore/templates/Alpha' });
    const bTpl = makeItem({ id: 'bbb', template: TEMPLATE_TEMPLATE_ID, path: '/sitecore/templates/Beta' });
    const sv = makeItem({
      id: 'svid', template: 't1', parent: 't1',
      path: '/sitecore/templates/T1/__Standard Values',
      sharedFields: [{ id: FIELD_IDS.masters, hint: '__Masters', value: '{BBB}' }],
    });
    const tpl = makeItem({
      id: 't1', template: TEMPLATE_TEMPLATE_ID, path: '/sitecore/templates/T1',
      sharedFields: [{ id: FIELD_IDS.standardValues, hint: '__Standard values', value: '{SVID}' }],
    });
    const item = makeItem({
      id: 'i1', template: 't1', parent: 'parent', path: '/sitecore/content/Home',
      sharedFields: [{ id: FIELD_IDS.masters, hint: '__Masters', value: '{AAA}' }],
    });
    const engine = buildEngine([aTpl, bTpl, tpl, sv, item]);
    const opts = getInsertOptions(engine, 'i1');
    expect(opts.map(o => o.templateId)).toEqual(['aaa']); // not bbb, not [aaa, bbb]
  });

  // M6: explicit-empty __Masters at item-level returns [] and does NOT
  // fall through to SV. `readFieldWithSvFallback` short-circuits on a
  // present-but-empty shared field at the item level, treating an
  // explicitly cleared __Masters as the user's authoritative "no inserts."
  it('returns [] when item-level __Masters is explicitly empty (no SV fall-through)', () => {
    const childTpl = makeItem({ id: 'pagetpl', template: TEMPLATE_TEMPLATE_ID, path: '/sitecore/templates/Page' });
    const sv = makeItem({
      id: 'svid', template: 't1', parent: 't1',
      path: '/sitecore/templates/T1/__Standard Values',
      sharedFields: [{ id: FIELD_IDS.masters, hint: '__Masters', value: '{PAGETPL}' }],
    });
    const tpl = makeItem({
      id: 't1', template: TEMPLATE_TEMPLATE_ID, path: '/sitecore/templates/T1',
      sharedFields: [{ id: FIELD_IDS.standardValues, hint: '__Standard values', value: '{SVID}' }],
    });
    const item = makeItem({
      id: 'i1', template: 't1', parent: 'parent', path: '/sitecore/content/Home',
      sharedFields: [{ id: FIELD_IDS.masters, hint: '__Masters', value: '' }],
    });
    const engine = buildEngine([childTpl, tpl, sv, item]);
    const opts = getInsertOptions(engine, 'i1');
    expect(opts).toEqual([]);
  });

  // M7: registry-only parent - sharedFields carry __Masters directly.
  // Mirrors the live consumer case: /sitecore/system/Tasks/Commands is an OOTB
  // item that is never serialized in any layer, yet its registry sharedFields
  // contain __Masters pointing to the "Command" template.
  it('returns insert options when parent is registry-only and sharedFields carry __Masters', () => {
    const masterId = 'aabbccdd-0001-0000-0000-000000000001';
    const parentId = 'aabbccdd-0002-0000-0000-000000000002';
    const engine = buildEngineWithRegistry({
      tree: [],
      registry: [
        {
          id: parentId,
          name: 'Commands',
          parent: 'some-parent',
          template: TEMPLATE_TEMPLATE_ID,
          path: '/sitecore/system/Tasks/Commands',
          database: 'master',
          sharedFields: { [FIELD_IDS.masters]: `{${masterId.toUpperCase()}}` },
        },
        {
          id: masterId,
          name: 'Command',
          parent: parentId,
          template: TEMPLATE_TEMPLATE_ID,
          path: '/sitecore/templates/System/Tasks/Command',
          database: 'master',
          sharedFields: {},
        },
      ],
    });
    const opts = getInsertOptions(engine, parentId);
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({
      templateId: masterId,
      templateName: 'Command',
      kind: 'template',
    });
  });

  // M8: registry-only parent whose template has __Masters on its __Standard Values
  // (SV cascade path for registry parents). The parent has no own __Masters,
  // but its template's __Standard Values item in the registry carries __Masters.
  it('resolves __Masters via SV cascade when parent is registry-only and owns no __Masters', () => {
    const masterId = 'bbccddee-0001-0000-0000-000000000001';
    const parentId = 'bbccddee-0002-0000-0000-000000000002';
    const parentTemplateId = 'bbccddee-0003-0000-0000-000000000003';
    const svId = 'bbccddee-0004-0000-0000-000000000004';
    const engine = buildEngineWithRegistry({
      tree: [],
      registry: [
        {
          id: parentId,
          name: 'Schedules',
          parent: 'some-parent',
          template: parentTemplateId,
          path: '/sitecore/system/Tasks/Schedules',
          database: 'master',
          sharedFields: {},
        },
        {
          id: parentTemplateId,
          name: 'Schedule Folder',
          parent: 'templates-parent',
          template: TEMPLATE_TEMPLATE_ID,
          path: '/sitecore/templates/System/Tasks/Schedule Folder',
          database: 'master',
          sharedFields: {},
        },
        {
          id: svId,
          name: '__Standard Values',
          parent: parentTemplateId,
          template: parentTemplateId,
          path: '/sitecore/templates/System/Tasks/Schedule Folder/__Standard Values',
          database: 'master',
          sharedFields: { [FIELD_IDS.masters]: `{${masterId.toUpperCase()}}` },
        },
        {
          id: masterId,
          name: 'Schedule',
          parent: parentTemplateId,
          template: TEMPLATE_TEMPLATE_ID,
          path: '/sitecore/templates/System/Tasks/Schedule',
          database: 'master',
          sharedFields: {},
        },
      ],
    });
    const opts = getInsertOptions(engine, parentId);
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({
      templateId: masterId,
      templateName: 'Schedule',
      kind: 'template',
    });
  });
});
