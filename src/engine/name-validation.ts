import type { ItemNode } from './types.js';

/**
 * Extract the on-tree names of a node's direct children. The "name" is the
 * last segment of each child's Sitecore path - the same value Sitecore uses
 * for sibling-collision checks via `Item.Name`.
 *
 * Used by copy/move/duplicate-style operations that need to validate a
 * candidate name against existing siblings or compute a conflict-free name
 * (Sitecore's `ItemUtil.GetCopyOfName`).
 */
export function getSiblingNames(parent: ItemNode): string[] {
  return [...parent.children.values()]
    .map((c) => c.item.path.split('/').pop() ?? '')
    .filter(Boolean);
}

/**
 * Port of `Sitecore.Data.Items.ItemUtil.GetItemNameError`
 * (Sitecore.Kernel.decompiled.cs:379368). Predicate-equivalent.
 *
 * Defaults baked from Sitecore's standard `Settings.*` values. If a content tree
 * case forces a deviation, surface as env vars at that point - not before.
 */
export const NAME_LIMITS = {
  maxLength: 100,
  // Sitecore default: \/:?"<>|[]
  invalidChars: ['\\', '/', ':', '?', '"', '<', '>', '|', '[', ']'] as const,
  // Sitecore default: ^[\w\*\$][\w\s\-\$]*(\(\d{1,}\))?$  (ECMAScript)
  // \w in JS = [A-Za-z0-9_] - matches .NET ECMAScript flag.
  validationRegex: /^[\w\*\$][\w\s\-\$]*(\(\d{1,}\))?$/,
} as const;

export function getItemNameError(name: string): string | null {
  if (name.length === 0) return 'An item name cannot be blank.';
  if (name.length > NAME_LIMITS.maxLength) {
    return `An item name length should be less or equal to ${NAME_LIMITS.maxLength}.`;
  }
  if (name[name.length - 1] === '.') return 'An item name cannot end in a period (.)';
  if (name.trim().length !== name.length) return 'An item name cannot start or end with blanks.';

  // Sitecore HTML-decodes before the invalid-chars check. Mirror that.
  const decoded = htmlDecode(name);
  for (const ch of NAME_LIMITS.invalidChars) {
    if (decoded.includes(ch)) return `Item name "${name}" contains invalid characters.`;
  }
  if (!NAME_LIMITS.validationRegex.test(name)) {
    return `Item name "${name}" must satisfy pattern: ${NAME_LIMITS.validationRegex.source}`;
  }
  return null;
}

// Minimal HTML entity decoder covering what Sitecore's HttpUtility.HtmlDecode
// would produce inside an item name. Full HTML decoding isn't appropriate -
// Sitecore's predicate is what matters.
function htmlDecode(s: string): string {
  return s
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/gi, '&'); // last - prevents double-decoding
}

/**
 * Composite check used by `Engine.insertItem`. Runs `getItemNameError` first,
 * then case-insensitive sibling-name comparison. Sitecore default is
 * `AllowDuplicateItemNamesOnSameLevel = false` (Sitecore.Kernel.decompiled.cs:
 * 379055 `AssertDuplicateItemName`).
 *
 * Caller passes the list of EXISTING sibling names. Engine resolves the list
 * from the parent's children before calling.
 */
export function getNameVsSiblingsError(
  name: string,
  existingSiblingNames: readonly string[],
): string | null {
  const nameError = getItemNameError(name);
  if (nameError) return nameError;
  const lowered = name.toLowerCase();
  const collision = existingSiblingNames.find((s) => s.toLowerCase() === lowered);
  if (collision) {
    return `An item with the same name already exists at this level: "${collision}".`;
  }
  return null;
}
