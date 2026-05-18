import { Engine } from '../../../src/engine/index.js';
import { ItemTree } from '../../../src/engine/tree.js';
import { Registry } from '../../../src/engine/registry.js';
import type { RegistryData, RegistryItem, ScsItem } from '../../../src/engine/types.js';
import type { ItemNode } from '../../../src/engine/types.js';
import {
  BASE_TENANT_TEMPLATE_ID,
  BASE_SITE_ROOT_TEMPLATE_ID,
  BASE_SETTINGS_TEMPLATE_ID,
  BASE_SXA_STANDARD_VALUES_FOLDER_TEMPLATE_ID,
  PER_SITE_STANDARD_VALUES_TEMPLATE_ID,
  FIELD_IDS,
  SHARED_SITES_FIELD_ID,
  TEMPLATE_TEMPLATE_ID,
  PLACEHOLDERS_FIELD_ID,
  PLACEHOLDER_KEY_FIELD_ID,
} from '../../../src/engine/constants.js';

export function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return {
    parent: '00000000-0000-0000-0000-000000000000',
    template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
    sharedFields: [],
    languages: [],
    ...overrides,
  };
}

export function buildEngine(items: ScsItem[]): Engine {
  const engine = Object.create(Engine.prototype) as Engine;
  const tree = new ItemTree();
  for (const item of items) {
    tree.addItem(item, `/fake/${item.id}.yml`);
  }
  (engine as any).tree = tree;
  (engine as any).registry = null;
  (engine as any).options = { rootDir: '/fake' };
  return engine;
}

/**
 * Build an engine with both a tree and a registry pre-populated.
 * Registry items are injected directly (no disk round-trip) using the
 * same `index()` approach as `attachRegistry` in standard-values-cascade.test.ts.
 */
export function buildEngineWithRegistry(opts: {
  tree: ScsItem[];
  registry: RegistryItem[];
}): Engine {
  const engine = buildEngine(opts.tree);
  const registry = new Registry();
  const data: RegistryData = {
    version: '3.0',
    source: 'test',
    extractedAt: 'test',
    items: opts.registry,
  };
  (registry as unknown as { index(d: RegistryData): void }).index(data);
  (engine as unknown as { registry: Registry }).registry = registry;
  return engine;
}

/**
 * Minimal test fixture: tenant + one or more sites with SharedSites wiring.
 * Returns the engine plus the tenant/site template IDs injected so tests can
 * reference them without hardcoding GUIDs.
 */
export interface SctFixture {
  engine: Engine;
  tenantTemplateId: string;
  siteTemplateId: string;
  settingsTemplateId: string;
  sctFolderTemplateId: string;
  sctItemTemplateId: string;
}

/**
 * Builds a fixture with:
 *   - Tenant template inheriting from _BaseTenant
 *   - Site template inheriting from _BaseSiteRoot
 *   - Settings template inheriting from _BaseSettings
 *   - SCT folder template inheriting from _BaseSXAStandardValuesFolder
 *   - SCT item template inheriting from _PerSiteStandardValues
 *   - The tenant item at `/sitecore/content/<tenantName>`
 *   - Zero or more site items under the tenant, with SharedSites wiring
 *
 * Site items get predictable IDs (`ba000010-...`, `ba000011-...`, etc.) in
 * declaration order so tests can reference them without a second lookup.
 */
export function buildSctFixture(opts: {
  tenantName: string;
  sites: { name: string; shared?: string[] }[];
}): SctFixture {
  const tenantTemplateId = 'aa000001-0000-0000-0000-000000000000';
  const siteTemplateId = 'aa000002-0000-0000-0000-000000000000';
  const settingsTemplateId = 'aa000003-0000-0000-0000-000000000000';
  const sctFolderTemplateId = 'aa000004-0000-0000-0000-000000000000';
  const sctItemTemplateId = 'aa000005-0000-0000-0000-000000000000';

  const items: ScsItem[] = [
    // Template items so inheritance predicates can walk __Base template.
    makeItem({
      id: tenantTemplateId,
      path: '/sitecore/templates/tenant',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${BASE_TENANT_TEMPLATE_ID.toUpperCase()}}` }],
    }),
    makeItem({
      id: siteTemplateId,
      path: '/sitecore/templates/site',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${BASE_SITE_ROOT_TEMPLATE_ID.toUpperCase()}}` }],
    }),
    makeItem({
      id: settingsTemplateId,
      path: '/sitecore/templates/settings',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${BASE_SETTINGS_TEMPLATE_ID.toUpperCase()}}` }],
    }),
    makeItem({
      id: sctFolderTemplateId,
      path: '/sitecore/templates/sct-folder',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${BASE_SXA_STANDARD_VALUES_FOLDER_TEMPLATE_ID.toUpperCase()}}` }],
    }),
    makeItem({
      id: sctItemTemplateId,
      path: '/sitecore/templates/sct-item',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${PER_SITE_STANDARD_VALUES_TEMPLATE_ID.toUpperCase()}}` }],
    }),
  ];

  // Sites keyed by name → item id (deterministic).
  const siteIdsByName = new Map<string, string>();
  for (let i = 0; i < opts.sites.length; i++) {
    siteIdsByName.set(opts.sites[i].name, `ba0000${(i + 10).toString().padStart(2, '0')}-0000-0000-0000-000000000000`);
  }

  const tenantId = 'ba000001-0000-0000-0000-000000000000';
  const tenantPath = `/sitecore/content/${opts.tenantName}`;

  // Tenant item - SharedSites resolves to concat of each site's `shared` list,
  // deduped.
  const sharedSiteRefs: string[] = [];
  for (const site of opts.sites) {
    for (const sharedName of site.shared ?? []) {
      const id = siteIdsByName.get(sharedName);
      if (id && !sharedSiteRefs.includes(id)) sharedSiteRefs.push(id);
    }
  }
  const tenantSharedFields = [];
  if (sharedSiteRefs.length > 0) {
    tenantSharedFields.push({
      id: SHARED_SITES_FIELD_ID,
      hint: 'SharedSites',
      value: sharedSiteRefs.map(id => `{${id.toUpperCase()}}`).join('|'),
    });
  }
  items.push(makeItem({
    id: tenantId,
    path: tenantPath,
    template: tenantTemplateId,
    sharedFields: tenantSharedFields,
  }));

  // Site items.
  for (const site of opts.sites) {
    const siteId = siteIdsByName.get(site.name)!;
    items.push(makeItem({
      id: siteId,
      parent: tenantId,
      path: `${tenantPath}/${site.name}`,
      template: siteTemplateId,
      sharedFields: [],
    }));
  }

  return {
    engine: buildEngine(items),
    tenantTemplateId,
    siteTemplateId,
    settingsTemplateId,
    sctFolderTemplateId,
    sctItemTemplateId,
  };
}

/**
 * Add a Settings folder + Standard Values folder under a site.
 * Returns the newly-created item IDs for caller reference.
 */
export function addSettingsAndSctFolder(fixture: SctFixture, siteRootPath: string): {
  settingsId: string;
  sctFolderId: string;
} {
  const site = fixture.engine.getItemByPath(siteRootPath);
  if (!site) throw new Error(`Site root missing: ${siteRootPath}`);
  const settingsId = `be${Math.random().toString(16).slice(2, 10).padEnd(8, '0')}-0000-0000-0000-000000000000`;
  const sctFolderId = `be${Math.random().toString(16).slice(2, 10).padEnd(8, '0')}-0000-0000-0000-000000000000`;
  fixture.engine.getTree().addItem(
    makeItem({
      id: settingsId,
      parent: site.item.id,
      path: `${siteRootPath}/Settings`,
      template: fixture.settingsTemplateId,
    }),
    '/fake/settings.yml',
  );
  fixture.engine.getTree().addItem(
    makeItem({
      id: sctFolderId,
      parent: settingsId,
      path: `${siteRootPath}/Settings/Standard Values`,
      template: fixture.sctFolderTemplateId,
    }),
    '/fake/sctfolder.yml',
  );
  return { settingsId, sctFolderId };
}

/**
 * Inject a page template that inherits from `_PerSiteStandardValues` so its
 * items participate in SCT resolution. Returns the template's id.
 *
 * Additional `baseTemplateIds` are appended AFTER `_PerSiteStandardValues` in
 * the `__Base template` multi-GUID field so inheritance walks see both.
 */
export function addPerSiteTemplate(
  engine: Engine,
  displayName: string,
  baseTemplateIds: string[] = [],
): string {
  const id = `ac${Math.random().toString(16).slice(2, 10).padEnd(8, '0')}-0000-0000-0000-000000000000`;
  const bases = [PER_SITE_STANDARD_VALUES_TEMPLATE_ID, ...baseTemplateIds];
  engine.getTree().addItem(
    makeItem({
      id,
      path: `/sitecore/templates/test/${displayName}`,
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: FIELD_IDS.baseTemplate,
        hint: '__Base template',
        value: bases.map(b => `{${b.toUpperCase()}}`).join('|'),
      }],
    }),
    '/fake/tpl.yml',
  );
  return id;
}

/**
 * Add an SCT item to a fixture. The SCT's path is
 * `<siteRoot>/Settings/Standard Values/<fileName>`. The SCT's own template
 * equals `subjectTemplateId` directly - that template must inherit from
 * `_PerSiteStandardValues` (use `addPerSiteTemplate` to create).
 */
export function addSctItem(opts: {
  engine: Engine;
  siteRootPath: string;
  fileName: string;
  subjectTemplateId: string;
  fields: Record<string, string>; // versioned fields on the SCT, en/v1
}): ScsItem {
  const sctFolder = findFirstChildByName(opts.engine, `${opts.siteRootPath}/Settings`, 'Standard Values');
  if (!sctFolder) throw new Error(`Standard Values folder missing under ${opts.siteRootPath}/Settings`);

  const id = `bf${Math.random().toString(16).slice(2, 10).padEnd(8, '0')}-0000-0000-0000-000000000000`;
  const sctPath = `${sctFolder.item.path}/${opts.fileName}`;
  const versionedFields = Object.entries(opts.fields).map(([id, value]) => ({ id, hint: '', value }));

  const item: ScsItem = makeItem({
    id,
    parent: sctFolder.item.id,
    path: sctPath,
    template: opts.subjectTemplateId,
    sharedFields: [],
    languages: [
      {
        language: 'en',
        fields: [],
        versions: [{ version: 1, fields: versionedFields }],
      },
    ],
  });

  opts.engine.getTree().addItem(item, `/fake/${id}.yml`);
  return item;
}

function findFirstChildByName(engine: Engine, parentPath: string, name: string): ItemNode | undefined {
  const parent = engine.getItemByPath(parentPath);
  if (!parent) return undefined;
  const targetLower = name.toLowerCase();
  for (const child of parent.children.values()) {
    const last = child.item.path.split('/').pop()?.toLowerCase();
    if (last === targetLower) return child;
  }
  return undefined;
}

/**
 * Build an engine with a single rendering item declaring the given placeholder
 * keys via its template's `Placeholders` shared field. Each declared key is
 * synthesised as a placeholder-settings item with a `Placeholder Key` field.
 *
 * Used by orphan-pruning tests to seed just enough registry/tree metadata for
 * `getDeclaredPlaceholderKeys(engine, renderingId)` to return `keys` as-is.
 *
 * Multiple renderings can be seeded via repeated keys in the same engine - use
 * `seedRenderingPlaceholders(engine, renderingId, keys)` for the mutation form.
 */
export function seedRenderingPlaceholders(
  engine: Engine,
  renderingId: string,
  keys: readonly string[],
): void {
  const placeholderItemIds = keys.map((_, i) => {
    const hex = (i + 1).toString(16).padStart(8, '0');
    return `bb${hex}-0000-0000-0000-000000000000`;
  });

  engine.getTree().addItem(
    makeItem({
      id: renderingId,
      path: `/sitecore/layout/renderings/test/${renderingId.slice(0, 8)}`,
      sharedFields: [
        {
          id: PLACEHOLDERS_FIELD_ID,
          hint: 'Placeholders',
          value: placeholderItemIds.map(id => `{${id.toUpperCase()}}`).join('|'),
        },
      ],
    }),
    `/fake/${renderingId}.yml`,
  );

  for (let i = 0; i < keys.length; i++) {
    engine.getTree().addItem(
      makeItem({
        id: placeholderItemIds[i],
        path: `/sitecore/layout/placeholder settings/test/${keys[i]}`,
        sharedFields: [
          { id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: keys[i] },
        ],
      }),
      `/fake/${placeholderItemIds[i]}.yml`,
    );
  }
}
