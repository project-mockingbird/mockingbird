import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';
import { FIELD_IDS } from '../../engine/constants.js';
import { formatGuidBraced } from '../../engine/guid.js';
import { getCompatibleRenderings, getAllRenderings } from '../../engine/renderings/compatibility.js';
import { resolveDatasourceFields } from '../../engine/renderings/datasource-fields.js';
import { getRenderingParametersSchema } from '../../engine/template-schema.js';
import { lookupUnifiedItem, getId, getName } from '../../engine/layout/unified-item.js';
import { readSharedField } from '../../engine/layout/item-fields.js';
import type { RenderingMeta } from '../../engine/renderings/types.js';

/**
 * Build a RenderingMeta object from a rendering item.
 * Reads icon, displayName (fallback to name), parametersTemplate, and the
 * Datasource Template / Datasource Location fields (resolved by hint via the
 * rendering's template chain - see resolveDatasourceFields).
 *
 * Registry-aware: looks up the item via lookupUnifiedItem so registry-only
 * renderings (the predominant content tree shape) are resolvable. Field reads go
 * through readSharedField which checks both serialized and registry stores.
 */
function buildRenderingMeta(engine: Engine, renderingId: string): RenderingMeta | null {
  const node = lookupUnifiedItem(renderingId, engine);
  if (!node) return null;

  const id = getId(node);
  const name = getName(node);
  const path = node.kind === 'node' ? node.value.item.path : node.value.path;
  const template = (node.kind === 'node' ? node.value.item.template : node.value.template).toLowerCase();

  const displayNameValue = readSharedField(engine, id, FIELD_IDS.displayName);
  const displayName = displayNameValue && displayNameValue.trim() !== '' ? displayNameValue : name;

  const iconValue = readSharedField(engine, id, FIELD_IDS.icon);
  const icon = iconValue && iconValue.trim() !== '' ? iconValue : undefined;

  const sortorderRaw = readSharedField(engine, id, FIELD_IDS.sortorder);
  const sortOrder = (sortorderRaw && sortorderRaw.trim() !== '')
    ? (Number.isFinite(Number(sortorderRaw)) ? Number(sortorderRaw) : undefined)
    : undefined;

  const parametersTemplateValue = readSharedField(engine, id, FIELD_IDS.parametersTemplate);
  const parametersTemplateId = parametersTemplateValue && parametersTemplateValue.trim() !== ''
    ? parametersTemplateValue.toUpperCase()
    : undefined;

  const datasource = resolveDatasourceFields(engine, renderingId);

  return {
    id: formatGuidBraced(id),
    name,
    displayName,
    path,
    template,
    icon,
    parametersTemplateId,
    datasourceTemplate: datasource?.datasourceTemplate,
    datasourceLocation: datasource?.datasourceLocation,
    sortOrder,
  };
}

export function registerRenderingsRoutes(app: FastifyInstance, engine: Engine): void {
  app.get('/api/renderings/:id/parameters-schema', async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = getRenderingParametersSchema(engine, id);
    if (!schema) return reply.code(404).send({ error: 'Rendering has no Parameters Template' });
    return schema;
  });

  app.get('/api/renderings/compatible', async (request, reply) => {
    const { placeholder, pageItemId } = request.query as { placeholder?: string; pageItemId?: string };
    if (!placeholder || !pageItemId) {
      return reply.code(400).send({ error: 'placeholder and pageItemId are required' });
    }
    try {
      const renderings = getCompatibleRenderings(engine, placeholder, pageItemId);
      return { renderings };
    } catch (err: any) {
      return reply.code(422).send({ error: err?.message ?? 'Could not resolve compatible renderings' });
    }
  });

  app.get('/api/renderings/all', async () => {
    return { renderings: getAllRenderings(engine) };
  });

  app.get('/api/renderings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const meta = buildRenderingMeta(engine, id);
    if (!meta) return reply.status(404).send({ error: 'Rendering not found' });
    return meta;
  });
}
