/**
 * Public surface of the contextual-analysis layer.
 *
 * Route code imports from here only. Featherless-specific request building lives
 * in `./featherless.ts` and is reached exclusively through `createAiProvider`,
 * so nothing outside this directory depends on a provider's wire format.
 */

import { config } from '../config/env.js';
import { createFeatherlessProvider } from './featherless.js';
import { type AiServiceOptions } from './service.js';
import type { AiProvider } from './types.js';

export * from './types.js';
export { analyzeWithContext, deterministicOutcome, type AiServiceOptions } from './service.js';
export { buildAnalysisBatches } from './context.js';
export { buildPrompt } from './prompt.js';
export { parseModelReport, type ModelReport, type ModelAnalysis } from './schema.js';
export { createFeatherlessProvider, type FeatherlessProviderOptions } from './featherless.js';

/** The provider built from server configuration. */
export function createAiProvider(): AiProvider {
  return createFeatherlessProvider({
    apiKey: config.ai.apiKey,
    model: config.ai.model,
    baseUrl: config.ai.baseUrl,
    timeoutMs: config.ai.timeoutMs,
  });
}

/** Service options derived from server configuration. */
export function aiServiceOptions(provider: AiProvider | null): AiServiceOptions {
  return {
    provider,
    enabled: config.aiEnabled,
    maxContextChars: config.ai.maxContextChars,
    maxTokens: config.ai.maxTokens,
    timeoutMs: config.ai.timeoutMs,
  };
}