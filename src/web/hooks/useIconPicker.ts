import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEngineStatus } from '@/hooks/useEngineStatus';

/** Curated categories + "All icons". Only fetched when icons are enabled. */
export function useIconCategories() {
  const { data: status } = useEngineStatus();
  const enabled = !!status?.iconsEnabled;
  return useQuery({
    queryKey: ['icon-categories'],
    queryFn: () => api.getIconCategories(),
    enabled,
    staleTime: Infinity, // the baked set never changes at runtime
  });
}

/** Icon paths for one category; disabled until a category is chosen. */
export function useIconList(category: string | null) {
  return useQuery({
    queryKey: ['icon-list', category],
    queryFn: () => api.getIconList(category as string),
    enabled: !!category,
    staleTime: Infinity,
  });
}

/** Persist an item's __Icon; refreshes the item detail + tree on success. */
export function useSetIcon(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (icon: string) => api.setIcon(itemId, icon),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['item', itemId] });
      qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['children'] });
    },
  });
}
