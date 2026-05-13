import { useEffect, useRef } from 'react';
import { useConfigQuery, useConfigMutation } from '@/hooks/useConfigQuery';
import { useProjectsStore } from './projectsStore';
import { migrateFromLocalStorage } from './projectsStoreMigration';
import { useSettings } from '@/settings/SettingsProvider';

const DEBOUNCE_MS = 300;

/**
 * Bridges the projectsStore to /api/config. On first mount:
 *   - Fetches GET /api/config (via useConfigQuery)
 *   - Populates the store, sets hydrated=true
 * On subsequent store mutations:
 *   - Debounces PUT /api/config writes (coalesces rapid mutations)
 */
export function ProjectsStoreHydrator() {
  const { data, isSuccess, isError } = useConfigQuery();
  const { mutate: putConfig } = useConfigMutation();
  const setAll = useProjectsStore((s) => s.setAll);
  const markHydrated = useProjectsStore((s) => s.markHydrated);
  const hydrated = useProjectsStore((s) => s.hydrated);
  const { setSetting } = useSettings();

  // Stabilize the mutation function so the subscription effect does not
  // re-run on every render. Tanstack-query v5 returns new identities for
  // the mutation object, including its `mutate` property, on every render.
  const putConfigRef = useRef(putConfig);
  useEffect(() => {
    putConfigRef.current = putConfig;
  });

  // Hydrate once when the GET resolves.
  // If server is empty and localStorage has legacy data, migrate it first.
  useEffect(() => {
    if (!isSuccess && !isError) return;
    if (hydrated) return;

    const serverProjects = data?.projects ?? {};
    const serverIsEmpty = Object.keys(serverProjects).length === 0;

    void (async () => {
      if (serverIsEmpty) {
        const migrated = await migrateFromLocalStorage();
        if (migrated && Object.keys(migrated.projects).length > 0) {
          setAll(migrated.projects);
          try {
            await fetch('/api/config', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ version: 1, projects: migrated.projects }),
            });
          } catch (err) {
            console.warn('[migration] PUT /api/config failed:', err);
          }
          if (migrated.lastOpenedHash) {
            setSetting('session.lastOpenedHash', migrated.lastOpenedHash);
          }
          setSetting('session.autoRestore', migrated.autoRestore);
        } else {
          setAll(serverProjects);
        }
      } else {
        setAll(serverProjects);
      }
      markHydrated();
    })();
  }, [isSuccess, isError, data, hydrated, setAll, markHydrated, setSetting]);

  // Debounced write-through: subscribe to store after hydration, schedule PUT.
  // Note: mutate is intentionally not in the dep array - it's read via ref.
  useEffect(() => {
    if (!hydrated) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useProjectsStore.subscribe((state) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        putConfigRef.current({ version: 1, projects: state.projects });
      }, DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [hydrated]);

  return null;
}
