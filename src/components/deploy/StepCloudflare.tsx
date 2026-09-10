import { useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, StepFooter, StepHeader } from './common';
import { verifyCredentials, type VerifyResult } from '@/lib/signer/cloudflare';
import type { WizardState } from '@/lib/signer/useWizard';

export function StepCloudflare({ wizard }: { wizard: WizardState }) {
  const { cloudflare, setCloudflare, setStep } = wizard;
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canTest = cloudflare.accountId.trim().length > 0 && cloudflare.apiToken.trim().length > 0;
  const verified = Boolean(result?.tokenValid && !error);

  async function test() {
    setTesting(true);
    setError(null);
    setResult(null);
    try {
      const r = await verifyCredentials({
        accountId: cloudflare.accountId.trim(),
        apiToken: cloudflare.apiToken.trim(),
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <StepHeader
        title="Connect Cloudflare"
        sub="Deploy to YOUR Cloudflare account with a restricted API Token — never your password or global key."
      />

      <Alert className="border-primary/30 bg-primary/5">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Your token stays in this tab</AlertTitle>
        <AlertDescription>
          The API token is used only for direct calls to Cloudflare from your browser. It is never
          stored, logged, or sent to any other server. Create a token with just{' '}
          <strong>Workers Scripts:Edit</strong> on your account.
        </AlertDescription>
      </Alert>

      <div className="space-y-5">
        <Field label="Account ID" hint="Cloudflare dashboard → Workers → right sidebar.">
          <Input
            value={cloudflare.accountId}
            onChange={(e) => {
              setCloudflare({ ...cloudflare, accountId: e.target.value });
              setResult(null);
            }}
            placeholder="a1b2c3d4e5f6…"
            autoComplete="off"
          />
        </Field>

        <Field
          label="API Token"
          hint='Use an API Token (not the Global API Key). Permissions: Account → Workers Scripts → Edit.'
        >
          <Input
            type="password"
            value={cloudflare.apiToken}
            onChange={(e) => {
              setCloudflare({ ...cloudflare, apiToken: e.target.value });
              setResult(null);
            }}
            placeholder="••••••••••••••••"
            autoComplete="off"
          />
        </Field>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={test}
            disabled={!canTest || testing}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background h-10 px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {testing ? 'Testing…' : 'Test Cloudflare connection'}
          </button>
          {verified && (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Connected{result?.accountName ? ` — ${result.accountName}` : ''}
            </span>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Connection failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && result.notes.length > 0 && !error && (
          <Alert>
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 space-y-0.5">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <StepFooter
        onBack={() => setStep('application')}
        onNext={() => setStep('template')}
        nextDisabled={!verified}
        nextLabel={verified ? 'Continue' : 'Test to continue'}
      />
    </div>
  );
}
