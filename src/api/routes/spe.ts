// src/api/routes/spe.ts
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { FastifyRequest } from 'fastify';
import type { SessionManager } from '../../spe/host/session-manager.js';

export function registerSpeRoutes(app: FastifyInstance, manager: SessionManager): void {
  app.post('/api/spe/sessions', async (_request, reply) => {
    // Warmup-window gate: when the eager primer hasn't reported ready yet,
    // return 425 Too Early so callers (the /scripts page, smoke probes)
    // poll instead of paying a 10-30s cold spawn on each request.
    const speState = manager.state;
    if (speState.state === 'starting') {
      return reply
        .status(425)
        .header('Retry-After', '5')
        .send({
          error: 'SPE host is warming up; retry after Retry-After seconds.',
          speState: speState.state,
          statusCode: 425,
        });
    }
    try {
      const info = await manager.create();
      return reply.status(201).send(info);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('max sessions') ? 503 : 500;
      return reply.status(status).send({ error: msg, statusCode: status });
    }
  });

  app.post('/api/spe/sessions/:id/execute', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { script?: string; applyMode?: boolean } | undefined;
    if (!body || typeof body.script !== 'string' || body.script.length === 0) {
      return reply.status(400).send({ error: 'script is required', statusCode: 400 });
    }
    const result = manager.execute(id, { script: body.script, applyMode: body.applyMode === true });
    if ('error' in result) {
      const status = result.error === 'session-not-found' ? 404 : 409;
      return reply.status(status).send({ error: result.error, statusCode: status });
    }
    return reply.status(202).send(result);
  });

  app.post('/api/spe/sessions/:id/abort', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!manager.get(id)) {
      return reply.status(404).send({ error: 'session-not-found', statusCode: 404 });
    }
    const aborted = await manager.abort(id);
    return { aborted };
  });

  app.delete('/api/spe/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!manager.get(id)) {
      return reply.status(404).send({ error: 'session-not-found', statusCode: 404 });
    }
    await manager.dispose(id, 'explicit');
    return reply.status(204).send();
  });

  // WebSocket: server-push only. Replays the recent frame buffer on connect.
  // The `socket` parameter is the underlying ws.WebSocket (NOT a SocketStream
  // wrapper) per @fastify/websocket v10+ contract. If that package is upgraded
  // and changes the handler signature, this typing will need adjustment.
  app.get(
    '/api/spe/sessions/:id/stream',
    { websocket: true },
    (socket: WebSocket, request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const sub = manager.subscribe(id, (frame) => {
        try { socket.send(JSON.stringify(frame)); } catch { /* socket closed */ }
      });
      if (!sub) {
        socket.close(1011, 'session-not-found');
        return;
      }
      // Replay recent frames
      for (const frame of sub.replay) {
        try { socket.send(JSON.stringify(frame)); } catch { /* */ }
      }
      socket.on('close', () => sub.unsubscribe());
    }
  );
}
