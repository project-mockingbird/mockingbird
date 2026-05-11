/**
 * Set-TenantTemplate port - re-templates a freshly-instantiated site's
 * descendants against the per-tenant template set.
 *
 * Mirrors the SPE Set-TenantTemplate flow inside New-JSSSite. Site branch
 * instantiation produces items templated against the OOTB cross-tenant
 * prototypes (e.g. `Foundation/.../JSS Page`). This pass walks the site
 * subtree and swaps each descendant's template to the matching tenant
 * template - the one created by tenant scaffolding under
 * `/sitecore/templates/Project/<tenant>/`.
 *
 * Lookup mirrors SPE's Get-ProjectTemplateBasedOnBaseTemplate two-pass:
 *   1. Tenant template whose `__Base template` field DIRECTLY references
 *      the current item's template id.
 *   2. Fallback: tenant template whose full inheritance chain includes
 *      the current item's template id.
 * First match wins (SPE uses `Select-Object -First 1`).
 */
import type { Engine } from '../index.js';
import { walkSubtree } from '../walk-subtree.js';
import {
  getDirectBaseTemplateIds,
  templateInheritsFrom,
} from '../layout/template-walk.js';

export type SetTenantTemplateResult = {
  /** Item ids whose template was changed, in walk order. */
  reTemplated: string[];
  /** Non-fatal issues (e.g. lookup miss for a descendant). */
  warnings: string[];
};

export async function setTenantTemplate(
  engine: Engine,
  siteRootId: string,
  tenantTemplateIds: string[],
): Promise<SetTenantTemplateResult> {
  const result: SetTenantTemplateResult = { reTemplated: [], warnings: [] };
  if (tenantTemplateIds.length === 0) return result;

  const tenantSet = new Set(tenantTemplateIds.map(id => id.toLowerCase()));
  const subtree = walkSubtree(engine, siteRootId, { includeRoot: true });

  for (const item of subtree) {
    const currentTpl = item.template.toLowerCase();
    if (tenantSet.has(currentTpl)) continue;

    const match = findTenantTemplateForSource(engine, tenantTemplateIds, currentTpl);
    if (!match) {
      // Not every site descendant maps to a tenant template (e.g. system
      // folders templated against generic Folder template). Silent skip
      // matches SPE behavior - it only re-templates when a match exists.
      continue;
    }

    try {
      await engine.changeTemplate(item.id, match);
      result.reTemplated.push(item.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.warnings.push(`setTenantTemplate: skipped ${item.path} (${msg})`);
    }
  }

  return result;
}

function findTenantTemplateForSource(
  engine: Engine,
  tenantTemplates: string[],
  sourceTemplateId: string,
): string | undefined {
  const target = sourceTemplateId.toLowerCase();
  // Pass 1: direct __Base template membership (SPE's first filter).
  const direct = tenantTemplates.find(tplId =>
    getDirectBaseTemplateIds(engine, tplId).includes(target),
  );
  if (direct) return direct;
  // Pass 2: full inheritance walk (SPE's Test-BaseTemplate fallback).
  return tenantTemplates.find(tplId =>
    templateInheritsFrom(engine, tplId, target),
  );
}
