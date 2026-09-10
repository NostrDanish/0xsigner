import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function StepHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <p className="text-muted-foreground text-base">{sub}</p>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <span className="text-sm font-medium leading-none">{label}</span>
      {children}
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function StepFooter({
  onBack,
  onNext,
  nextDisabled,
  nextLabel = 'Continue',
  busy,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back
          </button>
        )}
      </div>
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || busy}
          className={cn(
            'inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-6',
            'bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-colors',
            'disabled:opacity-50 disabled:pointer-events-none',
          )}
        >
          {busy ? 'Working…' : nextLabel}
        </button>
      )}
    </div>
  );
}
