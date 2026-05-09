/**
 * scaffoldHeadlessTenant - TypeScript port of Add-JSSTenant.ps1.
 *
 * Mirrors the 20-step sequence documented in
 * docs/superpowers/specs/2026-05-08-sxa-headless-scaffolding-design.md
 * (section "Add-JSSTenant - the canonical sequence"). Notable substitutions
 * vs. the SPE script:
 *   - Sitecore standard `__Display name` / `__Long description` fields
 *     used in place of `Metadata+_Name` / `Metadata+_Description`
 *     (decision #4 in the spec - the upstream type expression doesn`t
 *     resolve in SXA 10.4 decompile and the assignment is defensive in
 *     PS via Fields.Contains() check).
 *   - ExecuteScript actions log a warning and proceed (decision #2).
 *   - Curated definition items are recognized by id prefix
 *     `curated-` and have actions inlined; their EditTenantTemplate
 *     `<tenant-page-template>` sentinel resolves to the tenant`s Page
 *     template at dispatch time.
 */
import type { Engine } from '../index.js';
import { insertBranch } from '../insert-branch.js';
import { insertItem } from '../insert-item.js';
import { applyFieldUpdates } from './field-updates.js';
import { dispatchAction, defaultPorts, type ActionContext } from './actions.js';
import { synthesizeRegistryAsScs } from './synthesize.js';
import {
  discoverTenantDefinitions,
  hydrateDefinitionActions,
} from './definition-items.js';
import {
  ScaffoldError,
  type ScaffoldHeadlessTenantInput,
  type ScaffoldResult,
  type DefinitionItem,
  type ScaffoldingAction,
} from './types.js';

// SXA Headless template/branch GUIDs (lowercase, dashed). See spec table.
const TENANT_BRANCH_ID = '2d3805b9-3089-44f3-b952-d45c44add7f8';
const HEADLESS_SITE_SETUP_ROOT_ID = 'bed31d6f-d968-45a9-b54e-12d7f977d861';

// Project root item GUIDs (cited from Add-JSSTenant.ps1 lines 50-55).
const PROJECT_TEMPLATES = '825b30b4-b40b-422e-9920-23a1b6bda89c';
const PROJECT_MEDIA = '90ae357f-6171-4ea9-808c-5600b678f726';
const PROJECT_PLACEHOLDER_SETTINGS = 'f5f0fbe3-61ad-4967-a5d8-8d760331d6a1';
const PROJECT_RENDERINGS = '1995806f-0a84-42b5-93b0-88f0e2ff872c';
const PROJECT_SETTINGS = '0af56f64-b5d7-473f-9497-1dc19265e494';
const PROJECT_BRANCHES = 'a1f6469d-16e1-4a5f-9e49-1aad869a5d11';

// _BaseTenant + Tenant template field GUIDs (from Sitecore.XA.Foundation.Multisite Templates.cs).
const FIELD_TENANT_TEMPLATES = '9c596379-f8d4-45d1-a064-cdf1ede2e7c7';
const FIELD_TENANT_MEDIA_LIBRARY = 'e90a4413-c111-4951-9b6a-00c4ce7fb289';
const FIELD_TENANT_SHARED_MEDIA_LIBRARY = '800dc4ed-0846-45ba-b112-19902af240f6';
// JSSTenant adds these folder-reference fields (extends _BaseTenant).
const FIELD_PLACEHOLDER_SETTINGS_FOLDER = 'f55c08e7-ad14-4d8a-9d6f-89eb6f2c6d3b'; // approximate; verify in real registry
const FIELD_RENDERINGS_FOLDER = '1d9c08c1-29bb-4f9d-9eb6-c6cce3ad53f5';            // approximate
const FIELD_BRANCHES_FOLDER = 'b9a2bff3-6f7c-4632-9b25-5f96d36b9e8c';              // approximate
const FIELD_SETTINGS_FOLDER = '00fa3aaf-fd2c-4f8e-9628-90fed3c4e6eb';              // approximate
const FIELD_MODULES = '1230d2cb-4948-4d43-8a3b-b39978f6f1b3';
// Sitecore standard fields (substituted per spec decision #4).
const FIELD_DISPLAY_NAME = 'b5e02ad9-d56f-4c41-a065-a133db87bdeb';
const FIELD_DESCRIPTION = '9541e67d-ce8c-4225-803d-33f7f29f09ef';

// Folder template paths from Add-JSSTenant.ps1 lines 94-97.
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

async function resolveDefinitionActions(
  engine: Engine,
  definition: DefinitionItem,
  warnings: string[],
  tenantPageTemplateId: string | undefined,
): Promise<ScaffoldingAction[]> {
  const actions = definition.source === 'curated'
    ? definition.actions
    : hydrateDefinitionActions(engine, definition, warnings);

  // Resolve the curated `<tenant-page-template>` sentinel to the actual
  // tenant Page template (if known). If unknown, drop the action with a
  // warning - the v1 curated def`s only such action is the JSSPage
  // base-template wiring, which only matters once the tenant has a Page
  // template to receive it.
  return actions.map(a => {
    if (a.kind === 'EditTenantTemplate' && a.targetTemplateId === '<tenant-page-template>') {
      if (!tenantPageTemplateId) {
        warnings.push(
          'Curated EditTenantTemplate skipped - no tenant Page template found yet (curated definitions assume the tenant has been bootstrapped)',
        );
        return null;
      }
      return { ...a, targetTemplateId: tenantPageTemplateId };
    }
    return a;
  }).filter((a): a is ScaffoldingAction => a !== null);
}

export async function scaffoldHeadlessTenant(
  engine: Engine,
  input: ScaffoldHeadlessTenantInput,
): Promise<ScaffoldResult> {
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
  const parent = engine.getItemByPath(input.tenantLocation);
  if (!parent) {
    throw new ScaffoldError('parent-not-found', `Parent not found: ${input.tenantLocation}`);
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
  createdPaths.push(tenantNode.item.path);
  for (const created of tenantInsertResult.createdItems) {
    if (created.item.path !== tenantNode.item.path) createdPaths.push(created.item.path);
  }

  // Step 4: set tenant display name + description (spec decision #4: substituted standard fields).
  await applyFieldUpdates(engine, [
    { itemId: tenantId, fieldId: FIELD_DISPLAY_NAME, value: displayName },
    { itemId: tenantId, fieldId: FIELD_DESCRIPTION, value: description },
  ]);

  // Step 5: create cross-cutting folders (Add-JSSTenant lines 94-97).
  const projectFolderTemplateId = lookupTemplateIdByPath(engine, PROJECT_FOLDER_TEMPLATE_PATH);
  const folderTemplateIds: Record<string, string | undefined> = {
    PlaceholderSettings: lookupTemplateIdByPath(engine, FOLDER_TEMPLATE_PATHS.PlaceholderSettings) ?? projectFolderTemplateId,
    Renderings: lookupTemplateIdByPath(engine, FOLDER_TEMPLATE_PATHS.Renderings) ?? projectFolderTemplateId,
    Branches: lookupTemplateIdByPath(engine, FOLDER_TEMPLATE_PATHS.Branches) ?? projectFolderTemplateId,
    Settings: lookupTemplateIdByPath(engine, FOLDER_TEMPLATE_PATHS.Settings) ?? projectFolderTemplateId,
  };

  const tenantTail = `/${input.tenantName}`;
  const projectRoots: Record<string, string> = {
    PlaceholderSettings: '/sitecore/layout/Placeholder Settings/Project',
    Renderings: '/sitecore/layout/Renderings/Project',
    Branches: '/sitecore/templates/Branches/Project',
    Settings: '/sitecore/system/Settings/Project',
  };

  const folderItemIds: Record<string, string | undefined> = {};
  for (const [key, rootPath] of Object.entries(projectRoots)) {
    const root = engine.getItemByPath(rootPath) ?? null;
    const tplId = folderTemplateIds[key];
    if (!root || !tplId) {
      warnings.push(`Cross-cutting folder skipped (${key}): missing root ${rootPath} or template`);
      continue;
    }
    const created = await insertItem(engine, {
      parentId: root.item.id,
      templateId: tplId,
      name: input.tenantName,
    });
    folderItemIds[key] = created.rootItemId;
    const path = `${rootPath}${tenantTail}`;
    createdPaths.push(path);
  }

  // Templates root (under /sitecore/templates/Project).
  const projectTemplatesRoot = engine.getItemByPath('/sitecore/templates/Project');
  let templatesRootId: string | undefined;
  if (projectTemplatesRoot && projectFolderTemplateId) {
    const created = await insertItem(engine, {
      parentId: projectTemplatesRoot.item.id,
      templateId: projectFolderTemplateId,
      name: input.tenantName,
    });
    templatesRootId = created.rootItemId;
    createdPaths.push(`/sitecore/templates/Project${tenantTail}`);
  } else {
    warnings.push('Templates root skipped: /sitecore/templates/Project missing or Project Folder template missing');
  }

  // Media library folders (mirror Add-TenantMediaLibrary).
  const projectMediaRoot = engine.getItemByPath('/sitecore/media library/Project');
  const mediaFolderTplId = lookupTemplateIdByPath(engine, MEDIA_FOLDER_TEMPLATE_PATH);
  let mediaLibraryId: string | undefined;
  let sharedMediaId: string | undefined;
  if (projectMediaRoot && mediaFolderTplId) {
    const ml = await insertItem(engine, {
      parentId: projectMediaRoot.item.id,
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

  // Step 7: HeadlessSiteSetupRoot inside settings folder.
  if (folderItemIds.Settings) {
    const setupTemplateId = HEADLESS_SITE_SETUP_ROOT_ID;
    const setupRootInRegistry = engine.getRegistryItem(setupTemplateId);
    if (setupRootInRegistry) {
      const created = await insertItem(engine, {
        parentId: folderItemIds.Settings,
        templateId: setupTemplateId,
        name: input.tenantName,
      });
      createdPaths.push(`/sitecore/system/Settings/Project${tenantTail}/${input.tenantName}`);
      void created;
    } else {
      warnings.push(`HeadlessSiteSetupRoot template ${setupTemplateId} not in registry; skipped`);
    }
  }

  // Step 8: tenant structural fields.
  const structuralUpdates = [];
  if (templatesRootId) structuralUpdates.push({ itemId: tenantId, fieldId: FIELD_TENANT_TEMPLATES, value: templatesRootId });
  if (mediaLibraryId) structuralUpdates.push({ itemId: tenantId, fieldId: FIELD_TENANT_MEDIA_LIBRARY, value: mediaLibraryId });
  if (sharedMediaId) structuralUpdates.push({ itemId: tenantId, fieldId: FIELD_TENANT_SHARED_MEDIA_LIBRARY, value: sharedMediaId });
  if (folderItemIds.PlaceholderSettings) structuralUpdates.push({ itemId: tenantId, fieldId: FIELD_PLACEHOLDER_SETTINGS_FOLDER, value: folderItemIds.PlaceholderSettings });
  if (folderItemIds.Renderings) structuralUpdates.push({ itemId: tenantId, fieldId: FIELD_RENDERINGS_FOLDER, value: folderItemIds.Renderings });
  if (folderItemIds.Branches) structuralUpdates.push({ itemId: tenantId, fieldId: FIELD_BRANCHES_FOLDER, value: folderItemIds.Branches });
  if (folderItemIds.Settings) structuralUpdates.push({ itemId: tenantId, fieldId: FIELD_SETTINGS_FOLDER, value: folderItemIds.Settings });
  if (structuralUpdates.length > 0) await applyFieldUpdates(engine, structuralUpdates);

  // Step 9: dispatch all selected actions.
  // Find the tenant`s Page template (if any) to resolve curated sentinel references.
  let tenantPageTemplateId: string | undefined;
  if (templatesRootId) {
    const templatesRoot = engine.getItemById(templatesRootId);
    const pageTemplate = templatesRoot
      ? Array.from(templatesRoot.children.values()).find(c => c.item.path.endsWith('/Page') || c.item.path.endsWith('/Base Page'))
      : undefined;
    tenantPageTemplateId = pageTemplate?.item.id;
  }

  const ctx: ActionContext = {
    ports: defaultPorts,
    engine,
    contextItemId: tenantId,
    contextItemPath: tenantNode.item.path,
    tenantTemplates: templatesRootId
      ? Array.from(engine.getItemById(templatesRootId)?.children.values() ?? []).map(c => c.item.id)
      : [],
    language,
    warnings,
    updateTemplate: false,
  };

  // Pass 1: EditTenantTemplate actions.
  for (const def of selectedRaw) {
    const actions = await resolveDefinitionActions(engine, def, warnings, tenantPageTemplateId);
    for (const a of actions) {
      if (a.kind === 'EditTenantTemplate') await dispatchAction(a, ctx);
    }
  }
  // Pass 2: AddItem actions.
  ctx.updateTemplate = true;
  for (const def of selectedRaw) {
    const actions = await resolveDefinitionActions(engine, def, warnings, tenantPageTemplateId);
    for (const a of actions) {
      if (a.kind === 'AddItem') await dispatchAction(a, ctx);
    }
  }
  ctx.updateTemplate = false;
  // Pass 3: ExecuteScript actions (skipped + warned).
  for (const def of selectedRaw) {
    const actions = await resolveDefinitionActions(engine, def, warnings, tenantPageTemplateId);
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
  };
}
