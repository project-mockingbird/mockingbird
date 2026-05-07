import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('GET /api/items/descendants', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const result = await createServer({ rootDir: FIXTURES });
    app = result.app;
    await result.engine.readiness.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 when path query param is missing', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/items/descendants' });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toMatch(/path/i);
  });

  it('returns 404 when path resolves to no item', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/items/descendants?path=/nonexistent/path',
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns 200 with a flat list of descendant items', async () => {
    // /sitecore/templates/Project/MyProject/MyTemplate has:
    //   - Data (section, has children)
    //   - __Standard Values (leaf)
    //   - Data/Title (leaf)
    //   - Data/Description (leaf)
    const response = await app.inject({
      method: 'GET',
      url: '/api/items/descendants?path=/sitecore/templates/Project/MyProject/MyTemplate',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(4);

    // Verify the Data section is present with the correct shape
    const dataItem = body.items.find(
      (i: { path: string }) =>
        i.path === '/sitecore/templates/Project/MyProject/MyTemplate/Data',
    );
    expect(dataItem).toBeDefined();
    expect(dataItem.id).toBe('a1b2c3d4-e5f6-7890-abcd-000000000002');
    expect(dataItem.name).toBe('Data');
    expect(dataItem.template).toBeDefined();
    expect(typeof dataItem.hasChildren).toBe('boolean');
    expect(dataItem.displayName).toBeUndefined();

    // Verify descendants at deeper levels also appear (flat, not hierarchical)
    const titleItem = body.items.find(
      (i: { path: string }) =>
        i.path === '/sitecore/templates/Project/MyProject/MyTemplate/Data/Title',
    );
    expect(titleItem).toBeDefined();
  });

  it('returns 200 with items: [] for a leaf item that has no descendants', async () => {
    // Title is a leaf field item with no children
    const response = await app.inject({
      method: 'GET',
      url: '/api/items/descendants?path=/sitecore/templates/Project/MyProject/MyTemplate/Data/Title',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toEqual([]);
  });

  it('path-prefix matching is case-insensitive', async () => {
    const lowerResponse = await app.inject({
      method: 'GET',
      url: '/api/items/descendants?path=/sitecore/templates/Project/MyProject/MyTemplate',
    });
    const upperResponse = await app.inject({
      method: 'GET',
      url: '/api/items/descendants?path=/SITECORE/TEMPLATES/PROJECT/MYPROJECT/MYTEMPLATE',
    });
    expect(lowerResponse.statusCode).toBe(200);
    expect(upperResponse.statusCode).toBe(200);
    const lowerBody = lowerResponse.json();
    const upperBody = upperResponse.json();
    expect(upperBody.items.length).toBe(lowerBody.items.length);
    // Both responses contain the same set of item IDs
    const lowerIds = new Set(lowerBody.items.map((i: { id: string }) => i.id));
    const upperIds = new Set(upperBody.items.map((i: { id: string }) => i.id));
    expect(upperIds).toEqual(lowerIds);
  });

  it('hasChildren is correctly set on response items', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/items/descendants?path=/sitecore/templates/Project/MyProject/MyTemplate',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();

    // Data section has children (Title and Description) - should be true
    const dataItem = body.items.find(
      (i: { path: string }) =>
        i.path === '/sitecore/templates/Project/MyProject/MyTemplate/Data',
    );
    expect(dataItem).toBeDefined();
    expect(dataItem.hasChildren).toBe(true);

    // Title is a leaf field - should be false
    const titleItem = body.items.find(
      (i: { path: string }) =>
        i.path === '/sitecore/templates/Project/MyProject/MyTemplate/Data/Title',
    );
    expect(titleItem).toBeDefined();
    expect(titleItem.hasChildren).toBe(false);
  });
});
