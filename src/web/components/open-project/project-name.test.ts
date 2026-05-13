import { describe, it, expect } from 'vitest';
import { deriveProjectName } from './project-name';

describe('deriveProjectName', () => {
  it('returns "project" for empty array', () => {
    expect(deriveProjectName([])).toBe('project');
  });

  it('returns "project" for workspace-root path /sitecore.json', () => {
    expect(deriveProjectName(['/sitecore.json'])).toBe('project');
  });

  it('returns the parent folder name for a single nested path', () => {
    expect(deriveProjectName(['/foo/sitecore.json'])).toBe('foo');
  });

  it('returns parent of sitecore.json for a deeper path', () => {
    expect(deriveProjectName(['/workspace/authoring/sitecore.json'])).toBe('authoring');
  });

  it('returns common ancestor basename for multiple paths sharing a parent dir', () => {
    expect(
      deriveProjectName([
        '/proj/authoring/sitecore.json',
        '/proj/content/sitecore.json',
      ]),
    ).toBe('proj');
  });

  it('returns "project" when multiple paths share no common segments', () => {
    expect(
      deriveProjectName([
        '/a/sitecore.json',
        '/b/sitecore.json',
      ]),
    ).toBe('project');
  });
});
