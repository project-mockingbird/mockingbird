// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  filterIcons, iconDisplayName, addRecentIcon, readRecentIcons, writeRecentIcons, RECENT_ICONS_KEY,
} from './icon-picker';

// Stub localStorage at module scope - jsdom's Storage is missing .clear().
// Mirrors the pattern in src/web/state/workspacePersistence.test.ts.
let mem: Record<string, string>;

beforeEach(() => {
  mem = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => { mem[k] = v; },
    removeItem: (k: string) => { delete mem[k]; },
    clear: () => { mem = {}; },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('filterIcons', () => {
  const paths = ['Office/32x32/folder.png', 'Office/32x32/folder_open.png', 'Network/32x32/home.png'];
  it('matches the filename case-insensitively', () => {
    expect(filterIcons(paths, 'FOLDER')).toEqual(['Office/32x32/folder.png', 'Office/32x32/folder_open.png']);
  });
  it('returns all on empty query', () => {
    expect(filterIcons(paths, '')).toEqual(paths);
  });
  it('does not match on the theme/size segments', () => {
    expect(filterIcons(paths, '32x32')).toEqual([]);
  });
});

describe('iconDisplayName', () => {
  it('strips folder and extension', () => {
    expect(iconDisplayName('Office/32x32/folder_open.png')).toBe('folder_open');
  });
});

describe('addRecentIcon', () => {
  it('moves an existing entry to the front without duplicating', () => {
    expect(addRecentIcon(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
  });
  it('caps the list', () => {
    expect(addRecentIcon(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });
});

describe('recent-icon storage', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips through localStorage', () => {
    writeRecentIcons(['x', 'y']);
    expect(readRecentIcons()).toEqual(['x', 'y']);
  });
  it('returns [] for malformed JSON', () => {
    localStorage.setItem(RECENT_ICONS_KEY, '{not json');
    expect(readRecentIcons()).toEqual([]);
  });
  it('returns [] when unset', () => {
    expect(readRecentIcons()).toEqual([]);
  });
});
