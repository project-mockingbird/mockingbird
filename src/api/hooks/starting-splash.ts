// src/api/hooks/starting-splash.ts
//
// Cold-start splash. On a fresh boot the HTTP listener binds before the engine
// finishes loading the registry + indexing the tree (see src/api/index.ts).
// During that window a reverse proxy in front of Mockingbird would otherwise
// forward requests to a live-but-not-ready server; without this hook the
// browser sees an empty/404 page. This hook intercepts top-level browser
// navigations and returns a self-contained "Starting Mockingbird" page that
// polls /api/status and reloads into the real SPA once the engine is ready.
//
// Scope is deliberately narrow:
//   - Only while readiness is NOT ready and NOT no-project (i.e. 'initializing'
//     or 'error'). 'no-project' is a valid resting state (the SPA shows the
//     first-run wizard), so it falls through.
//   - Only GET/HEAD navigations whose Accept includes text/html. The SPA's own
//     /api/status poll uses fetch (application/json) and is never intercepted.
//   - Never /api/*, /sitecore/*, /ws, /-/media, /-/jssmedia, or static assets.
//
// Returns 200 (not 503) on purpose: a 503 from the upstream can be swallowed
// and replaced by a proxy's own error page (defeating the whole point). A 200
// with a no-store body passes through any proxy untouched.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { MOCKINGBIRD_LOGO_DATA_URI } from './mockingbird-logo.js';

/** Minimal readiness surface the hook needs. Satisfied by ReadinessState. */
export interface ReadinessLike {
  isReady(): boolean;
  isNoProject(): boolean;
}

// Request path prefixes that must never be turned into the splash page. These
// mirror the SPA-fallback block-list in src/api/server.ts's notFoundHandler.
const PASSTHROUGH_PREFIXES = ['/api/', '/sitecore/', '/ws', '/-/media', '/-/jssmedia'];

export function registerStartingSplash(app: FastifyInstance, readiness: ReadinessLike): void {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    // Ready / no-project boots serve the real app.
    if (readiness.isReady() || readiness.isNoProject()) return;

    if (req.method !== 'GET' && req.method !== 'HEAD') return;

    const path = req.url.split('?')[0];
    for (const prefix of PASSTHROUGH_PREFIXES) {
      if (path === prefix || path.startsWith(prefix)) return;
    }

    // Only real browser navigations ask for HTML. fetch/XHR (the status poll)
    // and most asset loads do not, so they fall through to their real handlers.
    const accept = req.headers.accept ?? '';
    if (!accept.includes('text/html')) return;

    if (isStaticAsset(path)) return;

    reply
      .code(200)
      .header('Cache-Control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(SPLASH_HTML);
  });
}

/**
 * A concrete static asset (Vite's hashed `/assets/*` bundles, or any path whose
 * final segment carries a file extension like `.js` / `.css` / `.ico`). Client
 * route paths have no extension, so this only ever excludes real files.
 */
function isStaticAsset(path: string): boolean {
  if (path.startsWith('/assets/')) return true;
  const last = path.slice(path.lastIndexOf('/') + 1);
  return last.includes('.');
}

const SPLASH_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Starting Mockingbird...</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0b0d10; color: #e6e8eb;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .card { width: min(90vw, 420px); text-align: center; padding: 32px; }
  .logo { width: 76px; height: 76px; display: inline-block; animation: pulse 1.7s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { transform: scale(1); opacity: .85 } 50% { transform: scale(1.09); opacity: 1 } }
  h1 { font-size: 20px; font-weight: 600; margin: 20px 0 6px; letter-spacing: .2px; }
  .sub { color: #9aa2ab; font-size: 13px; min-height: 18px; font-variant-numeric: tabular-nums; }
  .sub.err { color: #f87171; }
  .bar { margin-top: 18px; height: 6px; border-radius: 999px; background: #1c2128; overflow: hidden; }
  .bar.hidden { display: none; }
  .fill { height: 100%; width: 0%; border-radius: 999px; background: linear-gradient(90deg, #ff6a2a, #ff9a5a); transition: width .4s ease; }
  .bar.indeterminate .fill { width: 35%; animation: slide 1.15s ease-in-out infinite; }
  @keyframes slide { 0% { margin-left: -35% } 100% { margin-left: 100% } }
</style>
</head>
<body>
  <div class="card">
    <img class="logo" width="76" height="76" alt="Mockingbird" src="${MOCKINGBIRD_LOGO_DATA_URI}">
    <h1>Starting Mockingbird...</h1>
    <div class="sub" id="sub">Warming up</div>
    <div class="bar indeterminate" id="bar"><div class="fill" id="fill"></div></div>
  </div>
<script>
(function () {
  var sub = document.getElementById('sub');
  var bar = document.getElementById('bar');
  var fill = document.getElementById('fill');
  function fmt(n) { try { return (n || 0).toLocaleString(); } catch (e) { return String(n || 0); } }
  function schedule() { setTimeout(poll, 1000); }
  function poll() {
    fetch('/api/status', { cache: 'no-store', headers: { accept: 'application/json' } })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s) { schedule(); return; }
        if (s.state === 'ready' || s.state === 'no-project') { location.reload(); return; }
        if (s.state === 'error') {
          bar.className = 'bar hidden';
          sub.className = 'sub err';
          sub.textContent = 'Startup failed: ' + (s.error || 'unknown error');
          return;
        }
        var p = s.progress;
        if (p && p.total > 0) {
          var pct = Math.min(100, Math.floor((p.scanned / p.total) * 100));
          bar.className = 'bar';
          fill.style.width = pct + '%';
          sub.textContent = 'Indexing ' + fmt(p.scanned) + ' / ' + fmt(p.total) + '  (' + pct + '%)';
        } else {
          sub.textContent = 'Warming up';
        }
        schedule();
      })
      .catch(function () { schedule(); });
  }
  poll();
})();
</script>
</body>
</html>`;
