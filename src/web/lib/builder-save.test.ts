import { describe, it, expect, vi } from 'vitest';
import { applyBuilderStructuralChanges, applyBuilderFieldPropEdits } from './builder-save';

const SOURCE = '1eb8ae32-e190-44a6-968d-ed904c794ebf';
const TYPE = 'ab162cc0-dc80-4abf-8871-998ee5d7ba32';

const okFetch = () =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;

describe('applyBuilderStructuralChanges', () => {
  it('creates a new section under the template path via POST /api/items', async () => {
    const fetchFn = okFetch();
    await applyBuilderStructuralChanges(
      '/sitecore/templates/Feature/Demo/Thing',
      { newSections: ['Demo Section'], newFields: [] },
      fetchFn,
    );
    const calls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('/api/items');
    expect(calls[0][1].method).toBe('POST');
    expect(JSON.parse(calls[0][1].body)).toEqual({
      type: 'section',
      name: 'Demo Section',
      parentPath: '/sitecore/templates/Feature/Demo/Thing',
    });
  });

  it('creates new fields under their section path, section before field', async () => {
    const fetchFn = okFetch();
    await applyBuilderStructuralChanges(
      '/sitecore/templates/Feature/Demo/Thing',
      {
        newSections: ['Data'],
        newFields: [{ sectionName: 'Data', name: 'Url', fieldType: 'Single-Line Text' }],
      },
      fetchFn,
    );
    const calls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    // Section must be created first so the field's parent path resolves.
    expect(JSON.parse(calls[0][1].body)).toEqual({
      type: 'section',
      name: 'Data',
      parentPath: '/sitecore/templates/Feature/Demo/Thing',
    });
    expect(JSON.parse(calls[1][1].body)).toEqual({
      type: 'field',
      name: 'Url',
      fieldType: 'Single-Line Text',
      parentPath: '/sitecore/templates/Feature/Demo/Thing/Data',
    });
  });

  it('does nothing when there are no new sections or fields', async () => {
    const fetchFn = okFetch();
    await applyBuilderStructuralChanges('/t', { newSections: [], newFields: [] }, fetchFn);
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('throws when a create request fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 409 }) as unknown as typeof fetch;
    await expect(
      applyBuilderStructuralChanges('/t', { newSections: ['X'], newFields: [] }, fetchFn),
    ).rejects.toThrow(/section/i);
  });
});

describe('applyBuilderFieldPropEdits', () => {
  it('PUTs each field-property edit to its own field-definition item, not the template', async () => {
    const fetchFn = okFetch();
    const fieldA = 'aaaaaaaa-0000-0000-0000-000000000001';
    const fieldB = 'bbbbbbbb-0000-0000-0000-000000000002';
    const updates = new Map<string, Record<string, string>>([
      [fieldA, { [SOURCE]: '/sitecore/media library' }],
      [fieldB, { [TYPE]: 'Rich Text', [SOURCE]: '/sitecore/content' }],
    ]);
    await applyBuilderFieldPropEdits(updates, fetchFn);

    const calls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    // Each edit targets the field ITEM, carrying that item's own field GUIDs.
    expect(calls[0][0]).toBe(`/api/items/${fieldA}`);
    expect(calls[0][1].method).toBe('PUT');
    expect(JSON.parse(calls[0][1].body)).toEqual({ fields: { [SOURCE]: '/sitecore/media library' } });
    expect(calls[1][0]).toBe(`/api/items/${fieldB}`);
    expect(JSON.parse(calls[1][1].body)).toEqual({ fields: { [TYPE]: 'Rich Text', [SOURCE]: '/sitecore/content' } });
  });

  it('skips a field whose prop set is empty', async () => {
    const fetchFn = okFetch();
    await applyBuilderFieldPropEdits(new Map([['field-1', {}]]), fetchFn);
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('throws when a field PUT fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(
      applyBuilderFieldPropEdits(new Map([['field-1', { [SOURCE]: 'x' }]]), fetchFn),
    ).rejects.toThrow(/field-1/);
  });
});
