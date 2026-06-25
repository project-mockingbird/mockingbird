import { describe, it, expect, vi } from 'vitest';
import { applyBuilderStructuralChanges } from './builder-save';

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
