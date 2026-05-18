import { useEffect, useRef } from 'react';
import { useConfigQuery, useConfigMutation } from '@/hooks/useConfigQuery';
import { useProjectsStore } from './projectsStore';
import { migrateFromLocalStorage } from './projectsStoreMigration';
import { useSettings } from '@/settings/SettingsProvider';

const DEBOUNCE_MS = 300;

const SETTINGS_STORAGE_KEY = 'mockingbird.settings.v1';

async function migrateLastOpenedHash(
  serverConfig: { version: 1; projects: Record<string, unknown>; lastOpenedHash?: string },
): Promise<void> {
  if (typeof localStorage === 'undefined') return;

  let browserHash: string | null = null;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed['session.lastOpenedHash'] === 'string') {
        browserHash = parsed['session.lastOpenedHash'];
      }
    }
  } catch {
    return;
  }

  if (!browserHash) return;

  // Promote to server if server has none. Either way, clear the browser key.
  if (!serverConfig.lastOpenedHash) {
    try {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...serverConfig, lastOpenedHash: browserHash }),
      });
    } catch (err) {
      console.warn('[migration] failed to promote session.lastOpenedHash to server:', err);
      return;
    }
  }

  // Clear the browser-side key (whether or not the PUT fired).
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      delete parsed['session.lastOpenedHash'];
      if (Object.keys(parsed).length === 0) {
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
      } else {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(parsed));
      }
    }
  } catch {
    /* ignore - migration is best-effort */
  }
}

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

      // One-time migration: promote browser-side session.lastOpenedHash to
      // server-side lastOpenedHash field on config.mockingbird. After this
      // hydrator finishes, the browser key is gone and the server is the
      // single source of truth.
      await migrateLastOpenedHash(data ?? { version: 1, projects: serverProjects });

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
