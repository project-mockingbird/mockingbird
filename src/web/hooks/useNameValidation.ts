import { useMemo } from 'react';
import { getItemNameError, getNameVsSiblingsError } from '@/lib/name-validation';

/**
 * Combined name validation for create / insert / duplicate / rename dialogs.
 * Returns null when the name is acceptable, otherwise a user-facing error
 * string from the engine-mirror validators in `lib/name-validation`.
 *
 * @param name - the typed name
 * @param siblings - existing sibling names (case-insensitive uniqueness
 *                   check). Pass undefined to skip the uniqueness check.
 */
export function useNameValidation(
  name: string,
  siblings: string[] | undefined,
): string | null {
  return useMemo(() => {
    if (siblings) {
      // getNameVsSiblingsError runs the format check internally before the
      // uniqueness check, so a single call covers both when siblings is
      // provided.
      return getNameVsSiblingsError(name, siblings);
    }
    return getItemNameError(name);
  }, [name, siblings]);
}
