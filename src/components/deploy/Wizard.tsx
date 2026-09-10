import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STEP_ORDER, useWizard, type WizardStep } from '@/lib/signer/useWizard';
import { StepApplication } from './StepApplication';
import { StepCloudflare } from './StepCloudflare';
import { StepTemplate } from './StepTemplate';
import { StepProviders } from './StepProviders';
import { StepSecurity } from './StepSecurity';
import { StepLimits } from './StepLimits';
import { StepReview } from './StepReview';
import { StepDeploy } from './StepDeploy';

const STEP_LABELS: Record<WizardStep, string> = {
  application: 'Application',
  cloudflare: 'Cloudflare',
  template: 'Template',
  providers: 'Providers',
  security: 'Security',
  limits: 'Limits',
  review: 'Review',
  deploy: 'Deploy',
};

export function Wizard() {
  const wizard = useWizard();
  const currentIdx = STEP_ORDER.indexOf(wizard.step);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24">
      {/* Progress */}
      <nav aria-label="Deployment steps" className="mb-10">
        <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-2">
          {STEP_ORDER.map((s, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <li key={s} className="flex items-center gap-1 sm:gap-2 shrink-0">
                <div
                  className={cn(
                    'flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold border transition-colors',
                    done && 'bg-primary text-primary-foreground border-primary',
                    active && 'border-primary text-primary ring-2 ring-primary/30',
                    !done && !active && 'border-muted-foreground/30 text-muted-foreground',
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={cn('text-xs hidden md:block', active ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                  {STEP_LABELS[s]}
                </span>
                {i < STEP_ORDER.length - 1 && <div className="h-px w-4 sm:w-6 bg-border mx-0.5" />}
              </li>
            );
          })}
        </ol>
      </nav>

      {wizard.step === 'application' && <StepApplication wizard={wizard} />}
      {wizard.step === 'cloudflare' && <StepCloudflare wizard={wizard} />}
      {wizard.step === 'template' && <StepTemplate wizard={wizard} />}
      {wizard.step === 'providers' && <StepProviders wizard={wizard} />}
      {wizard.step === 'security' && <StepSecurity wizard={wizard} />}
      {wizard.step === 'limits' && <StepLimits wizard={wizard} />}
      {wizard.step === 'review' && <StepReview wizard={wizard} />}
      {wizard.step === 'deploy' && <StepDeploy wizard={wizard} />}
    </div>
  );
}
