import { Input } from '@/components/ui/input';
import { Field, StepFooter, StepHeader } from './common';
import type { WizardState } from '@/lib/signer/useWizard';

function RpmInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <Input
      type="number"
      min={1}
      max={100000}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(Math.max(1, Number(e.target.value)))}
    />
  );
}

const KEY_BY_LABELS: Array<{ value: 'ip' | 'api-key' | 'header' | 'nostr-pubkey'; label: string }> = [
  { value: 'ip', label: 'Per IP' },
  { value: 'api-key', label: 'Per API key' },
  { value: 'header', label: 'Per header' },
  { value: 'nostr-pubkey', label: 'Per Nostr pubkey' },
];

export function StepLimits({ wizard }: { wizard: WizardState }) {
  const { manifest, updateManifest, setStep } = wizard;
  const limits = manifest.limits;

  const setDefault = (patch: Partial<typeof limits.default>) =>
    updateManifest({ limits: { ...limits, default: { ...limits.default, ...patch } } });

  const setRoute = (path: string, rpm: number) =>
    updateManifest({
      limits: {
        ...limits,
        perRoute: {
          ...limits.perRoute,
          [path]: { ...(limits.perRoute[path] ?? { keyBy: 'ip', requestsPerMinute: 60 }), requestsPerMinute: rpm },
        },
      },
    });

  return (
    <div className="space-y-6">
      <StepHeader
        title="Rate limiting"
        sub="Blunt abuse with per-identity request budgets. Exceeded limits return 429 + Retry-After."
      />

      <section className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="font-semibold">Default rule</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Identity key">
            <div className="flex flex-wrap gap-2">
              {KEY_BY_LABELS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setDefault({ keyBy: k.value })}
                  className={`h-9 px-3 rounded-md border text-sm font-medium transition-colors ${limits.default.keyBy === k.value ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-background hover:bg-accent'}`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Requests / minute">
            <RpmInput value={limits.default.requestsPerMinute} onChange={(n) => setDefault({ requestsPerMinute: n })} />
          </Field>
        </div>
        {limits.default.keyBy === 'header' && (
          <Field label="Identity header" hint="e.g. X-Session-Id">
            <Input
              value={limits.default.headerName ?? ''}
              onChange={(e) => setDefault({ headerName: e.target.value })}
              placeholder="X-Session-Id"
            />
          </Field>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold">Per-route overrides</h3>
          <p className="text-sm text-muted-foreground">Give expensive routes (AI, crawl, Tor) tighter budgets.</p>
        </div>
        <div className="space-y-3">
          {Object.keys(manifest.routes).map((path) => {
            const rule = limits.perRoute[path];
            const providerId = manifest.routes[path];
            return (
              <div key={path} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <code className="text-sm font-mono">{path}</code>
                  <span className="ml-2 text-xs text-muted-foreground">{providerId}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">req/min</span>
                  <div className="w-28">
                    <RpmInput value={rule?.requestsPerMinute ?? limits.default.requestsPerMinute} onChange={(n) => setRoute(path, n)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <StepFooter onBack={() => setStep('security')} onNext={() => setStep('review')} />
    </div>
  );
}
