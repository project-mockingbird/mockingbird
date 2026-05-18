import { describe, it, expect, beforeEach } from 'vitest';
import { intern, internItem, internPoolSize, clearInternPool } from '../../src/engine/intern.js';
import type { ScsItem } from '../../src/engine/types.js';

function makeItem(overrides: Partial<ScsItem> = {}): ScsItem {
  return {
    id: 'aa000001-0000-0000-0000-000000000001',
    parent: 'bb000001-0000-0000-0000-000000000001',
    template: 'cc000001-0000-0000-0000-000000000001',
    path: '/sitecore/content/test',
    sharedFields: [],
    languages: [],
    ...overrides,
  };
}

describe('intern pool', () => {
  beforeEach(() => clearInternPool());

  it('returns the same reference for the same string value', () => {
    const a = intern('foo');
    const b = intern('foo');
    expect(a).toBe(b);
  });

  it('grows the pool only on first insertion', () => {
    expect(internPoolSize()).toBe(0);
    intern('alpha');
    expect(internPoolSize()).toBe(1);
    intern('alpha');
    expect(internPoolSize()).toBe(1);
    intern('beta');
    expect(internPoolSize()).toBe(2);
  });

  it('unifies identical template IDs across items (identity check)', () => {
    const a = internItem(makeItem({ template: 'deadbeef-0000-0000-0000-000000000000' }));
    const b = internItem(makeItem({ template: 'deadbeef-0000-0000-0000-000000000000' }));
    expect(a.template).toBe(b.template); // reference equality after interning
  });

  it('unifies field IDs and hints across items', () => {
    const a = internItem(
      makeItem({
        sharedFields: [
          { id: 'ff000001-0000-0000-0000-000000000001', hint: '__Base template', value: 'x' },
          { id: 'ff000002-0000-0000-0000-000000000002', hint: 'Title', value: 'Hello' },
        ],
      }),
    );
    const b = internItem(
      makeItem({
        sharedFields: [
          { id: 'ff000001-0000-0000-0000-000000000001', hint: '__Base template', value: 'y' },
          { id: 'ff000002-0000-0000-0000-000000000002', hint: 'Title', value: 'World' },
        ],
      }),
    );
    expect(a.sharedFields[0].id).toBe(b.sharedFields[0].id);
    expect(a.sharedFields[0].hint).toBe(b.sharedFields[0].hint);
    expect(a.sharedFields[1].id).toBe(b.sharedFields[1].id);
    // Values remain distinct - not interned (typically unique per item).
    expect(a.sharedFields[0].value).not.toBe(b.sharedFields[0].value);
  });

  it('interns language codes, versioned and unversioned field ids, and optional type', () => {
    const item = internItem(
      makeItem({
        languages: [
          {
            language: 'en',
            fields: [
              { id: 'aa000001-0000-0000-0000-000000000001', hint: 'Name', value: 'v1', type: 'Single-Line Text' },
            ],
            versions: [
              {
                version: 1,
                fields: [
                  { id: 'aa000001-0000-0000-0000-000000000001', hint: 'Name', value: 'v2' },
                ],
              },
            ],
          },
        ],
      }),
    );
    // Same id used unversioned and versioned - should share identity after intern.
    expect(item.languages[0].fields[0].id).toBe(item.languages[0].versions[0].fields[0].id);
    expect(item.languages[0].fields[0].hint).toBe(item.languages[0].versions[0].fields[0].hint);
    // Language code interned.
    expect(intern('en')).toBe(item.languages[0].language);
    // Optional type interned when present.
    expect(item.languages[0].fields[0].type).toBe(intern('Single-Line Text'));
  });
});
