import { describe, it, expect } from 'vitest';
import { resolveFieldValue } from '../../src/api/resolve.js';
import type { Engine } from '../../src/engine/index.js';
import type { ItemNode, RegistryItem } from '../../src/engine/types.js';

function createMockEngine(
  items: Record<string, { path: string }>,
  registryItems: Record<string, { name: string; path: string }>,
): Engine {
  return {
    getItemById(id: string): ItemNode | undefined {
      const entry = items[id];
      if (!entry) return undefined;
      return { item: { path: entry.path } } as unknown as ItemNode;
    },
    getRegistryItem(id: string): RegistryItem | undefined {
      const entry = registryItems[id];
      if (!entry) return undefined;
      return { name: entry.name, path: entry.path } as unknown as RegistryItem;
    },
  } as unknown as Engine;
}

describe('resolveFieldValue', () => {
  const engine = createMockEngine(
    {
      'a1b2c3d4-e5f6-7890-abcd-000000000001': { path: '/sitecore/templates/Project/MyTemplate' },
      'b2c3d4e5-f6a7-8901-bcde-000000000002': { path: '/sitecore/content/Home/About' },
    },
    {
      'cccccccc-cccc-cccc-cccc-cccccccccccc': { name: 'Standard Template', path: '/sitecore/templates/System/Standard template' },
    },
  );

  it('returns value unchanged when no GUIDs', () => {
    expect(resolveFieldValue('Hello world', engine)).toBe('Hello world');
  });

  it('returns empty string unchanged', () => {
    expect(resolveFieldValue('', engine)).toBe('');
  });

  it('resolves a single GUID', () => {
    const result = resolveFieldValue('{A1B2C3D4-E5F6-7890-ABCD-000000000001}', engine);
    expect(result).toBe('MyTemplate [/sitecore/templates/Project/MyTemplate]');
  });

  it('resolves concatenated GUIDs (no delimiter)', () => {
    const result = resolveFieldValue(
      '{A1B2C3D4-E5F6-7890-ABCD-000000000001}{B2C3D4E5-F6A7-8901-BCDE-000000000002}',
      engine,
    );
    expect(result).toBe(
      'MyTemplate [/sitecore/templates/Project/MyTemplate]\nAbout [/sitecore/content/Home/About]',
    );
  });

  it('resolves pipe-separated GUIDs', () => {
    const result = resolveFieldValue(
      '{A1B2C3D4-E5F6-7890-ABCD-000000000001}|{B2C3D4E5-F6A7-8901-BCDE-000000000002}',
      engine,
    );
    expect(result).toBe(
      'MyTemplate [/sitecore/templates/Project/MyTemplate]\nAbout [/sitecore/content/Home/About]',
    );
  });

  it('resolves newline-separated GUIDs', () => {
    const result = resolveFieldValue(
      '{A1B2C3D4-E5F6-7890-ABCD-000000000001}\n{B2C3D4E5-F6A7-8901-BCDE-000000000002}',
      engine,
    );
    expect(result).toBe(
      'MyTemplate [/sitecore/templates/Project/MyTemplate]\nAbout [/sitecore/content/Home/About]',
    );
  });

  it('shows (Item not found) for unresolvable GUIDs', () => {
    const result = resolveFieldValue('{DEADBEEF-DEAD-BEEF-DEAD-BEEFDEADBEEF}', engine);
    expect(result).toBe('{DEADBEEF-DEAD-BEEF-DEAD-BEEFDEADBEEF} (Item not found)');
  });

  it('handles mixed found and not-found GUIDs', () => {
    const result = resolveFieldValue(
      '{A1B2C3D4-E5F6-7890-ABCD-000000000001}|{DEADBEEF-DEAD-BEEF-DEAD-BEEFDEADBEEF}',
      engine,
    );
    expect(result).toBe(
      'MyTemplate [/sitecore/templates/Project/MyTemplate]\n{DEADBEEF-DEAD-BEEF-DEAD-BEEFDEADBEEF} (Item not found)',
    );
  });

  it('preserves non-GUID text around GUIDs (inline replacement)', () => {
    const result = resolveFieldValue(
      'Template is {A1B2C3D4-E5F6-7890-ABCD-000000000001} here',
      engine,
    );
    expect(result).toBe(
      'Template is MyTemplate [/sitecore/templates/Project/MyTemplate] here',
    );
  });

  it('falls back to registry when serialized item not found', () => {
    const result = resolveFieldValue('{CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC}', engine);
    expect(result).toBe('Standard Template [/sitecore/templates/System/Standard template]');
  });
});
