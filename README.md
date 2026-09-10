# Universal Edge Signer

**Bring your own Cloudflare account. Bring your own API keys. Deploy your own edge gateway.**

A one-click deployment platform that turns a form into a hardened, rate-limited
Cloudflare Worker API gateway — for AI, search, indexers, crawlers, IP/geo,
Tor, and any REST API. It is the generic extraction of the signer that powers
[SAVEDD](https://github.com/NostrDanish/Savedd).

> **FORM → TEST → DEPLOY → DONE** — as easy as deploying a Nostr relay.

[![Edit with Shakespeare](https://shakespeare.diy/badge.svg)](https://shakespeare.diy/clone?url=https%3A%2F%2Fgithub.com%2FNostrDanish%2F0xsigner.git)

## The principle

This is **the machine that creates _your_ API proxy**, not a hosted proxy that
everyone shares. Every deployment is:

- **your** Cloudflare account and Worker,
- **your** provider API keys — stored as Cloudflare Worker **Secrets** (`env.*`),
  never in code, Git, logs, or the browser bundle,
- **your** routes, CORS allowlist, and rate limits,
- **your** ownership — inspect it or delete it from your own dashboard.

The deployment token is used only for direct browser→Cloudflare API calls and is
never stored or sent anywhere else.

## What one deployment can be

🔎 Search gateway · 🤖 AI gateway · 🧅 Tor gateway · 🌐 IP/geolocation ·
🕷️ Crawler · 📚 SIP-01/Nostr indexer · 🎮 Game backend · 🧩 Generic REST ·
🔀 Multi-provider · 🔐 Private/internal API

## Quick start

```bash
npm install
npm run dev
# open http://localhost:8080 and click "Deploy a Signer"
```

You'll need:

1. A **Cloudflare Account ID** and a restricted **API Token** with
   `Account → Workers Scripts → Edit`.
2. The **API key(s)** for whichever provider(s) you pick (e.g. Brave, OpenAI).

The wizard walks you through Application → Cloudflare → Template → Providers →
Security → Limits → Review → Deploy, then hands you a `*.workers.dev` URL and a
live health check.

## Migrating SAVEDD

The **SAVEDD preset** reproduces the current stack (Brave + OpenAI-compatible +
the Christian system prompt + `savedd.com` CORS) as a generated Worker, so
SAVEDD can move off its hand-maintained `worker.ts` onto the shared runtime.

## Docs

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the data flow, provider-adapter
model, security invariants (no open proxy, SSRF guard, secret handling), and the
phased roadmap.

## Tech

React 19 · TypeScript · Vite · TailwindCSS 4 · shadcn/ui · zod · Cloudflare Workers REST API

## License

MIT

---

_Vibed with [Shakespeare](https://shakespeare.diy)_
