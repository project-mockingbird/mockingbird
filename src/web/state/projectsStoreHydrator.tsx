import { useEffect } from 'react';
import { useConfigQuery, useConfigMutation } from '@/hooks/useConfigQuery';
import { useProjectsStore } from './projectsStore';

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
  const mutate = useConfigMutation();
  const setAll = useProjectsStore((s) => s.setAll);
  const markHydrated = useProjectsStore((s) => s.markHydrated);
  const hydrated = useProjectsStore((s) => s.hydrated);

  // Hydrate once when the GET resolves.
  useEffect(() => {
    if (!isSuccess && !isError) return;
    if (hydrated) return;
    if (data) setAll(data.projects);
    markHydrated();
  }, [isSuccess, isError, data, hydrated, setAll, markHydrated]);

  // Debounced write-through: subscribe to store, schedule PUT.
  useEffect(() => {
    if (!hydrated) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useProjectsStore.subscribe((state) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        mutate.mutate({ version: 1, projects: state.projects });
      }, DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [hydrated, mutate]);

  return null;
}
