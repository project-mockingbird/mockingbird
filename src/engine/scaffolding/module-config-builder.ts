/**
 * Builds proposed `*.module.json` configurations for newly-scaffolded
 * tenants and sites. Pure: returns the JSON shape + intended file path,
 * never touches the filesystem. Caller (the scaffold orchestrator + API
 * arm) decides when to actually write the file based on dryRun / accept
 * flags.
 *
 * Emit-path + filename-suffix come from the consumer's `sitecore.json`
 * `modules` glob, so the file lands somewhere the consumer's existing
 * loader will discover. Examples:
 *   glob `serialization/*.module.json` -> `serialization/mb-<tenant>.module.json`
 *   glob `authoring/items/**\/*.module.json` -> `authoring/items/mb-<tenant>.module.json`
 *   glob `serialization/*.json` (mockingbird dev default) -> `serialization/mb-<tenant>.json`
 *
 * Disk layout (items.path inside the module):
 *   - Tenant items rooted at items/mockingbird/tenant-<tenant>/
 *   - Site items rooted at items/mockingbird/tenant-<tenant>/site-<site>/
 *
 * The tenant module's `content` include uses the default ItemAndDescendants
 * scope so anything created underneath the tenant root (including sites
 * scaffolded later) lives in the tenant's serialization tree without needing
 * additional includes. The per-site module file is intentional redundancy
 * for cleaner per-site push/pull operations.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { ModuleConfig } from '../types.js';

/**
 * Derive (a) the static directory the emitted module file should live in
 * and (b) the filename suffix the consumer's loader is looking for, by
 * parsing the first `modules` glob in sitecore.json.
 *
 * Algorithm: walk path segments until the first one with a wildcard.
 * Everything before that is the static directory. The last segment's
 * substring after the final `*` is the filename suffix (e.g.
 * `*.module.json` -> ".module.json", `*.json` -> ".json").
 *
 * Falls back to `serialization/<name>.module.json` if sitecore.json is
 * unreadable or the first glob doesn't conform to the simple shape we
 * understand.
 */
function deriveEmitTarget(rootDir: string, baseName: string): string {
  let glob = 'serialization/*.module.json';
  try {
    const raw = readFileSync(resolve(rootDir, 'sitecore.json'), 'utf-8');
    const config = JSON.parse(raw);
    const first = Array.isArray(config?.modules) ? config.modules[0] : undefined;
    if (typeof first === 'string' && first.trim().length > 0) {
      glob = first;
    }
  } catch {
    // fall through to default
  }

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

export function buildTenantModuleConfig(
  rootDir: string,
  tenantName: string,
): ProposedModuleConfig {
  const absoluteFilePath = deriveEmitTarget(rootDir, `mb-${tenantName}`);
  const itemsPath = `items/mockingbird/tenant-${tenantName}`;
  // 8 SingleItem includes covering every item the tenant scaffold creates.
  // Verified against a real Sitecore CM (2026-05-10, second pass): the
  // tenant scaffold creates per-tenant subfolders under all four
  // cross-cutting Project roots (Templates, Renderings, PlaceholderSettings,
  // Branches, Settings) plus media library + shared subfolder. The
  // BranchesFolder + SettingsFolder field values on the tenant root get
  // overwritten to per-site paths by site scaffolding, but the per-tenant
  // subfolders themselves persist - hence they live in the tenant module.
  return {
    absoluteFilePath,
    contents: {
      namespace: `Mockingbird.Tenant.${tenantName}`,
      items: {
        path: itemsPath,
        includes: [
          { name: 'content', path: `/sitecore/content/${tenantName}`, database: 'master', scope: 'SingleItem' },
          { name: 'templates', path: `/sitecore/templates/Project/${tenantName}`, database: 'master', scope: 'SingleItem' },
          { name: 'renderings', path: `/sitecore/layout/Renderings/Project/${tenantName}`, database: 'master', scope: 'SingleItem' },
          { name: 'placeholders', path: `/sitecore/layout/Placeholder Settings/Project/${tenantName}`, database: 'master', scope: 'SingleItem' },
          { name: 'branches', path: `/sitecore/templates/Branches/Project/${tenantName}`, database: 'master', scope: 'SingleItem' },
          { name: 'settings', path: `/sitecore/system/Settings/Project/${tenantName}`, database: 'master', scope: 'SingleItem' },
          { name: 'media', path: `/sitecore/media library/Project/${tenantName}`, database: 'master', scope: 'SingleItem' },
          { name: 'media-shared', path: `/sitecore/media library/Project/${tenantName}/shared`, database: 'master', scope: 'SingleItem' },
        ],
      },
    },
  };
}

export function buildSiteModuleConfig(
  rootDir: string,
  tenantName: string,
  siteName: string,
): ProposedModuleConfig {
  const absoluteFilePath = deriveEmitTarget(rootDir, `mb-${tenantName}-${siteName}`);
  const itemsPath = `items/mockingbird/tenant-${tenantName}/site-${siteName}`;
  return {
    absoluteFilePath,
    contents: {
      namespace: `Mockingbird.Tenant.${tenantName}.Site.${siteName}`,
      items: {
        path: itemsPath,
        includes: [
          { name: 'site', path: `/sitecore/content/${tenantName}/${siteName}`, database: 'master' },
        ],
      },
    },
  };
}

/**
 * Serialize a proposed module config to the JSON string the file should
 * contain. Indentation matches what the existing user-authored module
 * files in this workspace use (3 spaces, trailing newline).
 */
export function serializeModuleConfig(proposed: ProposedModuleConfig): string {
  return JSON.stringify(proposed.contents, null, 3) + '\n';
}
