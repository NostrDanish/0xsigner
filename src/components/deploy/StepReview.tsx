import { CheckCircle2, XCircle } from 'lucide-react';
import { Field, StepFooter, StepHeader } from './common';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useRequiredSecrets, validateManifest, type WizardState } from '@/lib/signer/useWizard';
import { buildWorkerSource } from '@/lib/signer/runtime/generator';

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive" />
      )}
      <span>{label}</span>
    </div>
  );
}

export function StepReview({ wizard }: { wizard: WizardState }) {
  const { manifest, cloudflare, secrets, setStep } = wizard;
  const required = useRequiredSecrets(manifest);
  const errors = validateManifest(manifest);
  const manifestOk = Object.keys(errors).length === 0;
  const secretsOk = required.every((s) => (secrets[s.name] ?? '').trim().length > 0);
  const cloudflareOk = cloudflare.accountId.trim().length > 0 && cloudflare.apiToken.trim().length > 0;
  const source = manifestOk ? buildWorkerSource(manifest) : '';
  const ready = manifestOk && secretsOk && cloudflareOk;

  return (
    <div className="space-y-6">
      <StepHeader title="Review & deploy" sub="Everything checks out below, then deploy to your Cloudflare account." />

      <section className="rounded-xl border bg-card divide-y">
        <div className="p-4 space-y-2">
          <Row ok={cloudflareOk} label={cloudflareOk ? 'Cloudflare token present' : 'Cloudflare token missing'} />
          <Row ok={manifestOk} label={manifestOk ? `Manifest valid (${Object.keys(manifest.routes).length} routes, ${Object.keys(manifest.providers).length} providers)` : 'Manifest has errors'} />
          <Row ok={secretsOk} label={secretsOk ? `${required.length} secret(s) ready to store as Worker Secrets` : 'Some secrets are empty'} />
          <Row ok label={`Worker: ${manifest.workerName}`} />
          <Row ok={manifest.security.allowedOrigins.length > 0} label={manifest.security.allowedOrigins.length > 0 ? `CORS locked to ${manifest.security.allowedOrigins.join(', ')}` : 'No CORS origins set (same-origin only)'} />
        </div>

        {!manifestOk && (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertTitle>Fix these before deploying</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 space-y-0.5">
                  {Object.entries(errors).map(([k, v]) => (
                    <li key={k}>
                      <code className="text-xs">{k}</code>: {v}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="p-4">
          <Field label="Generated worker (preview)" hint={`${source.split('\n').length} lines · ${(new Blob([source]).size / 1024).toFixed(1)} KB · no secrets embedded`}>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed font-mono">
              {source.slice(0, 4000)}
              {source.length > 4000 ? '\n…' : ''}
            </pre>
          </Field>
        </div>
      </section>

      <StepFooter
        onBack={() => setStep('limits')}
        onNext={() => setStep('deploy')}
        nextDisabled={!ready}
        nextLabel="Deploy"
      />
    </div>
  );
}
