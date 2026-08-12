export const RECENT_ICONS_KEY = 'mockingbird.recentIcons';

/** Filter icon paths by a case-insensitive substring of the FILENAME only. */
export function filterIcons(paths: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (q === '') return paths;
  return paths.filter((p) => {
    const name = p.slice(p.lastIndexOf('/') + 1).toLowerCase();
    return name.includes(q);
  });
}

/** Filename without directory or extension, for alt text / tooltips. */
export function iconDisplayName(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
}

/** Pure: dedup, move-to-front, cap. */
export function addRecentIcon(list: string[], path: string, cap = 24): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, cap);
}

export function readRecentIcons(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_ICONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writeRecentIcons(list: string[]): void {
  try {
    localStorage.setItem(RECENT_ICONS_KEY, JSON.stringify(list));
  } catch {
    /* storage full / disabled - recent list is best-effort */
  }
}
