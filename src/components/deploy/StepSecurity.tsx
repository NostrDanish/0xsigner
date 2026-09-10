import { Input } from '@/components/ui/input';
import { Field, StepFooter, StepHeader } from './common';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Globe } from 'lucide-react';
import type { WizardState } from '@/lib/signer/useWizard';

export function StepSecurity({ wizard }: { wizard: WizardState }) {
  const { manifest, updateManifest, setStep } = wizard;
  const sec = manifest.security;

  const isPublic = sec.allowedOrigins.includes('*');

  return (
    <div className="space-y-6">
      <StepHeader
        title="Security"
        sub="Lock down who can call your signer and how it authenticates."
      />

      <div className="space-y-5">
        <Field
          label="Allowed origins (CORS)"
          hint="One per line. Only these sites may call the API cross-origin. Use * only for a public API."
        >
          <textarea
            value={sec.allowedOrigins.join('\n')}
            onChange={(e) =>
              updateManifest({
                security: {
                  ...sec,
                  allowedOrigins: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                },
              })
            }
            rows={3}
            placeholder={'https://savedd.com\nhttps://www.savedd.com'}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>

        {isPublic && (
          <Alert className="border-amber-500/40 bg-amber-500/10">
            <Globe className="h-4 w-4" />
            <AlertTitle>Public mode</AlertTitle>
            <AlertDescription>
              <code>*</code> lets any website call your signer. Combine it with a gateway API key
              and tight rate limits.
            </AlertDescription>
          </Alert>
        )}

        <Field label="Public gateway auth" hint="Separate from the upstream provider key.">
          <div className="flex flex-wrap gap-2">
            {(['none', 'api-key'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() =>
                  updateManifest({
                    security: {
                      ...sec,
                      publicAuth:
                        t === 'none'
                          ? { type: 'none' }
                          : { type: 'api-key', secretName: 'GATEWAY_API_KEY' },
                    },
                  })
                }
                className={`h-9 px-3 rounded-md border text-sm font-medium transition-colors ${sec.publicAuth.type === t ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-background hover:bg-accent'}`}
              >
                {t === 'none' ? 'None' : 'API key'}
              </button>
            ))}
          </div>
        </Field>

        {sec.publicAuth.type === 'api-key' && (
          <Field label="Gateway key binding" hint="Clients send it as X-API-Key or Bearer. Value collected in the Providers step.">
            <Input value={sec.publicAuth.secretName} readOnly className="font-mono" />
          </Field>
        )}

        <Field label="Privacy mode" hint="Controls logging/analytics behaviour of the deployed worker.">
          <div className="flex flex-wrap gap-2">
            {(['standard', 'privacy', 'maximum'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => updateManifest({ privacy: { mode: m } })}
                className={`h-9 px-3 rounded-md border text-sm font-medium capitalize transition-colors ${manifest.privacy.mode === m ? 'bg-primary text-primary-foreground border-primary' : 'border-input bg-background hover:bg-accent'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>

        <label className="flex items-start gap-3 text-sm rounded-lg border border-border p-3">
          <input
            type="checkbox"
            checked={sec.internalMode}
            onChange={(e) => updateManifest({ security: { ...sec, internalMode: e.target.checked } })}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="font-medium">Internal / private-network mode.</span>{' '}
            <span className="text-muted-foreground">
              Allow crawler & Tor-gateway targets on private IPs and localhost. Off by default —
              enable only for deployments you fully control (SSRF risk).
            </span>
          </span>
        </label>
      </div>

      <StepFooter onBack={() => setStep('providers')} onNext={() => setStep('limits')} />
    </div>
  );
}
