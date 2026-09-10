import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Field, StepFooter, StepHeader } from './common';
import { useRequiredSecrets, type WizardState } from '@/lib/signer/useWizard';
import type { ProviderConfig, SignerManifest } from '@/lib/signer/manifest';

type Providers = SignerManifest['providers'];

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <Input
      type="number"
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function OpenAIFields({
  cfg,
  onChange,
}: {
  cfg: Extract<ProviderConfig, { type: 'openai' }>;
  onChange: (c: ProviderConfig) => void;
}) {
  return (
    <>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Endpoint">
          <Input value={cfg.endpoint} onChange={(e) => onChange({ ...cfg, endpoint: e.target.value })} placeholder="https://api.openai.com/v1" />
        </Field>
        <Field label="Model">
          <Input value={cfg.model} onChange={(e) => onChange({ ...cfg, model: e.target.value })} placeholder="gpt-4o-mini" />
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Provider label">
          <Input value={cfg.providerName} onChange={(e) => onChange({ ...cfg, providerName: e.target.value })} />
        </Field>
        <Field label="Max tokens (cap)">
          <NumberInput value={cfg.maxTokens} min={1} max={128000} onChange={(n) => onChange({ ...cfg, maxTokens: n })} />
        </Field>
      </div>
      <Field
        label="System prompt (server-side)"
        hint="Injected on every request. Clients can never override it."
      >
        <Textarea
          value={cfg.systemPrompt}
          onChange={(e) => onChange({ ...cfg, systemPrompt: e.target.value })}
          placeholder="You are a helpful assistant…"
          rows={4}
        />
      </Field>
    </>
  );
}

function GenericRestFields({
  cfg,
  onChange,
}: {
  cfg: Extract<ProviderConfig, { type: 'generic-rest' }>;
  onChange: (c: ProviderConfig) => void;
}) {
  return (
    <>
      <Field label="Upstream endpoint" hint="Fixed at deploy time — the browser can never change it.">
        <Input value={cfg.endpoint} onChange={(e) => onChange({ ...cfg, endpoint: e.target.value })} placeholder="https://api.example.com" />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Upstream path" hint='e.g. "/v1/data" appended to the endpoint'>
          <Input value={cfg.upstreamPath} onChange={(e) => onChange({ ...cfg, upstreamPath: e.target.value })} />
        </Field>
        <Field label="Client method">
          <div className="flex gap-2">
            {(['GET', 'POST'] as const).map((mth) => (
              <button
                key={mth}
                type="button"
                onClick={() => onChange({ ...cfg, method: mth })}
                className={`h-10 px-4 rounded-md border text-sm font-medium transition-colors ${cfg.method === mth ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-background hover:bg-accent'}`}
              >
                {mth}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field label="Auth">
        <div className="flex flex-wrap gap-2">
          {(['none', 'bearer', 'header', 'basic'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() =>
                onChange({
                  ...cfg,
                  auth:
                    t === 'none'
                      ? { type: 'none' }
                      : t === 'header'
                        ? { type: 'header', name: 'X-API-Key', secretName: cfg.auth.type !== 'none' ? cfg.auth.secretName : 'UPSTREAM_API_KEY' }
                        : { type: t, secretName: cfg.auth.type !== 'none' ? cfg.auth.secretName : 'UPSTREAM_API_KEY' },
                })
              }
              className={`h-9 px-3 rounded-md border text-sm font-medium capitalize transition-colors ${cfg.auth.type === t ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-background hover:bg-accent'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Forward query params" hint="Comma-separated whitelist forwarded to the upstream.">
        <Input
          value={cfg.forwardQuery.join(', ')}
          onChange={(e) => onChange({ ...cfg, forwardQuery: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder="q, limit, page"
        />
      </Field>
    </>
  );
}

function BraveFields({ cfg, onChange }: { cfg: Extract<ProviderConfig, { type: 'brave' }>; onChange: (c: ProviderConfig) => void }) {
  return (
    <Field label="Secret binding name" hint="The env var the worker reads (value collected below).">
      <Input value={cfg.secretName} onChange={(e) => onChange({ ...cfg, secretName: e.target.value.toUpperCase() })} />
    </Field>
  );
}

function IpGeoFields({ cfg, onChange }: { cfg: Extract<ProviderConfig, { type: 'ip-geo' }>; onChange: (c: ProviderConfig) => void }) {
  return (
    <>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Provider endpoint">
          <Input value={cfg.endpoint} onChange={(e) => onChange({ ...cfg, endpoint: e.target.value })} placeholder="https://ipinfo.io" />
        </Field>
        <Field label="Path suffix" hint='e.g. "/json"'>
          <Input value={cfg.pathSuffix} onChange={(e) => onChange({ ...cfg, pathSuffix: e.target.value })} />
        </Field>
      </div>
      <Field label="Auth">
        <div className="flex gap-2">
          {(['none', 'bearer', 'query'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() =>
                onChange({
                  ...cfg,
                  auth:
                    t === 'none'
                      ? { type: 'none' }
                      : t === 'query'
                        ? { type: 'query', name: 'token', secretName: 'IPGEO_API_KEY' }
                        : { type: 'bearer', secretName: 'IPGEO_API_KEY' },
                })
              }
              className={`h-9 px-3 rounded-md border text-sm font-medium capitalize transition-colors ${cfg.auth.type === t ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-background hover:bg-accent'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>
    </>
  );
}

function IndexerFields({ cfg, onChange }: { cfg: Extract<ProviderConfig, { type: 'indexer' }>; onChange: (c: ProviderConfig) => void }) {
  return (
    <>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Indexer endpoint">
          <Input value={cfg.endpoint} onChange={(e) => onChange({ ...cfg, endpoint: e.target.value })} placeholder="https://indexer.example.com" />
        </Field>
        <Field label="Search path">
          <Input value={cfg.searchPath} onChange={(e) => onChange({ ...cfg, searchPath: e.target.value })} placeholder="/search" />
        </Field>
      </div>
      <Field label="Auth">
        <div className="flex gap-2">
          {(['none', 'bearer'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ ...cfg, auth: t === 'none' ? { type: 'none' } : { type: 'bearer', secretName: 'INDEXER_API_KEY' } })}
              className={`h-9 px-3 rounded-md border text-sm font-medium capitalize transition-colors ${cfg.auth.type === t ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-background hover:bg-accent'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>
    </>
  );
}

function CrawlerFields({ cfg, onChange }: { cfg: Extract<ProviderConfig, { type: 'crawler' }>; onChange: (c: ProviderConfig) => void }) {
  return (
    <>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Crawler endpoint">
          <Input value={cfg.endpoint} onChange={(e) => onChange({ ...cfg, endpoint: e.target.value })} placeholder="https://crawler.example.com" />
        </Field>
        <Field label="Crawl path">
          <Input value={cfg.crawlPath} onChange={(e) => onChange({ ...cfg, crawlPath: e.target.value })} placeholder="/crawl" />
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Max pages (cap)">
          <NumberInput value={cfg.maxPages} min={1} max={10000} onChange={(n) => onChange({ ...cfg, maxPages: n })} />
        </Field>
        <Field label="Auth">
          <div className="flex gap-2">
            {(['none', 'bearer'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...cfg, auth: t === 'none' ? { type: 'none' } : { type: 'bearer', secretName: 'CRAWLER_API_KEY' } })}
                className={`h-9 px-3 rounded-md border text-sm font-medium capitalize transition-colors ${cfg.auth.type === t ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-background hover:bg-accent'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field label="Allowed domains" hint="Optional crawl allowlist (comma-separated). Strongly recommended.">
        <Input
          value={cfg.allowedDomains.join(', ')}
          onChange={(e) => onChange({ ...cfg, allowedDomains: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder="example.com, docs.example.com"
        />
      </Field>
    </>
  );
}

function TorFields({ cfg, onChange }: { cfg: Extract<ProviderConfig, { type: 'tor-gateway' }>; onChange: (c: ProviderConfig) => void }) {
  return (
    <>
      <Field label="Tor gateway endpoint" hint="Your authenticated Tor gateway node (HTTPS). Never a raw SOCKS port.">
        <Input value={cfg.endpoint} onChange={(e) => onChange({ ...cfg, endpoint: e.target.value })} placeholder="https://tor-gateway.example.com" />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Fetch path">
          <Input value={cfg.fetchPath} onChange={(e) => onChange({ ...cfg, fetchPath: e.target.value })} placeholder="/v1/fetch" />
        </Field>
        <Field label="Secret binding name">
          <Input value={cfg.secretName} onChange={(e) => onChange({ ...cfg, secretName: e.target.value.toUpperCase() })} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={cfg.allowClearnet}
          onChange={(e) => onChange({ ...cfg, allowClearnet: e.target.checked })}
          className="h-4 w-4"
        />
        Allow clearnet (non-.onion) targets through the gateway
      </label>
    </>
  );
}

const PROVIDER_TITLES: Record<ProviderConfig['type'], string> = {
  brave: 'Brave Search',
  openai: 'AI (OpenAI-compatible)',
  'generic-rest': 'Generic REST API',
  'ip-geo': 'IP / Geolocation',
  indexer: 'Indexer (SIP-01)',
  crawler: 'Crawler',
  'tor-gateway': 'Tor Gateway',
};

export function StepProviders({ wizard }: { wizard: WizardState }) {
  const { manifest, setProvider, setSecret, secrets, setStep } = wizard;
  const required = useRequiredSecrets(manifest);

  const entries = Object.entries(manifest.providers);
  const allSecretsFilled = required.every((s) => (secrets[s.name] ?? '').trim().length > 0);

  return (
    <div className="space-y-6">
      <StepHeader
        title="Providers & secrets"
        sub="Configure each provider, then paste its API key. Keys go straight to the Cloudflare secret store — never into the generated code."
      />

      <div className="space-y-6">
        {entries.map(([id, cfg], idx) => (
          <section key={id} className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{PROVIDER_TITLES[cfg.type]}</h3>
              <code className="text-xs text-muted-foreground">route → {Object.keys(manifest.routes).find((p) => manifest.routes[p] === id) ?? id}</code>
            </div>

            {cfg.type === 'openai' && <OpenAIFields cfg={cfg} onChange={(c) => setProvider(id, c)} />}
            {cfg.type === 'brave' && <BraveFields cfg={cfg} onChange={(c) => setProvider(id, c)} />}
            {cfg.type === 'generic-rest' && <GenericRestFields cfg={cfg} onChange={(c) => setProvider(id, c)} />}
            {cfg.type === 'ip-geo' && <IpGeoFields cfg={cfg} onChange={(c) => setProvider(id, c)} />}
            {cfg.type === 'indexer' && <IndexerFields cfg={cfg} onChange={(c) => setProvider(id, c)} />}
            {cfg.type === 'crawler' && <CrawlerFields cfg={cfg} onChange={(c) => setProvider(id, c)} />}
            {cfg.type === 'tor-gateway' && <TorFields cfg={cfg} onChange={(c) => setProvider(id, c)} />}

            {idx < entries.length - 1 && <Separator className="mt-2" />}
          </section>
        ))}
      </div>

      {required.length > 0 && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
          <div>
            <h3 className="font-semibold">Secrets</h3>
            <p className="text-sm text-muted-foreground">
              Stored as Cloudflare Worker Secrets (<code>env.*</code>). Never in code, Git, or logs.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {required.map((s) => (
              <Field key={s.name} label={s.label} hint={`${s.hint} → env.${s.name}`}>
                <Input
                  type="password"
                  value={secrets[s.name] ?? ''}
                  onChange={(e) => setSecret(s.name, e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="off"
                />
              </Field>
            ))}
          </div>
        </section>
      )}

      <StepFooter
        onBack={() => setStep('template')}
        onNext={() => setStep('security')}
        nextDisabled={!allSecretsFilled}
        nextLabel={allSecretsFilled ? 'Continue' : 'Fill secrets to continue'}
      />
    </div>
  );
}
