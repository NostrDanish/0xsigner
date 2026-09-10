import { Input } from '@/components/ui/input';
import { Field, StepFooter, StepHeader } from './common';
import type { WizardState } from '@/lib/signer/useWizard';

/** Derive a valid worker name from the app name. */
function toWorkerName(app: string): string {
  const slug = app
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'my-signer';
}

export function StepApplication({ wizard }: { wizard: WizardState }) {
  const { manifest, updateManifest, setStep } = wizard;
  const website = manifest.security.allowedOrigins[0] ?? '';

  const valid =
    manifest.app.trim().length > 0 &&
    /^[a-z0-9-]+$/.test(manifest.workerName) &&
    manifest.workerName.length > 0;

  return (
    <div className="space-y-6">
      <StepHeader
        title="Your application"
        sub="Name the app this signer will protect. This becomes the Worker's identity."
      />

      <div className="space-y-5">
        <Field label="Application name" hint='e.g. "SAVEDD", "Dsearch", "My Game"'>
          <Input
            value={manifest.app}
            onChange={(e) => {
              const app = e.target.value;
              updateManifest({ app, workerName: toWorkerName(app) });
            }}
            placeholder="SAVEDD"
            autoFocus
          />
        </Field>

        <Field
          label="Website URL"
          hint="The origin allowed to call your signer (CORS). You can add more later."
        >
          <Input
            value={website}
            onChange={(e) => {
              const v = e.target.value.trim();
              const rest = manifest.security.allowedOrigins.slice(1);
              updateManifest({
                security: {
                  ...manifest.security,
                  allowedOrigins: v ? [v, ...rest] : rest,
                },
              });
            }}
            placeholder="https://savedd.com"
            inputMode="url"
          />
        </Field>

        <Field
          label="Worker name"
          hint="Lowercase letters, numbers, hyphens. Becomes <name>.<you>.workers.dev"
        >
          <Input
            value={manifest.workerName}
            onChange={(e) =>
              updateManifest({
                workerName: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
              })
            }
            placeholder="my-signer"
          />
        </Field>
      </div>

      <StepFooter onNext={() => setStep('cloudflare')} nextDisabled={!valid} />
    </div>
  );
}
