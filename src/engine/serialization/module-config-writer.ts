/**
 * Generic helpers for deriving the emit path and serializing a proposed
 * `*.module.json` configuration. Extracted from the scaffolding builder so
 * that other features (e.g. the serialization-root wizard) can reuse them
 * without pulling in scaffolding internals.
 */
import { readFileSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import type { Engine } from '../index.js';
import type { ModuleConfig } from '../types.js';

/**
 * Derive the absolute path where the emitted module file should be
 * written, so the consumer's `sitecore.json` loader will discover it
 * on the next reload.
 *
 * Source-of-truth order (most reliable first):
 *
 *   1. Mirror an already-loaded module's filePath + extension. The
 *      engine has already successfully read sitecore.json AND globbed
 *      for matching files at init - if anything matched, mirroring its
 *      directory + extension is more robust than re-parsing the glob
 *      ourselves (handles weird globs, multi-glob configs, anything).
 *
 *   2. Re-read sitecore.json and parse the first `modules` glob:
 *      walk segments to find the first wildcard, take everything
 *      before as the directory, and substring-after-last-`*` as the
 *      filename suffix.
 *
 *   3. Fall back to `serialization/<name>.module.json` if neither
 *      source produces a usable hint.
 *
 * Examples:
 *   glob `serialization/*.module.json`         -> serialization/mb-X.module.json
 *   glob `authoring/items/**\/*.module.json`   -> authoring/items/mb-X.module.json
 *   glob `serialization/*.json` (mb dev)       -> serialization/mb-X.json
 */
export function deriveEmitTarget(engine: Engine, baseName: string): string {
  // 1. Mirror an already-loaded module's directory + extension. Needs no
  //    rootDir, so it works in single-root AND multi-layer open modes.
  for (const mod of engine.getModules()) {
    if (typeof mod.filePath === 'string' && mod.filePath.length > 0) {
      const dir = dirname(mod.filePath);
      const filename = basename(mod.filePath);
      const suffix = filename.toLowerCase().endsWith('.module.json')
        ? '.module.json'
        : '.json';
      return resolve(dir, `${baseName}${suffix}`);
    }
  }

  // 2. No loaded modules to mirror - fall back to parsing sitecore.json, which
  //    needs a single rootDir. Multi-layer workspaces have none; with zero
  //    loaded modules there is nowhere unambiguous to emit.
  const rootDir = engine.getRootDir();
  if (!rootDir) {
    throw new Error(
      'Cannot derive a serialization target: no modules are loaded and the workspace has no single root directory (multi-layer). Append to an existing module instead.',
    );
  }

  // 3. Parse the first glob from sitecore.json.
  let glob = 'serialization/*.module.json';
  try {
    const raw = readFileSync(resolve(rootDir, 'sitecore.json'), 'utf-8');
    const config = JSON.parse(raw);
    const first = Array.isArray(config?.modules) ? config.modules[0] : undefined;
    if (typeof first === 'string' && first.trim().length > 0) {
      glob = first;
    } else {
      console.warn(
        `[scaffolding] sitecore.json at ${rootDir} has no usable modules glob; ` +
        `falling back to default ${glob}`,
      );
    }
  } catch (err) {
    console.warn(
      `[scaffolding] Could not read sitecore.json at ${rootDir}: ` +
      `${err instanceof Error ? err.message : String(err)}. ` +
      `Falling back to default glob ${glob}`,
    );
  }

  // 4. Parse glob -> static directory + filename suffix.
  const parts = glob.replace(/\\/g, '/').split('/');
  let firstWildcardIdx = parts.findIndex(p => p.includes('*'));
  if (firstWildcardIdx === -1) firstWildcardIdx = parts.length;
  const staticDir = parts.slice(0, firstWildcardIdx).join('/');
  const fileSegment = parts[parts.length - 1] ?? '*.module.json';
  const lastStarIdx = fileSegment.lastIndexOf('*');
  const suffix = lastStarIdx >= 0 ? fileSegment.slice(lastStarIdx + 1) : '.module.json';
  const filename = `${baseName}${suffix || '.module.json'}`;
  return resolve(rootDir, staticDir, filename);
}

export type ProposedModuleConfig = {
  /** Absolute file path where the module JSON should be written. */
  absoluteFilePath: string;
  /** The ModuleConfig contents (without `filePath` - the loader stamps that). */
  contents: Omit<ModuleConfig, 'filePath'>;
};

/**
 * Serialize a proposed module config to the JSON string the file should
 * contain. Indentation matches what the existing user-authored module
 * files in this workspace use (3 spaces, trailing newline).
 */
export function serializeModuleConfig(proposed: ProposedModuleConfig): string {
  return JSON.stringify(proposed.contents, null, 3) + '\n';
}
