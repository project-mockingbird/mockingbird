import { describe, it, expect } from 'vitest';
import { buildEditorUrl, DEFAULT_EDITOR_URL_TEMPLATE } from '../../../src/web/lib/editor-url';

describe('buildEditorUrl', () => {
  it('builds the default vscode://file URL for a Windows host path', () => {
    const url = buildEditorUrl(
      DEFAULT_EDITOR_URL_TEMPLATE,
      'C:\\projects\\foo\\authoring\\items\\bar.yml',
    );
    expect(url).toBe('vscode://file/C:/projects/foo/authoring/items/bar.yml');
  });

  it('passes a Linux native path through unchanged (already forward-slashed)', () => {
    const url = buildEditorUrl(DEFAULT_EDITOR_URL_TEMPLATE, '/srv/mockingbird/serialization/foo.yml');
    expect(url).toBe('vscode://file//srv/mockingbird/serialization/foo.yml');
  });

  it('URL-encodes spaces in the path', () => {
    const url = buildEditorUrl(
      DEFAULT_EDITOR_URL_TEMPLATE,
      'C:\\Program Files\\Has Spaces\\file.yml',
    );
    expect(url).toBe('vscode://file/C:/Program%20Files/Has%20Spaces/file.yml');
  });

  it('honors a non-default template (e.g., JetBrains IDEA)', () => {
    const url = buildEditorUrl('idea://open?file={path}', 'C:\\projects\\foo\\bar.yml');
    expect(url).toBe('idea://open?file=C:/projects/foo/bar.yml');
  });

  it('returns empty string for empty filePath', () => {
    expect(buildEditorUrl(DEFAULT_EDITOR_URL_TEMPLATE, '')).toBe('');
  });
});
