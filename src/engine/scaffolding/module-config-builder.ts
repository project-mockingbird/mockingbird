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
import type { Engine } from '../index.js';
import { deriveEmitTarget, type ProposedModuleConfig } from '../serialization/module-config-writer.js';
export { serializeModuleConfig } from '../serialization/module-config-writer.js';
export type { ProposedModuleConfig } from '../serialization/module-config-writer.js';

export function buildTenantModuleConfig(
  engine: Engine,
  tenantName: string,
): ProposedModuleConfig {
  const absoluteFilePath = deriveEmitTarget(engine, `mb-${tenantName}`);
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
  engine: Engine,
  tenantName: string,
  siteName: string,
): ProposedModuleConfig {
  const absoluteFilePath = deriveEmitTarget(engine, `mb-${tenantName}-${siteName}`);
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

