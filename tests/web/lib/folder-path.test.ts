import { describe, it, expect } from 'vitest';
import { containingFolder } from '../../../src/web/lib/folder-path';

describe('containingFolder', () => {
  it('returns the directory of a Windows host path', () => {
    expect(containingFolder('C:\\projects\\foo\\bar.yml')).toBe('C:\\projects\\foo');
  });

  it('returns the directory of a POSIX host path', () => {
    expect(containingFolder('/Users/x/foo/bar.yml')).toBe('/Users/x/foo');
  });

  it('returns empty string for empty input', () => {
    expect(containingFolder('')).toBe('');
    expect(containingFolder(undefined)).toBe('');
    expect(containingFolder(null)).toBe('');
  });

  it('returns the input when no separator is present', () => {
    expect(containingFolder('bar.yml')).toBe('bar.yml');
  });

  it('handles a path with both separator types (mixed)', () => {
    // The Windows-style trailing segment wins.
    expect(containingFolder('C:/projects/foo\\bar.yml')).toBe('C:/projects/foo');
  });
});
