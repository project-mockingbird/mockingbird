import { describe, it, expect } from 'vitest';
import { detectOverlaps } from './duplicate-detect';

describe('detectOverlaps', () => {
  it('returns an empty map for non-overlapping candidates', () => {
    const result = detectOverlaps([
      { sitecoreJsonPath: '/workspaces/repo-a/sitecore.json' },
      { sitecoreJsonPath: '/workspaces/repo-b/sitecore.json' },
    ]);
    expect(result.size).toBe(0);
  });

  it('flags a child candidate as overlapping its parent', () => {
    const result = detectOverlaps([
      { sitecoreJsonPath: '/workspaces/repo/sitecore.json' },
      { sitecoreJsonPath: '/workspaces/repo/migration/sitecore.json' },
    ]);
    expect(result.get('/workspaces/repo/migration/sitecore.json')).toEqual([
      '/workspaces/repo/sitecore.json',
    ]);
    expect(result.has('/workspaces/repo/sitecore.json')).toBe(false);
  });

  it('flags a grandchild against an ancestor', () => {
    const result = detectOverlaps([
      { sitecoreJsonPath: '/workspaces/repo/sitecore.json' },
      { sitecoreJsonPath: '/workspaces/repo/a/b/sitecore.json' },
    ]);
    expect(result.get('/workspaces/repo/a/b/sitecore.json')).toEqual([
      '/workspaces/repo/sitecore.json',
    ]);
  });

  it('handles multiple ancestors', () => {
    const result = detectOverlaps([
      { sitecoreJsonPath: '/workspaces/repo/sitecore.json' },
      { sitecoreJsonPath: '/workspaces/repo/a/sitecore.json' },
      { sitecoreJsonPath: '/workspaces/repo/a/b/sitecore.json' },
    ]);
    const flagged = result.get('/workspaces/repo/a/b/sitecore.json');
    expect(flagged).toBeDefined();
    expect(flagged!.sort()).toEqual([
      '/workspaces/repo/a/sitecore.json',
      '/workspaces/repo/sitecore.json',
    ]);
  });

  it('does not flag siblings at the same depth', () => {
    const result = detectOverlaps([
      { sitecoreJsonPath: '/workspaces/repo/a/sitecore.json' },
      { sitecoreJsonPath: '/workspaces/repo/b/sitecore.json' },
    ]);
    expect(result.size).toBe(0);
  });

  it('treats identical paths as a no-op (not self-flag)', () => {
    const result = detectOverlaps([
      { sitecoreJsonPath: '/workspaces/repo/sitecore.json' },
      { sitecoreJsonPath: '/workspaces/repo/sitecore.json' },
    ]);
    expect(result.size).toBe(0);
  });
});
