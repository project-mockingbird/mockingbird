import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Engine } from '../../engine/index.js';
import { resolveSiteForRequest, type SiteDefinition } from '../../engine/sites/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    site: SiteDefinition | null;
  }
}

/**
 * Decorate every Fastify request with `request.site`, resolved per Sitecore's
 * SiteContextResolver layered precedence: `?site=` query param, then `Host:`
 * header match, then synthetic-fallback from `envFallback` (typically the
 * `SITE_ROOT_PATH` env var). Hook runs as `onRequest`, so
 * `request.site` is populated before any route handler or Mercurius context
 * builder runs.
 *
 * `envFallback` is the path string the operator set in
 * `SITE_ROOT_PATH` (or empty when not set).
 */
export function registerSiteContextHook(
  app: FastifyInstance,
  engine: Engine,
  envFallback: string,
): void {
  app.decorateRequest('site', null);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    const rawSite = (req.query as { site?: string | string[] } | undefined)?.site;
    const queryParamSite = Array.isArray(rawSite) ? rawSite[0] : rawSite;
    const hostHeader = req.headers.host ?? '';
    req.site = resolveSiteForRequest({
      engine,
      siteArg: queryParamSite,
      host: hostHeader,
      envFallback,
    });
  });
}
