/**
 * Regression tests for the runtime generator.
 *
 * The critical invariant: the source we upload to Cloudflare must be plain
 * JavaScript. The Workers upload API does NOT transpile TypeScript, so the
 * raw `buildWorkerSource` output (valid TS, invalid JS) must go through
 * `buildWorkerJs` before deployment.
 */
import { describe, expect, it, vi } from 'vitest';
import { transformSync } from 'esbuild';

// In tests, delegate the wasm build's API to the native esbuild engine —
// identical transform semantics without fetching the wasm binary.
vi.mock('esbuild-wasm', async () => {
  const esbuild = await import('esbuild');
  return {
    initialize: () => Promise.resolve(),
    transform: (source: string, options: object) => esbuild.transform(source, options as never),
  };
});

import { buildWorkerJs, buildWorkerSource } from './generator';
import { manifestForTemplate } from '../templates';

function isValidJs(source: string): boolean {
  try {
    transformSync(source, { loader: 'js', target: 'es2022', format: 'esm' });
    return true;
  } catch {
    return false;
  }
}

describe('buildWorkerSource', () => {
  it('embeds the non-secret manifest and never secret values', () => {
    const m = manifestForTemplate('ai-search', 'Test App', 'test-signer');
    const src = buildWorkerSource(m);
    expect(src).toContain('"app": "Test App"');
    expect(src).toContain('BRAVE_API_KEY'); // the binding NAME is fine
    expect(src).not.toMatch(/sk-[a-zA-Z0-9]/); // never a key value
    expect(src).toContain('export default __worker;');
  });

  it('produces TypeScript that is NOT valid JavaScript (why transpilation is mandatory)', () => {
    const m = manifestForTemplate('ai-search', 'Test App', 'test-signer');
    // Documents the bug fixed by buildWorkerJs: raw output is TS.
    expect(isValidJs(buildWorkerSource(m))).toBe(false);
  });
});

describe('buildWorkerJs', () => {
  it('produces deployable plain JavaScript', async () => {
    const m = manifestForTemplate('ai-search', 'Test App', 'test-signer');
    const js = await buildWorkerJs(m);
    expect(isValidJs(js)).toBe(true);
    expect(js).toContain('export default __worker;');
    // No TS-only syntax should survive transpilation.
    expect(js).not.toContain('interface ');
    expect(js).not.toContain('declare const MANIFEST');
  }, 30_000);

  it('keeps every provider adapter in the bundle', async () => {
    const m = manifestForTemplate('multi', 'Multi', 'multi-signer');
    const js = await buildWorkerJs(m);
    for (const handler of ['braveHandle', 'openaiHandle', 'genericRestHandle', 'ipGeoHandle', 'indexerHandle', 'crawlerHandle', 'torGatewayHandle']) {
      expect(js).toContain(handler);
    }
  }, 30_000);
});
