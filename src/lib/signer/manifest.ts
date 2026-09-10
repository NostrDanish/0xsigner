/**
 * Signer configuration manifest — the NON-SECRET contract for a deployment.
 *
 * This object is:
 *   - validated with zod in the UI,
 *   - serialized into the generated Worker as a plain JSON literal,
 *   - safe to show, store, version, and diff.
 *
 * It must NEVER contain provider API keys, tokens, or private key material.
 * Those are collected separately in the wizard and pushed straight to the
 * Cloudflare Worker secret store (env.*). The manifest only references the
 * NAME of the secret binding (e.g. "BRAVE_API_KEY"), never the value.
 */
import { z } from 'zod';

/** Bump when the generated runtime changes. Lets the deployer pin a tested build. */
export const RUNTIME_VERSION = '1.0.0';

export const PROVIDER_TYPES = [
  'brave',
  'openai',
  'generic-rest',
  'ip-geo',
  'indexer',
  'crawler',
  'tor-gateway',
] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const TEMPLATE_IDS = [
  'ai',
  'search',
  'ai-search',
  'generic',
  'ip-geo',
  'indexer',
  'crawler',
  'tor',
  'multi',
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/* ------------------------------------------------------------------ */
/* Provider configuration (discriminated union on `type`)             */
/* ------------------------------------------------------------------ */

const httpsUrl = (label: string) =>
  z
    .string()
    .url(`${label} must be a valid URL`)
    .refine((u) => {
      try {
        return new URL(u).protocol === 'https:';
      } catch {
        return false;
      }
    }, `${label} must use https://`);

const secretName = z
  .string()
  .min(1, 'Secret binding name is required')
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Use UPPER_SNAKE_CASE, e.g. BRAVE_API_KEY');

const braveProvider = z.object({
  type: z.literal('brave'),
  secretName: secretName.default('BRAVE_API_KEY'),
});

const openaiProvider = z.object({
  type: z.literal('openai'),
  endpoint: httpsUrl('AI endpoint').default('https://api.openai.com/v1'),
  model: z.string().min(1, 'Model is required').max(120).default('gpt-4o-mini'),
  providerName: z.string().max(60).default('OpenAI-compatible'),
  /** Injected server-side; clients can never override it. */
  systemPrompt: z.string().max(24_000).default(''),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(128_000).default(2000),
  /** Allow the client to pick among these models; empty = force `model`. */
  modelAllowlist: z.array(z.string().max(120)).default([]),
  streaming: z.boolean().default(false),
  secretName: secretName.default('OPENAI_API_KEY'),
});

const genericRestAuth = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('bearer'), secretName: secretName }),
  z.object({ type: z.literal('header'), name: z.string().min(1).max(64), secretName: secretName }),
  z.object({ type: z.literal('basic'), secretName: secretName }),
]);

const genericRestProvider = z.object({
  type: z.literal('generic-rest'),
  /** Fixed upstream base URL — the browser can never change it (no open proxy). */
  endpoint: httpsUrl('Upstream endpoint'),
  /** Upstream path appended to `endpoint` for this route, e.g. "/v1/data". */
  upstreamPath: z.string().max(300).default(''),
  /** Client HTTP method allowed on this route. */
  method: z.enum(['GET', 'POST']).default('GET'),
  auth: genericRestAuth.default({ type: 'none' }),
  /** Whitelisted query params forwarded to the upstream. */
  forwardQuery: z.array(z.string().max(64)).default([]),
  /** Whitelisted client headers forwarded upstream (never Authorization/Cookie). */
  forwardHeaders: z.array(z.string().max(64)).default([]),
});

const ipGeoProvider = z.object({
  type: z.literal('ip-geo'),
  /** Base URL; the target IP is appended, e.g. https://ipinfo.io */
  endpoint: httpsUrl('IP-geo endpoint').default('https://ipinfo.io'),
  auth: z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }),
    z.object({ type: z.literal('bearer'), secretName: secretName }),
    z.object({ type: z.literal('query'), name: z.string().min(1).max(32).default('token'), secretName: secretName }),
  ]).default({ type: 'bearer', secretName: 'IPGEO_API_KEY' }),
  /** Suffix after the IP, e.g. "/json" for ipinfo. */
  pathSuffix: z.string().max(64).default('/json'),
});

const indexerProvider = z.object({
  type: z.literal('indexer'),
  endpoint: httpsUrl('Indexer endpoint'),
  /** Path for search, e.g. "/search". */
  searchPath: z.string().max(120).default('/search'),
  auth: z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }),
    z.object({ type: z.literal('bearer'), secretName: secretName }),
  ]).default({ type: 'none' }),
});

const crawlerProvider = z.object({
  type: z.literal('crawler'),
  endpoint: httpsUrl('Crawler endpoint'),
  crawlPath: z.string().max(120).default('/crawl'),
  auth: z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }),
    z.object({ type: z.literal('bearer'), secretName: secretName }),
  ]).default({ type: 'bearer', secretName: 'CRAWLER_API_KEY' }),
  /** Hard cap on pages per crawl, enforced gateway-side. */
  maxPages: z.number().int().min(1).max(10_000).default(100),
  /** Optional domain allowlist for crawl targets (SSRF hardening). */
  allowedDomains: z.array(z.string().max(200)).default([]),
});

const torGatewayProvider = z.object({
  type: z.literal('tor-gateway'),
  /** Authenticated HTTPS front of the user's dedicated Tor gateway node. */
  endpoint: httpsUrl('Tor gateway endpoint'),
  fetchPath: z.string().max(120).default('/v1/fetch'),
  secretName: secretName.default('TOR_GATEWAY_TOKEN'),
  /** Only allow fetching .onion / http(s) targets through the gateway. */
  allowClearnet: z.boolean().default(true),
});

export const providerConfigSchema = z.discriminatedUnion('type', [
  braveProvider,
  openaiProvider,
  genericRestProvider,
  ipGeoProvider,
  indexerProvider,
  crawlerProvider,
  torGatewayProvider,
]);
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

/* ------------------------------------------------------------------ */
/* Routes: public path -> provider id                                 */
/* ------------------------------------------------------------------ */

const routePath = z
  .string()
  .min(1)
  .max(120)
  .regex(/^\/[a-z0-9\-/_]*$/i, 'Route must look like /api/search');

/* ------------------------------------------------------------------ */
/* Security, CORS, rate limits, privacy                               */
/* ------------------------------------------------------------------ */

const origin = z
  .string()
  .refine((o) => {
    if (o === '*') return true;
    try {
      const u = new URL(o);
      return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    } catch {
      return false;
    }
  }, 'Origin must be https:// (or localhost for dev), or * for public mode');

const rateLimitRule = z.object({
  /** What identifies the caller. */
  keyBy: z.enum(['ip', 'api-key', 'header', 'nostr-pubkey']).default('ip'),
  /** When keyBy === 'header', which header holds the identity. */
  headerName: z.string().max(64).optional(),
  requestsPerMinute: z.number().int().min(1).max(100_000).default(60),
});

export const manifestSchema = z
  .object({
    version: z.literal('1').default('1'),
    runtimeVersion: z.string().default(RUNTIME_VERSION),
    app: z.string().min(1, 'App name is required').max(60),
    template: z.enum(TEMPLATE_IDS),

    /** Worker script name (becomes <name>.<subdomain>.workers.dev). */
    workerName: z
      .string()
      .min(1, 'Worker name is required')
      .max(52)
      .regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers, hyphens only'),

    /** Provider definitions keyed by a short id ("search", "ai", ...). */
    providers: z.record(z.string().max(40), providerConfigSchema),

    /** Public path -> provider id. */
    routes: z.record(routePath, z.string().max(40)),

    security: z.object({
      /** Origins allowed to call the API cross-origin. Never default to "*". */
      allowedOrigins: z.array(origin).default([]),
      /** Optional public gateway auth — separate from upstream provider secrets. */
      publicAuth: z
        .discriminatedUnion('type', [
          z.object({ type: z.literal('none') }),
          z.object({ type: z.literal('api-key'), secretName: secretName }),
          z.object({ type: z.literal('nip98') }),
        ])
        .default({ type: 'none' }),
      /** Allow crawling/fetching private/internal targets. Off by default. */
      internalMode: z.boolean().default(false),
    }),

    limits: z.object({
      default: rateLimitRule.default({ keyBy: 'ip', requestsPerMinute: 60 }),
      /** Per-route overrides keyed by route path. */
      perRoute: z.record(routePath, rateLimitRule).default({}),
    }),

    privacy: z.object({
      mode: z.enum(['standard', 'privacy', 'maximum']).default('standard'),
    }),
  })
  .superRefine((m, ctx) => {
    for (const [path, providerId] of Object.entries(m.routes)) {
      if (!m.providers[providerId]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['routes', path],
          message: `Route "${path}" points to unknown provider "${providerId}"`,
        });
      }
    }
  });

export type SignerManifest = z.infer<typeof manifestSchema>;
export type RateLimitRule = z.infer<typeof rateLimitRule>;

/* ------------------------------------------------------------------ */
/* Secret collection (values never enter the manifest)                */
/* ------------------------------------------------------------------ */

/** One secret the wizard must collect and push to the Worker secret store. */
export interface RequiredSecret {
  /** The env binding name inside the Worker (e.g. BRAVE_API_KEY). */
  name: string;
  /** Human label for the form. */
  label: string;
  /** Which provider id asked for it. */
  providerId: string;
  /** Purpose shown to the user. */
  hint: string;
}

/** Walk a manifest and list every secret binding the runtime will read. */
export function requiredSecrets(manifest: SignerManifest): RequiredSecret[] {
  const out = new Map<string, RequiredSecret>();
  const add = (s: RequiredSecret) => {
    if (!out.has(s.name)) out.set(s.name, s);
  };

  for (const [providerId, p] of Object.entries(manifest.providers)) {
    switch (p.type) {
      case 'brave':
        add({ name: p.secretName, label: 'Brave API key', providerId, hint: 'X-Subscription-Token for Brave Search' });
        break;
      case 'openai':
        add({ name: p.secretName, label: 'AI provider API key', providerId, hint: `Bearer key for ${p.providerName}` });
        break;
      case 'ip-geo':
        if (p.auth.type !== 'none') add({ name: p.auth.secretName, label: 'IP-geo API key', providerId, hint: 'Credential for the IP/geolocation provider' });
        break;
      case 'indexer':
        if (p.auth.type === 'bearer') add({ name: p.auth.secretName, label: 'Indexer API key', providerId, hint: 'Bearer token for the indexer' });
        break;
      case 'crawler':
        if (p.auth.type === 'bearer') add({ name: p.auth.secretName, label: 'Crawler API key', providerId, hint: 'Bearer token for the crawler' });
        break;
      case 'tor-gateway':
        add({ name: p.secretName, label: 'Tor gateway token', providerId, hint: 'Auth token for your Tor gateway node' });
        break;
      case 'generic-rest':
        if (p.auth.type !== 'none') add({ name: p.auth.secretName, label: 'Upstream API credential', providerId, hint: `Credential sent as ${p.auth.type}` });
        break;
    }
  }

  if (manifest.security.publicAuth.type === 'api-key') {
    add({
      name: manifest.security.publicAuth.secretName,
      label: 'Public gateway API key',
      providerId: '(gateway)',
      hint: 'Clients must present this key to call your signer',
    });
  }

  return [...out.values()];
}

/** Extract just the secret values map the wizard collected, for pushing to CF. */
export type SecretValues = Record<string, string>;
