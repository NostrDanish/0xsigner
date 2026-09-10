/**
 * Signer runtime core — dependency-free primitives that ship inside the
 * generated Cloudflare Worker.
 *
 * IMPORTANT: this file is serialized verbatim into the worker by
 * `generator.ts`. It must therefore:
 *   - have NO imports,
 *   - use NO Node/DOM-only APIs (Worker runtime only),
 *   - avoid `any` (it is type-checked with the rest of the project).
 *
 * The `SignerManifest` type is structurally duplicated here (rather than
 * imported) so the generated worker stays a single self-contained module.
 */

/* ------------------------------------------------------------------ */
/* Minimal manifest typing (structural mirror of manifest.ts)         */
/* ------------------------------------------------------------------ */

export interface RuntimeManifest {
  version: '1';
  app: string;
  security: {
    allowedOrigins: string[];
    publicAuth: { type: 'none' } | { type: 'api-key'; secretName: string } | { type: 'nip98' };
    internalMode: boolean;
  };
  limits: {
    default: RateRule;
    perRoute: Record<string, RateRule>;
  };
  privacy: { mode: 'standard' | 'privacy' | 'maximum' };
  routes: Record<string, string>;
  providers: Record<string, Record<string, unknown>>;
}

export interface RateRule {
  keyBy: 'ip' | 'api-key' | 'header' | 'nostr-pubkey';
  headerName?: string;
  requestsPerMinute: number;
}

export type WorkerEnv = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Standard error model — never leak internals                        */
/* ------------------------------------------------------------------ */

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'SSRF_BLOCKED'
  | 'PAYLOAD_TOO_LARGE'
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'INTERNAL';

export function errorBody(code: ErrorCode, message: string, requestId: string): string {
  return JSON.stringify({ error: { code, message, requestId } });
}

export function makeRequestId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/* ------------------------------------------------------------------ */
/* CORS — reflect allowlisted origins only, never "*" unless public   */
/* ------------------------------------------------------------------ */

export function corsAllowOrigin(request: Request, allowed: string[]): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null; // same-origin / non-browser
  if (allowed.includes('*')) return '*';
  return allowed.includes(origin) ? origin : null;
}

export function applyCors(headers: Headers, request: Request, allowed: string[]): void {
  const allow = corsAllowOrigin(request, allowed);
  if (allow) {
    headers.set('Access-Control-Allow-Origin', allow);
    headers.append('Vary', 'Origin');
  }
}

export function handlePreflight(request: Request, allowed: string[]): Response {
  const allow = corsAllowOrigin(request, allowed);
  if (!allow) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allow,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  });
}

export function jsonResponse(
  data: unknown,
  status: number,
  request: Request,
  allowed: string[],
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  applyCors(headers, request, allowed);
  return new Response(JSON.stringify(data), { status, headers });
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  request: Request,
  allowed: string[],
  requestId: string,
  retryAfterSeconds?: number,
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  applyCors(headers, request, allowed);
  if (retryAfterSeconds !== undefined) headers.set('Retry-After', String(retryAfterSeconds));
  return new Response(errorBody(code, message, requestId), { status, headers });
}

/* ------------------------------------------------------------------ */
/* Public gateway auth (distinct from upstream provider secrets)      */
/* ------------------------------------------------------------------ */

export function checkPublicAuth(
  request: Request,
  manifest: RuntimeManifest,
  env: WorkerEnv,
): boolean {
  const auth = manifest.security.publicAuth;
  if (auth.type === 'none') return true;
  if (auth.type === 'nip98') return true; // structural NIP-98 check is per-route; presence-only here
  const expected = env[auth.secretName];
  if (typeof expected !== 'string' || expected.length === 0) return false;
  const header = request.headers.get('Authorization') ?? '';
  const apiKey = request.headers.get('X-API-Key') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  return bearer === expected || apiKey === expected;
}

/* ------------------------------------------------------------------ */
/* Rate limiting (best-effort per isolate; upgrade path: CF binding)  */
/* ------------------------------------------------------------------ */

const buckets = new Map<string, { count: number; resetAt: number }>();

export function identityKey(request: Request, rule: RateRule): string {
  switch (rule.keyBy) {
    case 'api-key':
      return `k:${request.headers.get('X-API-Key') ?? request.headers.get('Authorization') ?? 'anon'}`;
    case 'header':
      return `h:${rule.headerName ?? ''}:${request.headers.get(rule.headerName ?? '') ?? 'anon'}`;
    case 'nostr-pubkey':
      return `n:${request.headers.get('X-Nostr-Pubkey') ?? 'anon'}`;
    case 'ip':
    default:
      return `i:${request.headers.get('CF-Connecting-IP') ?? 'anon'}`;
  }
}

/** Returns seconds until reset if limited, else 0. */
export function rateLimit(request: Request, rule: RateRule, routePath: string): number {
  const key = `${routePath}|${identityKey(request, rule)}`;
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    if (buckets.size > 10_000) buckets.clear();
    return 0;
  }
  entry.count++;
  if (entry.count > rule.requestsPerMinute) {
    return Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* SSRF guard — validate crawl/fetch targets                          */
/* ------------------------------------------------------------------ */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  const inRange = (base: string, bits: number): boolean => {
    const b = ipv4ToInt(base);
    if (b === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  };
  return (
    inRange('127.0.0.0', 8) ||
    inRange('10.0.0.0', 8) ||
    inRange('172.16.0.0', 12) ||
    inRange('192.168.0.0', 16) ||
    inRange('169.254.0.0', 16) ||
    inRange('100.64.0.0', 10) ||
    inRange('0.0.0.0', 8)
  );
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'instance-data',
  'metadata',
]);

export interface SsrfCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a user-supplied target URL (crawler / tor fetch). Blocks
 * localhost, private/link-local IPs, and cloud-metadata hostnames unless
 * the deployment explicitly enables internalMode.
 */
export function checkTargetUrl(raw: string, internalMode: boolean): SsrfCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'Target must be a valid URL' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'Target must be http(s)' };
  }
  const host = url.hostname.toLowerCase();
  if (internalMode) return { ok: true };

  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.internal') || host.endsWith('.local')) {
    return { ok: false, reason: 'Target host is blocked' };
  }
  if (isPrivateIpv4(host)) return { ok: false, reason: 'Target IP is private/reserved' };
  if (host === '::1' || host.startsWith('[')) {
    // IPv6 literal: conservative — only allow if clearly global. Block ULA/loopback/link-local.
    const bare = host.replace(/[[\]]/g, '');
    if (bare === '::1' || bare.startsWith('fe80') || bare.startsWith('fc') || bare.startsWith('fd')) {
      return { ok: false, reason: 'Target IPv6 is private/reserved' };
    }
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('INVALID_JSON');
  }
}

export function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function getSecret(env: WorkerEnv, name: string): string | undefined {
  const v = env[name];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
