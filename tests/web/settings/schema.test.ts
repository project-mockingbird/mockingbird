import { describe, it, expect } from 'vitest';
import { VALIDATORS, validateTheme, SETTINGS_DEFAULTS } from '../../../src/web/settings/schema';

describe('SETTINGS_DEFAULTS', () => {
  it('matches the contract', () => {
    expect(SETTINGS_DEFAULTS).toEqual({
      'editor.defaultTab': 'content',
      'editor.defaultViewMode': 'normal',
      'versioning.trimKeepCount': 5,
      'versioning.trimWarnThreshold': 15,
      'layout.treePanelSize': 20,
      'session.autoRestore': true,
      'session.lastOpenedHash': null,
    });
  });
});

describe('VALIDATORS', () => {
  describe('editor.defaultTab', () => {
    it.each(['content', 'standard', 'layout'] as const)('accepts %s', (v) => {
      expect(VALIDATORS['editor.defaultTab'](v)).toBe(v);
    });
    it('rejects unknown values', () => {
      expect(() => VALIDATORS['editor.defaultTab']('foo')).toThrow(/content.*standard.*layout/i);
    });
  });

  describe('editor.defaultViewMode', () => {
    it.each(['normal', 'raw'] as const)('accepts %s', (v) => {
      expect(VALIDATORS['editor.defaultViewMode'](v)).toBe(v);
    });
    it('rejects unknown values', () => {
      expect(() => VALIDATORS['editor.defaultViewMode']('bold')).toThrow(/normal.*raw/i);
    });
  });

  describe('versioning.trimKeepCount', () => {
    it('accepts integer in range', () => {
      expect(VALIDATORS['versioning.trimKeepCount'](10)).toBe(10);
    });
    it.each([0, -1, 101, 1.5, '5', null])('rejects %p', (v) => {
      expect(() => VALIDATORS['versioning.trimKeepCount'](v)).toThrow(/integer.*1.*100/i);
    });
  });

  describe('versioning.trimWarnThreshold', () => {
    it('accepts integer in range', () => {
      expect(VALIDATORS['versioning.trimWarnThreshold'](20)).toBe(20);
    });
    it.each([0, 1001, 'twenty'])('rejects %p', (v) => {
      expect(() => VALIDATORS['versioning.trimWarnThreshold'](v)).toThrow(/integer.*1.*1000/i);
    });
  });

  describe('layout.treePanelSize', () => {
    it.each([10, 20, 33.5, 60])('accepts %p', (v) => {
      expect(VALIDATORS['layout.treePanelSize'](v)).toBe(v);
    });
    it.each([0, 9, 61, 200, '20', null])('rejects %p', (v) => {
      expect(() => VALIDATORS['layout.treePanelSize'](v)).toThrow(/10.*60/);
    });
  });
});

describe('validateTheme', () => {
  it.each(['light', 'dark', 'system'] as const)('accepts %s', (v) => {
    expect(validateTheme(v)).toBe(v);
  });
  it('rejects unknown', () => {
    expect(() => validateTheme('purple')).toThrow(/light.*dark.*system/i);
  });
});
