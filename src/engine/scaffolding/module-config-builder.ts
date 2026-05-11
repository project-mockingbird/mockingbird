/**
 * Builds proposed `*.module.json` configurations for newly-scaffolded
 * tenants and sites. Pure: returns the JSON shape + intended file path,
 * never touches the filesystem. Caller (the scaffold orchestrator + API
 * arm) decides when to actually write the file based on dryRun / accept
 * flags.
 *
 * Naming convention (per user direction):
 *   - Tenant module file:  serialization/mb-<tenant>.json
 *   - Site module file:    serialization/mb-<tenant>-<site>.json
 *
 * Disk layout:
 *   - Tenant items rooted at items/mockingbird/tenant-<tenant>/
 *   - Site items rooted at items/mockingbird/tenant-<tenant>/site-<site>/
 *
 * The tenant module's `content` include uses the default ItemAndDescendants
 * scope so anything created underneath the tenant root (including sites
 * scaffolded later) lives in the tenant's serialization tree without needing
 * additional includes. The per-site module file is intentional redundancy
 * for cleaner per-site push/pull operations.
 */
import { resolve } from 'path';
import type { ModuleConfig } from '../types.js';

const SERIALIZATION_DIR = 'serialization';

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
  const absoluteFilePath = resolve(rootDir, SERIALIZATION_DIR, `mb-${tenantName}.json`);
  const itemsPath = `items/mockingbird/tenant-${tenantName}`;
  // 6 SingleItem includes covering every item the tenant scaffold creates.
  // Verified against a real Sitecore CM (2026-05-10): tenant scaffold ONLY
  // creates the tenant root + per-tenant Templates / Renderings /
  // PlaceholderSettings / Media folders + a "shared" subfolder under media.
  // SettingsFolder + BranchesFolder are per-SITE in real Sitecore (under
  // /sitecore/content/<tenant>/<site>/), so they're populated by site
  // scaffolding and live in the per-site mb-<tenant>-<site>.json module.
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
  const absoluteFilePath = resolve(
    rootDir,
    SERIALIZATION_DIR,
    `mb-${tenantName}-${siteName}.json`,
  );
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
