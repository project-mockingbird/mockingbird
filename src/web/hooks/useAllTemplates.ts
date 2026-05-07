import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEngineReady } from '@/hooks/useEngineStatus';

/**
 * Fetches every Template + Branch + Folder item under /sitecore/templates.
 * Lazy via the `enabled` flag so the ~3000-item payload only loads when a
 * caller actually needs it (e.g. when InsertFromTemplateDialog opens).
 *
 * Cached for 5 minutes; invalidated by `useWebSocket` on item events so
 * a newly-authored template shows up in the picker without a manual refresh.
 */
export function useAllTemplates({ enabled }: { enabled: boolean }) {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['all-templates'],
    queryFn: () => api.getAllTemplates(),
    enabled: ready && enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
