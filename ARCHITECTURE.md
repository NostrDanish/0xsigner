# Universal Edge Signer — Architecture

> The machine that creates **your** API proxy — not a hosted proxy everyone shares.

Bring your own Cloudflare account. Bring your own API keys. Deploy your own edge
gateway. The platform never routes production traffic and never becomes a
centralized API-key vault.

This project is the generic extraction of the signer that powers
[SAVEDD](https://github.com/NostrDanish/Savedd). SAVEDD's `worker.ts` was a
single-purpose AI + Brave proxy; here those proven patterns (secret-injection,
payload whitelisting, sanitized errors, NIP-98-style auth, CORS lockdown) are
generalized into a **config-driven runtime** with a **provider-adapter** model.

---

## Data flow

```
USER'S BROWSER                     USER'S CLOUDFLARE ACCOUNT
┌──────────────────┐               ┌──────────────────────────────┐
│  Deploy Wizard   │  CF REST API  │  Worker (generated runtime)  │
│  (this web app)  │ ────────────► │  ┌────────────────────────┐  │
│                  │  token used   │  │ route table            │  │
│  • builds a      │  in-memory    │  │ provider adapters      │  │
│    NON-SECRET    │  only, never  │  │ SSRF guard             │  │
│    manifest      │  stored       │  │ rate limiter           │  │
│  • collects      │               │  │ CORS allowlist         │  │
│    secrets       │ ──secrets──►  │  └────────────────────────┘  │
│                  │  (env.* only) │            │                 │
└──────────────────┘               └────────────┼─────────────────┘
                                                 ▼
                                   Provider APIs (Brave, OpenAI,
                                   indexer, crawler, Tor gateway, …)
```

Two kinds of values, kept strictly separate:

| Value | Where it lives | Ever in code/Git/browser-bundle? |
|-------|----------------|----------------------------------|
| **Manifest** (routes, endpoints, model, CORS, limits, system prompt) | Serialized into the Worker as a JSON literal | Yes — it's non-secret by construction |
| **Secrets** (provider keys, gateway key) | Cloudflare Worker **secret store** (`env.*`) | **Never** |

The deployer sends secrets straight from the browser to Cloudflare's
`PUT /accounts/{id}/workers/scripts/{name}/secrets` endpoint. The token used for
deployment is held only in React state for the lifetime of the tab.

---

## Source layout

```
src/lib/signer/
├── manifest.ts            # zod schema for the non-secret manifest; requiredSecrets()
├── templates.ts           # preset manifests per template + the SAVEDD preset
├── cloudflare.ts          # browser-side Cloudflare REST client (verify/upload/secrets/subdomain/health)
├── useWizard.ts           # wizard state (token + secrets live only here, in memory)
└── runtime/
    ├── core.ts            # CORS, SSRF guard, error model, rate limiter, public auth
    ├── providers.ts       # one adapter per ProviderType (handle + healthCheck)
    ├── entry.ts           # the Worker's default-export fetch handler
    └── generator.ts       # assembles core+providers+entry+manifest into ONE module
```

The `runtime/*` files are ordinary, type-checked TS modules, but written to be
**bundle-safe**: their only cross-file references are exported symbols, so
`generator.ts` strips `import`/`export` syntax and concatenates them into a
single self-contained Worker module, injecting the manifest as a literal. The
Worker is uploaded module-syntax via `multipart/form-data` (`main_module`).

---

## Provider adapters

Each adapter implements a uniform shape:

```ts
validateConfig / validateCredentials / buildRequest / parseResponse / healthCheck
```

(concretely: a `handle(ctx, cfg)` dispatcher + `healthCheckProvider(...)`).

| Type | What it fronts | Secret |
|------|----------------|--------|
| `brave` | Brave Search | `BRAVE_API_KEY` |
| `openai` | any OpenAI-compatible chat endpoint | `OPENAI_API_KEY` |
| `generic-rest` | any fixed REST endpoint | configured |
| `ip-geo` | ipinfo / IP2Location / MaxMind-style | `IPGEO_API_KEY` |
| `indexer` | SIP-01 / Dsearch-style indexer | `INDEXER_API_KEY` |
| `crawler` | Crawlstr-style crawler (SSRF-hardened) | `CRAWLER_API_KEY` |
| `tor-gateway` | an authenticated Tor gateway node | `TOR_GATEWAY_TOKEN` |

Three access levels (per the design's "really important part"):

1. **HTTP API** — Brave, OpenAI, IP/GEO, indexer, crawler → Worker → HTTPS API.
2. **Nostr/indexer protocol** — SIP-01, NIP-50/77/98-shaped queries → Worker → indexer.
3. **Network gateway** — Tor → Worker → *authenticated HTTPS Tor gateway* → SOCKS/Tor.
   A Cloudflare Worker cannot be a Tor SOCKS client, so Tor is a dedicated node
   the Worker talks to over a hardened, authenticated HTTPS API. The raw SOCKS
   port is never exposed.

---

## Security invariants

- **No open proxy.** Upstream endpoints are fixed at deploy time. There is no
  `?url=anything`. Only the crawler/Tor adapters accept a target URL, and both
  run it through the SSRF guard.
- **SSRF guard** blocks localhost, `127/8`, `10/8`, `172.16/12`, `192.168/16`,
  `169.254/16`, `100.64/10`, IPv6 loopback/ULA/link-local, and cloud-metadata
  hostnames — unless the deployment explicitly enables `internalMode`.
- **Secrets never leak.** They are read only via `env.*`; status/health responses
  are built to contain no secret material; provider error bodies are drained and
  replaced with sanitized messages.
- **CORS** reflects allowlisted origins only — never `*` unless public mode is
  explicitly chosen.
- **Server-controlled AI.** The operator's model and system prompt are forced;
  clients can only pick a model from an explicit allowlist and can never inject
  a system prompt.
- **Rate limiting** returns `429` + `Retry-After`, keyed by IP / API key /
  header / Nostr pubkey, per-route. (V1 uses a best-effort per-isolate limiter;
  the documented upgrade path is a Cloudflare Rate Limiting binding.)
- **Least privilege.** The wizard asks for an API **Token** (not the global key)
  scoped to `Workers Scripts:Edit`.

---

## Built-in endpoints on every deployed worker

- `GET /api/status` — non-secret status (which providers are configured).
- `GET /api/health` — per-provider reachability probe.
- plus whatever routes the manifest defines (e.g. `/api/search`, `/api/ai`).

---

## Phased roadmap

- **Phase 1 (this repo):** generic runtime, Cloudflare deploy, secrets, CORS,
  rate limiting, generic-rest, Brave, OpenAI. — **SAVEDD is the first consumer.**
- **Phase 2:** IP/GEO, indexer, crawler, Nostr (NIP-50/77/98 binding with
  canonical public-origin handling).
- **Phase 3:** Tor gateway node reference implementation, game API, Durable
  Objects for quotas/jobs, CF Rate Limiting binding, custom domains, service
  bindings.

### Key references

- Workers: https://developers.cloudflare.com/workers/
- Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Rate limit binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- API tokens: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- NIPs: https://nips.nostr.com/5 · /50 · /77 · /98
- Tor: https://spec.torproject.org/socks-extensions.html · /control-spec/
