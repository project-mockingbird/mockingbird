/**
 * scaffoldHeadlessTenant - TypeScript port of Add-JSSTenant.ps1.
 *
 * Mirrors the canonical Add-JSSTenant sequence: branch instantiation,
 * cross-cutting folder creation under the six Project roots, media
 * library setup, HeadlessSiteSetupRoot under Settings, structural
 * field writes, then per-DefinitionItem action dispatch in three
 * passes (EditTenantTemplate -> AddItem -> ExecuteScript).
 *
 * SXA Multisite Metadata fields (_Name, _Description) are written
 * alongside the standard `__Display name` / `__Long description` so
 * downstream JSS code paths (Get-SiteMediaItem, etc.) see what real
 * Sitecore writes. ExecuteScript actions are logged and skipped.
 */
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type { Engine } from '../index.js';
import { insertBranch, resolveInsertParent, resolveInsertParentById, type InsertBranchParent } from '../insert-branch.js';
import { insertItem, insertItemAtParent } from '../insert-item.js';
import { applyTenantTemplates } from './tenant-templates.js';
import { applyFieldUpdates } from './field-updates.js';
import { dispatchAction, defaultPorts, type ActionContext } from './actions.js';
import { synthesizeRegistryAsScs } from './synthesize.js';
import {
  discoverTenantDefinitions,
  hydrateDefinitionActions,
} from './definition-items.js';
import { buildTenantModuleConfig, serializeModuleConfig } from './module-config-builder.js';
import {
  ScaffoldError,
  type ScaffoldHeadlessTenantInput,
  type ScaffoldResult,
  type ScaffoldDryRunResult,
  type CoverageGap,
  type DefinitionItem,
} from './types.js';

// SXA Headless template/branch GUIDs (lowercase, dashed). See spec table.
const TENANT_BRANCH_ID = '2d3805b9-3089-44f3-b952-d45c44add7f8';

// SPE-canonical Project root ids (Add-JSSTenant.ps1 lines 50-55). Looked up
// by id, not by path, because mockingbird's path index is db-blind and
// `/sitecore/templates/Project` exists in BOTH master (canonical `825b30b4`,
// Template Folder) AND core (anomaly `fdcc1875`, plain Folder) - so a
// path-based lookup can land on the wrong twin. SPE itself uses
// `Get-ItemByIdSafe "{<id>}"` for the same reason. All five ids are
// master-db items.
const PROJECT_ROOT_IDS = {
  Templates: '825b30b4-b40b-422e-9920-23a1b6bda89c',
  Media: '90ae357f-6171-4ea9-808c-5600b678f726',
  PlaceholderSettings: 'f5f0fbe3-61ad-4967-a5d8-8d760331d6a1',
  Renderings: '1995806f-0a84-42b5-93b0-88f0e2ff872c',
  Settings: '0af56f64-b5d7-473f-9497-1dc19265e494',
  // Branches: /sitecore/templates/Branches/Project is currently absent
  // from the OOTB registry entirely; resolution falls back to path-based
  // (which also misses). Tracked as a separate registry-gap follow-up.
};
const PROJECT_BRANCHES_PATH = '/sitecore/templates/Branches/Project';

// _Base Tenant fields (Foundation/Experience Accelerator/Multisite/Base/_Base Tenant).
const FIELD_TENANT_TEMPLATES = '9c596379-f8d4-45d1-a064-cdf1ede2e7c7';
const FIELD_TENANT_MEDIA_LIBRARY = 'e90a4413-c111-4951-9b6a-00c4ce7fb289';
const FIELD_TENANT_SHARED_MEDIA_LIBRARY = '800dc4ed-0846-45ba-b112-19902af240f6';
// _Base JSS Tenant folder fields (verified via inspect-tenant-folder-fields.mjs).
// All four are set on the tenant root when scaffolding: SettingsFolder +
// BranchesFolder point to per-tenant subfolders here, and site scaffolding
// later OVERWRITES those two field values to per-site paths under
// /sitecore/content/<tenant>/<site>/. PlaceholderSettings + Renderings are
// not overwritten - they stay per-tenant.
const FIELD_PLACEHOLDER_SETTINGS_FOLDER = '102b58da-2a86-4953-b3cd-c9f91256b657';
const FIELD_RENDERINGS_FOLDER = '853b245f-53e4-4ebe-bab5-299f9de314b6';
const FIELD_BRANCHES_FOLDER = 'c5dbb136-3299-4835-a8ce-bca8b49ba3fa';
const FIELD_SETTINGS_FOLDER = 'b6953f8b-56d3-4c90-a6db-885786711e4a';
const FIELD_MODULES = '1230d2cb-4948-4d43-8a3b-b39978f6f1b3';
// Sitecore standard fields.
const FIELD_DISPLAY_NAME = 'b5e02ad9-d56f-4c41-a065-a133db87bdeb';
const FIELD_DESCRIPTION = '9541e67d-ce8c-4225-803d-33f7f29f09ef';
// SXA Multisite Metadata fields (written alongside the standard ones so
// JSS code paths that read these specifically see what real Sitecore writes).
const FIELD_META_NAME = '85a7501a-86d9-4243-9075-0b727c3a6db4';
const FIELD_META_DESCRIPTION = '89cecf4f-e545-44f2-813d-272c08661d14';

// Folder template paths from Add-JSSTenant.ps1 lines 94-97. All four
// are used by the per-tenant cross-cutting folder creates in Step 5.
const FOLDER_TEMPLATE_PATHS = {
  PlaceholderSettings: '/sitecore/templates/Foundation/JSS Experience Accelerator/Multisite/Folders/Placeholder Settings Folder',
  Renderings: '/sitecore/templates/Foundation/JSS Experience Accelerator/Multisite/Folders/Rendering Folder',
  Branches: '/sitecore/templates/Foundation/JSS Experience Accelerator/Multisite/Folders/Branches Folder',
  Settings: '/sitecore/templates/Foundation/JSS Experience Accelerator/Multisite/Folders/Settings Folder',
};
const PROJECT_FOLDER_TEMPLATE_PATH = '/sitecore/templates/Foundation/Experience Accelerator/Multisite/Project Folder';
const MEDIA_FOLDER_TEMPLATE_PATH = '/sitecore/templates/System/Media/Media folder';

function lookupTemplateIdByPath(engine: Engine, path: string): string | undefined {
  const tree = engine.getItemByPath(path);
  if (tree) return tree.item.id;
  const reg = engine.getRegistryItemByPath(path);
  return reg?.id;
}

/**
 * Sitecore paths a fresh tenant scaffold writes to. Used by the
 * coverage-gap probe; the matching emitted module config has one
 * SingleItem include per path so SCS push/pull semantics match what
 * the orchestrator actually creates.
 *
 * Verified against a real Sitecore CM (2026-05-10, second pass):
 *   - Tenant root + Templates + PlaceholderSettings + Renderings + Media
 *     are populated under their Project roots.
 *   - Per-tenant Branches + Settings subfolders are ALSO created under
 *     /sitecore/templates/Branches/Project and /sitecore/system/Settings/Project.
 *     The tenant.BranchesFolder + tenant.SettingsFolder fields are set to
 *     those folders' IDs by tenant scaffolding. Site scaffolding LATER
 *     overwrites those two field values to per-site paths under
 *     /sitecore/content/<tenant>/<site>/, but the per-tenant subfolders
 *     themselves are not removed.
 *   - SharedMediaLibrary is the "shared" subfolder under the tenant's
 *     media library.
 *   - HeadlessSiteSetupRoot under /sitecore/system/Settings/Project/<tenant>/
 *     is NOT created (the SPE script's call uses an undefined variable,
 *     producing a trailing-space Name, which silently fails).
 */
function tenantTargetPaths(tenantName: string): Array<{ path: string; label: string }> {
  return [
    { path: `/sitecore/content/${tenantName}`, label: 'Tenant root' },
    { path: `/sitecore/templates/Project/${tenantName}`, label: 'Templates folder' },
    { path: `/sitecore/layout/Renderings/Project/${tenantName}`, label: 'Renderings folder' },
    { path: `/sitecore/layout/Placeholder Settings/Project/${tenantName}`, label: 'Placeholder Settings folder' },
    { path: `/sitecore/templates/Branches/Project/${tenantName}`, label: 'Branches folder' },
    { path: `/sitecore/system/Settings/Project/${tenantName}`, label: 'Settings folder' },
    { path: `/sitecore/media library/Project/${tenantName}`, label: 'Media library folder' },
    { path: `/sitecore/media library/Project/${tenantName}/shared`, label: 'Shared media subfolder' },
  ];
}

export async function scaffoldHeadlessTenant(
  engine: Engine,
  input: ScaffoldHeadlessTenantInput,
): Promise<ScaffoldResult | ScaffoldDryRunResult> {
  const warnings: string[] = [];
  const createdPaths: string[] = [];
  const language = input.language ?? 'en';
  const displayName = input.displayName ?? input.tenantName;
  const description = input.description ?? '';

  // Step 1: validate parent + name (spec lines 35-47 in Add-JSSTenant).
  if (input.tenantLocation !== '/sitecore/content') {
    throw new ScaffoldError(
      'parent-template-mismatch',
      `Tenants must be created under /sitecore/content (got ${input.tenantLocation})`,
    );
  }
  const expectedPath = `${input.tenantLocation}/${input.tenantName}`;
  if (engine.getItemByPath(expectedPath)) {
    throw new ScaffoldError('name-collision', `Item already exists: ${expectedPath}`);
  }
  // Parent may be tree-resident (an existing serialized item) or
  // registry-only (e.g. /sitecore/content on a fresh install where
  // nothing has been authored under it yet). resolveInsertParent
  // handles both cases. Validated BEFORE the coverage probe so a missing
  // parent fails fast instead of returning a misleading dry-run preview.
  const parent: InsertBranchParent | undefined = resolveInsertParent(engine, input.tenantLocation);
  if (!parent) {
    throw new ScaffoldError('parent-not-found', `Parent not found: ${input.tenantLocation}`);
  }

  // Step 1a: include-coverage probe BEFORE any writes. Each cross-cutting
  // root we'd write to needs to be covered by a serialization include;
  // otherwise resolveFilePath silently ghost-writes under workspace root.
  const targets = tenantTargetPaths(input.tenantName);
  const coverageGaps: CoverageGap[] = targets
    .filter(t => !engine.findCoveringInclude(t.path))
    .map(t => ({ path: t.path, label: t.label }));

  let emittedModuleConfigPath: string | undefined;
  if (coverageGaps.length > 0) {
    const proposed = buildTenantModuleConfig(engine.getRootDir(), input.tenantName);
    if (input.dryRun) {
      return {
        dryRun: true,
        proposedPaths: targets.map(t => t.path),
        coverageGaps,
        proposedModuleConfig: {
          filePath: proposed.absoluteFilePath,
          contents: proposed.contents,
        },
      };
    }
    if (!input.acceptModuleConfig) {
      throw new ScaffoldError(
        'include-coverage-missing',
        `Scaffold blocked: ${coverageGaps.length} target paths have no covering serialization include. ` +
        `Set acceptModuleConfig=true to authorize writing ${proposed.absoluteFilePath}, ` +
        `or add includes manually. Missing: ${coverageGaps.map(g => g.path).join(', ')}`,
      );
    }
    // Authorized: write the module config first, then reload modules so
    // resolveFilePath sees the new includes BEFORE we start scaffolding.
    await mkdir(dirname(proposed.absoluteFilePath), { recursive: true });
    await writeFile(proposed.absoluteFilePath, serializeModuleConfig(proposed), 'utf-8');
    await engine.reloadModules();
    emittedModuleConfigPath = proposed.absoluteFilePath;
    // Sanity check: verify gaps are now closed. If they're not, the
    // module config we wrote is wrong - fail fast rather than ghost-write.
    const stillUncovered = targets.filter(t => !engine.findCoveringInclude(t.path));
    if (stillUncovered.length > 0) {
      throw new ScaffoldError(
        'include-coverage-missing',
        `Scaffold aborted: emitted ${proposed.absoluteFilePath} but ${stillUncovered.length} target paths are still uncovered: ${stillUncovered.map(t => t.path).join(', ')}`,
      );
    }
  } else if (input.dryRun) {
    return {
      dryRun: true,
      proposedPaths: targets.map(t => t.path),
      coverageGaps: [],
    };
  }

  // Step 2: load definition items.
  const allDefinitions = await discoverTenantDefinitions(engine);
  const selectedRaw: DefinitionItem[] = [];
  for (const id of input.definitionItemIds) {
    const def = allDefinitions.find(d => d.id === id);
    if (!def) {
      throw new ScaffoldError('definition-item-not-found', `Definition item not found: ${id}`);
    }
    selectedRaw.push(def);
  }

  // Step 3: instantiate tenant from registry-resident branch.
  const tenantBranchReg = engine.getRegistryItem(TENANT_BRANCH_ID);
  if (!tenantBranchReg) {
    throw new ScaffoldError(
      'branch-prototype-not-found',
      `Tenant branch prototype not in registry: ${TENANT_BRANCH_ID}. Mockingbird OOTB registry must contain SXA Headless templates for tenant scaffolding to work.`,
    );
  }
  const tenantBranchScs = synthesizeRegistryAsScs(tenantBranchReg);
  const tenantInsertResult = await insertBranch(engine, parent, tenantBranchScs, input.tenantName);
  const tenantId = tenantInsertResult.rootItemId;
  const tenantNode = engine.getItemById(tenantId);
  if (!tenantNode) {
    throw new ScaffoldError('parent-not-found', `Tenant item missing after insert: ${tenantId}`);
  }
  createdPaths.push(...tenantInsertResult.createdItems.map(c => c.item.path));

  // Step 4: set tenant display name + description on both the standard
  // Sitecore fields AND the SXA Multisite Metadata fields.
  await applyFieldUpdates(engine, [
    { itemId: tenantId, fieldId: FIELD_DISPLAY_NAME, value: displayName },
    { itemId: tenantId, fieldId: FIELD_DESCRIPTION, value: description },
    { itemId: tenantId, fieldId: FIELD_META_NAME, value: displayName },
    { itemId: tenantId, fieldId: FIELD_META_DESCRIPTION, value: description },
  ]);

  // Step 5: create cross-cutting folders. Verified against a real Sitecore CM
  // (2026-05-10, second pass): the tenant scaffold creates per-tenant subfolders
  // under all four cross-cutting Project roots - PlaceholderSettings, Renderings,
  // Branches, Settings - plus the media library. The SPE script's Add-JSSTenantFolder
  // helper computes path = $Parent.Paths.Path + $Tenant.Tail and creates a folder
  // there with the named JSS Multisite folder template. The tenant.*Folder fields
  // are then assigned the created folder IDs (see Step 8).
  const projectFolderTemplateId = lookupTemplateIdByPath(engine, PROJECT_FOLDER_TEMPLATE_PATH);
  const folderTemplateIds: Record<string, string | undefined> = {
    PlaceholderSettings: lookupTemplateIdByPath(engine, FOLDER_TEMPLATE_PATHS.PlaceholderSettings) ?? projectFolderTemplateId,
    Renderings: lookupTemplateIdByPath(engine, FOLDER_TEMPLATE_PATHS.Renderings) ?? projectFolderTemplateId,
    Branches: lookupTemplateIdByPath(engine, FOLDER_TEMPLATE_PATHS.Branches) ?? projectFolderTemplateId,
    Settings: lookupTemplateIdByPath(engine, FOLDER_TEMPLATE_PATHS.Settings) ?? projectFolderTemplateId,
  };

  const tenantTail = `/${input.tenantName}`;
  // Resolve cross-cutting Project roots by SPE-canonical (master-db) id
  // rather than by path. mockingbird's path index is db-blind and at least
  // /sitecore/templates/Project has master + core twins - path resolution
  // can land on the wrong one. Branches/Project has no canonical id in the
  // OOTB registry today, so it stays path-based and skip-with-warning'd.
  const folderRoots: Record<string, InsertBranchParent | undefined> = {
    PlaceholderSettings: resolveInsertParentById(engine, PROJECT_ROOT_IDS.PlaceholderSettings),
    Renderings: resolveInsertParentById(engine, PROJECT_ROOT_IDS.Renderings),
    Settings: resolveInsertParentById(engine, PROJECT_ROOT_IDS.Settings),
    Branches: resolveInsertParent(engine, PROJECT_BRANCHES_PATH),
  };

  const folderItemIds: Record<string, string | undefined> = {};
  for (const [key, root] of Object.entries(folderRoots)) {
    const tplId = folderTemplateIds[key];
    if (!root || !tplId) {
      warnings.push(`Cross-cutting folder skipped (${key}): missing root or template`);
      continue;
    }
    const created = await insertItemAtParent(engine, root, {
      templateId: tplId,
      name: input.tenantName,
    });
    folderItemIds[key] = created.rootItemId;
    createdPaths.push(`${root.item.path}${tenantTail}`);
  }

  // Templates root (under master /sitecore/templates/Project).
  const projectTemplatesRoot = resolveInsertParentById(engine, PROJECT_ROOT_IDS.Templates);
  let templatesRootId: string | undefined;
  if (projectTemplatesRoot && projectFolderTemplateId) {
    const created = await insertItemAtParent(engine, projectTemplatesRoot, {
      templateId: projectFolderTemplateId,
      name: input.tenantName,
    });
    templatesRootId = created.rootItemId;
    createdPaths.push(`/sitecore/templates/Project${tenantTail}`);
  } else {
    warnings.push('Templates root skipped: master /sitecore/templates/Project missing or Project Folder template missing');
  }

  // Step 6.5: create per-tenant Template ITEMS under the tenant templates
  // root. Without this step, /sitecore/templates/Project/<tenant>/ stays
  // empty and every EditTenantTemplate action warn-and-skips. Mirrors SPE's
  // Add-TenantTemplate (Get-SourceTemplate + New-TenantTemplate fanout).
  let preCreatedTenantTemplateIds: string[] = [];
  if (templatesRootId) {
    const tenantTemplatesRoot = resolveInsertParentById(engine, templatesRootId);
    if (tenantTemplatesRoot) {
      const result = await applyTenantTemplates(engine, tenantTemplatesRoot, selectedRaw);
      preCreatedTenantTemplateIds = result.tenantTemplateIds;
      warnings.push(...result.warnings);
    } else {
      warnings.push('applyTenantTemplates skipped: tenant templates root could not be re-resolved as InsertBranchParent');
    }
  }

  // Media library folders (mirror Add-TenantMediaLibrary, master db).
  const projectMediaRoot = resolveInsertParentById(engine, PROJECT_ROOT_IDS.Media);
  const mediaFolderTplId = lookupTemplateIdByPath(engine, MEDIA_FOLDER_TEMPLATE_PATH);
  let mediaLibraryId: string | undefined;
  let sharedMediaId: string | undefined;
  if (projectMediaRoot && mediaFolderTplId) {
    const ml = await insertItemAtParent(engine, projectMediaRoot, {
      templateId: mediaFolderTplId,
      name: input.tenantName,
    });
    mediaLibraryId = ml.rootItemId;
    createdPaths.push(`/sitecore/media library/Project${tenantTail}`);
    const shared = await insertItem(engine, {
      parentId: ml.rootItemId,
      templateId: mediaFolderTplId,
      name: 'shared',
    });
    sharedMediaId = shared.rootItemId;
    createdPaths.push(`/sitecore/media library/Project${tenantTail}/shared`);
  }

  // Step 7 (removed): HeadlessSiteSetupRoot under settings folder.
  // The Add-JSSTenant.ps1 SPE script appears to create this child via
  // `New-Item ... -Name "$TenantName $($templateItem.'DisplayName')"`,
  // but `$templateItem` is undefined in that scope. PowerShell expands it
  // to "$TenantName " (trailing space), Sitecore's name validator rejects
  // trailing whitespace, the New-Item call throws, and nothing actually
  // gets created. Verified empirically: real Sitecore CMs do NOT have a
  // HeadlessSiteSetupRoot under /sitecore/system/Settings/Project/<tenant>.
  // Mockingbird previously created one to "match Sitecore" - it was
  // matching the broken intent, not the actual outcome.

  // Step 8: tenant structural fields. SettingsFolder + BranchesFolder are
  // assigned to the per-tenant folder IDs created in Step 5; site scaffolding
  // overwrites them later to per-site paths under /sitecore/content/<tenant>/<site>/.
  const structuralUpdates = [];
  if (templatesRootId) structuralUpdates.push({ itemId: tenantId, fieldId: FIELD_TENANT_TEMPLATES, value: templatesRootId });
  if (mediaLibraryId) structuralUpdates.push({ itemId: tenantId, fieldId: FIELD_TENANT_MEDIA_LIBRARY, value: mediaLibraryId });
  if (sharedMediaId) structuralUpdates.push({ itemId: tenantId, fieldId: FIELD_TENANT_SHARED_MEDIA_LIBRARY, value: sharedMediaId });
  if (folderItemIds.PlaceholderSettings) structuralUpdates.push({ itemId: tenantId, fieldId: FIELD_PLACEHOLDER_SETTINGS_FOLDER, value: folderItemIds.PlaceholderSettings });
  if (folderItemIds.Renderings) structuralUpdates.push({ itemId: tenantId, fieldId: FIELD_RENDERINGS_FOLDER, value: folderItemIds.Renderings });
  if (folderItemIds.Branches) structuralUpdates.push({ itemId: tenantId, fieldId: FIELD_BRANCHES_FOLDER, value: folderItemIds.Branches });
  if (folderItemIds.Settings) structuralUpdates.push({ itemId: tenantId, fieldId: FIELD_SETTINGS_FOLDER, value: folderItemIds.Settings });
  if (structuralUpdates.length > 0) await applyFieldUpdates(engine, structuralUpdates);

  // Step 9: dispatch all selected actions in three passes.
  const ctx: ActionContext = {
    ports: defaultPorts,
    engine,
    contextItemId: tenantId,
    contextItemPath: tenantNode.item.path,
    tenantTemplates: (() => {
      const fromTree = templatesRootId
        ? Array.from(engine.getItemById(templatesRootId)?.children.values() ?? []).map(c => c.item.id)
        : [];
      const seen = new Set(fromTree.map(s => s.toLowerCase()));
      for (const id of preCreatedTenantTemplateIds) if (!seen.has(id.toLowerCase())) fromTree.push(id);
      return fromTree;
    })(),
    language,
    warnings,
    updateTemplate: false,
  };

  // Pass 1: EditTenantTemplate actions.
  for (const def of selectedRaw) {
    const actions = hydrateDefinitionActions(engine, def, warnings);
    for (const a of actions) {
      if (a.kind === 'EditTenantTemplate') await dispatchAction(a, ctx);
    }
  }
  // Pass 2: AddItem actions.
  ctx.updateTemplate = true;
  for (const def of selectedRaw) {
    const actions = hydrateDefinitionActions(engine, def, warnings);
    for (const a of actions) {
      if (a.kind === 'AddItem') await dispatchAction(a, ctx);
    }
  }
  ctx.updateTemplate = false;
  // Pass 3: ExecuteScript actions (skipped + warned).
  for (const def of selectedRaw) {
    const actions = hydrateDefinitionActions(engine, def, warnings);
    for (const a of actions) {
      if (a.kind === 'ExecuteScript') await dispatchAction(a, ctx);
    }
  }

  // Step 10: Modules field (Add-JSSTenant.ps1:135).
  await applyFieldUpdates(engine, [
    { itemId: tenantId, fieldId: FIELD_MODULES, value: selectedRaw.map(d => d.id).join('|') },
  ]);

  return {
    rootItemPath: tenantNode.item.path,
    rootItemId: tenantId,
    createdCount: createdPaths.length,
    createdPaths,
    warnings,
    emittedModuleConfigPath,
  };
}
