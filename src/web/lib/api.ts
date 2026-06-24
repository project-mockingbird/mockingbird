import type {
  TreeNode, ItemDetail, ValidationResult, CreateItemRequest, UpdateItemRequest,
  TemplateSchema, TrimVersionsRequest, LookupSourceItem,
  RenderingMeta, RenderingPlaceholderPath, CompatibleRenderingsResponse,
  InsertOptionsResponse, InsertItemRequest, InsertItemResponse,
  DuplicateItemRequest, CopyItemRequest, MoveItemRequest, AllTemplatesResponse,
  DescendantItem,
} from './types';

const BASE = '';

export interface ItemYamlResponse {
  yaml: string;
  filePath: string;
}

/**
 * Strip braces from a GUID before embedding in a URL path.
 * Sources like rendering XML store GUIDs as `{UPPERCASE-GUID}`; the API routes
 * expect bare GUIDs in the path because URL-encoded `%7B...%7D` breaks
 * the engine's id lookup.
 */
function bareGuid(id: string): string {
  return id.replace(/[{}]/g, '');
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  // Only send Content-Type: application/json when there's actually a body.
  // Fastify's strict content-type parser rejects bodyless requests carrying
  // application/json (FST_ERR_CTP_EMPTY_JSON_BODY -> HTTP 400). DELETEs and
  // bodyless POSTs were silently failing because of this.
  const baseHeaders: Record<string, string> = options?.body !== undefined
    ? { 'Content-Type': 'application/json' }
    : {};
  const response = await fetch(`${BASE}${url}`, {
    ...options,
    headers: { ...baseHeaders, ...(options?.headers as Record<string, string> | undefined) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return response.json();
}

export const api = {
  getTree: (database: string = 'master') =>
    request<TreeNode[]>(`/api/tree?depth=3&db=${database}`),
  getChildren: (parentId: string, database: string = 'master') =>
    request<TreeNode[]>(`/api/tree/children/${parentId}?depth=1&db=${database}`),
  getAncestors: (id: string) =>
    request<string[]>(`/api/tree/ancestors/${id}`),
  getDescendants: (path: string) =>
    request<{ items: DescendantItem[] }>(
      `/api/items/descendants?path=${encodeURIComponent(path)}`,
    ),
  getLookupSource: (source: string, contextId?: string) => {
    const qs = new URLSearchParams({ source });
    if (contextId) qs.set('contextId', contextId);
    return request<LookupSourceItem[]>(`/api/lookup-source?${qs.toString()}`);
  },
  getDatabases: () =>
    request<string[]>('/api/databases'),
  getItem: (id: string) =>
    request<ItemDetail>(`/api/items/${id}`),
  getItemByPath: (path: string) =>
    request<ItemDetail>(`/api/items/by-path?path=${encodeURIComponent(path)}`),
  getItemYaml: (id: string) =>
    request<ItemYamlResponse>(`/api/items/${id}/yaml`),
  createItem: (data: CreateItemRequest) =>
    request<ItemDetail>('/api/items', { method: 'POST', body: JSON.stringify(data) }),
  getInsertOptions: (itemId: string) =>
    request<InsertOptionsResponse>(`/api/items/${encodeURIComponent(itemId)}/insert-options`),
  insertItem: (data: InsertItemRequest) =>
    request<InsertItemResponse>('/api/items', { method: 'POST', body: JSON.stringify(data) }),
  duplicateItem: (data: DuplicateItemRequest) =>
    request<InsertItemResponse>('/api/items', { method: 'POST', body: JSON.stringify(data) }),
  copyItem: (data: Omit<CopyItemRequest, 'type'>) =>
    request<InsertItemResponse>('/api/items', {
      method: 'POST',
      body: JSON.stringify({ type: 'copyTo', ...data }),
    }),
  moveItem: (data: Omit<MoveItemRequest, 'type'>) =>
    request<InsertItemResponse>('/api/items', {
      method: 'POST',
      body: JSON.stringify({ type: 'moveTo', ...data }),
    }),
  refreshItem: (id: string) =>
    request<{ rootItemId: string; refreshed: number; item: ItemDetail }>(
      `/api/items/${bareGuid(id)}/refresh`,
      { method: 'POST', body: '{}' },
    ),
  renameItem: (id: string, newName: string) =>
    request<ItemDetail>(`/api/items/${bareGuid(id)}/rename`, {
      method: 'POST',
      body: JSON.stringify({ name: newName }),
    }),
  createStandardValues: (id: string) =>
    request<ItemDetail>(`/api/items/${bareGuid(id)}/standard-values`, {
      method: 'POST',
      body: '{}',
    }),
  updateItem: (id: string, data: UpdateItemRequest) =>
    request<ItemDetail>(`/api/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteItem: (id: string) =>
    request<{ deleted: boolean; filePaths: string[] }>(`/api/items/${id}`, { method: 'DELETE' }),
  trimVersions: (id: string, data: TrimVersionsRequest) =>
    request<ItemDetail>(`/api/items/${id}/trim-versions`, { method: 'POST', body: JSON.stringify(data) }),
  validate: () =>
    request<ValidationResult>('/api/validate', { method: 'POST', body: '{}' }),
  getFieldTypes: () =>
    request<string[]>('/api/schema/field-types'),
  getTemplateSchema: (itemId: string) =>
    request<TemplateSchema>(`/api/items/${itemId}/template-schema`),
  getRenderingMeta: (id: string) =>
    request<RenderingMeta>(`/api/renderings/${bareGuid(id)}`),
  getCompatibleRenderings: (placeholder: string, pageItemId: string) =>
    request<CompatibleRenderingsResponse>(
      `/api/renderings/compatible?placeholder=${encodeURIComponent(placeholder)}&pageItemId=${encodeURIComponent(bareGuid(pageItemId))}`,
    ),
  getAllRenderings: () => request<CompatibleRenderingsResponse>('/api/renderings/all'),
  getAllTemplates: () => request<AllTemplatesResponse>('/api/templates'),
  getRenderingParametersSchema: (id: string) =>
    request<TemplateSchema>(`/api/renderings/${bareGuid(id)}/parameters-schema`),
  getPlaceholderPaths: (itemId: string, language: string = 'en') =>
    request<{ paths: RenderingPlaceholderPath[] }>(
      `/api/items/${bareGuid(itemId)}/placeholder-paths?language=${encodeURIComponent(language)}`,
    ),
  getSxaVariants: (renderingId: string) =>
    request<{ variants: Array<{ id: string; name: string; displayName: string; folderName: string; isShared: boolean }> }>(
      `/api/sxa/variants?renderingId=${encodeURIComponent(renderingId)}`,
    ),
  getSxaStyleOptions: (renderingId: string) =>
    request<{
      categories: Array<{
        name: string;
        isShared: boolean;
        styles: Array<{ id: string; displayName: string; cssValue: string }>;
      }>;
    }>(`/api/sxa/style-options?renderingId=${encodeURIComponent(renderingId)}`),
  getSxaGridOptions: () =>
    request<{
      breakpoints: Array<{ key: string; displayName: string; sortOrder: number; abbr: string }>;
      dimensions: Array<{ key: string; displayName: string; tab: 'basic' | 'advanced' }>;
      cells: Array<{
        breakpointKey: string;
        dimensionKey: string;
        options: Array<{ id: string; displayName: string; cssClass: string }>;
      }>;
    }>(`/api/sxa/grid-options`),
  getPackageSourceSize: (rootItemId: string, scope: string) =>
    request<{ count: number }>(
      `/api/package/source-size?rootItemId=${encodeURIComponent(rootItemId)}&scope=${encodeURIComponent(scope)}`,
    ),
};
