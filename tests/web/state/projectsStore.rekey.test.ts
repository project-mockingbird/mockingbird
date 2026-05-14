import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectsStore, resetProjectsStore, type SavedProject } from '../../../src/web/state/projectsStore';

function makeProject(hash: string, overrides: Partial<SavedProject> = {}): SavedProject {
  return {
    hash,
    name: 'p',
    layers: [{ sitecoreJsonPath: '/ws/a/sitecore.json', name: 'a', color: '#111' }],
    createdAt: 100,
    lastOpenedAt: 200,
    ...overrides,
  };
}

describe('projectsStore.rekey', () => {
  beforeEach(() => { resetProjectsStore(); });

  it('moves the entry from oldHash to newHash preserving name and createdAt', () => {
    const old = makeProject('old', { name: 'my-project', createdAt: 100, lastOpenedAt: 200 });
    useProjectsStore.getState().upsert(old);
    const nextLayers = [
      { sitecoreJsonPath: '/ws/a/sitecore.json', name: 'a', color: '#111' },
      { sitecoreJsonPath: '/ws/b/sitecore.json', name: 'b', color: '#222' },
    ];

    useProjectsStore.getState().rekey('old', 'new', nextLayers, 500);

    const updated = useProjectsStore.getState().get('new');
    expect(updated).not.toBeNull();
    expect(updated!.hash).toBe('new');
    expect(updated!.name).toBe('my-project');
    expect(updated!.createdAt).toBe(100);
    expect(updated!.lastOpenedAt).toBe(500);
    expect(updated!.layers).toEqual(nextLayers);
    expect(useProjectsStore.getState().get('old')).toBeNull();
  });

  it('throws when newHash already exists', () => {
    useProjectsStore.getState().upsert(makeProject('old'));
    useProjectsStore.getState().upsert(makeProject('collide', { name: 'other' }));

    expect(() => {
      useProjectsStore.getState().rekey('old', 'collide', [], 1);
    }).toThrow(/already exists/i);

    expect(useProjectsStore.getState().get('old')).not.toBeNull();
    expect(useProjectsStore.getState().get('collide')!.name).toBe('other');
  });

  it('throws when oldHash does not exist', () => {
    expect(() => {
      useProjectsStore.getState().rekey('missing', 'new', [], 1);
    }).toThrow(/not found/i);
  });

  it('is a noop when oldHash === newHash (still updates layers and lastOpenedAt)', () => {
    useProjectsStore.getState().upsert(makeProject('same', { createdAt: 100 }));
    const nextLayers = [{ sitecoreJsonPath: '/ws/c/sitecore.json', name: 'c', color: '#333' }];

    useProjectsStore.getState().rekey('same', 'same', nextLayers, 999);

    const got = useProjectsStore.getState().get('same')!;
    expect(got.layers).toEqual(nextLayers);
    expect(got.lastOpenedAt).toBe(999);
    expect(got.createdAt).toBe(100);
  });
});
