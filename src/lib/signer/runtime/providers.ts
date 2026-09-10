/**
 * Provider adapters — one per ProviderType. Serialized into the generated
 * Worker, so: no imports of local files, no `any`, Worker-runtime APIs only.
 *
 * Every adapter receives the validated request plus the full env and reads
 * its secret ONLY from env (env.BRAVE_API_KEY etc.) — never from config.
 */

import {
  asString,
  checkTargetUrl,
  getSecret,
  jsonResponse,
  errorResponse,
  readJsonBody,
  type RuntimeManifest,
  type WorkerEnv,
} from './core';

export interface ProviderResult {
  response: Response;
}

export interface ProviderContext {
  request: Request;
  env: WorkerEnv;
  manifest: RuntimeManifest;
  allowed: string[]; // CORS origins
  requestId: string;
}

type Cfg = Record<string, unknown>;

const MAX_BODY = 256 * 1024; // 256 KB default cap on inbound JSON

function unavailable(ctx: ProviderContext, what: string): ProviderResult {
  return {
    response: errorResponse(
      'CONFIGURATION_ERROR',
      `${what} is not configured on this deployment`,
      503,
      ctx.request,
      ctx.allowed,
      ctx.requestId,
    ),
  };
}

async function safeJson(upstream: Response): Promise<unknown> {
  try {
    return await upstream.json();
  } catch {
    return { ok: false };
  }
}

/** Map an upstream status to a client-safe message (never the raw body). */
function upstreamMessage(status: number, label: string): string {
  if (status === 401 || status === 403) return `${label} credential was rejected`;
  if (status === 402) return `${label} credit balance is exhausted`;
  if (status === 429) return `${label} is rate-limited right now`;
  if (status >= 500) return `${label} is temporarily unavailable`;
  return `${label} rejected the request (HTTP ${status})`;
}

/* ------------------------------------------------------------------ */
/* Brave Search                                                        */
/* ------------------------------------------------------------------ */

async function braveHandle(ctx: ProviderContext, cfg: Cfg): Promise<ProviderResult> {
  const key = getSecret(ctx.env, asString(cfg.secretName) ?? 'BRAVE_API_KEY');
  if (!key) return unavailable(ctx, 'Brave Search');

  let body: unknown;
  try {
    body = await readJsonBody(ctx.request, MAX_BODY);
  } catch (e) {
    return { response: errorResponse(e instanceof Error && e.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST', 'Body must be JSON', 400, ctx.request, ctx.allowed, ctx.requestId) };
  }
  const raw = (body ?? {}) as Record<string, unknown>;
  const q = asString(raw.q)?.trim();
  if (!q) return { response: errorResponse('INVALID_REQUEST', 'q must be a non-empty string', 400, ctx.request, ctx.allowed, ctx.requestId) };
  if (q.length > 500) return { response: errorResponse('INVALID_REQUEST', 'q is too long', 400, ctx.request, ctx.allowed, ctx.requestId) };

  let count = 20;
  if (raw.count !== undefined) {
    const n = Number(raw.count);
    if (!Number.isFinite(n) || n <= 0) return { response: errorResponse('INVALID_REQUEST', 'count must be positive', 400, ctx.request, ctx.allowed, ctx.requestId) };
    count = Math.min(Math.floor(n), 20);
  }
  const search_lang = asString(raw.search_lang);
  if (search_lang !== undefined && !/^[a-z]{2}$/.test(search_lang)) {
    return { response: errorResponse('INVALID_REQUEST', 'search_lang must be a 2-letter code', 400, ctx.request, ctx.allowed, ctx.requestId) };
  }

  const params = new URLSearchParams({ q, count: String(count), text_decorations: '0' });
  if (search_lang) params.set('search_lang', search_lang);
  const url = `https://api.search.brave.com/res/v1/web/search?${params}`;

  const upstream = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);

  if (!upstream) return { response: errorResponse('PROVIDER_UNAVAILABLE', 'Brave Search unreachable', 502, ctx.request, ctx.allowed, ctx.requestId) };
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => undefined);
    return { response: errorResponse('UPSTREAM_ERROR', upstreamMessage(upstream.status, 'Brave Search'), upstream.status === 429 ? 429 : 502, ctx.request, ctx.allowed, ctx.requestId) };
  }
  return { response: jsonResponse(await safeJson(upstream), 200, ctx.request, ctx.allowed) };
}

/* ------------------------------------------------------------------ */
/* OpenAI-compatible AI                                                */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function applySystemPrompt(messages: ChatMessage[], prompt: string): ChatMessage[] {
  if (!prompt) return messages;
  return [{ role: 'system', content: prompt }, ...messages.filter((m) => m.role !== 'system')];
}

async function openaiHandle(ctx: ProviderContext, cfg: Cfg): Promise<ProviderResult> {
  const key = getSecret(ctx.env, asString(cfg.secretName) ?? 'OPENAI_API_KEY');
  if (!key) return unavailable(ctx, 'Engine AI');
  const endpoint = (asString(cfg.endpoint) ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = asString(cfg.model) ?? 'gpt-4o-mini';
  const systemPrompt = asString(cfg.systemPrompt) ?? '';
  const maxTokensCap = typeof cfg.maxTokens === 'number' ? cfg.maxTokens : 2000;
  const temperature = typeof cfg.temperature === 'number' ? cfg.temperature : undefined;
  const allowlist = Array.isArray(cfg.modelAllowlist) ? (cfg.modelAllowlist as unknown[]).filter((m): m is string => typeof m === 'string') : [];

  let body: unknown;
  try {
    body = await readJsonBody(ctx.request, MAX_BODY);
  } catch (e) {
    return { response: errorResponse(e instanceof Error && e.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST', 'Body must be JSON', 400, ctx.request, ctx.allowed, ctx.requestId) };
  }
  const raw = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(raw.messages) || raw.messages.length === 0 || raw.messages.length > 20) {
    return { response: errorResponse('INVALID_REQUEST', 'messages must be a non-empty array (max 20)', 400, ctx.request, ctx.allowed, ctx.requestId) };
  }
  const messages: ChatMessage[] = [];
  let total = 0;
  for (const m of raw.messages) {
    if (!m || typeof m !== 'object') return { response: errorResponse('INVALID_REQUEST', 'each message must be an object', 400, ctx.request, ctx.allowed, ctx.requestId) };
    const r = m as Record<string, unknown>;
    if (r.role !== 'system' && r.role !== 'user' && r.role !== 'assistant') return { response: errorResponse('INVALID_REQUEST', 'invalid message role', 400, ctx.request, ctx.allowed, ctx.requestId) };
    if (typeof r.content !== 'string' || r.content.length === 0) return { response: errorResponse('INVALID_REQUEST', 'message content must be a string', 400, ctx.request, ctx.allowed, ctx.requestId) };
    if (r.content.length > 24_000) return { response: errorResponse('INVALID_REQUEST', 'message content too long', 400, ctx.request, ctx.allowed, ctx.requestId) };
    total += r.content.length;
    messages.push({ role: r.role, content: r.content });
  }
  if (total > 64_000) return { response: errorResponse('INVALID_REQUEST', 'request too large', 400, ctx.request, ctx.allowed, ctx.requestId) };

  // Server controls the model; client may only pick from an explicit allowlist.
  let chosenModel = model;
  const requestedModel = asString(raw.model);
  if (requestedModel && allowlist.includes(requestedModel)) chosenModel = requestedModel;

  let maxTokens = 1200;
  if (raw.max_tokens !== undefined) {
    const n = Number(raw.max_tokens);
    if (Number.isFinite(n) && n > 0) maxTokens = Math.min(Math.floor(n), maxTokensCap);
  }

  const upstreamBody: Record<string, unknown> = {
    model: chosenModel,
    messages: applySystemPrompt(messages, systemPrompt),
    max_completion_tokens: maxTokens,
  };
  if (temperature !== undefined) upstreamBody.temperature = temperature;

  const upstream = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(upstreamBody),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);

  if (!upstream) return { response: errorResponse('PROVIDER_UNAVAILABLE', 'AI provider unreachable', 502, ctx.request, ctx.allowed, ctx.requestId) };
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => undefined);
    return { response: errorResponse('UPSTREAM_ERROR', upstreamMessage(upstream.status, 'AI provider'), upstream.status === 429 ? 429 : 502, ctx.request, ctx.allowed, ctx.requestId) };
  }
  return { response: jsonResponse(await safeJson(upstream), 200, ctx.request, ctx.allowed) };
}

/* ------------------------------------------------------------------ */
/* Generic REST (fixed endpoint; never a browser-controlled URL)       */
/* ------------------------------------------------------------------ */

const NEVER_FORWARD = new Set(['authorization', 'cookie', 'x-api-key', 'cf-access-token', 'host', 'content-length', 'connection']);

async function genericRestHandle(ctx: ProviderContext, cfg: Cfg): Promise<ProviderResult> {
  const endpoint = asString(cfg.endpoint);
  if (!endpoint) return unavailable(ctx, 'Upstream API');
  const method = (asString(cfg.method) ?? 'GET').toUpperCase();
  const upstreamPath = asString(cfg.upstreamPath) ?? '';
  const forwardQuery = Array.isArray(cfg.forwardQuery) ? (cfg.forwardQuery as unknown[]).filter((q): q is string => typeof q === 'string') : [];
  const forwardHeaders = Array.isArray(cfg.forwardHeaders) ? (cfg.forwardHeaders as unknown[]).filter((h): h is string => typeof h === 'string') : [];

  if (ctx.request.method !== method) {
    return { response: errorResponse('METHOD_NOT_ALLOWED', `Use ${method} for this route`, 405, ctx.request, ctx.allowed, ctx.requestId) };
  }

  // Build the upstream URL from the FIXED config endpoint only.
  const base = endpoint.replace(/\/$/, '');
  const url = new URL(`${base}${upstreamPath}`);
  const incoming = new URL(ctx.request.url);
  for (const key of forwardQuery) {
    const v = incoming.searchParams.get(key);
    if (v !== null) url.searchParams.set(key, v);
  }

  const headers = new Headers();
  for (const name of forwardHeaders) {
    const lower = name.toLowerCase();
    if (NEVER_FORWARD.has(lower)) continue;
    const v = ctx.request.headers.get(name);
    if (v !== null) headers.set(name, v);
  }

  // Attach the configured upstream credential from env.
  const auth = (cfg.auth ?? { type: 'none' }) as Record<string, unknown>;
  const authType = asString(auth.type) ?? 'none';
  const secretName = asString(auth.secretName);
  const secret = secretName ? getSecret(ctx.env, secretName) : undefined;
  if (authType !== 'none' && !secret) return unavailable(ctx, 'Upstream credential');
  if (authType === 'bearer' && secret) headers.set('Authorization', `Bearer ${secret}`);
  else if (authType === 'header' && secret) headers.set(asString(auth.name) ?? 'X-API-Key', secret);
  else if (authType === 'basic' && secret) headers.set('Authorization', `Basic ${btoa(secret)}`);

  let bodyInit: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      const parsed = await readJsonBody(ctx.request, MAX_BODY);
      bodyInit = JSON.stringify(parsed ?? {});
      headers.set('Content-Type', 'application/json');
    } catch {
      bodyInit = undefined;
    }
  }

  const upstream = await fetch(url.toString(), {
    method,
    headers,
    body: bodyInit,
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);

  if (!upstream) return { response: errorResponse('PROVIDER_UNAVAILABLE', 'Upstream API unreachable', 502, ctx.request, ctx.allowed, ctx.requestId) };
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => undefined);
    return { response: errorResponse('UPSTREAM_ERROR', upstreamMessage(upstream.status, 'Upstream API'), upstream.status === 429 ? 429 : 502, ctx.request, ctx.allowed, ctx.requestId) };
  }
  return { response: jsonResponse(await safeJson(upstream), 200, ctx.request, ctx.allowed) };
}

/* ------------------------------------------------------------------ */
/* IP / GEO                                                            */
/* ------------------------------------------------------------------ */

async function ipGeoHandle(ctx: ProviderContext, cfg: Cfg): Promise<ProviderResult> {
  const endpoint = (asString(cfg.endpoint) ?? 'https://ipinfo.io').replace(/\/$/, '');
  const pathSuffix = asString(cfg.pathSuffix) ?? '/json';
  const auth = (cfg.auth ?? { type: 'none' }) as Record<string, unknown>;
  const authType = asString(auth.type) ?? 'none';

  const incoming = new URL(ctx.request.url);
  // Default to the caller's own IP; allow an explicit ?ip= override.
  let target = incoming.searchParams.get('ip') ?? ctx.request.headers.get('CF-Connecting-IP') ?? '';
  target = target.trim();
  if (target && !/^[\d.:a-fA-F]{2,45}$/.test(target)) {
    return { response: errorResponse('INVALID_REQUEST', 'invalid ip', 400, ctx.request, ctx.allowed, ctx.requestId) };
  }

  const url = new URL(`${endpoint}/${encodeURIComponent(target)}${pathSuffix}`);
  const headers = new Headers({ Accept: 'application/json' });
  const secretName = asString(auth.secretName);
  const secret = secretName ? getSecret(ctx.env, secretName) : undefined;
  if (authType === 'bearer') {
    if (!secret) return unavailable(ctx, 'IP-geo credential');
    headers.set('Authorization', `Bearer ${secret}`);
  } else if (authType === 'query') {
    if (!secret) return unavailable(ctx, 'IP-geo credential');
    url.searchParams.set(asString(auth.name) ?? 'token', secret);
  }

  const upstream = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!upstream) return { response: errorResponse('PROVIDER_UNAVAILABLE', 'IP-geo provider unreachable', 502, ctx.request, ctx.allowed, ctx.requestId) };
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => undefined);
    return { response: errorResponse('UPSTREAM_ERROR', upstreamMessage(upstream.status, 'IP-geo provider'), 502, ctx.request, ctx.allowed, ctx.requestId) };
  }
  return { response: jsonResponse(await safeJson(upstream), 200, ctx.request, ctx.allowed) };
}

/* ------------------------------------------------------------------ */
/* Indexer (SIP-01 / generic)                                          */
/* ------------------------------------------------------------------ */

async function indexerHandle(ctx: ProviderContext, cfg: Cfg): Promise<ProviderResult> {
  const endpoint = asString(cfg.endpoint);
  if (!endpoint) return unavailable(ctx, 'Indexer');
  const searchPath = asString(cfg.searchPath) ?? '/search';
  const auth = (cfg.auth ?? { type: 'none' }) as Record<string, unknown>;

  const incoming = new URL(ctx.request.url);
  const q = incoming.searchParams.get('q') ?? incoming.searchParams.get('query') ?? '';
  const url = new URL(`${endpoint.replace(/\/$/, '')}${searchPath}`);
  // Forward a conservative set of SIP-01-style operators.
  const FORWARD = ['q', 'query', 'site', 'domain', 'url', 'title', 'topic', 'type', 'platform', 'category', 'network', 'country', 'mime', 'filetype', 'source', 'lang', 'before', 'after', 'limit', 'page'];
  if (q) url.searchParams.set('q', q);
  for (const key of FORWARD) {
    const v = incoming.searchParams.get(key);
    if (v !== null && key !== 'q' && key !== 'query') url.searchParams.set(key, v);
  }

  const headers = new Headers({ Accept: 'application/json' });
  if (asString(auth.type) === 'bearer') {
    const secret = asString(auth.secretName) ? getSecret(ctx.env, asString(auth.secretName)!) : undefined;
    if (!secret) return unavailable(ctx, 'Indexer credential');
    headers.set('Authorization', `Bearer ${secret}`);
  }

  const upstream = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!upstream) return { response: errorResponse('PROVIDER_UNAVAILABLE', 'Indexer unreachable', 502, ctx.request, ctx.allowed, ctx.requestId) };
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => undefined);
    return { response: errorResponse('UPSTREAM_ERROR', upstreamMessage(upstream.status, 'Indexer'), 502, ctx.request, ctx.allowed, ctx.requestId) };
  }
  return { response: jsonResponse(await safeJson(upstream), 200, ctx.request, ctx.allowed) };
}

/* ------------------------------------------------------------------ */
/* Crawler (SSRF-hardened)                                             */
/* ------------------------------------------------------------------ */

async function crawlerHandle(ctx: ProviderContext, cfg: Cfg): Promise<ProviderResult> {
  const endpoint = asString(cfg.endpoint);
  if (!endpoint) return unavailable(ctx, 'Crawler');
  const crawlPath = asString(cfg.crawlPath) ?? '/crawl';
  const maxPages = typeof cfg.maxPages === 'number' ? cfg.maxPages : 100;
  const allowedDomains = Array.isArray(cfg.allowedDomains) ? (cfg.allowedDomains as unknown[]).filter((d): d is string => typeof d === 'string') : [];
  const auth = (cfg.auth ?? { type: 'none' }) as Record<string, unknown>;

  let body: unknown;
  try {
    body = await readJsonBody(ctx.request, MAX_BODY);
  } catch (e) {
    return { response: errorResponse(e instanceof Error && e.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST', 'Body must be JSON', 400, ctx.request, ctx.allowed, ctx.requestId) };
  }
  const raw = (body ?? {}) as Record<string, unknown>;
  const target = asString(raw.url)?.trim();
  if (!target) return { response: errorResponse('INVALID_REQUEST', 'url is required', 400, ctx.request, ctx.allowed, ctx.requestId) };

  const check = checkTargetUrl(target, ctx.manifest.security.internalMode);
  if (!check.ok) return { response: errorResponse('SSRF_BLOCKED', check.reason ?? 'Target blocked', 400, ctx.request, ctx.allowed, ctx.requestId) };

  if (allowedDomains.length > 0) {
    let host = '';
    try {
      host = new URL(target).hostname.toLowerCase();
    } catch {
      host = '';
    }
    const ok = allowedDomains.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`));
    if (!ok) return { response: errorResponse('SSRF_BLOCKED', 'Domain is not on the crawl allowlist', 403, ctx.request, ctx.allowed, ctx.requestId) };
  }

  let pages = Math.min(Math.max(1, Number(raw.maxPages) || 1), maxPages);
  if (!Number.isFinite(pages)) pages = 1;

  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
  if (asString(auth.type) === 'bearer') {
    const secret = asString(auth.secretName) ? getSecret(ctx.env, asString(auth.secretName)!) : undefined;
    if (!secret) return unavailable(ctx, 'Crawler credential');
    headers.set('Authorization', `Bearer ${secret}`);
  }

  const upstream = await fetch(`${endpoint.replace(/\/$/, '')}${crawlPath}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url: target, maxPages: pages }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);

  if (!upstream) return { response: errorResponse('PROVIDER_UNAVAILABLE', 'Crawler unreachable', 502, ctx.request, ctx.allowed, ctx.requestId) };
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => undefined);
    return { response: errorResponse('UPSTREAM_ERROR', upstreamMessage(upstream.status, 'Crawler'), 502, ctx.request, ctx.allowed, ctx.requestId) };
  }
  return { response: jsonResponse(await safeJson(upstream), 200, ctx.request, ctx.allowed) };
}

/* ------------------------------------------------------------------ */
/* Tor gateway (Worker -> authenticated HTTPS gateway -> SOCKS/Tor)    */
/* ------------------------------------------------------------------ */

async function torGatewayHandle(ctx: ProviderContext, cfg: Cfg): Promise<ProviderResult> {
  const endpoint = asString(cfg.endpoint);
  if (!endpoint) return unavailable(ctx, 'Tor gateway');
  const fetchPath = asString(cfg.fetchPath) ?? '/v1/fetch';
  const allowClearnet = cfg.allowClearnet !== false;
  const token = getSecret(ctx.env, asString(cfg.secretName) ?? 'TOR_GATEWAY_TOKEN');
  if (!token) return unavailable(ctx, 'Tor gateway credential');

  let body: unknown;
  try {
    body = await readJsonBody(ctx.request, MAX_BODY);
  } catch (e) {
    return { response: errorResponse(e instanceof Error && e.message === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST', 'Body must be JSON', 400, ctx.request, ctx.allowed, ctx.requestId) };
  }
  const raw = (body ?? {}) as Record<string, unknown>;
  const target = asString(raw.url)?.trim();
  if (!target) return { response: errorResponse('INVALID_REQUEST', 'url is required', 400, ctx.request, ctx.allowed, ctx.requestId) };

  let host = '';
  try {
    host = new URL(target).hostname.toLowerCase();
  } catch {
    return { response: errorResponse('INVALID_REQUEST', 'url must be valid', 400, ctx.request, ctx.allowed, ctx.requestId) };
  }
  const isOnion = host.endsWith('.onion');
  if (!isOnion && !allowClearnet) {
    return { response: errorResponse('FORBIDDEN', 'Only .onion targets are allowed on this deployment', 403, ctx.request, ctx.allowed, ctx.requestId) };
  }
  // Always SSRF-check clearnet targets; .onion can't resolve to private IP from here.
  if (!isOnion) {
    const check = checkTargetUrl(target, ctx.manifest.security.internalMode);
    if (!check.ok) return { response: errorResponse('SSRF_BLOCKED', check.reason ?? 'Target blocked', 400, ctx.request, ctx.allowed, ctx.requestId) };
  }

  const upstream = await fetch(`${endpoint.replace(/\/$/, '')}${fetchPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url: target, method: asString(raw.method) ?? 'GET' }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);

  if (!upstream) return { response: errorResponse('PROVIDER_UNAVAILABLE', 'Tor gateway unreachable', 502, ctx.request, ctx.allowed, ctx.requestId) };
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => undefined);
    return { response: errorResponse('UPSTREAM_ERROR', upstreamMessage(upstream.status, 'Tor gateway'), 502, ctx.request, ctx.allowed, ctx.requestId) };
  }
  return { response: jsonResponse(await safeJson(upstream), 200, ctx.request, ctx.allowed) };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export async function dispatchProvider(
  type: string,
  ctx: ProviderContext,
  cfg: Cfg,
): Promise<ProviderResult> {
  switch (type) {
    case 'brave':
      return braveHandle(ctx, cfg);
    case 'openai':
      return openaiHandle(ctx, cfg);
    case 'generic-rest':
      return genericRestHandle(ctx, cfg);
    case 'ip-geo':
      return ipGeoHandle(ctx, cfg);
    case 'indexer':
      return indexerHandle(ctx, cfg);
    case 'crawler':
      return crawlerHandle(ctx, cfg);
    case 'tor-gateway':
      return torGatewayHandle(ctx, cfg);
    default:
      return { response: errorResponse('CONFIGURATION_ERROR', `Unknown provider type "${type}"`, 500, ctx.request, ctx.allowed, ctx.requestId) };
  }
}

/* ------------------------------------------------------------------ */
/* Health checks (used by the generated worker's /api/health AND by    */
/* the deploy UI's live probe via the deployed worker).                */
/* ------------------------------------------------------------------ */

export interface HealthItem {
  id: string;
  ok: boolean;
  detail: string;
  latencyMs?: number;
}

export async function healthCheckProvider(
  id: string,
  type: string,
  cfg: Cfg,
  env: WorkerEnv,
): Promise<HealthItem> {
  const started = Date.now();
  const fail = (detail: string): HealthItem => ({ id, ok: false, detail, latencyMs: Date.now() - started });

  const secretName = asString(cfg.secretName)
    ?? asString((cfg.auth as Record<string, unknown> | undefined)?.secretName);
  const secret = secretName ? getSecret(env, secretName) : undefined;
  const needsSecret = type !== 'generic-rest' || asString((cfg.auth as Cfg | undefined)?.type) !== 'none';
  if (needsSecret && secretName && !secret) return fail(`secret ${secretName} is not set`);

  try {
    switch (type) {
      case 'brave': {
        const r = await fetch('https://api.search.brave.com/res/v1/web/search?q=test&count=1', {
          headers: { 'X-Subscription-Token': secret! }, signal: AbortSignal.timeout(8000),
        });
        await r.body?.cancel().catch(() => undefined);
        return { id, ok: r.ok, detail: r.ok ? 'API key valid' : `HTTP ${r.status}`, latencyMs: Date.now() - started };
      }
      case 'openai': {
        const endpoint = (asString(cfg.endpoint) ?? 'https://api.openai.com/v1').replace(/\/$/, '');
        const r = await fetch(`${endpoint}/models`, {
          headers: { Authorization: `Bearer ${secret!}` }, signal: AbortSignal.timeout(8000),
        });
        await r.body?.cancel().catch(() => undefined);
        return { id, ok: r.ok, detail: r.ok ? `API key valid (${asString(cfg.providerName) ?? 'provider'})` : `HTTP ${r.status}`, latencyMs: Date.now() - started };
      }
      case 'ip-geo':
      case 'indexer':
      case 'crawler':
      case 'tor-gateway':
      case 'generic-rest': {
        const endpoint = asString(cfg.endpoint);
        if (!endpoint) return fail('no endpoint configured');
        const r = await fetch(endpoint, { method: 'GET', signal: AbortSignal.timeout(8000) }).catch(() => null);
        if (!r) return fail('unreachable');
        await r.body?.cancel().catch(() => undefined);
        // A 401/403 still proves reachability; only network failure is fatal.
        return { id, ok: true, detail: `reachable (HTTP ${r.status})`, latencyMs: Date.now() - started };
      }
      default:
        return fail(`unknown provider type "${type}"`);
    }
  } catch {
    return fail('health check failed');
  }
}
