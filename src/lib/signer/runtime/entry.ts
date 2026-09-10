/**
 * Worker entry — the single default-export fetch handler. Serialized into
 * the generated module. The MANIFEST placeholder is replaced with the
 * serialized (non-secret) manifest at generation time.
 */

import {
  applyCors,
  checkPublicAuth,
  errorResponse,
  handlePreflight,
  jsonResponse,
  makeRequestId,
  rateLimit,
  type RuntimeManifest,
  type WorkerEnv,
} from './core';
import { dispatchProvider, healthCheckProvider, type HealthItem } from './providers';

// Injected by generator.ts (string replace). Keep this exact marker.
declare const MANIFEST: RuntimeManifest;

function publicStatus(env: WorkerEnv): Record<string, unknown> {
  const providers: Record<string, unknown> = {};
  for (const [id, cfg] of Object.entries(MANIFEST.providers)) {
    const c = cfg as Record<string, unknown>;
    const secretName =
      (typeof c.secretName === 'string' ? c.secretName : undefined) ??
      (typeof (c.auth as Record<string, unknown> | undefined)?.secretName === 'string'
        ? ((c.auth as Record<string, unknown>).secretName as string)
        : undefined);
    providers[id] = {
      type: c.type,
      configured: secretName ? typeof env[secretName] === 'string' && (env[secretName] as string).length > 0 : true,
    };
  }
  return {
    app: MANIFEST.app,
    runtimeVersion: MANIFEST.version,
    routes: Object.keys(MANIFEST.routes),
    providers,
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const allowed = MANIFEST.security.allowedOrigins;
    const requestId = makeRequestId();

    try {
      if (path.startsWith('/api/') && request.method === 'OPTIONS') {
        return handlePreflight(request, allowed);
      }

      // Built-in status endpoint — never leaks secrets.
      if (path === '/api/status' && request.method === 'GET') {
        return jsonResponse(publicStatus(env), 200, request, allowed);
      }

      // Built-in health endpoint — probes each provider's reachability.
      if (path === '/api/health' && request.method === 'GET') {
        const checks: HealthItem[] = [];
        for (const [id, cfg] of Object.entries(MANIFEST.providers)) {
          const c = cfg as Record<string, unknown>;
          checks.push(await healthCheckProvider(id, String(c.type), c, env));
        }
        const ok = checks.every((c) => c.ok);
        return jsonResponse({ ok, checks }, ok ? 200 : 207, request, allowed);
      }

      const providerId = MANIFEST.routes[path];
      if (!providerId) {
        return errorResponse('NOT_FOUND', 'Unknown route', 404, request, allowed, requestId);
      }
      const cfg = MANIFEST.providers[providerId];
      if (!cfg) {
        return errorResponse('CONFIGURATION_ERROR', 'Route has no provider', 500, request, allowed, requestId);
      }

      // Public gateway auth (separate from upstream provider secrets).
      if (!checkPublicAuth(request, MANIFEST, env)) {
        return errorResponse('UNAUTHORIZED', 'Valid credentials required', 401, request, allowed, requestId);
      }

      // Rate limit: route-specific rule wins, else the default.
      const rule = MANIFEST.limits.perRoute[path] ?? MANIFEST.limits.default;
      const retryAfter = rateLimit(request, rule, path);
      if (retryAfter > 0) {
        return errorResponse('RATE_LIMITED', 'Too many requests', 429, request, allowed, requestId, retryAfter);
      }

      const result = await dispatchProvider(String(cfg.type), {
        request,
        env,
        manifest: MANIFEST,
        allowed,
        requestId,
      }, cfg);
      // Ensure CORS header present even if a provider built its own response.
      applyCors(result.response.headers, request, allowed);
      return result.response;
    } catch {
      // Deliberately opaque: internal errors must not leak config details.
      return errorResponse('INTERNAL', 'Internal error', 500, request, allowed, requestId);
    }
  },
};
