import { describe, it, expect } from 'vitest';
import { buildRegistryItemDetail } from '../../src/api/items-from-registry.js';
import type { RegistryItem } from '../../src/engine/types.js';
import { buildEngine, makeItem } from '../engine/layout/_helpers.js';

const TEMPLATE_ID = '1a2b3c4d-5e6f-7890-abcd-000000000001';

function regItem(overrides: Partial<RegistryItem> = {}): RegistryItem {
  return {
    id: 'aaaa1111-bbbb-2222-cccc-333333333333',
    name: 'OOTB Item',
    parent: 'cccc4444-bbbb-5555-aaaa-666666666666',
    template: TEMPLATE_ID,
    path: '/sitecore/templates/System/OOTB Item',
    database: 'master',
    sharedFields: { 'fld-aaa': 'value-a', 'fld-bbb': 'value-b' },
    ...overrides,
  };
}

describe('buildRegistryItemDetail', () => {
  const engine = buildEngine([
    makeItem({ id: 'tpl', template: TEMPLATE_ID, path: '/sitecore/templates/System/OOTB Item' }),
  ]);

  it('returns ItemDetail-shaped object with source: "registry"', () => {
    const result = buildRegistryItemDetail(regItem(), engine);
    expect(result.source).toBe('registry');
    expect(result.id).toBe('aaaa1111-bbbb-2222-cccc-333333333333');
    expect(result.name).toBe('OOTB Item');
    expect(result.path).toBe('/sitecore/templates/System/OOTB Item');
    expect(result.template).toBe(TEMPLATE_ID);
    expect(result.parent).toBe('cccc4444-bbbb-5555-aaaa-666666666666');
    expect(result.filePath).toBe('');
  });

  it('maps sharedFields Record into ScsField[] preserving id and value', () => {
    const result = buildRegistryItemDetail(regItem(), engine);
    expect(result.sharedFields).toHaveLength(2);
    const a = result.sharedFields.find((f: { id: string }) => f.id === 'fld-aaa');
    const b = result.sharedFields.find((f: { id: string }) => f.id === 'fld-bbb');
    expect(a).toEqual({ id: 'fld-aaa', hint: '', value: 'value-a' });
    expect(b).toEqual({ id: 'fld-bbb', hint: '', value: 'value-b' });
  });

  it('returns empty languages array when the registry item has no unversioned/versioned data', () => {
    const result = buildRegistryItemDetail(regItem(), engine);
    expect(result.languages).toEqual([]);
  });

  it('exposes unversionedFields per language in the languages shape', () => {
    const result = buildRegistryItemDetail(
      regItem({
        unversionedFields: {
          en: { 'fld-title': 'Site media library', 'fld-display': 'Site media library' },
          'de-DE': { 'fld-title': 'SiteMediaLibrary' },
        },
      }),
      engine,
    );
    const en = (result.languages as Array<{ language: string; fields: Array<{ id: string; value: string }> }>)
      .find(l => l.language === 'en');
    expect(en).toBeDefined();
    expect(en!.fields).toHaveLength(2);
    expect(en!.fields.find(f => f.id === 'fld-title')?.value).toBe('Site media library');
    const de = (result.languages as Array<{ language: string; fields: Array<{ id: string; value: string }> }>)
      .find(l => l.language === 'de-DE');
    expect(de).toBeDefined();
    expect(de!.fields[0].value).toBe('SiteMediaLibrary');
  });

  it('exposes versionedFields per language + version in the languages shape', () => {
    const result = buildRegistryItemDetail(
      regItem({
        versionedFields: {
          en: {
            '1': { 'fld-created': '20220209T062012Z' },
            '2': { 'fld-created': '20230101T000000Z' },
          },
        },
      }),
      engine,
    );
    const en = (result.languages as Array<{ language: string; versions: Array<{ version: number; fields: Array<{ id: string; value: string }> }> }>)
      .find(l => l.language === 'en');
    expect(en).toBeDefined();
    expect(en!.versions).toHaveLength(2);
    expect(en!.versions[0]).toEqual({ version: 1, fields: [{ id: 'fld-created', hint: '', value: '20220209T062012Z' }] });
    expect(en!.versions[1].version).toBe(2);
  });

  it('merges languages that appear in only unversioned OR only versioned maps', () => {
    const result = buildRegistryItemDetail(
      regItem({
        unversionedFields: { en: { 'fld-title': 'en-only-unv' } },
        versionedFields: { 'ja-JP': { '1': { 'fld-created': 'ja-only-ver' } } },
      }),
      engine,
    );
    const langs = (result.languages as Array<{ language: string }>).map(l => l.language);
    expect(langs).toEqual(['en', 'ja-JP']);
  });

  it('classifies the item type using the template GUID', () => {
    const result = buildRegistryItemDetail(regItem(), engine);
    expect(typeof result.type).toBe('string');
  });
});
