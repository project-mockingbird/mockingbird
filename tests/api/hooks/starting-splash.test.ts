import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerStartingSplash } from '../../../src/api/hooks/starting-splash.js';
import { ReadinessState } from '../../../src/engine/readiness.js';

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

/**
 * Build a bare Fastify app with the splash hook + a distinguishable passthrough
 * for anything the hook does not intercept. `/api/status` is a real route so we
 * can assert the hook never hijacks it.
 */
function makeApp(readiness: ReadinessState): FastifyInstance {
  const a = Fastify();
  registerStartingSplash(a, readiness);
  a.get('/api/status', async () => ({ state: readiness.state, progress: readiness.progress }));
  a.setNotFoundHandler(async () => ({ passthrough: true }));
  return a;
}

const HTML = { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
const JSON_ACCEPT = { accept: 'application/json' };

describe('starting-splash hook', () => {
  it('serves the splash HTML for a top-level browser navigation while initializing', async () => {
    app = makeApp(new ReadinessState()); // state defaults to 'initializing'
    const res = await app.inject({ method: 'GET', url: '/', headers: HTML });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Starting Mockingbird');
    // The page must poll /api/status so it can auto-advance into the app.
    expect(res.body).toContain('/api/status');
    await app.close();
    app = null;
  });

  it('does not intercept /api/* requests', async () => {
    app = makeApp(new ReadinessState());
    const res = await app.inject({ method: 'GET', url: '/api/status', headers: HTML });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ state: 'initializing' });
  });

  it('does not intercept fetch/XHR requests (no text/html in Accept)', async () => {
    app = makeApp(new ReadinessState());
    const res = await app.inject({ method: 'GET', url: '/', headers: JSON_ACCEPT });
    expect(res.json()).toEqual({ passthrough: true });
  });

  it('does not intercept static asset requests', async () => {
    app = makeApp(new ReadinessState());
    const js = await app.inject({ method: 'GET', url: '/assets/app-abc123.js', headers: HTML });
    expect(js.json()).toEqual({ passthrough: true });
    const ico = await app.inject({ method: 'GET', url: '/favicon.ico', headers: HTML });
    expect(ico.json()).toEqual({ passthrough: true });
  });

  it('passes through once the engine is ready', async () => {
    const readiness = new ReadinessState();
    readiness.markReady();
    app = makeApp(readiness);
    const res = await app.inject({ method: 'GET', url: '/', headers: HTML });
    expect(res.json()).toEqual({ passthrough: true });
  });

  it('passes through in no-project state (SPA shows the first-run wizard)', async () => {
    const readiness = new ReadinessState();
    readiness.markNoProject();
    app = makeApp(readiness);
    const res = await app.inject({ method: 'GET', url: '/', headers: HTML });
    expect(res.json()).toEqual({ passthrough: true });
  });

  it('still serves the splash when startup errored (so users see the failure, not Bad Gateway)', async () => {
    const readiness = new ReadinessState();
    readiness.markError(new Error('boom'));
    app = makeApp(readiness);
    const res = await app.inject({ method: 'GET', url: '/', headers: HTML });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Starting Mockingbird');
  });
});
