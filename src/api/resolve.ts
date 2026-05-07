import type { Engine } from '../engine/index.js';

const GUID_PATTERN = /\{([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}/gi;

/**
 * Checks whether the entire string consists only of GUIDs separated by
 * pipes, newlines, or whitespace (or concatenated with no delimiter).
 */
const GUID_ONLY_PATTERN = /^(\s*\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}\s*([|\n]?\s*))+$/i;

function resolveGuid(id: string, original: string, engine: Engine): string {
  const node = engine.getItemById(id);
  if (node) {
    const name = node.item.path.split('/').pop()!;
    return `${name} [${node.item.path}]`;
  }

  const registryItem = engine.getRegistryItem(id);
  if (registryItem) {
    return `${registryItem.name} [${registryItem.path}]`;
  }

  return `${original} (Item not found)`;
}

/**
 * Scans a string for `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}` GUID patterns
 * and resolves each one to a human-readable `Name [/path]` representation.
 *
 * If the value consists entirely of GUIDs (with optional pipe/newline/whitespace
 * delimiters), each GUID is resolved and results are joined with newlines.
 * If non-GUID content is mixed in, GUIDs are replaced inline.
 */
export function resolveFieldValue(value: string, engine: Engine): string {
  if (!value || !GUID_PATTERN.test(value)) return value;

  // Reset lastIndex after the test call above
  GUID_PATTERN.lastIndex = 0;

  // Check if the value is GUID-only (no surrounding text)
  if (GUID_ONLY_PATTERN.test(value)) {
    const guids: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = GUID_PATTERN.exec(value)) !== null) {
      guids.push(resolveGuid(match[1].toLowerCase(), match[0], engine));
    }
    GUID_PATTERN.lastIndex = 0;
    return guids.join('\n');
  }

  // Inline replacement for mixed content
  return value.replace(GUID_PATTERN, (original, id: string) =>
    resolveGuid(id.toLowerCase(), original, engine),
  );
}
