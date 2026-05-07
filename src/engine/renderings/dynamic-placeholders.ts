/**
 * substituteDynamicPlaceholder - resolves `{*}` / `{0}` / `{N}` tokens in a
 * placeholder-key template using the parent rendering's `DynamicPlaceholderId`
 * parameter. Mirrors Sitecore's `DynamicPlaceholderKeysResolver.GetDynamicKeys`.
 *
 * Supported tokens (all replaced with the same `DynamicPlaceholderId` value):
 *   - `{*}` - standard SXA single-level dynamic token (e.g. `container-{*}`)
 *   - `{0}` - numeric-index token (e.g. `accordion-{0}`)
 *   - `{N}` - positional-nesting token (e.g. `tab-{N}`)
 *   - `{n}` for any integer n - treated uniformly in v1 (see limitation below)
 *
 * v1 simplification: multi-token templates (e.g. `grid-{0}-{1}`) substitute
 * ALL tokens with the same `DynamicPlaceholderId` value. The decompile of
 * `DynamicPlaceholderKeysResolver` was not available, so positional semantics
 * for distinct numeric indices cannot be verified from first principles. If
 * content tree analysis later reveals positional behaviour, this implementation
 * must be revised.
 *
 * Known limitation - SXA Accordion and similar complex renderings:
 * Some SXA renderings (e.g. Accordion) produce multi-part placeholder keys
 * such as `accordion-0-0-2` that are NOT produced by simple token substitution.
 * These renderings use a custom placeholder generator not exposed by the base
 * `DynamicPlaceholdersResolver`. Callers should fall back to in-xml path
 * discovery (Task 7's other source) for renderings that exhibit this pattern.
 */

import type { RenderingEntry } from '../layout/types.js';

/**
 * Regex that matches any supported substitution token:
 *   {*}              - standard SXA dynamic token
 *   {0}, {1}, ... {n} for any integer n - numeric / positional tokens
 *   {N}              - literal letter-N token (capital N only)
 */
const TOKEN_RE = /\{(?:\*|N|\d+)\}/g;

/**
 * Substitute dynamic-placeholder tokens in a placeholder-key template.
 *
 * @param template    - placeholder key template, e.g. `'container-{*}'`
 * @param parentEntry - the parent rendering whose `params.DynamicPlaceholderId`
 *                      provides the substitution value
 * @returns the resolved string, or `template` unchanged when:
 *   - `parentEntry.params.DynamicPlaceholderId` is absent or empty (preserving
 *     the token form so callers can mark the result as `isTokenForm: true`), or
 *   - the template contains no recognised tokens (replace becomes a no-op).
 */
export function substituteDynamicPlaceholder(
  template: string,
  parentEntry: RenderingEntry,
): string {
  const dynamicId = parentEntry.params?.DynamicPlaceholderId;
  if (!dynamicId) return template;
  return template.replace(TOKEN_RE, dynamicId);
}
