import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepHeader } from './common';
import { useToast } from '@/hooks/useToast';
import { buildWorkerJs, DEFAULT_COMPATIBILITY_DATE } from '@/lib/signer/runtime/generator';
import { deployWorker, checkDeployedHealth, type LiveHealth } from '@/lib/signer/cloudflare';
import { useRequiredSecrets, type WizardState } from '@/lib/signer/useWizard';

type Phase = 'idle' | 'deploying' | 'done' | 'error';

interface ProgressLine {
  label: string;
  status: 'pending' | 'active' | 'ok' | 'fail';
}

export function StepDeploy({ wizard }: { wizard: WizardState }) {
  const { manifest, cloudflare, secrets, reset } = wizard;
  const required = useRequiredSecrets(manifest);
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>('idle');
  const [lines, setLines] = useState<ProgressLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [health, setHealth] = useState<LiveHealth | null>(null);
  const started = useRef(false);

  const baseLines: ProgressLine[] = [
    { label: 'Connect to Cloudflare', status: 'pending' },
    { label: `Create worker "${manifest.workerName}"`, status: 'pending' },
    ...required.map((s) => ({ label: `Store secret ${s.name}`, status: 'pending' as const })),
    { label: 'Apply security & CORS', status: 'pending' },
    { label: 'Enable workers.dev', status: 'pending' },
    { label: 'Run health check', status: 'pending' },
  ];

  async function deploy() {
    setPhase('deploying');
    setError(null);
    setHealth(null);
    const seq = baseLines.map((l) => ({ ...l }));
    setLines(seq);

    const mark = (i: number, status: ProgressLine['status']) => {
      setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, status } : l)));
    };

    try {
      mark(0, 'active');
      // Transpile the generated TS runtime to plain JS — the Cloudflare
      // upload API does not transpile TypeScript.
      const source = await buildWorkerJs(manifest);
      const secretValues = Object.fromEntries(required.map((s) => [s.name, secrets[s.name] ?? '']));

      mark(0, 'ok');
      mark(1, 'active');
      const result = await deployWorker(
        { accountId: cloudflare.accountId.trim(), apiToken: cloudflare.apiToken.trim() },
        manifest.workerName,
        source,
        secretValues,
        DEFAULT_COMPATIBILITY_DATE,
        (stepLabel) => {
          if (stepLabel.startsWith('Storing secret')) {
            // mark the corresponding secret line
            const idx = 2 + Math.min(required.length - 1, parseInt(stepLabel.split(' ')[2]?.split('/')[0] ?? '1', 10) - 1);
            mark(idx, 'active');
          }
        },
      );
      // Mark all create/secret lines ok.
      for (let i = 1; i <= 1 + required.length; i++) mark(i, 'ok');
      mark(2 + required.length, 'ok'); // security & CORS (baked into manifest)
      mark(3 + required.length, 'ok'); // workers.dev

      setHost(result.workersDevHost);
      mark(4 + required.length, 'active');
      if (result.workersDevHost) {
        // Give the edge a moment, then probe.
        await new Promise((r) => setTimeout(r, 1500));
        const h = await checkDeployedHealth(result.workersDevHost);
        setHealth(h);
        mark(4 + required.length, h.reachable ? 'ok' : 'pending');
      } else {
        mark(4 + required.length, 'pending');
      }

      setPhase('done');
      toast({ title: 'Deployed', description: `Your signer is live${result.workersDevHost ? ` at ${result.workersDevHost}` : ''}.` });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deployment failed');
      setPhase('error');
      setLines((prev) => {
        const firstActive = prev.findIndex((l) => l.status === 'active' || l.status === 'pending');
        return prev.map((l, idx) => (idx === Math.max(0, firstActive) ? { ...l, status: 'fail' } : l));
      });
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void deploy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endpoint = host ? `https://${host}` : null;

  return (
    <div className="space-y-6">
      <StepHeader
        title={phase === 'done' ? 'Your signer is live' : phase === 'error' ? 'Deployment failed' : 'Deploying…'}
        sub={phase === 'done' ? 'Everything below is yours — the worker, the secrets, the rate limits.' : 'Hang tight while we provision your Cloudflare Worker.'}
      />

      <section className="rounded-xl border bg-card p-5 space-y-2.5">
        {lines.map((l) => (
          <div key={l.label} className="flex items-center gap-2.5 text-sm">
            {l.status === 'ok' && <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
            {l.status === 'active' && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
            {l.status === 'pending' && <div className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0" />}
            {l.status === 'fail' && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
            <span className={l.status === 'pending' ? 'text-muted-foreground' : ''}>{l.label}</span>
          </div>
        ))}
      </section>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <div className="font-medium text-destructive mb-1">Something went wrong</div>
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { started.current = false; setPhase('idle'); void deploy(); }}>
            Retry deployment
          </Button>
        </div>
      )}

      {phase === 'done' && endpoint && (
        <section className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-muted-foreground">Your API</div>
              <code className="text-lg font-mono font-semibold">{endpoint}</code>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(endpoint).catch(() => undefined);
                  toast({ title: 'Copied', description: 'Endpoint URL copied to clipboard.' });
                }}
              >
                <Copy className="h-4 w-4 mr-1.5" /> Copy
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`${endpoint}/api/status`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1.5" /> Status
                </a>
              </Button>
            </div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground mb-1.5">Endpoints</div>
            <div className="flex flex-wrap gap-2">
              {Object.keys(manifest.routes).map((r) => (
                <code key={r} className="rounded-md bg-muted px-2 py-1 text-xs font-mono">{r}</code>
              ))}
            </div>
          </div>

          {health && health.checks.length > 0 && (
            <div>
              <div className="text-sm text-muted-foreground mb-1.5">Provider health</div>
              <div className="space-y-1.5">
                {health.checks.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-sm">
                    {c.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                    <span className="font-medium">{c.id}</span>
                    <span className="text-muted-foreground">{c.detail}</span>
                    {c.latencyMs !== undefined && <span className="text-xs text-muted-foreground">· {c.latencyMs}ms</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Secrets live only in the Cloudflare secret store (<code>env.*</code>) — never in code,
            Git, or the browser. Manage the worker in your{' '}
            <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer" className="underline">
              Cloudflare dashboard
            </a>
            .
          </div>

          <Button variant="ghost" onClick={reset} className="w-full">
            Deploy another signer
          </Button>
        </section>
      )}
    </div>
  );
}
