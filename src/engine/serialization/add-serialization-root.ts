import type { Engine } from '../index.js';
import type { ModuleInclude, ModuleConfig } from '../types.js';
import { encodeSegment } from '../child-file-path.js';
import { serializeModuleConfig, deriveEmitTarget } from './module-config-writer.js';

export type RootScope = NonNullable<ModuleInclude['scope']>;

export type SerializationRootErrorCode =
  | 'path-not-found'
  | 'invalid-scope'
  | 'module-not-found'
  | 'include-collision'
  | 'target-exists';

export class SerializationRootError extends Error {
  constructor(public code: SerializationRootErrorCode, message: string) {
    super(message);
    this.name = 'SerializationRootError';
  }
}

const VALID_SCOPES: ReadonlySet<string> = new Set([
  'SingleItem', 'ItemAndChildren', 'ItemAndDescendants', 'DescendantsOnly',
]);

export function leafOf(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? '';
}

export function buildIncludeEntry(input: {
  path: string;
  database: string;
  scope: RootScope;
  name?: string;
}): ModuleInclude {
  if (!VALID_SCOPES.has(input.scope)) {
    throw new SerializationRootError('invalid-scope', `Invalid scope: ${input.scope}`);
  }
  const name = input.name && input.name.trim().length > 0
    ? input.name.trim()
    : encodeSegment(leafOf(input.path));
  return { name, path: input.path, database: input.database, scope: input.scope };
}

export function appendIncludeToModuleContents(rawModuleJson: string, include: ModuleInclude): string {
  const parsed = JSON.parse(rawModuleJson) as ModuleConfig;
  const includes = parsed.items?.includes ?? [];
  for (const existing of includes) {
    if (existing.path.toLowerCase() === include.path.toLowerCase()) {
      throw new SerializationRootError('include-collision', `An include already covers ${include.path}`);
    }
    if ((existing.name ?? '').toLowerCase() === include.name.toLowerCase()) {
      throw new SerializationRootError('include-collision', `An include named "${include.name}" already exists in this module`);
    }
  }
  if (!parsed.items) parsed.items = { includes: [] };
  parsed.items.includes = [...includes, include];
  return JSON.stringify(parsed, null, 3) + '\n';
}

export function buildNewModuleContents(
  engine: Engine,
  include: ModuleInclude,
  baseName: string,
): { targetFilePath: string; contents: string } {
  const targetFilePath = deriveEmitTarget(engine, baseName);
  const contents = serializeModuleConfig({
    absoluteFilePath: targetFilePath,
    contents: {
      namespace: `Mockingbird.SerializationRoot.${include.name}`,
      items: { path: 'items', includes: [include] },
    },
  });
  return { targetFilePath, contents };
}
