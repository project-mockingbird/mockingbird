import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';
import { classifyItem, FIELD_IDS } from '../../engine/constants.js';
import { statSync } from 'fs';
import type { ItemNode, ScsItem } from '../../engine/types.js';
import { resolveFieldValue } from '../resolve.js';
import { getTemplateSchema, enrichSchemaWithStoredFields } from '../template-schema.js';
import { notifyItemChange } from '../notify.js';
import { getPlaceholderPaths } from '../../engine/renderings/placeholder-paths.js';
import { getInsertOptions } from '../../engine/insert-options.js';
import { duplicateItem } from '../../engine/duplicate-item.js';
import { copyItem } from '../../engine/copy-item.js';
import { moveItem } from '../../engine/move-item.js';
import { refreshItem } from '../../engine/refresh-item.js';
import { renameItem } from '../../engine/rename-item.js';
import { buildRegistryItemDetail } from '../items-from-registry.js';
import { serializeItem } from '../../engine/serializer.js';
import { applyFieldEdit, readCurrentFieldValue } from '../../engine/mutate-fields.js';
import { unifiedDiff } from '../../engine/unified-diff.js';
import type { MutationPlan } from '../../engine/mutation-plan.js';
import { toHostPath } from '../host-path.js';

export function registerItemRoutes(app: FastifyInstance, engine: Engine): void {
  app.get('/api/items/by-path', async (request, reply) => {
    const { path } = request.query as { path?: string };
    if (!path) return reply.status(400).send({ error: 'Missing "path" query parameter', statusCode: 400 });
    const node = engine.getItemByPath(path);
    if (node) {
      const detail = serializeItemNode(node, engine);
      const provenance = engine.getItemProvenance(node.item.id);
      if (provenance) (detail as Record<string, unknown>).provenance = provenance;
      return detail;
    }
    const registryItem = engine.getRegistryItemByPath(path);
    if (registryItem) {
      const detail = buildRegistryItemDetail(registryItem, engine);
      const provenance = engine.getItemProvenance(registryItem.id);
      if (provenance) (detail as Record<string, unknown>).provenance = provenance;
      return detail;
    }
    return reply.status(404).send({ error: `Item not found: ${path}`, statusCode: 404 });
  });

  app.get('/api/items/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const node = engine.getItemById(id);
    if (node) {
      const detail = serializeItemNode(node, engine);
      const provenance = engine.getItemProvenance(node.item.id);
      if (provenance) (detail as Record<string, unknown>).provenance = provenance;
      return detail;
    }
    const registryItem = engine.getRegistryItem(id);
    if (registryItem) {
      const detail = buildRegistryItemDetail(registryItem, engine);
      const provenance = engine.getItemProvenance(registryItem.id);
      if (provenance) (detail as Record<string, unknown>).provenance = provenance;
      return detail;
    }
    return reply.status(404).send({ error: `Item not found: ${id}`, statusCode: 404 });
  });

  app.get('/api/items/:id/yaml', async (request, reply) => {
    const { id } = request.params as { id: string };
    const node = engine.getItemById(id);
    if (!node) {
      return reply.status(404).send({ error: `Item not found: ${id}`, statusCode: 404 });
    }
    return { yaml: serializeItem(node.item), filePath: toHostPath(node.filePath) };
  });

  app.get('/api/items/:id/insert-options', async (request, reply) => {
    const { id } = request.params as { id: string };
    const exists = engine.getItemById(id) || engine.getRegistryItem(id);
    if (!exists) return reply.status(404).send({ error: `Item not found: ${id}`, statusCode: 404 });
    return { options: getInsertOptions(engine, id) };
  });

  app.post('/api/items', async (request, reply) => {
    const body = request.body as {
      type: string;
      name?: string;
      parentPath?: string;
      fieldType?: string;
      templateId?: string;
      sourceId?: string;
      destinationParentId?: string;
      // Scaffolding body shapes (type=scaffold-headless-tenant, scaffold-headless-site).
      tenantLocation?: string;
      tenantName?: string;
      siteLocation?: string;
      siteName?: string;
      hostName?: string;
      virtualFolder?: string;
      definitionItemIds?: string[];
      displayName?: string;
      description?: string;
      language?: string;
      languages?: string[];
      pos?: string;
      graphQLEndpoint?: string;
      deploymentSecret?: string;
      dryRun?: boolean;
      acceptModuleConfig?: boolean;
    };
    if (!body.type) {
      return reply.status(400).send({ error: 'Missing required field: type', statusCode: 400 });
    }

    // Scaffolding entry points dispatch to the orchestrators which carry
    // their own input validation (ScaffoldError codes map to 4xx below).
    if (body.type === 'scaffold-headless-tenant' || body.type === 'scaffold-headless-site') {
      try {
        const { ScaffoldError } = await import('../../engine/scaffolding/types.js');
        const { notifyTreeRefresh } = await import('../notify.js');
        if (body.type === 'scaffold-headless-tenant') {
          if (!body.tenantLocation || !body.tenantName || !Array.isArray(body.definitionItemIds)) {
            return reply.status(400).send({ error: 'tenantLocation, tenantName, and definitionItemIds[] required', statusCode: 400 });
          }
          const { scaffoldHeadlessTenant } = await import('../../engine/scaffolding/tenant-orchestrator.js');
          const result = await scaffoldHeadlessTenant(engine, {
            tenantLocation: body.tenantLocation,
            tenantName: body.tenantName,
            displayName: body.displayName,
            description: body.description,
            language: body.language,
            definitionItemIds: body.definitionItemIds,
            dryRun: body.dryRun === true,
            acceptModuleConfig: body.acceptModuleConfig === true,
          });
          // Dry-run preview: 200 with the proposal, no notify, no 201.
          if (result.dryRun === true) {
            return reply.status(200).send(result);
          }
          notifyTreeRefresh(engine, {
            reason: 'scaffold',
            rootItemPath: result.rootItemPath,
            createdCount: result.createdCount,
          });
          return reply.status(201).send(result);
        } else {
          if (!body.siteLocation || !body.siteName || !body.hostName || !body.virtualFolder || !Array.isArray(body.definitionItemIds)) {
            return reply.status(400).send({ error: 'siteLocation, siteName, hostName, virtualFolder, and definitionItemIds[] required', statusCode: 400 });
          }
          const { scaffoldHeadlessSite } = await import('../../engine/scaffolding/site-orchestrator.js');
          const result = await scaffoldHeadlessSite(engine, {
            siteLocation: body.siteLocation,
            siteName: body.siteName,
            hostName: body.hostName,
            virtualFolder: body.virtualFolder,
            displayName: body.displayName,
            description: body.description,
            language: body.language,
            languages: body.languages,
            pos: body.pos,
            graphQLEndpoint: body.graphQLEndpoint,
            deploymentSecret: body.deploymentSecret,
            definitionItemIds: body.definitionItemIds,
            dryRun: body.dryRun === true,
            acceptModuleConfig: body.acceptModuleConfig === true,
          });
          if (result.dryRun === true) {
            return reply.status(200).send(result);
          }
          notifyTreeRefresh(engine, {
            reason: 'scaffold',
            rootItemPath: result.rootItemPath,
            createdCount: result.createdCount,
          });
          return reply.status(201).send(result);
        }
      } catch (err: unknown) {
        const { ScaffoldError } = await import('../../engine/scaffolding/types.js');
        if (err instanceof ScaffoldError) {
          const codeToStatus: Record<string, number> = {
            'parent-not-found': 404,
            'parent-template-mismatch': 400,
            'name-collision': 409,
            'definition-item-not-found': 404,
            'branch-prototype-not-found': 500,
            'invalid-action': 400,
            'unsupported-action': 501,
            'include-coverage-missing': 409,
          };
          const status = codeToStatus[err.code] ?? 500;
          return reply.status(status).send({ error: err.message, code: err.code, statusCode: status });
        }
        throw err;
      }
    }

    // copyTo/moveTo carry sourceId+destinationParentId; copyTo's name is
    // optional (engine derives "Copy of <source>" via getCopyOfName) and
    // moveTo doesn't use name at all.
    const skipsName = ['copyTo', 'moveTo'];
    if (!skipsName.includes(body.type) && !body.name) {
      return reply.status(400).send({ error: 'Missing required field: name', statusCode: 400 });
    }
    // parentPath is required for legacy create paths and fromTemplate; not
    // for duplicate (source's own parent), copyTo, or moveTo (both pass
    // destinationParentId by id, not path).
    const skipsParentPath = ['duplicate', 'copyTo', 'moveTo'];
    if (!skipsParentPath.includes(body.type) && !body.parentPath) {
      return reply.status(400).send({ error: 'Missing required field: parentPath', statusCode: 400 });
    }
    // The live createXxx / insertItem / duplicateItem paths each carry
    // their own validation (parent exists, name format, sibling collision,
    // template exists). Running planCreateItem first as a dry-run was dead
    // weight - its return value was discarded, so warnings/errors got
    // surfaced only by the real call below repeating the work and throwing.
    // Status-code semantics: tree-walk errors thrown by the real createXxx
    // land in the catch as 400, and the explicit fromTemplate / duplicate
    // parent / source 404s fire before the real call.
    try {
      let node: ItemNode;
      switch (body.type) {
        case 'template':
        case 'section':
        case 'rendering':
        case 'field': {
          if (body.type === 'field' && !body.fieldType) {
            return reply.status(400).send({ error: 'fieldType required for fields', statusCode: 400 });
          }
          // The skipsName / skipsParentPath guards above ensure these are
          // defined for create paths; the `!` is safe by control flow.
          const name = body.name!;
          const parentPath = body.parentPath!;
          if (body.type === 'template') node = await engine.createTemplate(name, parentPath);
          else if (body.type === 'section') node = await engine.createSection(name, parentPath);
          else if (body.type === 'field') node = await engine.createField(name, parentPath, body.fieldType!);
          else node = await engine.createRendering(name, parentPath);
          break;
        }
        case 'fromTemplate': {
          if (!body.templateId) {
            return reply.status(400).send({ error: 'templateId required for fromTemplate', statusCode: 400 });
          }
          const parent = engine.getItemByPath(body.parentPath!);
          if (!parent) {
            return reply.status(404).send({ error: `Parent path not found: ${body.parentPath}`, statusCode: 404 });
          }
          const result = await engine.insertItem({
            parentId: parent.item.id,
            templateId: body.templateId,
            name: body.name!,
          });
          for (const created of result.createdItems) {
            notifyItemChange(engine, { type: 'added', itemId: created.item.id, itemPath: created.item.path });
          }
          return reply.status(201).send(serializeItemNode(result.createdItems[0], engine));
        }
        case 'duplicate': {
          if (!body.sourceId) {
            return reply.status(400).send({ error: 'sourceId required for duplicate', statusCode: 400 });
          }
          // 404 vs 400: source unresolvable -> 404 (matches GET shape).
          const exists = engine.getItemById(body.sourceId);
          if (!exists) {
            return reply.status(404).send({ error: `Source item not found: ${body.sourceId}`, statusCode: 404 });
          }
          const result = await duplicateItem(engine, {
            sourceId: body.sourceId,
            name: body.name!,
          });
          for (const created of result.createdItems) {
            notifyItemChange(engine, { type: 'added', itemId: created.item.id, itemPath: created.item.path });
          }
          return reply.status(201).send(serializeItemNode(result.createdItems[0], engine));
        }
        case 'copyTo': {
          if (!body.sourceId) {
            return reply.status(400).send({ error: 'sourceId required for copyTo', statusCode: 400 });
          }
          if (!body.destinationParentId) {
            return reply.status(400).send({ error: 'destinationParentId required for copyTo', statusCode: 400 });
          }
          const sourceExists = engine.getItemById(body.sourceId);
          if (!sourceExists) {
            return reply.status(404).send({ error: `Source item not found: ${body.sourceId}`, statusCode: 404 });
          }
          const destExists = engine.getItemById(body.destinationParentId);
          if (!destExists) {
            return reply.status(404).send({ error: `Destination parent not found: ${body.destinationParentId}`, statusCode: 404 });
          }
          const result = await copyItem(engine, {
            sourceId: body.sourceId,
            destinationParentId: body.destinationParentId,
            name: body.name,
          });
          for (const created of result.createdItems) {
            notifyItemChange(engine, {
              type: 'added',
              itemId: created.item.id,
              itemPath: created.item.path,
            });
          }
          return reply.status(201).send(serializeItemNode(result.createdItems[0], engine));
        }
        case 'moveTo': {
          if (!body.sourceId) {
            return reply.status(400).send({ error: 'sourceId required for moveTo', statusCode: 400 });
          }
          if (!body.destinationParentId) {
            return reply.status(400).send({ error: 'destinationParentId required for moveTo', statusCode: 400 });
          }
          const sourceExists = engine.getItemById(body.sourceId);
          if (!sourceExists) {
            return reply.status(404).send({ error: `Source item not found: ${body.sourceId}`, statusCode: 404 });
          }
          const destExists = engine.getItemById(body.destinationParentId);
          if (!destExists) {
            return reply.status(404).send({ error: `Destination parent not found: ${body.destinationParentId}`, statusCode: 404 });
          }
          const result = await moveItem(engine, {
            sourceId: body.sourceId,
            destinationParentId: body.destinationParentId,
          });
          notifyItemChange(engine, {
            type: 'moved',
            itemId: result.movedRootId,
            itemPath: result.movedRoot.item.path,
            fromPath: result.fromPath,
          });
          return reply.status(200).send(serializeItemNode(result.movedRoot, engine));
        }
        default: return reply.status(400).send({ error: `Unknown item type: ${body.type}`, statusCode: 400 });
      }
      notifyItemChange(engine, { type: 'added', itemId: node.item.id, itemPath: node.item.path });
      return reply.status(201).send(serializeItemNode(node, engine));
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err), statusCode: 400 });
    }
  });

  app.put('/api/items/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const node = engine.getItemById(id);
    if (!node) return reply.status(404).send({ error: `Item not found: ${id}`, statusCode: 404 });
    const body = request.body as { fields?: Record<string, string>; language?: string; version?: number };
    if (!body.fields || Object.keys(body.fields).length === 0) {
      return reply.status(400).send({ error: 'No fields provided', statusCode: 400 });
    }
    const language = body.language ?? 'en';
    const version = body.version ?? 1;
    const plan = await engine.planUpdateFields(id, body.fields, language, version);
    if (plan.files.length === 0) {
      // No-op (no effective change). Return current state without writing.
      return serializeItemNode(node, engine);
    }
    // The plan was computed on a clone; replay the field edits on the live item
    // so the in-memory tree matches the on-disk state we are about to write.
    const schema = getTemplateSchema(node.item.template, engine);
    const scopeByFieldId = new Map<string, 'shared' | 'unversioned' | 'versioned'>();
    const nameByFieldId = new Map<string, string>();
    for (const section of schema.sections) {
      for (const field of section.fields) {
        scopeByFieldId.set(field.id.toLowerCase(),
          field.unversioned ? 'unversioned' : field.shared ? 'shared' : 'versioned');
        nameByFieldId.set(field.id.toLowerCase(), field.name);
      }
    }
    // Capture pre-mutation values so we can revert in-memory if applyPlan
    // throws. Without this, a partial-disk-write failure leaves the live
    // tree showing values that never landed on disk.
    const previousValues: Record<string, string | undefined> = {};
    for (const rawId of Object.keys(body.fields)) {
      const lower = rawId.toLowerCase();
      previousValues[lower] = readCurrentFieldValue(node.item, lower, language, version);
    }
    for (const [rawId, value] of Object.entries(body.fields)) {
      const lower = rawId.toLowerCase();
      // Pass the schema-resolved name as hint so applyFieldEdit's existing-field
      // heal-empty-Hint branch fires. Without this, the live tree's in-memory
      // hint stays empty even though the on-disk plan wrote the healed value.
      applyFieldEdit(node.item, lower, value, language, version,
        scopeByFieldId.get(lower), nameByFieldId.get(lower) ?? '');
    }
    try {
      await engine.applyPlan(plan);
    } catch (err) {
      // Revert each field whose pre-mutation value was defined. If a field
      // didn't exist before the edit, we leave the appended entry in place;
      // removing newly-pushed entries would require pulling them back out
      // of the correct scope array, which is more invasive than the
      // disk-vs-memory mismatch we are guarding against here.
      for (const rawId of Object.keys(body.fields)) {
        const lower = rawId.toLowerCase();
        const old = previousValues[lower];
        if (old !== undefined) {
          applyFieldEdit(node.item, lower, old, language, version, scopeByFieldId.get(lower), nameByFieldId.get(lower) ?? '');
        }
      }
      throw err;
    }
    notifyItemChange(engine, { type: 'changed', itemId: node.item.id, itemPath: node.item.path });
    return serializeItemNode(node, engine);
  });

  app.post('/api/items/:id/rename', async (request, reply) => {
    const { id } = request.params as { id: string };
    const exists = engine.getItemById(id);
    if (!exists) return reply.status(404).send({ error: `Item not found: ${id}`, statusCode: 404 });
    const body = request.body as { name?: string };
    if (!body.name || !body.name.trim()) {
      return reply.status(400).send({ error: 'Missing required field: name', statusCode: 400 });
    }
    try {
      const result = await renameItem(engine, { itemId: id, newName: body.name });
      notifyItemChange(engine, {
        type: 'moved',
        itemId: result.itemId,
        itemPath: result.toPath,
        fromPath: result.fromPath,
      });
      return reply.status(200).send(serializeItemNode(result.renamedRoot, engine));
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err), statusCode: 400 });
    }
  });

  app.post('/api/items/:id/refresh', async (request, reply) => {
    const { id } = request.params as { id: string };
    const exists = engine.getItemById(id);
    if (!exists) return reply.status(404).send({ error: `Item not found: ${id}`, statusCode: 404 });
    try {
      const result = await refreshItem(engine, { itemId: id });
      const node = engine.getItemById(result.rootItemId)!;
      notifyItemChange(engine, { type: 'changed', itemId: node.item.id, itemPath: node.item.path });
      return reply.status(200).send({
        rootItemId: result.rootItemId,
        refreshed: result.refreshed,
        item: serializeItemNode(node, engine),
      });
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err), statusCode: 400 });
    }
  });

  app.post('/api/items/:id/trim-versions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const node = engine.getItemById(id);
    if (!node) return reply.status(404).send({ error: `Item not found: ${id}`, statusCode: 404 });
    const body = request.body as { language?: string; keepCount?: number };
    const language = body.language ?? 'en';
    const keepCount = body.keepCount ?? 5;
    if (!Number.isInteger(keepCount) || keepCount < 1) {
      return reply.status(400).send({ error: 'keepCount must be a positive integer', statusCode: 400 });
    }
    const lang = node.item.languages.find(l => l.language === language);
    if (!lang) return reply.status(404).send({ error: `Language not found on item: ${language}`, statusCode: 404 });
    if (lang.versions.length > keepCount) {
      // Mutate a clone, write to disk, commit on success - same in-memory /
      // disk consistency contract as PUT.
      const draft = structuredClone(node.item);
      const draftLang = draft.languages.find(l => l.language === language)!;
      draftLang.versions = [...draftLang.versions].sort((a, b) => a.version - b.version).slice(-keepCount);
      const { serializeItem } = await import('../../engine/serializer.js');
      const { writeFile } = await import('fs/promises');
      await writeFile(node.filePath, serializeItem(draft), 'utf-8');
      node.item = draft;
      notifyItemChange(engine, { type: 'changed', itemId: node.item.id, itemPath: node.item.path });
    }
    return serializeItemNode(node, engine);
  });

  app.delete('/api/items/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const node = engine.getItemById(id);
    if (!node) return reply.status(404).send({ error: `Item not found: ${id}`, statusCode: 404 });
    const { id: itemId, path: itemPath } = node.item;
    const plan = await engine.planDeleteItem(id);
    // In-memory delete BEFORE disk delete. If applyPlan fails partway
    // through (e.g. one of N files cannot be removed), the worst case is
    // orphan YAML files on disk - which won't reappear in the tree
    // because their parent items are gone. That is a strictly better
    // failure mode than the previous order, where a disk failure left
    // the live tree showing an item that disk had already lost.
    engine.deleteItem(id);
    try {
      await engine.applyPlan(plan);
    } catch (err) {
      // Don't try to roll back the in-memory delete - reconstructing the
      // subtree from the plan's `before` content is invasive and the next
      // engine reload (or watcher event) will reconcile any orphans. Log
      // the failure and rethrow so the caller sees the 4xx/5xx.
      request.log.error({ err, itemId, itemPath, files: plan.files.map(f => f.path) },
        'DELETE applyPlan failed after in-memory delete; orphan files may remain on disk');
      throw err;
    }
    notifyItemChange(engine, { type: 'removed', itemId, itemPath });
    return { deleted: true, filePaths: plan.files.map(f => toHostPath(f.path)) };
  });

  app.get('/api/items/:id/unused-datasources', async (request, reply) => {
    const { id } = request.params as { id: string };
    const node = engine.getItemById(id);
    if (!node) return reply.status(404).send({ error: `Item not found: ${id}`, statusCode: 404 });
    const { findUnusedDatasources } = await import('../../engine/layout/unused-datasources.js');
    return findUnusedDatasources(id, engine);
  });

  app.post('/api/items/:id/unused-datasources/cleanup', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { itemIds } = request.body as { itemIds: string[] };
    const parent = engine.getItemById(id);
    if (!parent) return reply.status(404).send({ error: `Item not found: ${id}`, statusCode: 404 });

    // Defense-in-depth: re-run detection and reject the entire request if
    // any itemId isn't currently unused under :id's Page Data subtree.
    // Catches both weaponization (arbitrary id POSTed) and the TOCTOU
    // race where the user added a rendering ref between banner load and
    // confirm. The client refreshes and re-confirms; safer than partial
    // deletion of an outdated set.
    const { findUnusedDatasources } = await import('../../engine/layout/unused-datasources.js');
    const { items: currentlyUnused } = findUnusedDatasources(id, engine);
    const stillUnused = new Set(currentlyUnused.map(i => i.id));
    const invalid = itemIds.filter(i => !stillUnused.has(i));
    if (invalid.length > 0) {
      return reply.status(400).send({
        error: 'one or more itemIds are not currently unused under this item',
        invalidItemIds: invalid,
        statusCode: 400,
      });
    }

    const deleted: string[] = [];
    const failed: Array<{ itemId: string; error: string }> = [];

    for (const itemId of itemIds) {
      const childNode = engine.getItemById(itemId);
      if (!childNode) { failed.push({ itemId, error: 'item not found' }); continue; }
      try {
        const { id: deletedId, path: deletedPath } = childNode.item;
        const plan = await engine.planDeleteItem(itemId);
        engine.deleteItem(itemId);
        await engine.applyPlan(plan);
        notifyItemChange(engine, { type: 'removed', itemId: deletedId, itemPath: deletedPath });
        deleted.push(itemId);
      } catch (err) {
        failed.push({ itemId, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { deleted, failed };
  });

  app.get('/api/items/:id/template-schema', async (request, reply) => {
    const { id } = request.params as { id: string };
    const node = engine.getItemById(id);
    const registryItem = engine.getRegistryItem(id);
    const itemTemplate = node?.item.template ?? registryItem?.template;
    if (!itemTemplate) return reply.status(404).send({ error: `Item not found: ${id}`, statusCode: 404 });

    // Collect every field ID stored on the item across shared/unversioned/versioned
    // levels. Sitecore Pages augments the schema for fields stored on the item
    // but not declared in the template chain (e.g. SXA's OtherProperties on
    // renderings whose Json Rendering chain doesn't include Extended Options).
    const storedFieldIds = new Set<string>();
    if (node) {
      for (const f of node.item.sharedFields ?? []) storedFieldIds.add(f.id);
      for (const lang of node.item.languages ?? []) {
        for (const f of lang.fields ?? []) storedFieldIds.add(f.id);
        for (const v of lang.versions ?? []) {
          for (const f of v.fields ?? []) storedFieldIds.add(f.id);
        }
      }
    } else if (registryItem) {
      for (const fid of Object.keys(registryItem.sharedFields ?? {})) storedFieldIds.add(fid);
    }

    const baseSchema = getTemplateSchema(itemTemplate, engine);
    const schema = enrichSchemaWithStoredFields(baseSchema, storedFieldIds, engine);

    // For template items, include the template's own sections for the builder view.
    // Registry-only template items still get their own sections via the same path.
    if (classifyItem(itemTemplate) === 'template') {
      const ownSchema = getTemplateSchema(id, engine);
      return { ...schema, builderSections: ownSchema.sections.filter(s => s.sourceTemplateId === id) };
    }

    return schema;
  });

  app.get('/api/items/:itemId/placeholder-paths', async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const { language } = request.query as { language?: string };
    const exists = engine.getItemById(itemId) || engine.getRegistryItem(itemId);
    if (!exists) return reply.status(404).send({ error: 'Item not found' });
    return { paths: getPlaceholderPaths(engine, itemId, language ?? 'en') };
  });

  app.post('/api/items/preview-update', async (request, reply) => {
    const body = request.body as { id?: string; fields?: Record<string, string>; language?: string; version?: number };
    if (!body.id) return reply.status(400).send({ error: 'id is required', statusCode: 400 });
    if (!body.fields || Object.keys(body.fields).length === 0) {
      return reply.status(400).send({ error: 'No fields provided', statusCode: 400 });
    }
    if (!engine.getItemById(body.id)) {
      return reply.status(404).send({ error: `Item not found: ${body.id}`, statusCode: 404 });
    }
    const plan = await engine.planUpdateFields(body.id, body.fields, body.language ?? 'en', body.version ?? 1);
    return planToResponse(plan);
  });

  app.post('/api/items/preview-delete', async (request, reply) => {
    const body = request.body as { id?: string };
    if (!body.id) return reply.status(400).send({ error: 'id is required', statusCode: 400 });
    if (!engine.getItemById(body.id)) {
      return reply.status(404).send({ error: `Item not found: ${body.id}`, statusCode: 404 });
    }
    const plan = await engine.planDeleteItem(body.id);
    return planToResponse(plan);
  });

  // Linear-scan search used by the SPE Find-Item cmdlet. Predicate subset:
  // - field in {Name, ID, Path, TemplateID, TemplateName} or any field id/hint
  // - op in {eq, ne, like}; like is PowerShell-style (* / ?)
  app.post('/api/items/search', async (request, reply) => {
    const body = request.body as {
      predicate?: { field: string; op: string; value: string };
      limit?: number;
    } | undefined;
    if (!body?.predicate) {
      return reply.status(400).send({ error: 'predicate is required', statusCode: 400 });
    }
    const { field, op, value } = body.predicate;
    if (!field || !op) {
      return reply.status(400).send({ error: 'predicate.field and predicate.op are required', statusCode: 400 });
    }
    const limit = body.limit ?? 100;

    const SUPPORTED_OPS = new Set(['eq', 'ne', 'like']);
    if (!SUPPORTED_OPS.has(op)) {
      return reply.status(400).send({
        error: `op '${op}' is not supported (allowed: eq, ne, like)`,
        statusCode: 400,
      });
    }

    const matches: Array<{ id: string; path: string; template: string }> = [];
    for (const node of engine.getAllItems()) {
      const candidate = readSearchField(node, field, engine);
      if (candidate === undefined) continue;
      let hit = false;
      if (op === 'eq') hit = candidate === value;
      else if (op === 'ne') hit = candidate !== value;
      else if (op === 'like') hit = likeMatch(candidate, value);
      if (hit) {
        matches.push({ id: node.item.id, path: node.item.path, template: node.item.template });
        if (matches.length >= limit) break;
      }
    }
    return { items: matches, total: matches.length };
  });

  // GET /api/items/descendants - returns a flat list of every item whose path
  // is a proper descendant of the requested path. Used by feature dialogs
  // (e.g. the Image field Media Browser) that need to operate on a subtree
  // without paying for per-node lazy fetches. Includes both serialized and
  // registry items so the tree shape stays connected even when intermediate
  // folders only exist in the registry (e.g. /sitecore/media library/Project
  // is a registry-only OOTB folder).
  app.get('/api/items/descendants', async (request, reply) => {
    const { path } = request.query as { path?: string };
    if (!path) {
      return reply
        .status(400)
        .send({ error: 'Missing "path" query parameter', statusCode: 400 });
    }
    const root = engine.getItemByPath(path) ?? engine.getRegistryItemByPath(path);
    if (!root) {
      return reply.status(404).send({ error: `Item not found: ${path}`, statusCode: 404 });
    }
    // Trailing-slash normalization: input like '/path/' becomes prefix '/path/'.
    // The 404 guard above prevents path='/' (no item at root path) from matching all items.
    const lowerPrefix = path.toLowerCase().replace(/\/+$/, '') + '/';

    // Collect serialized + registry items by lowercased path. Serialized items
    // take precedence when an id collides (same item shown both serialized and
    // in registry).
    interface DescItem {
      id: string;
      name: string;
      displayName?: string;
      path: string;
      template: string;
      hasChildren: boolean;
    }
    const itemsByLowerPath = new Map<string, DescItem>();

    // Pass 1: serialized items (engine.getAllItems is tree-only).
    for (const node of engine.getAllItems()) {
      const lower = node.item.path.toLowerCase();
      if (!lower.startsWith(lowerPrefix)) continue;
      const name = node.item.path.split('/').pop() ?? '';
      const displayName = node.item.sharedFields.find(
        f => f.id.toLowerCase() === FIELD_IDS.displayName,
      )?.value;
      itemsByLowerPath.set(lower, {
        id: node.item.id,
        name,
        displayName: displayName && displayName.trim() !== '' ? displayName : undefined,
        path: node.item.path,
        template: node.item.template,
        hasChildren: false,
      });
    }

    // Pass 2: registry items reached by walking the registry's parent->children
    // graph from the root. Skip items already added in Pass 1.
    // root may be an ItemNode (serialized) or a RegistryItem; extract id accordingly.
    const rootId = 'item' in root ? root.item.id : root.id;
    const queue: string[] = [rootId];
    const seenIds = new Set<string>();
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      if (seenIds.has(parentId.toLowerCase())) continue;
      seenIds.add(parentId.toLowerCase());
      const children = engine.getRegistryChildren(parentId);
      for (const child of children) {
        const lower = child.path.toLowerCase();
        if (!lower.startsWith(lowerPrefix)) continue;
        if (!itemsByLowerPath.has(lower)) {
          const displayName = child.sharedFields[FIELD_IDS.displayName];
          itemsByLowerPath.set(lower, {
            id: child.id,
            name: child.name,
            displayName: displayName && displayName.trim() !== '' ? displayName : undefined,
            path: child.path,
            template: child.template,
            hasChildren: false,
          });
        }
        queue.push(child.id);
      }
    }

    // Compute hasChildren via parent-path counts.
    const items = Array.from(itemsByLowerPath.values());
    const childCounts = new Map<string, number>();
    for (const it of items) {
      const parentPath = it.path.slice(0, it.path.lastIndexOf('/'));
      const lowerParent = parentPath.toLowerCase();
      childCounts.set(lowerParent, (childCounts.get(lowerParent) ?? 0) + 1);
    }
    for (const it of items) {
      it.hasChildren = (childCounts.get(it.path.toLowerCase()) ?? 0) > 0;
    }

    return { items };
  });

  // References: items referenced by the given item via field values that
  // contain GUIDs. Catches multilist/droplink/treelist references and any
  // shared/versioned/unversioned field whose value contains GUID(s).
  app.get('/api/items/:id/references', async (request, reply) => {
    const { id } = request.params as { id: string };
    const node = engine.getItemById(id);
    if (!node) return reply.status(404).send({ error: `Item not found: ${id}`, statusCode: 404 });
    const seen = new Set<string>();
    const refs: Array<{ id: string; path: string }> = [];
    for (const guid of collectGuidsFromFields(node.item)) {
      const lower = guid.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      const ref = engine.getItemById(lower);
      if (ref) refs.push({ id: ref.item.id, path: ref.item.path });
    }
    return { items: refs };
  });

  // Referrers: items whose fields contain this item's GUID. Uses the same
  // GUID-extraction approach as references; false-positive risk for items
  // whose fields happen to contain a checksum-shaped GUID is acceptable for
  // a Tier-1 cmdlet.
  app.get('/api/items/:id/referrers', async (request, reply) => {
    const { id } = request.params as { id: string };
    const target = engine.getItemById(id);
    if (!target) return reply.status(404).send({ error: `Item not found: ${id}`, statusCode: 404 });
    const idLower = target.item.id.toLowerCase();
    const matches: Array<{ id: string; path: string }> = [];
    for (const node of engine.getAllItems()) {
      if (node.item.id === idLower) continue; // skip self
      if (collectGuidsFromFields(node.item).some(g => g.toLowerCase() === idLower)) {
        matches.push({ id: node.item.id, path: node.item.path });
      }
    }
    return { items: matches };
  });

  app.post('/api/items/preview-create', async (request, reply) => {
    const body = request.body as {
      type?: string; name?: string; parentPath?: string;
      fieldType?: string; templateId?: string; sourceId?: string;
    };
    if (!body.type) return reply.status(400).send({ error: 'type is required', statusCode: 400 });
    if (!body.name) return reply.status(400).send({ error: 'name is required', statusCode: 400 });
    const plan = await engine.planCreateItem({
      type: body.type as Parameters<typeof engine.planCreateItem>[0]['type'],
      name: body.name,
      parentPath: body.parentPath,
      fieldType: body.fieldType,
      templateId: body.templateId,
      sourceId: body.sourceId,
    });
    if (plan.files.length === 0) {
      const reason = plan.warnings[0] ?? 'no-op';
      const status = reason.toLowerCase().includes('not found') ? 404 : 400;
      return reply.status(status).send({ error: reason, statusCode: status });
    }
    return planToResponse(plan);
  });
}

/**
 * Read a single field value off an item for the search predicate. Built-in
 * field names (Name/ID/Path/TemplateID/TemplateName) are sourced from the
 * tree node; arbitrary names are looked up against the item's shared,
 * unversioned, and versioned field arrays by id (lowercased) or hint.
 */
function readSearchField(node: ItemNode, field: string, engine: Engine): string | undefined {
  if (field === 'Name') return node.item.path.split('/').pop();
  if (field === 'ID') return node.item.id;
  if (field === 'Path') return node.item.path;
  if (field === 'TemplateID') return node.item.template;
  if (field === 'TemplateName') {
    const tpl = engine.getItemById(node.item.template);
    if (tpl) return tpl.item.path.split('/').pop();
    const reg = engine.getRegistryItem(node.item.template);
    return reg?.path.split('/').pop();
  }
  // Field-equality fallback: walk shared / unversioned / versioned for the
  // matching field (by id lowercased or by hint, exact-match).
  const lower = field.toLowerCase();
  const shared = node.item.sharedFields.find(f => f.id.toLowerCase() === lower || f.hint === field);
  if (shared) return shared.value;
  for (const lang of node.item.languages) {
    const u = lang.fields.find(f => f.id.toLowerCase() === lower || f.hint === field);
    if (u) return u.value;
    for (const v of lang.versions) {
      const vf = v.fields.find(f => f.id.toLowerCase() === lower || f.hint === field);
      if (vf) return vf.value;
    }
  }
  return undefined;
}

/**
 * PowerShell-style wildcard match: * = any chars, ? = single char. Anchored,
 * case-insensitive. Reused for the `like` op in /api/items/search.
 */
function likeMatch(input: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  const re = new RegExp('^' + escaped + '$', 'i');
  return re.test(input);
}

const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Extract every GUID-shaped substring from every field value on the item
 * (shared + per-language unversioned + per-version). Used by /references
 * and /referrers to find item-to-item links via multilist/droplink/treelist
 * fields without consulting the template schema.
 */
function collectGuidsFromFields(item: ScsItem): string[] {
  const out: string[] = [];
  for (const f of item.sharedFields) {
    const m = f.value.match(GUID_RE);
    if (m) out.push(...m);
  }
  for (const lang of item.languages) {
    for (const f of lang.fields) {
      const m = f.value.match(GUID_RE);
      if (m) out.push(...m);
    }
    for (const v of lang.versions) {
      for (const f of v.fields) {
        const m = f.value.match(GUID_RE);
        if (m) out.push(...m);
      }
    }
  }
  return out;
}

function planToResponse(plan: MutationPlan): Record<string, unknown> {
  const diffs = plan.files.map(f => unifiedDiff(f.before, f.after, f.path)).filter(d => d !== '');
  return {
    diff: diffs.join('\n'),
    summary: plan.summary,
    warnings: plan.warnings,
    wouldWrite: plan.files.map(f => ({ path: f.path, bytes: Buffer.byteLength(f.after, 'utf-8'), op: f.op })),
  };
}

function serializeItemNode(node: ItemNode, engine: Engine): Record<string, unknown> {
  const resolvedFields: Record<string, string> = {};
  const allFields = [
    ...node.item.sharedFields,
    ...node.item.languages.flatMap(l => [
      ...l.fields,
      ...l.versions.flatMap(v => v.fields),
    ]),
  ];
  for (const field of allFields) {
    if (!field.value) continue;
    const resolved = resolveFieldValue(field.value, engine);
    if (resolved !== field.value) {
      resolvedFields[field.id] = resolved;
    }
  }

  const templateResolved = resolveFieldValue(`{${node.item.template}}`, engine);

  let fileSizeBytes: number | undefined;
  try { fileSizeBytes = statSync(node.filePath).size; } catch { /* file gone or unreadable; skip */ }

  return {
    source: 'serialized',
    id: node.item.id, name: node.item.path.split('/').pop() ?? '', path: node.item.path,
    template: node.item.template, parent: node.item.parent, type: classifyItem(node.item.template),
    filePath: toHostPath(node.filePath), sharedFields: node.item.sharedFields, languages: node.item.languages,
    resolvedFields: Object.keys(resolvedFields).length > 0 ? resolvedFields : undefined,
    templateResolved, fileSizeBytes,
  };
}
