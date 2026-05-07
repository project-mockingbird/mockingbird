import { describe, it, expect } from 'vitest';
import { unifiedDiff } from '../../src/engine/unified-diff.js';

describe('unifiedDiff', () => {
  it('produces an empty string when before and after are identical', () => {
    expect(unifiedDiff('foo\nbar\n', 'foo\nbar\n', 'a.yml')).toBe('');
  });

  it('shows added lines with + prefix', () => {
    const out = unifiedDiff('foo\n', 'foo\nbar\n', 'a.yml');
    expect(out).toContain('--- a.yml');
    expect(out).toContain('+++ a.yml');
    expect(out).toContain('+bar');
  });

  it('shows removed lines with - prefix', () => {
    const out = unifiedDiff('foo\nbar\n', 'foo\n', 'a.yml');
    expect(out).toContain('-bar');
  });

  it('handles whole-file create (before is empty)', () => {
    const out = unifiedDiff('', 'foo\n', 'a.yml');
    expect(out).toContain('--- /dev/null');
    expect(out).toContain('+++ a.yml');
    expect(out).toContain('+foo');
  });

  it('handles whole-file delete (after is empty)', () => {
    const out = unifiedDiff('foo\n', '', 'a.yml');
    expect(out).toContain('--- a.yml');
    expect(out).toContain('+++ /dev/null');
    expect(out).toContain('-foo');
  });

  it('preserves CRLF line endings in output where present', () => {
    const out = unifiedDiff('foo\r\n', 'foo\r\nbar\r\n', 'a.yml');
    expect(out).toContain('+bar');
  });
});
