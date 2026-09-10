/**
 * Wizard state — holds everything the deploy flow needs.
 *
 * SECURITY: Cloudflare credentials and provider secrets live ONLY in this
 * in-memory React state for the lifetime of the page. They are never
 * written to localStorage, analytics, or any backend. Navigating away or
 * refreshing discards them. The manifest (non-secret) is safe to persist.
 */
import { useMemo, useState } from 'react';
import {
  manifestSchema,
  requiredSecrets,
  type SecretValues,
  type SignerManifest,
  type TemplateId,
} from './manifest';
import { manifestForTemplate } from './templates';

export type WizardStep =
  | 'application'
  | 'cloudflare'
  | 'template'
  | 'providers'
  | 'security'
  | 'limits'
  | 'review'
  | 'deploy';

export const STEP_ORDER: WizardStep[] = [
  'application',
  'cloudflare',
  'template',
  'providers',
  'security',
  'limits',
  'review',
  'deploy',
];

export interface CloudflareForm {
  accountId: string;
  apiToken: string;
}

export interface WizardState {
  step: WizardStep;
  manifest: SignerManifest;
  cloudflare: CloudflareForm;
  secrets: SecretValues;
  setStep: (s: WizardStep) => void;
  setManifest: (m: SignerManifest) => void;
  updateManifest: (patch: Partial<SignerManifest>) => void;
  setProvider: (id: string, cfg: SignerManifest['providers'][string]) => void;
  setCloudflare: (c: CloudflareForm) => void;
  setSecret: (name: string, value: string) => void;
  chooseTemplate: (t: TemplateId) => void;
  reset: () => void;
}

function initialManifest(): SignerManifest {
  return manifestForTemplate('ai-search', 'My App', 'my-signer');
}

export function useWizard(): WizardState {
  const [step, setStep] = useState<WizardStep>('application');
  const [manifest, setManifest] = useState<SignerManifest>(initialManifest);
  const [cloudflare, setCloudflare] = useState<CloudflareForm>({ accountId: '', apiToken: '' });
  const [secrets, setSecrets] = useState<SecretValues>({});

  const updateManifest = (patch: Partial<SignerManifest>) =>
    setManifest((m) => ({ ...m, ...patch }));

  const setProvider = (id: string, cfg: SignerManifest['providers'][string]) =>
    setManifest((m) => ({ ...m, providers: { ...m.providers, [id]: cfg } }));

  const setSecret = (name: string, value: string) =>
    setSecrets((s) => ({ ...s, [name]: value }));

  const chooseTemplate = (t: TemplateId) => {
    setManifest((m) => {
      const next = manifestForTemplate(t, m.app, m.workerName);
      // Preserve any origins the user already set.
      next.security.allowedOrigins = m.security.allowedOrigins;
      next.security.publicAuth = m.security.publicAuth;
      next.privacy = m.privacy;
      return next;
    });
    setStep('providers');
  };

  const reset = () => {
    setStep('application');
    setManifest(initialManifest());
    setCloudflare({ accountId: '', apiToken: '' });
    setSecrets({});
  };

  return {
    step,
    manifest,
    cloudflare,
    secrets,
    setStep,
    setManifest,
    updateManifest,
    setProvider,
    setCloudflare,
    setSecret,
    chooseTemplate,
    reset,
  };
}

/** Validate the manifest; return a map of field-path -> message. */
export function validateManifest(manifest: SignerManifest): Record<string, string> {
  const res = manifestSchema.safeParse(manifest);
  if (res.success) return {};
  const out: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const path = issue.path.join('.') || '_';
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

export function useRequiredSecrets(manifest: SignerManifest) {
  return useMemo(() => requiredSecrets(manifest), [manifest]);
}
