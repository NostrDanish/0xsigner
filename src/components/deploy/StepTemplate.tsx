import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { StepHeader, StepFooter } from './common';
import { TEMPLATES } from '@/lib/signer/templates';
import { saveddManifest } from '@/lib/signer/templates';
import type { WizardState } from '@/lib/signer/useWizard';

export function StepTemplate({ wizard }: { wizard: WizardState }) {
  const { manifest, chooseTemplate, setStep, setManifest } = wizard;

  return (
    <div className="space-y-6">
      <StepHeader
        title="What are you protecting?"
        sub="Pick a starting point. Each is the same runtime with a different set of provider adapters and routes."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => chooseTemplate(t.id)}
            className={cn(
              'text-left rounded-xl border p-4 transition-all hover:border-primary/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              manifest.template === t.id ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card',
            )}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                {t.emoji}
              </span>
              <div>
                <div className="font-semibold">{t.label}</div>
                <div className="text-sm text-muted-foreground leading-snug mt-0.5">{t.blurb}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <Card className="border-dashed">
        <CardContent className="py-4 flex items-center justify-between gap-4">
          <div className="text-sm">
            <span className="font-medium">Migrating SAVEDD?</span>{' '}
            <span className="text-muted-foreground">
              Load the exact SAVEDD preset (Brave + OpenAI + Christian system prompt, savedd.com CORS).
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setManifest(saveddManifest(manifest.workerName));
              setStep('providers');
            }}
            className="shrink-0 rounded-md border border-input bg-background h-9 px-3 text-sm font-medium hover:bg-accent transition-colors"
          >
            Load SAVEDD preset
          </button>
        </CardContent>
      </Card>

      <StepFooter onBack={() => setStep('cloudflare')} onNext={() => setStep('providers')} />
    </div>
  );
}
