/**
 * Deployment templates — preset manifests per TemplateId. Selecting one
 * prefills providers, routes, rate limits, and CORS; the wizard then only
 * asks for the pieces that are actually deployment-specific (origins, keys,
 * endpoints).
 */
import type { SignerManifest, TemplateId } from './manifest';
import { RUNTIME_VERSION } from './manifest';

export interface TemplateMeta {
  id: TemplateId;
  label: string;
  blurb: string;
  emoji: string;
  /** Provider ids this template creates, for the wizard's provider forms. */
  providerIds: string[];
}

export const TEMPLATES: TemplateMeta[] = [
  { id: 'ai-search', label: 'AI + Search', blurb: 'OpenAI-compatible chat plus Brave Search — the SAVEDD stack.', emoji: '🔎', providerIds: ['ai', 'search'] },
  { id: 'ai', label: 'AI', blurb: 'A single OpenAI-compatible chat completions gateway.', emoji: '🤖', providerIds: ['ai'] },
  { id: 'search', label: 'Search', blurb: 'Brave Search behind your own key, rate-limited and CORS-locked.', emoji: '🔍', providerIds: ['search'] },
  { id: 'generic', label: 'Generic REST API', blurb: 'Any fixed REST endpoint, fronted with auth + rate limits.', emoji: '🧩', providerIds: ['api'] },
  { id: 'ip-geo', label: 'IP / Geolocation', blurb: 'IP intelligence (country, ASN, VPN/Tor signals) via your provider.', emoji: '🌐', providerIds: ['ip'] },
  { id: 'indexer', label: 'Indexer (SIP-01)', blurb: 'Secure access to a SIP-01 / Dsearch-style indexer.', emoji: '📚', providerIds: ['index'] },
  { id: 'crawler', label: 'Crawler', blurb: 'SSRF-hardened crawl jobs via your crawler (e.g. Crawlstr).', emoji: '🕷️', providerIds: ['crawl'] },
  { id: 'tor', label: 'Tor Gateway', blurb: 'Worker → your authenticated Tor gateway node → SOCKS/Tor.', emoji: '🧅', providerIds: ['tor'] },
  { id: 'multi', label: 'Multi-API', blurb: 'Several providers behind one worker, one set of routes.', emoji: '🔀', providerIds: ['search', 'ai', 'index', 'crawl'] },
];

function base(app: string, workerName: string, template: TemplateId): SignerManifest {
  return {
    version: '1',
    runtimeVersion: RUNTIME_VERSION,
    app,
    template,
    workerName,
    providers: {},
    routes: {},
    security: {
      allowedOrigins: [],
      publicAuth: { type: 'none' },
      internalMode: false,
    },
    limits: {
      default: { keyBy: 'ip', requestsPerMinute: 60 },
      perRoute: {},
    },
    privacy: { mode: 'standard' },
  };
}

/** Build a prefilled manifest for a template. */
export function manifestForTemplate(
  template: TemplateId,
  app: string,
  workerName: string,
): SignerManifest {
  const m = base(app, workerName, template);

  const addBrave = (id: string, path: string) => {
    m.providers[id] = { type: 'brave', secretName: 'BRAVE_API_KEY' };
    m.routes[path] = id;
    m.limits.perRoute[path] = { keyBy: 'ip', requestsPerMinute: 60 };
  };
  const addAi = (id: string, path: string) => {
    m.providers[id] = {
      type: 'openai',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      providerName: 'OpenAI',
      systemPrompt: '',
      maxTokens: 2000,
      modelAllowlist: [],
      streaming: false,
      secretName: 'OPENAI_API_KEY',
    };
    m.routes[path] = id;
    m.limits.perRoute[path] = { keyBy: 'ip', requestsPerMinute: 20 };
  };

  switch (template) {
    case 'ai-search':
      addBrave('search', '/api/search');
      addAi('ai', '/api/ai');
      break;
    case 'search':
      addBrave('search', '/api/search');
      break;
    case 'ai':
      addAi('ai', '/api/ai');
      break;
    case 'generic':
      m.providers.api = {
        type: 'generic-rest',
        endpoint: 'https://api.example.com',
        upstreamPath: '',
        method: 'GET',
        auth: { type: 'bearer', secretName: 'UPSTREAM_API_KEY' },
        forwardQuery: [],
        forwardHeaders: [],
      };
      m.routes['/api/data'] = 'api';
      break;
    case 'ip-geo':
      m.providers.ip = {
        type: 'ip-geo',
        endpoint: 'https://ipinfo.io',
        auth: { type: 'bearer', secretName: 'IPGEO_API_KEY' },
        pathSuffix: '/json',
      };
      m.routes['/api/ip'] = 'ip';
      break;
    case 'indexer':
      m.providers.index = {
        type: 'indexer',
        endpoint: 'https://indexer.example.com',
        searchPath: '/search',
        auth: { type: 'bearer', secretName: 'INDEXER_API_KEY' },
      };
      m.routes['/api/index'] = 'index';
      break;
    case 'crawler':
      m.providers.crawl = {
        type: 'crawler',
        endpoint: 'https://crawler.example.com',
        crawlPath: '/crawl',
        auth: { type: 'bearer', secretName: 'CRAWLER_API_KEY' },
        maxPages: 100,
        allowedDomains: [],
      };
      m.routes['/api/crawl'] = 'crawl';
      m.limits.perRoute['/api/crawl'] = { keyBy: 'ip', requestsPerMinute: 10 };
      break;
    case 'tor':
      m.providers.tor = {
        type: 'tor-gateway',
        endpoint: 'https://tor-gateway.example.com',
        fetchPath: '/v1/fetch',
        secretName: 'TOR_GATEWAY_TOKEN',
        allowClearnet: true,
      };
      m.routes['/api/tor'] = 'tor';
      m.limits.perRoute['/api/tor'] = { keyBy: 'ip', requestsPerMinute: 10 };
      break;
    case 'multi':
      addBrave('search', '/api/search');
      addAi('ai', '/api/ai');
      m.providers.index = {
        type: 'indexer',
        endpoint: 'https://indexer.example.com',
        searchPath: '/search',
        auth: { type: 'bearer', secretName: 'INDEXER_API_KEY' },
      };
      m.routes['/api/index'] = 'index';
      m.providers.crawl = {
        type: 'crawler',
        endpoint: 'https://crawler.example.com',
        crawlPath: '/crawl',
        auth: { type: 'bearer', secretName: 'CRAWLER_API_KEY' },
        maxPages: 100,
        allowedDomains: [],
      };
      m.routes['/api/crawl'] = 'crawl';
      m.limits.perRoute['/api/crawl'] = { keyBy: 'ip', requestsPerMinute: 10 };
      break;
  }

  return m;
}

/** The SAVEDD preset — Christian search engine: Brave + OpenAI-compatible. */
export const SAVEDD_SYSTEM_PROMPT =
  'You are SAVEDD, a Christian search assistant. Ground every answer in Scripture and the teaching of the Church. Be charitable, truthful, and concise. Cite sources when you can. Never fabricate references.';

export function saveddManifest(workerName: string): SignerManifest {
  const m = manifestForTemplate('ai-search', 'SAVEDD', workerName);
  m.security.allowedOrigins = ['https://savedd.com', 'https://www.savedd.com'];
  const ai = m.providers.ai;
  if (ai.type === 'openai') {
    ai.systemPrompt = SAVEDD_SYSTEM_PROMPT;
    ai.model = 'gpt-4o-mini';
  }
  return m;
}
