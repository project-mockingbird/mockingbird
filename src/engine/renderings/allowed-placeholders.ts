/**
 * getAllowedPlaceholders - extracts the allowed-placeholder-key list from a
 * rendering item.
 *
 * Algorithm (per Task 2 research, allowed-placeholders.md):
 *   1. Read the rendering item's "Placeholders" field
 *      (ID: 069a8361-b1cd-437c-8c32-a3be78941446) - a multilist of GUIDs.
 *   2. Resolve each GUID to a Placeholder Settings item.
 *   3. Read the "Placeholder Key" field
 *      (ID: 7256bdab-1fd2-49dd-b205-cb4873d2917c) from each resolved item.
 *   4. Return the non-empty key strings; dangling GUIDs are silently skipped.
 *
 * Delegates to getDeclaredPlaceholderKeys from rendering-metadata.ts, which
 * implements the same mechanism and is already exercised by the full test
 * suite. Delegation satisfies the DRY rule - no logic duplication.
 */

import type { Engine } from '../index.js';
import { getDeclaredPlaceholderKeys } from '../layout/rendering-metadata.js';
import { hasDynamicToken } from './dynamic-placeholders.js';

/**
 * Return the placeholder-key strings declared by a rendering item.
 *
 * @param engine - the engine instance with the loaded item tree
 * @param renderingId - the ID of the rendering item to inspect
 * @returns string[] of placeholder key values (e.g. ['container-{*}', 'accordion-0'])
 *   Returns an empty array when the rendering does not exist, has no
 *   Placeholders field, or all referenced Placeholder Settings GUIDs are
 *   unresolvable.
 */
export function getAllowedPlaceholders(engine: Engine, renderingId: string): string[] {
  return [...getDeclaredPlaceholderKeys(engine, renderingId)];
}

/**
 * True when a rendering declares at least one dynamic placeholder key (a key
 * containing a `{*}`/`{N}` token, e.g. a Container's `container-{*}`). Such
 * renderings must be assigned a `DynamicPlaceholderId` when placed so the key
 * resolves to a concrete slot and the child placeholder is exposed.
 */
export function declaresDynamicPlaceholders(engine: Engine, renderingId: string): boolean {
  return getDeclaredPlaceholderKeys(engine, renderingId).some(hasDynamicToken);
}
