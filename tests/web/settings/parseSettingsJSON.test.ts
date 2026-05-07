import { describe, it, expect } from 'vitest';
import { parseSettingsJSON } from '../../../src/web/settings/parseSettingsJSON';

describe('parseSettingsJSON', () => {
  it('parses valid overrides', () => {
    const r = parseSettingsJSON('{"editor.defaultTab": "layout"}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.settings).toEqual({ 'editor.defaultTab': 'layout' });
      expect(r.theme).toBeNull();
    }
  });

  it('extracts appearance.theme separately', () => {
    const r = parseSettingsJSON('{"appearance.theme": "light", "editor.defaultTab": "layout"}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.theme).toBe('light');
      expect(r.settings).toEqual({ 'editor.defaultTab': 'layout' });
    }
  });

  it('returns syntax error for invalid JSON', () => {
    const r = parseSettingsJSON('{not valid');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]).toMatch(/JSON|parse|syntax/i);
    }
  });

  it('rejects unknown keys', () => {
    const r = parseSettingsJSON('{"foo.bar": 1}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]).toMatch(/Unknown setting.*foo\.bar/);
    }
  });

  it('rejects values failing per-key validators', () => {
    const r = parseSettingsJSON('{"versioning.trimKeepCount": "ten"}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]).toMatch(/versioning\.trimKeepCount.*integer/i);
    }
  });

  it('reports all errors instead of first-only', () => {
    const r = parseSettingsJSON('{"foo.bar": 1, "versioning.trimKeepCount": "x"}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(2);
    }
  });

  it('handles empty object', () => {
    const r = parseSettingsJSON('{}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.settings).toEqual({});
      expect(r.theme).toBeNull();
    }
  });

  it('rejects non-object input (array or primitive)', () => {
    const r1 = parseSettingsJSON('[]');
    const r2 = parseSettingsJSON('"foo"');
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });
});
