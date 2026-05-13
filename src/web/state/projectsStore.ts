import { create } from 'zustand';

export interface SavedProjectLayer {
  sitecoreJsonPath: string;
  name: string;
  color: string;
}

export interface SavedProject {
  hash: string;
  name: string;
  layers: SavedProjectLayer[];
  createdAt: string;
  lastOpenedAt: string;
}

export interface ProjectsPrefs {
  autoRestore: boolean;
}

interface PersistedState {
  projects: Record<string, SavedProject>;
  lastOpenedHash: string | null;
  prefs: ProjectsPrefs;
}

interface ProjectsStateShape extends PersistedState {
  list(): SavedProject[];
  get(hash: string): SavedProject | null;
  upsert(project: SavedProject): void;
  remove(hash: string): void;
  rename(hash: string, newName: string): void;
  touchLastOpened(hash: string): void;
  setAutoRestore(value: boolean): void;
  reset(): void;
}

const STORAGE_KEY = 'mockingbird.projects';

const DEFAULT_STATE: PersistedState = {
  projects: {},
  lastOpenedHash: null,
  prefs: { autoRestore: true },
};

function loadFromStorage(): PersistedState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return {
      projects: parsed.projects ?? {},
      lastOpenedHash: parsed.lastOpenedHash ?? null,
      prefs: { autoRestore: parsed.prefs?.autoRestore ?? true },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveToStorage(state: PersistedState): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        projects: state.projects,
        lastOpenedHash: state.lastOpenedHash,
        prefs: state.prefs,
      }),
    );
  } catch {
    // ignore storage errors (private mode, quota, missing localStorage)
  }
}

export const useProjectsStore = create<ProjectsStateShape>((set, get) => ({
  ...loadFromStorage(),

  list: () => {
    const all = Object.values(get().projects);
    return all.sort((a, b) => (b.lastOpenedAt > a.lastOpenedAt ? 1 : -1));
  },

  get: (hash) => get().projects[hash] ?? null,

  upsert: (project) =>
    set((s) => ({
      projects: { ...s.projects, [project.hash]: project },
    })),

  remove: (hash) =>
    set((s) => {
      const next = { ...s.projects };
      delete next[hash];
      const lastOpenedHash = s.lastOpenedHash === hash ? null : s.lastOpenedHash;
      return { projects: next, lastOpenedHash };
    }),

  rename: (hash, newName) =>
    set((s) => {
      const existing = s.projects[hash];
      if (!existing) return s;
      return {
        projects: {
          ...s.projects,
          [hash]: { ...existing, name: newName },
        },
      };
    }),

  touchLastOpened: (hash) =>
    set((s) => {
      const existing = s.projects[hash];
      if (!existing) return { lastOpenedHash: hash };
      return {
        lastOpenedHash: hash,
        projects: {
          ...s.projects,
          [hash]: { ...existing, lastOpenedAt: new Date().toISOString() },
        },
      };
    }),

  setAutoRestore: (value) =>
    set((s) => ({ prefs: { ...s.prefs, autoRestore: value } })),

  reset: () => set({ ...DEFAULT_STATE }),
}));

// Persist on every change.
useProjectsStore.subscribe((state) =>
  saveToStorage({
    projects: state.projects,
    lastOpenedHash: state.lastOpenedHash,
    prefs: state.prefs,
  }),
);

/** Test helper - resets the store between tests. */
export function resetProjectsStore(): void {
  useProjectsStore.getState().reset();
}
