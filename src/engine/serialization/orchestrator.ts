import { mkdir, writeFile, readFile } from 'fs/promises';
import { dirname } from 'path';
import { existsSync } from 'fs';
import type { Engine } from '../index.js';
import type { ModuleInclude } from '../types.js';
import {
  buildIncludeEntry, appendIncludeToModuleContents, buildNewModuleContents,
  leafOf, SerializationRootError, type RootScope,
} from './add-serialization-root.js';

export interface AddSerializationRootInput {
  path: string;
  database?: string;
  scope?: RootScope;
  name?: string;
  target: { modulePath: string } | { newFile: true };
}

export interface AddSerializationRootResult {
  targetFilePath: string;
  willCreateFile: boolean;
  include: ModuleInclude;
  contents: string;
  warnings: string[];
  applied: boolean;
  reloaded: boolean;
}

export async function addSerializationRoot(
  engine: Engine,
  input: AddSerializationRootInput,
  opts: { dryRun?: boolean } = {},
): Promise<AddSerializationRootResult> {
  // 1. Path must resolve (tree or registry).
  const tree = engine.getItemByPath(input.path);
  const reg = tree ? null : engine.getRegistryItemByPath(input.path);
  if (!tree && !reg) {
    throw new SerializationRootError('path-not-found', `Path not found: ${input.path}`);
  }
  // Precedence: explicit override, then the registry item's database, then master.
  const database = input.database ?? reg?.database ?? 'master';
  const scope: RootScope = input.scope ?? 'DescendantsOnly';
  const include = buildIncludeEntry({ path: input.path, database, scope, name: input.name });

  const warnings: string[] = [];
  if (scope === 'SingleItem') {
    warnings.push('Scope SingleItem covers only the item itself; it will not enable creating children under this path.');
  }

  // Cross-module exact-path collision: an include for this exact Sitecore path
  // in ANY loaded module means ambiguous routing. Reject per the spec error table.
  const lowerPath = input.path.toLowerCase();
  for (const mod of engine.getModules()) {
    for (const inc of mod.items.includes) {
      if (inc.path.toLowerCase() === lowerPath) {
        throw new SerializationRootError(
          'include-collision',
          `An include already covers ${input.path} in ${mod.filePath}`,
        );
      }
    }
  }
  // Non-fatal redundancy: if new children under this path are already covered by a
  // broader (e.g. ancestor) include, this new root is likely redundant.
  if (engine.coversNewChildAt(input.path)) {
    warnings.push(
      'New children under this path are already covered by an existing include; this serialization root may be redundant.',
    );
  }

  // 2. Resolve target contents.
  let targetFilePath: string;
  let contents: string;
  let willCreateFile: boolean;
  if ('newFile' in input.target) {
    const built = buildNewModuleContents(engine, include, `mb-${leafOf(input.path)}`);
    targetFilePath = built.targetFilePath;
    contents = built.contents;
    willCreateFile = true;
    if (existsSync(targetFilePath)) {
      throw new SerializationRootError('target-exists', `Target file already exists: ${targetFilePath}. Pick it from the module list to append instead.`);
    }
  } else {
    const modulePath = input.target.modulePath;
    const known = engine.getModules().some(m => m.filePath === modulePath);
    if (!known) {
      throw new SerializationRootError('module-not-found', `Not a discovered module: ${modulePath}`);
    }
    const raw = await readFile(modulePath, 'utf-8');
    contents = appendIncludeToModuleContents(raw, include);
    targetFilePath = modulePath;
    willCreateFile = false;
  }

  const base: Omit<AddSerializationRootResult, 'applied' | 'reloaded'> = {
    targetFilePath, willCreateFile, include, contents, warnings,
  };

  if (opts.dryRun) {
    return { ...base, applied: false, reloaded: false };
  }

  await mkdir(dirname(targetFilePath), { recursive: true });
  await writeFile(targetFilePath, contents, 'utf-8');
  let reloaded = false;
  try {
    await engine.reloadModules();
    reloaded = true;
  } catch {
    reloaded = false;
  }
  return { ...base, applied: true, reloaded };
}
