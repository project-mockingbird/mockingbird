import { describe, it, expect } from 'vitest';
import {
  getItemNameError,
  NAME_LIMITS,
  getNameVsSiblingsError,
} from '../../src/engine/name-validation.js';

describe('getItemNameError', () => {
  it('returns null for valid simple names', () => {
    expect(getItemNameError('Home')).toBeNull();
    expect(getItemNameError('Page 1')).toBeNull();
    expect(getItemNameError('foo-bar_baz')).toBeNull();
    expect(getItemNameError('$name')).toBeNull(); // $-prefix is allowed by regex
  });

  it('rejects empty / blank-only input', () => {
    expect(getItemNameError('')).toMatch(/blank/);
  });

  it('rejects names exceeding MaxItemNameLength', () => {
    const tooLong = 'a'.repeat(NAME_LIMITS.maxLength + 1);
    expect(getItemNameError(tooLong)).toMatch(/length/);
  });

  it('rejects trailing period', () => {
    expect(getItemNameError('Home.')).toMatch(/period/);
  });

  it('rejects leading or trailing whitespace', () => {
    expect(getItemNameError(' Home')).toMatch(/blanks/);
    expect(getItemNameError('Home ')).toMatch(/blanks/);
  });

  it('rejects each invalid char individually', () => {
    for (const ch of ['/', '\\', ':', '?', '"', '<', '>', '|', '[', ']']) {
      expect(getItemNameError(`Home${ch}Page`)).toMatch(/invalid characters/);
    }
  });

  it('HTML-decodes input before invalid-char check (Sitecore parity)', () => {
    // & l t ; etc - the decoded "Home<Page" should fail invalid-chars
    expect(getItemNameError('Home&lt;Page')).toMatch(/invalid characters/);
  });

  it('rejects names that fail the ItemNameValidation regex', () => {
    // Must START with word-char, *, or $ - leading hyphen rejected
    expect(getItemNameError('-Home')).toMatch(/satisfy pattern/);
  });

  it('accepts the trailing version-counter form `Name(2)`', () => {
    expect(getItemNameError('Home(2)')).toBeNull();
    expect(getItemNameError('Home(123)')).toBeNull();
  });
});

describe('getNameVsSiblingsError', () => {
  it('returns null when no sibling has the name', () => {
    const siblings = ['Home', 'About', 'Contact'];
    expect(getNameVsSiblingsError('NewPage', siblings)).toBeNull();
  });

  it('rejects exact match (case-insensitive) against existing siblings', () => {
    const siblings = ['Home', 'About'];
    expect(getNameVsSiblingsError('home', siblings)).toMatch(/already exists/);
    expect(getNameVsSiblingsError('ABOUT', siblings)).toMatch(/already exists/);
  });

  it('returns the name-error first if name itself is invalid', () => {
    expect(getNameVsSiblingsError('Home.', ['Other'])).toMatch(/period/);
  });
});
