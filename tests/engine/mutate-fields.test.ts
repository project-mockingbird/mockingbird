import { describe, it, expect } from 'vitest';
import { applyFieldEdit } from '../../src/engine/mutate-fields.js';
import { serializeItem } from '../../src/engine/serializer.js';
import type { ScsItem } from '../../src/engine/types.js';

function emptyItem(): ScsItem {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    parent: '00000000-0000-0000-0000-000000000000',
    template: '22222222-2222-2222-2222-222222222222',
    path: '/sitecore/content/Test',
    sharedFields: [],
    languages: [],
  };
}

describe('applyFieldEdit hint propagation', () => {
  it('writes the provided hint into a new shared field', () => {
    const item = emptyItem();
    applyFieldEdit(item, 'fff', 'val', 'en', 1, 'shared', 'MyField');
    expect(item.sharedFields).toHaveLength(1);
    expect(item.sharedFields[0]).toMatchObject({ id: 'fff', hint: 'MyField', value: 'val' });
  });

  it('writes the provided hint into a new unversioned field', () => {
    const item = emptyItem();
    applyFieldEdit(item, 'fff', 'val', 'en', 1, 'unversioned', 'MyField');
    expect(item.languages[0].fields).toHaveLength(1);
    expect(item.languages[0].fields[0]).toMatchObject({ id: 'fff', hint: 'MyField', value: 'val' });
  });

  it('writes the provided hint into a new versioned field', () => {
    const item = emptyItem();
    applyFieldEdit(item, 'fff', 'val', 'en', 1, 'versioned', 'MyField');
    expect(item.languages[0].versions[0].fields).toHaveLength(1);
    expect(item.languages[0].versions[0].fields[0]).toMatchObject({ id: 'fff', hint: 'MyField', value: 'val' });
  });

  it('defaults hint to empty string when not provided (backward-compat for existing callers)', () => {
    const item = emptyItem();
    applyFieldEdit(item, 'fff', 'val', 'en', 1, 'shared');
    expect(item.sharedFields[0].hint).toBe('');
  });

  it('serialized YAML carries Hint when added via applyFieldEdit', () => {
    const item = emptyItem();
    applyFieldEdit(item, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'some-value', 'en', 1, 'versioned', 'MyFieldName');
    const yaml = serializeItem(item);
    expect(yaml).toContain('Hint: MyFieldName');
  });
});

describe('applyFieldEdit hint healing for existing fields', () => {
  it('heals an empty hint on an existing shared field when hint param is provided', () => {
    const item = emptyItem();
    item.sharedFields.push({ id: 'fff', hint: '', value: 'old' });
    applyFieldEdit(item, 'fff', 'new', 'en', 1, 'shared', 'MyField');
    expect(item.sharedFields).toHaveLength(1);
    expect(item.sharedFields[0]).toMatchObject({ id: 'fff', hint: 'MyField', value: 'new' });
  });

  it('preserves a non-empty existing shared-field hint (does not overwrite)', () => {
    const item = emptyItem();
    item.sharedFields.push({ id: 'fff', hint: 'CustomHint', value: 'old' });
    applyFieldEdit(item, 'fff', 'new', 'en', 1, 'shared', 'MyField');
    expect(item.sharedFields[0]).toMatchObject({ id: 'fff', hint: 'CustomHint', value: 'new' });
  });

  it('heals an empty hint on an existing unversioned field', () => {
    const item = emptyItem();
    item.languages.push({
      language: 'en',
      fields: [{ id: 'fff', hint: '', value: 'old' }],
      versions: [],
    });
    applyFieldEdit(item, 'fff', 'new', 'en', 1, 'unversioned', 'MyField');
    expect(item.languages[0].fields[0]).toMatchObject({ id: 'fff', hint: 'MyField', value: 'new' });
  });

  it('heals an empty hint on an existing versioned field', () => {
    const item = emptyItem();
    item.languages.push({
      language: 'en',
      fields: [],
      versions: [{ version: 1, fields: [{ id: 'fff', hint: '', value: 'old' }] }],
    });
    applyFieldEdit(item, 'fff', 'new', 'en', 1, 'versioned', 'MyField');
    expect(item.languages[0].versions[0].fields[0]).toMatchObject({ id: 'fff', hint: 'MyField', value: 'new' });
  });

  it('does not overwrite a non-empty existing versioned-field hint', () => {
    const item = emptyItem();
    item.languages.push({
      language: 'en',
      fields: [],
      versions: [{ version: 1, fields: [{ id: 'fff', hint: 'CustomHint', value: 'old' }] }],
    });
    applyFieldEdit(item, 'fff', 'new', 'en', 1, 'versioned', 'MyField');
    expect(item.languages[0].versions[0].fields[0]).toMatchObject({ id: 'fff', hint: 'CustomHint', value: 'new' });
  });

  it('leaves an empty hint alone when no hint param is provided (caller passed schema-less default)', () => {
    const item = emptyItem();
    item.sharedFields.push({ id: 'fff', hint: '', value: 'old' });
    applyFieldEdit(item, 'fff', 'new', 'en', 1, 'shared');
    expect(item.sharedFields[0]).toMatchObject({ id: 'fff', hint: '', value: 'new' });
  });
});
