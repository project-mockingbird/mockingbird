import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { cpSync } from 'fs';
import { tmpdir } from 'os';
import WebSocket from 'ws';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('WebSocket /ws', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let address: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'scp-ws-test-'));
    cpSync(FIXTURES, tempDir, { recursive: true });
    const result = await createServer({ rootDir: tempDir, host: '127.0.0.1' });
    app = result.app;
    await result.engine.readiness.ready();
    await result.engine.awaitWatcherReady();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'object' && addr) {
      address = `ws://127.0.0.1:${addr.port}`;
    }
  });

  afterAll(async () => {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('accepts a WebSocket connection', async () => {
    const ws = new WebSocket(`${address}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => { ws.close(); resolve(); });
      ws.on('error', reject);
    });
  });

  it('receives item event when a .yml file is created', async () => {
    const ws = new WebSocket(`${address}/ws`);
    const messages: string[] = [];

    await new Promise<void>((resolve) => { ws.on('open', resolve); });
    ws.on('message', (data) => { messages.push(data.toString()); });

    const newItemDir = resolve(tempDir, 'authoring/items/templates/WsTest');
    await mkdir(newItemDir, { recursive: true });
    await writeFile(resolve(newItemDir, 'WsTest.yml'), `---
ID: "cccccccc-cccc-cccc-cccc-cccccccccccc"
Parent: "b2c3d4e5-f6a7-8901-bcde-000000000000"
Template: "ab86861a-6030-46c5-b394-e8f99e8b87db"
Path: /sitecore/templates/Project/MyProject/WsTest
`);

    await new Promise(r => setTimeout(r, 1500));
    ws.close();

    expect(messages.length).toBeGreaterThan(0);
    const parsed = messages.map(m => JSON.parse(m));
    const itemEvent = parsed.find(e => e.type === 'item:added' || e.type === 'item:changed');
    expect(itemEvent).toBeDefined();
  });
});
