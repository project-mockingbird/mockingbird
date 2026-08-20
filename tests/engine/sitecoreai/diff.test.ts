import { describe, it, expect } from 'vitest';
import { diffItem, isFieldDifferent } from '../../../src/engine/sitecoreai/diff.js';
import type { ItemSnapshot } from '../../../src/engine/sitecoreai/types.js';

const base = (over: Partial<ItemSnapshot> = {}): ItemSnapshot => ({
  id: 'i', templateId: 't', sharedFields: [], unversionedFields: [], versions: [], ...over,
});

describe('isFieldDifferent', () => {
  it('ignores CR/LF differences', () => {
    expect(isFieldDifferent({ fieldId: 'f', value: 'a\r\nb' }, { fieldId: 'f', value: 'ab' })).toBe(false);
  });
  it('compares blobId for media', () => {
    expect(isFieldDifferent({ fieldId: 'f', value: 'x', blobId: 'b1' }, { fieldId: 'f', value: 'x', blobId: 'b2' })).toBe(true);
  });
  it('differs on value change', () => {
    expect(isFieldDifferent({ fieldId: 'f', value: 'a' }, { fieldId: 'f', value: 'b' })).toBe(true);
  });
});

describe('diffItem', () => {
  it('emits no ops when snapshots are identical', () => {
    const s = base({ sharedFields: [{ fieldId: 'f', value: 'v' }] });
    expect(diffItem(s, base({ sharedFields: [{ fieldId: 'f', value: 'v' }] }))).toEqual([]);
  });

  it('shared: UPDATE changed/new, RESET_FIELD target-only', () => {
    const source = base({ sharedFields: [{ fieldId: 'a', value: 'new' }, { fieldId: 'b', value: 'add' }] });
    const target = base({ sharedFields: [{ fieldId: 'a', value: 'old' }, { fieldId: 'c', value: 'gone' }] });
    expect(diffItem(source, target)).toEqual([
      { kind: 'updateField', fieldId: 'a', value: 'new' },
      { kind: 'updateField', fieldId: 'b', value: 'add' },
      { kind: 'resetField', fieldId: 'c' },
    ]);
  });

  it('unversioned: per-language UPDATE/RESET; target-only language resets its fields', () => {
    const source = base({ unversionedFields: [{ language: 'en', fields: [{ fieldId: 'a', value: 'v' }] }] });
    const target = base({ unversionedFields: [
      { language: 'en', fields: [{ fieldId: 'a', value: 'old' }, { fieldId: 'b', value: 'x' }] },
      { language: 'da', fields: [{ fieldId: 'c', value: 'y' }] },
    ] });
    expect(diffItem(source, target)).toEqual([
      { kind: 'updateField', fieldId: 'a', value: 'v', language: 'en' },
      { kind: 'resetField', fieldId: 'b', language: 'en' },
      { kind: 'resetField', fieldId: 'c', language: 'da' },
    ]);
  });

  it('versioned: field UPDATE creates a non-empty new version (no ADD_VERSION)', () => {
    const source = base({ versions: [{ language: 'en', version: 2, fields: [{ fieldId: 'a', value: 'v' }] }] });
    const target = base();
    expect(diffItem(source, target)).toEqual([
      { kind: 'updateField', fieldId: 'a', value: 'v', language: 'en', version: 2 },
    ]);
  });

  it('versioned: ADD_VERSION only for an empty new version', () => {
    const source = base({ versions: [{ language: 'en', version: 2, fields: [] }] });
    expect(diffItem(source, base())).toEqual([{ kind: 'addVersion', language: 'en', version: 2 }]);
  });

  it('versioned: REMOVE_VERSION for a target-only version', () => {
    const target = base({ versions: [{ language: 'en', version: 1, fields: [{ fieldId: 'a', value: 'v' }] }] });
    expect(diffItem(base(), target)).toEqual([{ kind: 'removeVersion', language: 'en', version: 1 }]);
  });

  it('CHANGE_TEMPLATE when template differs, first in the op list', () => {
    const source = base({ templateId: 'tnew', sharedFields: [{ fieldId: 'a', value: 'v' }] });
    const target = base({ templateId: 'told' });
    expect(diffItem(source, target)[0]).toEqual({ kind: 'changeTemplate', templateId: 'tnew' });
  });

  it('excludes statistics fields from the diff (no op for a differing __Updated)', () => {
    const UPDATED = 'd9cf14b1-fa16-4ba6-9288-e8a174d4d522';
    const source = base({ sharedFields: [{ fieldId: UPDATED, value: 'ts-new' }] });
    const target = base({ sharedFields: [{ fieldId: UPDATED, value: 'ts-old' }] });
    expect(diffItem(source, target)).toEqual([]);
  });

  it('compares field ids case- and braces-insensitively', () => {
    const source = base({ sharedFields: [{ fieldId: 'ABC', value: 'v' }] });
    const target = base({ sharedFields: [{ fieldId: '{abc}', value: 'v' }] });
    expect(diffItem(source, target)).toEqual([]);
  });

  it('excludes __Revision from shared fields', () => {
    const REVISION = '8cdc337e-a112-42fb-bbb4-4143751e123f';
    const source = base({ sharedFields: [{ fieldId: REVISION, value: 'rev-new' }] });
    const target = base({ sharedFields: [{ fieldId: REVISION, value: 'rev-old' }] });
    expect(diffItem(source, target)).toEqual([]);
  });

  it('excludes __Updated by from shared fields', () => {
    const UPDATED_BY = 'badd9cf9-53e0-4d0c-bcc0-2d784c282f6a';
    const source = base({ sharedFields: [{ fieldId: UPDATED_BY, value: 'user-new' }] });
    const target = base({ sharedFields: [{ fieldId: UPDATED_BY, value: 'user-old' }] });
    expect(diffItem(source, target)).toEqual([]);
  });

  it('excludes __Owner from shared fields', () => {
    const OWNER = '52807595-0f8f-4b20-8d2a-cb71d28c6103';
    const source = base({ sharedFields: [{ fieldId: OWNER, value: 'owner-new' }] });
    const target = base({ sharedFields: [{ fieldId: OWNER, value: 'owner-old' }] });
    expect(diffItem(source, target)).toEqual([]);
  });

  it('excludes __Lock from shared fields', () => {
    const LOCK = '001dd393-96c5-490b-924a-b0f25cd9efd8';
    const source = base({ sharedFields: [{ fieldId: LOCK, value: 'lock-new' }] });
    const target = base({ sharedFields: [{ fieldId: LOCK, value: 'lock-old' }] });
    expect(diffItem(source, target)).toEqual([]);
  });

  it('excludes __Last run from shared fields', () => {
    const LAST_RUN = 'b1e16562-f3f9-4ddd-84ca-6e099950ecc0';
    const source = base({ sharedFields: [{ fieldId: LAST_RUN, value: 'time-new' }] });
    const target = base({ sharedFields: [{ fieldId: LAST_RUN, value: 'time-old' }] });
    expect(diffItem(source, target)).toEqual([]);
  });

  it('stats-only source-only version emits empty ADD_VERSION (stats excluded, version treated as empty)', () => {
    const UPDATED = 'd9cf14b1-fa16-4ba6-9288-e8a174d4d522';
    const source = base({ versions: [{ language: 'en', version: 1, fields: [{ fieldId: UPDATED, value: 'ts-new' }] }] });
    const target = base();
    expect(diffItem(source, target)).toEqual([{ kind: 'addVersion', language: 'en', version: 1 }]);
  });

  it('excludes statistics fields from unversioned fields', () => {
    const UPDATED = 'd9cf14b1-fa16-4ba6-9288-e8a174d4d522';
    const source = base({ unversionedFields: [{ language: 'en', fields: [{ fieldId: UPDATED, value: 'ts-new' }] }] });
    const target = base();
    expect(diffItem(source, target)).toEqual([]);
  });

  it('template case- and braces-insensitive: no changeTemplate for same id', () => {
    const source = base({ templateId: 'ABC' });
    const target = base({ templateId: '{abc}' });
    expect(diffItem(source, target)).toEqual([]);
  });

  it('template empty-string vs zero-guid no-op', () => {
    const source = base({ templateId: '' });
    const target = base({ templateId: '00000000-0000-0000-0000-000000000000' });
    expect(diffItem(source, target)).toEqual([]);
  });
});
