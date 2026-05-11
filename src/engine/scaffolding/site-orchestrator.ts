/**
 * scaffoldHeadlessSite - TypeScript port of New-JSSSite.ps1.
 *
 * Mirrors the 16-step sequence in
 * docs/superpowers/specs/2026-05-08-sxa-headless-scaffolding-design.md
 * (section "New-JSSSite - the canonical sequence"). Notable substitutions:
 *   - Sitecore standard `__Display name` / `__Long description` substituted
 *     for `Metadata+_Name` / `Metadata+_Description` (decision #4).
 *   - `$editingTheme` undefined-bug from the SPE script: do not pass
 *     through; theme actions are stubbed in v1 anyway.
 *   - ExecuteScript actions logged + skipped (decision #2).
 *   - Pre-sort via Get-SortedSetupItemsCollection: skipped in v1.
 */
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type { Engine } from '../index.js';
import { insertBranch, resolveInsertParent } from '../insert-branch.js';
import { applyFieldUpdates } from './field-updates.js';
import { dispatchAction, defaultPorts, type ActionContext } from './actions.js';
import { synthesizeRegistryAsScs } from './synthesize.js';
import { setTenantTemplate } from './set-tenant-template.js';
import {
  discoverSiteDefinitions,
  hydrateDefinitionActions,
} from './definition-items.js';
import { buildSiteModuleConfig, serializeModuleConfig } from './module-config-builder.js';
import {
  ScaffoldError,
  type ScaffoldHeadlessSiteInput,
  type ScaffoldResult,
  type ScaffoldDryRunResult,
  type CoverageGap,
  type DefinitionItem,
  type ScaffoldingAction,
} from './types.js';

const SITE_BRANCH_ID = '45cf9f42-b3ac-4412-aab9-f8441c7e448e';
const JSSSITE_DEFINITION_TEMPLATE_ID = 'e46f3af2-39fa-4866-a157-7017c4b2a40c';

// JSSSettings field GUIDs (Sitecore.XA.JSS.Foundation.Multisite.Templates+JSSSettings).
const F_LAYOUT_PATH = 'c8d002f9-9518-4c5e-9baa-6617e13f0797';
const F_RENDERINGS_PATH = 'f29428d5-1285-48b8-a884-44057965829a';
const F_PLACEHOLDERS_PATH = '5ca117eb-8782-4a4f-9f2f-30de31fc2e34';
const F_APP_DATASOURCES_PATH = '5764d2d4-724d-4313-a81b-9246c911faff';
const F_DICTIONARY_PATH = 'a7bbad73-b933-49ff-95c8-1c269cb35e7c';
const F_DICTIONARY_DOMAIN = '0129da3f-8c86-4591-ae32-6ec923413923';
const F_APP_TEMPLATE = '32ce6bbe-4217-46e5-9335-42793884cbe3';
const F_FILESYSTEM_PATH = '72e83c8d-3578-4e50-b4c0-93a78a1729f2';
const F_SETTINGS_TEMPLATES = 'e8881464-38af-4655-be4a-ee10586578a2'; // Settings.Fields.Templates
const F_SERVER_SIDE_RENDERING_ENGINE = '9016141c-ff51-40f2-9135-40f5161b9784';
const F_GRAPHQL_ENDPOINT = '30e0a829-637e-478c-a136-66adb568398d';
const F_DEPLOYMENT_SECRET = '797d2f63-d5c4-4c4c-b21f-d3e250e2ab12';
// JSSSiteDefinition.Fields:
const F_RENDERING_HOST = 'f57099a3-526a-49f2-aebd-635453e48875';
const F_POS = '9eaf6dc9-b811-4cda-9edd-9697faba628a';
const F_THUMBNAILS_ROOT_PATH = '6dd8a774-2ce5-4c9e-be7f-1eaf65789956';
// _BaseSiteDefinition.Fields:
const F_HOST_NAME = '8e0dd914-9afb-4d45-bf8b-7ff5d6e5337e';
const F_VIRTUAL_FOLDER = '475031d8-724d-463c-80b2-90839dd1ad98';
const F_START_ITEM = '1ee576af-ba8e-4312-9fbd-2ccf8395baa1';
const F_LANGUAGE = 'f19277fe-1b85-4b0a-8c26-5e74d766b3a3';
// Site.Fields:
const F_SITE_MEDIA_LIBRARY = '33d9005e-1f71-415f-b107-53b965c3b037';
// Standard Sitecore fields (substituted per spec decision #4).
const F_DISPLAY_NAME = 'b5e02ad9-d56f-4c41-a065-a133db87bdeb';
const F_DESCRIPTION = '9541e67d-ce8c-4225-803d-33f7f29f09ef';
// Modules field on _Modules base template.
const F_MODULES = '1230d2cb-4948-4d43-8a3b-b39978f6f1b3';
// _Base Tenant.Templates field id — points at /sitecore/templates/Project/<tenant>/
// where per-tenant template ITEMS live (created by tenant scaffolding's
// applyTenantTemplates step).
const F_TENANT_TEMPLATES = '9c596379-f8d4-45d1-a064-cdf1ede2e7c7';

const DEFAULT_LAYOUT_ITEM = '96e5f4ba-a2cf-4a4c-a4e7-64da88226362';

function findTenantAncestor(engine: Engine, fromPath: string): string | undefined {
  // Walk up the path until we find an item whose template inherits from
  // JSSTenant. For v1 we just walk the path - a tenant is direct child of
  // /sitecore/content typically.
  const segments = fromPath.split('/').filter(Boolean);
  while (segments.length > 0) {
    const path = '/' + segments.join('/');
    const node = engine.getItemByPath(path);
    if (node) return node.item.id;
    segments.pop();
  }
  return undefined;
}

function findSiteDefinitionDescendant(engine: Engine, settingsItemId: string): string | undefined {
  const visited = new Set<string>();
  const queue = [settingsItemId];
  const target = JSSSITE_DEFINITION_TEMPLATE_ID;
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = engine.getItemById(id);
    if (!node) continue;
    if (node.item.template.toLowerCase() === target) return node.item.id;
    for (const child of node.children.values()) queue.push(child.item.id);
  }
  return undefined;
}

export async function scaffoldHeadlessSite(
  engine: Engine,
  input: ScaffoldHeadlessSiteInput,
): Promise<ScaffoldResult | ScaffoldDryRunResult> {
  const warnings: string[] = [];
  const createdPaths: string[] = [];
  const language = input.language ?? 'en';
  const displayName = input.displayName ?? input.siteName;
  const description = input.description ?? '';
  const expectedPath = `${input.siteLocation}/${input.siteName}`;

  // Step 0: per-site module file. Mockingbird always proposes one even
  // when the tenant's `content` include already covers the site path -
  // gives users per-site granularity for push/pull. dryRun returns the
  // preview; acceptModuleConfig=true writes it. With no-accept and no
  // coverage gap, the scaffold proceeds without the per-site file (the
  // tenant include's ItemAndDescendants scope picks up the YAMLs).
  const tenantName = input.siteLocation.split('/').filter(Boolean).pop() ?? '';
  const targets = [{ path: expectedPath, label: 'Site root' }];
  const coverageGaps: CoverageGap[] = targets
    .filter(t => !engine.findCoveringInclude(t.path))
    .map(t => ({ path: t.path, label: t.label }));
  const proposed = buildSiteModuleConfig(engine, tenantName, input.siteName);

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

  let emittedModuleConfigPath: string | undefined;
  if (coverageGaps.length > 0 && !input.acceptModuleConfig) {
    throw new ScaffoldError(
      'include-coverage-missing',
      `Scaffold blocked: site path ${expectedPath} has no covering serialization include. ` +
      `Set acceptModuleConfig=true to authorize writing ${proposed.absoluteFilePath}, ` +
      `or add an include manually.`,
    );
  }
  if (input.acceptModuleConfig) {
    await mkdir(dirname(proposed.absoluteFilePath), { recursive: true });
    await writeFile(proposed.absoluteFilePath, serializeModuleConfig(proposed), 'utf-8');
    await engine.reloadModules();
    emittedModuleConfigPath = proposed.absoluteFilePath;
    const stillUncovered = targets.filter(t => !engine.findCoveringInclude(t.path));
    if (stillUncovered.length > 0) {
      throw new ScaffoldError(
        'include-coverage-missing',
        `Scaffold aborted: emitted ${proposed.absoluteFilePath} but ${stillUncovered.length} target paths still uncovered: ${stillUncovered.map(t => t.path).join(', ')}`,
      );
    }
  }

  // Step 1: validate parent + name. Tree-first; fall back to registry so
  // a freshly-scaffolded tenant whose Sites folder hasn't been authored as
  // YAML yet is still a valid site location.
  const parent = resolveInsertParent(engine, input.siteLocation);
  if (!parent) {
    throw new ScaffoldError('parent-not-found', `Parent not found: ${input.siteLocation}`);
  }
  if (engine.getItemByPath(expectedPath)) {
    throw new ScaffoldError('name-collision', `Item already exists: ${expectedPath}`);
  }

  // Step 2: resolve definition items.
  const allDefinitions = await discoverSiteDefinitions(engine);
  const selectedRaw: DefinitionItem[] = [];
  for (const id of input.definitionItemIds) {
    const def = allDefinitions.find(d => d.id === id);
    if (!def) {
      throw new ScaffoldError('definition-item-not-found', `Definition item not found: ${id}`);
    }
    selectedRaw.push(def);
  }

  // Step 3: find tenant ancestor (for tenant.Templates / RenderingsFolder lookups).
  const tenantId = findTenantAncestor(engine, input.siteLocation);
  if (!tenantId) {
    throw new ScaffoldError('parent-not-found', `Cannot find tenant ancestor for ${input.siteLocation}`);
  }
  const tenantNode = engine.getItemById(tenantId)!;
  const tenantFields: Record<string, string> = {};
  for (const f of tenantNode.item.sharedFields) tenantFields[f.id.toLowerCase()] = f.value;

  // Step 4: instantiate site from registry-resident branch.
  const siteBranchReg = engine.getRegistryItem(SITE_BRANCH_ID);
  if (!siteBranchReg) {
    throw new ScaffoldError(
      'branch-prototype-not-found',
      `Site branch prototype not in registry: ${SITE_BRANCH_ID}`,
    );
  }
  const siteBranch = synthesizeRegistryAsScs(siteBranchReg);
  const siteInsert = await insertBranch(engine, parent, siteBranch, input.siteName);
  const siteId = siteInsert.rootItemId;
  const siteNode = engine.getItemById(siteId);
  if (!siteNode) {
    throw new ScaffoldError('parent-not-found', `Site item missing after insert: ${siteId}`);
  }
  createdPaths.push(siteNode.item.path);
  for (const created of siteInsert.createdItems) {
    if (created.item.path !== siteNode.item.path) createdPaths.push(created.item.path);
  }

  // Step 4.5: re-template site descendants against per-tenant templates.
  // SPE: Set-TenantTemplate $site $tenantTemplates. The branch instantiation
  // above produces items templated against OOTB cross-tenant prototypes
  // (e.g. Foundation/JSS Page). This pass swaps each subtree item's template
  // to the matching per-tenant template - the one tenant scaffolding created
  // under /sitecore/templates/Project/<tenant>/. Without this step, downstream
  // JSS apps don't find the per-tenant Page template under site children.
  const tenantTemplatesRootRaw = tenantFields[F_TENANT_TEMPLATES] ?? '';
  const tenantTemplatesRootId = tenantTemplatesRootRaw.replace(/[{}]/g, '').toLowerCase();
  const tenantTemplateIds: string[] = [];
  if (tenantTemplatesRootId) {
    const tenantTemplatesRoot = engine.getItemById(tenantTemplatesRootId);
    if (tenantTemplatesRoot) {
      for (const child of tenantTemplatesRoot.children.values()) {
        tenantTemplateIds.push(child.item.id);
      }
    } else {
      warnings.push(`Set-TenantTemplate skipped: tenant.Templates root not in tree (${tenantTemplatesRootId})`);
    }
  } else {
    warnings.push('Set-TenantTemplate skipped: tenant.Templates field is empty');
  }

  if (tenantTemplateIds.length > 0) {
    const result = await setTenantTemplate(engine, siteId, tenantTemplateIds);
    warnings.push(...result.warnings);
  }

  // Step 5: configure JSSSettings child.
  const settingsChild = Array.from(siteNode.children.values()).find(
    c => c.item.path.endsWith('/Settings'),
  );

  if (settingsChild) {
    const settingsUpdates = [
      { itemId: settingsChild.item.id, fieldId: F_LAYOUT_PATH, value: DEFAULT_LAYOUT_ITEM },
      { itemId: settingsChild.item.id, fieldId: F_RENDERINGS_PATH, value: tenantFields['1d9c08c1-29bb-4f9d-9eb6-c6cce3ad53f5'] ?? '' },
      { itemId: settingsChild.item.id, fieldId: F_PLACEHOLDERS_PATH, value: tenantFields['f55c08e7-ad14-4d8a-9d6f-89eb6f2c6d3b'] ?? '' },
      { itemId: settingsChild.item.id, fieldId: F_FILESYSTEM_PATH, value: `/dist/${input.siteName}` },
      { itemId: settingsChild.item.id, fieldId: F_SETTINGS_TEMPLATES, value: tenantFields['9c596379-f8d4-45d1-a064-cdf1ede2e7c7'] ?? '' },
      { itemId: settingsChild.item.id, fieldId: F_SERVER_SIDE_RENDERING_ENGINE, value: 'http' },
    ].filter(u => u.value !== '');

    if (input.graphQLEndpoint) {
      settingsUpdates.push({ itemId: settingsChild.item.id, fieldId: F_GRAPHQL_ENDPOINT, value: input.graphQLEndpoint });
    }
    if (input.deploymentSecret) {
      settingsUpdates.push({ itemId: settingsChild.item.id, fieldId: F_DEPLOYMENT_SECRET, value: input.deploymentSecret });
    }

    // Find AppDatasourcesPath (Data subfolder of site).
    const dataFolder = Array.from(siteNode.children.values()).find(c => c.item.path.endsWith('/Data'));
    if (dataFolder) {
      settingsUpdates.push({ itemId: settingsChild.item.id, fieldId: F_APP_DATASOURCES_PATH, value: dataFolder.item.id });
    }
    const dictionary = Array.from(siteNode.children.values()).find(c => c.item.path.endsWith('/Dictionary'));
    if (dictionary) {
      settingsUpdates.push({ itemId: settingsChild.item.id, fieldId: F_DICTIONARY_PATH, value: dictionary.item.id });
      settingsUpdates.push({ itemId: settingsChild.item.id, fieldId: F_DICTIONARY_DOMAIN, value: dictionary.item.id });
    }

    if (settingsUpdates.length > 0) await applyFieldUpdates(engine, settingsUpdates);
  } else {
    warnings.push('JSSSettings child not found under site - branch template may not have shipped Settings child');
  }

  // Step 6: site item field updates (display name, description, SiteMediaLibrary).
  const siteUpdates = [
    { itemId: siteId, fieldId: F_DISPLAY_NAME, value: displayName },
    { itemId: siteId, fieldId: F_DESCRIPTION, value: description },
    { itemId: siteId, fieldId: F_MODULES, value: selectedRaw.map(d => d.id).join('|') },
  ];
  await applyFieldUpdates(engine, siteUpdates);

  // Step 7: configure Site Definition descendant.
  if (settingsChild) {
    const siteDefinitionId = findSiteDefinitionDescendant(engine, settingsChild.item.id);
    if (siteDefinitionId) {
      const sdUpdates = [
        { itemId: siteDefinitionId, fieldId: F_HOST_NAME, value: input.hostName },
        { itemId: siteDefinitionId, fieldId: F_VIRTUAL_FOLDER, value: input.virtualFolder },
        { itemId: siteDefinitionId, fieldId: F_RENDERING_HOST, value: 'Default' },
        { itemId: siteDefinitionId, fieldId: F_LANGUAGE, value: language },
        { itemId: siteDefinitionId, fieldId: F_DISPLAY_NAME, value: displayName },
        { itemId: siteDefinitionId, fieldId: F_DESCRIPTION, value: description },
      ];
      if (input.pos) sdUpdates.push({ itemId: siteDefinitionId, fieldId: F_POS, value: input.pos });

      // Find Home page (first child of site whose template name is "Home" or matches JSSPage).
      const homePage = Array.from(siteNode.children.values()).find(c => c.item.path.endsWith('/Home'));
      if (homePage) sdUpdates.push({ itemId: siteDefinitionId, fieldId: F_START_ITEM, value: homePage.item.id });

      await applyFieldUpdates(engine, sdUpdates);
    } else {
      warnings.push('Site Definition descendant (JSSSiteDefinition template) not found under Settings');
    }
  }

  // Step 8: dispatch all site actions.
  const ctx: ActionContext = {
    ports: defaultPorts,
    engine,
    contextItemId: siteId,
    contextItemPath: siteNode.item.path,
    tenantTemplates: tenantTemplateIds,
    language,
    warnings,
    updateTemplate: true,
  };
  for (const def of selectedRaw) {
    const actions = hydrateDefinitionActions(engine, def, warnings);
    for (const a of actions as ScaffoldingAction[]) {
      await dispatchAction(a, ctx);
    }
  }

  return {
    rootItemPath: siteNode.item.path,
    rootItemId: siteId,
    createdCount: createdPaths.length,
    createdPaths,
    warnings,
    emittedModuleConfigPath,
  };
}
