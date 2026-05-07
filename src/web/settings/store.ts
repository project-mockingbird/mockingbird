import { SETTINGS_DEFAULTS, type Settings, type SettingsKey, type Overrides } from './schema';

const KEY = 'mockingbird.settings.v1';

const listeners = new Set<() => void>();
let cache: Overrides = readFromStorage();
let snapshot: Settings = computeSnapshot();

function readFromStorage(): Overrides {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Overrides) : {};
  } catch {
    return {};
  }
}

function computeSnapshot(): Settings {
  return { ...SETTINGS_DEFAULTS, ...cache } as Settings;
}

function writeToStorage(next: Overrides) {
  cache = next;
  snapshot = computeSnapshot();
  if (typeof localStorage === 'undefined') return;
  if (Object.keys(next).length === 0) {
    localStorage.removeItem(KEY);
  } else {
    localStorage.setItem(KEY, JSON.stringify(next));
  }
}

function notify() {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getOverrides(): Overrides {
  return cache;
}

// Returns a referentially stable snapshot so useSyncExternalStore's
// Object.is check sees no change between renders. Recomputed only when
// cache mutates (writeToStorage / cross-tab storage event).
export function getSnapshot(): Settings {
  return snapshot;
}

export function setSetting<K extends SettingsKey>(key: K, value: Settings[K]): void {
  const next: Overrides = { ...cache };
  if (value === SETTINGS_DEFAULTS[key]) {
    delete next[key];
  } else {
    next[key] = value;
  }
  writeToStorage(next);
  notify();
}

export function reset(): void {
  writeToStorage({});
  notify();
}

// Cross-tab sync: re-read on storage events from other tabs.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      cache = readFromStorage();
      snapshot = computeSnapshot();
      notify();
    }
  });
}
