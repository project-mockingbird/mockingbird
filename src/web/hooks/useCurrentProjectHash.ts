import { useConfigQuery } from './useConfigQuery';

/**
 * Returns the server-persisted lastOpenedHash from config.mockingbird, or null
 * if the config query hasn't resolved yet or no project has ever been opened.
 * This is the single source of truth for "which project is currently open" -
 * server-side replay on boot also uses the same field.
 */
export function useCurrentProjectHash(): string | null {
  const { data } = useConfigQuery();
  return data?.lastOpenedHash ?? null;
}
