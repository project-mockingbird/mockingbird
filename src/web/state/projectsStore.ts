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
  /** Unix ms. The legacy localStorage shape used ISO strings; the migration step
   *  in projectsStoreHydrator converts them. */
  createdAt: number;
  lastOpenedAt: number;
}

interface ProjectsStateShape {
  projects: Record<string, SavedProject>;
  hydrated: boolean;
  list(): SavedProject[];
  get(hash: string): SavedProject | null;
  /** Replace the whole projects map (used by the hydrator). */
  setAll(projects: Record<string, SavedProject>): void;
  upsert(project: SavedProject): void;
  remove(hash: string): void;
  rename(hash: string, newName: string): void;
  touchLastOpened(hash: string): void;
  reset(): void;
  /** Set by the hydrator after the initial GET completes (or fails). */
  markHydrated(): void;
}

export const useProjectsStore = create<ProjectsStateShape>((set, get) => ({
  projects: {},
  hydrated: false,

  list: () => Object.values(get().projects).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),

  get: (hash) => get().projects[hash] ?? null,

  setAll: (projects) => set({ projects }),

  upsert: (project) =>
    set((s) => ({ projects: { ...s.projects, [project.hash]: project } })),

  remove: (hash) =>
    set((s) => {
      const next = { ...s.projects };
      delete next[hash];
      return { projects: next };
    }),

  rename: (hash, newName) =>
    set((s) => {
      const existing = s.projects[hash];
      if (!existing) return s;
      return { projects: { ...s.projects, [hash]: { ...existing, name: newName } } };
    }),

  touchLastOpened: (hash) =>
    set((s) => {
      const existing = s.projects[hash];
      if (!existing) return s;
      return {
        projects: { ...s.projects, [hash]: { ...existing, lastOpenedAt: Date.now() } },
      };
    }),

  reset: () => set({ projects: {} }),
  markHydrated: () => set({ hydrated: true }),
}));

export function resetProjectsStore(): void {
  useProjectsStore.setState({ projects: {}, hydrated: false });
}
