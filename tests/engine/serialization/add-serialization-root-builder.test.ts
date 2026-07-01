import { describe, it, expect } from 'vitest';
import {
  buildIncludeEntry,
  appendIncludeToModuleContents,
  SerializationRootError,
} from '../../../src/engine/serialization/add-serialization-root.js';

describe('buildIncludeEntry', () => {
  it('defaults name to the encoded leaf and scope verbatim', () => {
    const inc = buildIncludeEntry({
      path: '/sitecore/system/Tasks/Commands',
      database: 'master',
      scope: 'DescendantsOnly',
    });
    expect(inc).toEqual({
      name: 'Commands',
      path: '/sitecore/system/Tasks/Commands',
      database: 'master',
      scope: 'DescendantsOnly',
    });
  });

  it('honors an explicit folder name', () => {
    const inc = buildIncludeEntry({
      path: '/sitecore/system/Tasks/Commands',
      database: 'master',
      scope: 'DescendantsOnly',
      name: 'tasks-commands',
    });
    expect(inc.name).toBe('tasks-commands');
  });
});

describe('appendIncludeToModuleContents', () => {
  const raw = JSON.stringify({
    namespace: 'MyModule',
    items: { path: 'items', includes: [
      { name: 'content', path: '/sitecore/content/Site', database: 'master' },
    ] },
  }, null, 3) + '\n';

  it('appends the include and re-serializes at 3-space indent + trailing newline', () => {
    const inc = buildIncludeEntry({ path: '/sitecore/system/Tasks/Commands', database: 'master', scope: 'DescendantsOnly' });
    const out = appendIncludeToModuleContents(raw, inc);
    const parsed = JSON.parse(out);
    expect(parsed.items.includes).toHaveLength(2);
    expect(parsed.items.includes[1]).toEqual(inc);
    expect(out.endsWith('\n')).toBe(true);
    expect(out).toContain('\n   "namespace"'); // 3-space indent
  });

  it('throws include-collision on a duplicate path (case-insensitive)', () => {
    const dup = buildIncludeEntry({ path: '/SITECORE/content/site', database: 'master', scope: 'DescendantsOnly' });
    try {
      appendIncludeToModuleContents(raw, dup);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SerializationRootError);
      expect((e as SerializationRootError).code).toBe('include-collision');
    }
  });

  it('throws include-collision on a duplicate name', () => {
    const dup = buildIncludeEntry({ path: '/sitecore/other', database: 'master', scope: 'DescendantsOnly', name: 'content' });
    try {
      appendIncludeToModuleContents(raw, dup);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as SerializationRootError).code).toBe('include-collision');
    }
  });
});
