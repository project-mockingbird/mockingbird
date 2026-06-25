import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Mutation hook for "Create Standard Values" - adds a `__Standard Values`
 * child to a template and points the template's `__Standard values` field at
 * it. On success invalidates ['tree'] + ['children'] (the new SV item appears
 * in the tree), ['item', templateId] (the template's field now points at the
 * SV item), ['template-schema', templateId] (SV cascade may change resolved
 * values), and ['validation'].
 */
export function useCreateStandardValues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => api.createStandardValues(templateId),
    onSuccess: (_data, templateId) => {
      qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['children'] });
      qc.invalidateQueries({ queryKey: ['item', templateId] });
      qc.invalidateQueries({ queryKey: ['template-schema', templateId] });
      qc.invalidateQueries({ queryKey: ['validation'] });
    },
  });
}
