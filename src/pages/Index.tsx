import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ArrowRight, KeyRound, Layers, Lock, Server, ShieldCheck, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const CAPABILITIES = [
  { emoji: '🔎', label: 'Search API gateway' },
  { emoji: '🤖', label: 'AI API gateway' },
  { emoji: '🧅', label: 'Tor gateway' },
  { emoji: '🌐', label: 'IP / geolocation' },
  { emoji: '🕷️', label: 'Crawler API' },
  { emoji: '📚', label: 'Nostr / SIP-01 indexer' },
  { emoji: '🎮', label: 'Game backend API' },
  { emoji: '🧩', label: 'Generic REST API' },
  { emoji: '🔀', label: 'Multi-provider' },
  { emoji: '🔐', label: 'Private / internal API' },
];

const PRINCIPLES = [
  {
    icon: Server,
    title: 'Your Cloudflare account',
    body: 'Every deployment creates a Worker in your own account. You own it, you can inspect it, you can delete it.',
  },
  {
    icon: KeyRound,
    title: 'Your API keys, as secrets',
    body: 'Provider credentials become Cloudflare Worker Secrets (env.*). They never touch code, Git, or the browser bundle.',
  },
  {
    icon: ShieldCheck,
    title: 'Not an open proxy',
    body: 'Fixed routes, fixed upstream endpoints, strict validation, CORS lockdown, and SSRF guards. No ?url=anything.',
  },
  {
    icon: Zap,
    title: 'Rate-limited at the edge',
    body: 'Per-IP, per-key, per-pubkey budgets return 429 + Retry-After. Blunt abuse before it reaches your quota.',
  },
];

const Index = () => {
  useSeoMeta({
    title: 'Universal Edge Signer — Deploy your own Cloudflare API gateway',
    description:
      'Bring your own Cloudflare account and API keys. Deploy a secure, rate-limited edge signer for AI, search, indexers, crawlers, Tor and any REST API — in one click.',
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <span className="font-bold tracking-tight">Universal Edge Signer</span>
          </div>
          <Button asChild>
            <Link to="/deploy">
              Deploy a Signer <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-20 sm:py-28 text-center">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            One runtime. Any API.
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
            Protect your API keys.
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Deploy your own gateway.
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
            Bring your own Cloudflare account and API keys. We generate a hardened, rate-limited
            edge signer and deploy it straight to your account — no vault, no middleman, no
            centralized proxy.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button size="lg" asChild className="w-full sm:w-auto">
              <Link to="/deploy">
                Deploy a Signer <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
              <a href="#how">How it works</a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            FORM → TEST → DEPLOY → DONE. As easy as deploying a Nostr relay.
          </p>
        </div>
      </section>

      {/* Capabilities */}
      <section className="border-y bg-muted/30">
        <div className="container py-14">
          <p className="text-center text-sm font-medium text-muted-foreground mb-8">
            One deployment system can create…
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 max-w-5xl mx-auto">
            {CAPABILITIES.map((c) => (
              <Card key={c.label} className="bg-card">
                <CardContent className="p-4 flex items-center gap-2.5">
                  <span className="text-xl" aria-hidden>{c.emoji}</span>
                  <span className="text-sm font-medium leading-tight">{c.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="container py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight text-center mb-3">
            The machine that creates <em>your</em> API proxy
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            This platform never routes your production traffic and never becomes an API-key vault.
            It only configures, validates, and deploys — then gets out of the way.
          </p>

          <ol className="grid sm:grid-cols-4 gap-4">
            {[
              { n: '1', t: 'Form', d: 'Pick a template, paste your provider keys.' },
              { n: '2', t: 'Test', d: 'We verify your Cloudflare token and provider reachability.' },
              { n: '3', t: 'Deploy', d: 'A Worker + secrets land in YOUR account over the CF API.' },
              { n: '4', t: 'Done', d: 'You get a workers.dev URL. Your app calls it directly.' },
            ].map((s) => (
              <li key={s.n} className="rounded-xl border bg-card p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold mb-3">
                  {s.n}
                </div>
                <div className="font-semibold">{s.t}</div>
                <div className="text-sm text-muted-foreground mt-1">{s.d}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Principles */}
      <section className="border-t bg-muted/30">
        <div className="container py-20">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {PRINCIPLES.map((p) => (
              <Card key={p.title} className="bg-card">
                <CardContent className="p-5">
                  <p.icon className="h-6 w-6 text-primary mb-3" />
                  <div className="font-semibold mb-1.5">{p.title}</div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20 text-center">
        <div className="mx-auto max-w-2xl space-y-5">
          <h2 className="text-3xl font-bold tracking-tight">Your keys. Your worker. Your rules.</h2>
          <p className="text-muted-foreground">
            SAVEDD, Dsearch, SIP-01, Crawlstr, Indexstr, Tor and 0xPrivacy infrastructure all run on
            the same machinery. Deploy yours.
          </p>
          <Button size="lg" asChild>
            <Link to="/deploy">
              Deploy a Signer <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t">
        <div className="container py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Universal Edge Signer — deployable API infrastructure.</span>
          <a href="https://shakespeare.diy" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">
            Vibed with Shakespeare
          </a>
        </div>
      </footer>
    </div>
  );
};

export default Index;
