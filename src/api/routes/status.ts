import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';
import type { SessionManager } from '../../spe/host/session-manager.js';
import { getPhaseTimings } from '../../engine/index-timing.js';

// Default URL scheme for the "Open in editor" buttons in QuickInfo and the
// Raw YAML tab. VS Code understands `vscode://file/<absolute-path>`, accepts
// forward slashes on Windows, and is the editor most operators have
// installed. Override per-deployment via MOCKINGBIRD_EDITOR_URL_TEMPLATE
// if the team uses a different editor (e.g. `idea://open?file={path}`).
const DEFAULT_EDITOR_URL_TEMPLATE = 'vscode://file/{path}';

export function registerStatusRoute(
  app: FastifyInstance,
  engine: Engine,
  speManager?: SessionManager,
): void {
  app.get('/api/status', async () => {
    const speSnap = speManager?.state ?? null;
    return {
      state: engine.readiness.state,
      progress: engine.readiness.progress,
      error: engine.readiness.error?.message ?? null,
      itemCount: engine.readiness.isReady() ? engine.getAllItems().length : 0,
      registryLoaded: engine.isRegistryLoaded(),
      cacheStale: engine.isCacheStale(),
      editorUrlTemplate: process.env.MOCKINGBIRD_EDITOR_URL_TEMPLATE ?? DEFAULT_EDITOR_URL_TEMPLATE,
      taco: process.env.TACO === '1',
      phaseTimings: getPhaseTimings().map((t) => ({
        label: t.label,
        durationMs: Math.round(t.durationMs * 100) / 100,
        ...(t.extras ? { extras: t.extras } : {}),
      })),
      speState: speSnap?.state ?? null,
      speError: speSnap?.error ?? null,
      speStartedAt: speSnap?.startedAt ?? null,
      speReadyAt: speSnap?.readyAt ?? null,
    };
  });
}
