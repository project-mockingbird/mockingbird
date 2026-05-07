import type { Engine } from '../index.js';
import type { PlaceholderNode } from './types.js';
import { toCanonicalGuid, formatGuidEdge } from '../guid.js';
import { readSharedField } from './item-fields.js';

/**
 * Field ID of the `Json Rendering` template's `ComponentQuery` field — a
 * versioned / shared rich-text field that holds a GraphQL query executed by
 * Sitecore's `GraphQLAwareRenderingContentsResolver` at layout resolution
 * time. Sitecore feeds the query variables `{contextItem, datasource,
 * language}` and emits the result under the rendering's `fields.data` key,
 * replacing the default datasource-item field serialization entirely.
 */
export const COMPONENT_QUERY_FIELD_ID = '17bb046a-a32a-41b3-8315-81217947611b';

/**
 * Pluggable in-process executor for ComponentQuery queries. Accepts a raw
 * GraphQL query string and a variables object keyed by the Sitecore-known
 * names `contextItem`, `datasource`, and `language`, and resolves to the
 * GraphQL response's `data` payload (NOT the full `{data, errors}` envelope
 * — callers strip `errors` themselves or log them).
 *
 * Injected via {@link import('./route-builder.js').LayoutOptions}.
 * `undefined` is the default and disables ComponentQuery dispatch entirely
 * (falling back to per-componentName resolvers + schema-driven fields).
 */
export type GraphQLExecutor = (
  query: string,
  variables: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Read the ComponentQuery shared field on a rendering definition item. The
 * field is currently NOT carried in registry v3.0 — only tree-serialised
 * rendering items expose it. Registry enrichment (Phase 4 of
 * `scripts/extract-registry-spe.ps1`) would light up OOTB renderings.
 * Returns `undefined` when the field is absent or empty.
 */
export function readComponentQuery(
  renderingId: string,
  engine: Engine,
): string | undefined {
  const value = readSharedField(engine, renderingId, COMPONENT_QUERY_FIELD_ID);
  if (!value || !value.trim()) return undefined;
  return value;
}

/**
 * A ComponentQuery invocation request collected from the placeholder tree.
 * `uid` is the rendering instance's `uid` (matches {@link PlaceholderNode}
 * and the eventual `ComponentNode.uid`) — used as the lookup key in the
 * result map that feeds back into `resolveComponents`.
 */
export interface ComponentQueryRequest {
  uid: string;
  renderingId: string;
  query: string;
  variables: {
    contextItem: string;
    datasource: string;
    language: string;
  };
}

/**
 * Resolve a PlaceholderNode's `dataSource` string to a canonical GUID string
 * suitable for passing as the `datasource` GraphQL variable. Sitecore feeds
 * the resolved id (not `local:Foo/Bar`), so `local:` references must be
 * rewritten against the owning item path. Returns empty string when the
 * reference can't be resolved (the query will fail or return an empty shape;
 * that matches Sitecore's behaviour).
 */
function resolveDatasourceId(
  dataSource: string,
  engine: Engine,
  ownerItemPath: string,
  pageItemPath: string,
): string {
  if (!dataSource) return '';

  const canonical = toCanonicalGuid(dataSource);
  if (canonical) return canonical;

  if (dataSource.startsWith('local:')) {
    const owner = ownerItemPath || pageItemPath;
    const relative = dataSource.slice('local:'.length).replace(/^\/+/, '');
    const absolutePath = `${owner}/${relative}`;
    const node = engine.getItemByPath(absolutePath);
    return node?.item.id ?? '';
  }

  if (dataSource.startsWith('/')) {
    const node = engine.getItemByPath(dataSource);
    return node?.item.id ?? '';
  }

  return '';
}

/**
 * Walk the placeholder tree and collect a ComponentQuery request for every
 * rendering whose definition item carries a non-empty ComponentQuery field.
 * Traversal is depth-first and preserves sibling order — the resulting
 * request list is a valid execution schedule for a parallel `Promise.all`.
 */
export function collectComponentQueryRequests(
  tree: Record<string, PlaceholderNode[]>,
  engine: Engine,
  pageItemId: string,
  pageItemPath: string,
  language: string,
): ComponentQueryRequest[] {
  const requests: ComponentQueryRequest[] = [];

  const visit = (node: PlaceholderNode): void => {
    const query = readComponentQuery(node.renderingId, engine);
    if (query) {
      const datasource = resolveDatasourceId(
        node.dataSource,
        engine,
        node.ownerItemPath ?? pageItemPath,
        pageItemPath,
      );
      requests.push({
        uid: node.uid,
        renderingId: node.renderingId,
        query,
        variables: {
          contextItem: pageItemId,
          datasource,
          language,
        },
      });
    }
    if (node.placeholders) {
      for (const slot of Object.values(node.placeholders)) {
        for (const child of slot) visit(child);
      }
    }
  };

  for (const slot of Object.values(tree)) {
    for (const node of slot) visit(node);
  }

  return requests;
}

/**
 * Post-execution walker that rewrites `id` scalars on any object that is an
 * element of a `results` array to bare-upper-hex (Edge `formatGuidEdge`
 * shape). Prod Edge emits `id` in TWO formats depending on resolver context:
 * canonical lowercase-dashed for AnyItem / multilist / route-tag sites, and
 * bare 32-hex uppercase for ComponentQuery-executed IGQL result rows
 * (Spotlight `data.datasource.links.results[*].id` and any other
 * `children(...) { results { id ... } }` projection). Mercurius resolves
 * `AnyItem.id` to canonical lowercase-dashed everywhere (0.3.4 scope-back),
 * so this walker re-shapes those ids back to the Edge format inside any
 * `results` array the query selected. Ids outside `results` arrays
 * (`datasource.id`, `template.id`) are untouched.
 */
export function rewriteResultRowIds(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(rewriteResultRowIds);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'results' && Array.isArray(v)) {
      out[k] = v.map(row => {
        const walked = rewriteResultRowIds(row);
        if (walked && typeof walked === 'object' && !Array.isArray(walked)) {
          const w = walked as Record<string, unknown>;
          if (typeof w.id === 'string') {
            const canonical = toCanonicalGuid(w.id);
            if (canonical) return { ...w, id: formatGuidEdge(canonical) };
          }
        }
        return walked;
      });
    } else {
      out[k] = rewriteResultRowIds(v);
    }
  }
  return out;
}

/**
 * Execute every {@link ComponentQueryRequest} in parallel against the
 * injected executor and return a map keyed by rendering uid → query-result
 * JSON. Failures per-query surface as `undefined` entries so the main
 * pipeline can fall back to default content resolution instead of
 * propagating the error up through the whole layout response.
 */
export async function executeComponentQueryRequests(
  requests: ComponentQueryRequest[],
  executor: GraphQLExecutor,
): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  if (requests.length === 0) return out;
  const results = await Promise.allSettled(
    requests.map(r => executor(r.query, r.variables as unknown as Record<string, unknown>)),
  );
  for (let i = 0; i < requests.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      out.set(requests[i].uid, rewriteResultRowIds(r.value));
    } else {
      // Log but don't throw — a failed ComponentQuery for one rendering
      // shouldn't null the whole route. Caller falls back to default
      // content resolution for this rendering.
      //
      // Mercurius rejects GraphQL validation failures with a FastifyError
      // whose `.errors` array carries the specific messages (e.g. "Cannot
      // query field X on type Y"). The generic stringification of
      // `r.reason` elides those — surface them so the next schema gap is
      // diagnosable from the log alone.
      const reason = r.reason as { errors?: Array<{ message?: string }> } | undefined;
      const detail = Array.isArray(reason?.errors) && reason!.errors.length > 0
        ? reason!.errors.map(e => e?.message ?? String(e)).join('; ')
        : String(r.reason);
      console.warn(
        `[component-query] executor failed for rendering ${requests[i].renderingId} uid=${requests[i].uid}: ${detail}`,
      );
    }
  }
  return out;
}
