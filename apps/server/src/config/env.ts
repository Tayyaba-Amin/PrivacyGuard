import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

// `.env` lives in the repository root. The depth is identical for `src/config`
// and `dist/config`, so one relative lookup works in dev and in the build.
loadDotenv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)) });

const DEFAULT_PORT = 4000;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_CORS_ORIGINS = 'http://localhost:5173';
const DEFAULT_MAX_TEXT_CHARS = 20_000;

/**
 * Featherless exposes an OpenAI-compatible `/v1/chat/completions` endpoint, so no
 * SDK is required and no other provider is involved. The base URL is
 * configurable mainly so the test-suite can point the provider at a local mock.
 */
const DEFAULT_FEATHERLESS_BASE_URL = 'https://api.featherless.ai/v1';
const DEFAULT_FEATHERLESS_MODEL = 'Qwen/Qwen3-8B';
const DEFAULT_FEATHERLESS_TIMEOUT_MS = 15_000;
const DEFAULT_FEATHERLESS_MAX_CONTEXT_CHARS = 4_000;
const DEFAULT_FEATHERLESS_MAX_TOKENS = 1_200;

function readInt(raw: string | undefined, name: string, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid ${name}: expected an integer between ${min} and ${max}, received "${raw}".`);
  }
  return parsed;
}

const readPort = (raw: string | undefined): number => readInt(raw, 'PORT', DEFAULT_PORT, 1, 65535);

const readList = (raw: string | undefined, fallback: string): string[] =>
  (raw ?? fallback)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

/** Strips trailing slashes so `${baseUrl}/chat/completions` is always well formed. */
const readBaseUrl = (raw: string | undefined): string =>
  (raw?.trim() || DEFAULT_FEATHERLESS_BASE_URL).replace(/\/+$/, '');

export type AppConfig = {
  nodeEnv: string;
  isProduction: boolean;
  host: string;
  port: number;
  corsOrigins: string[];
  /** Upper bound on a single analyze request. Larger payloads get a 413. */
  maxTextChars: number;
  /** Master switch for the contextual-analysis layer. */
  aiEnabled: boolean;
  ai: {
    provider: 'featherless';
    /**
     * Server-side secret. Never logged, never serialised into an HTTP response
     * and never exposed to the browser bundle. When absent the AI layer reports
     * `unavailable` and the deterministic engine stands alone.
     */
    apiKey: string | undefined;
    model: string;
    baseUrl: string;
    timeoutMs: number;
    /** Hard ceiling on the user-text characters placed into a single prompt. */
    maxContextChars: number;
    maxTokens: number;
  };
};

export const config: AppConfig = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  host: process.env.HOST?.trim() || DEFAULT_HOST,
  port: readPort(process.env.PORT),
  corsOrigins: readList(process.env.CORS_ORIGINS, DEFAULT_CORS_ORIGINS),
  maxTextChars: readInt(process.env.MAX_TEXT_CHARS, 'MAX_TEXT_CHARS', DEFAULT_MAX_TEXT_CHARS, 100, 200_000),
  aiEnabled: process.env.AI_ENABLED?.trim().toLowerCase() !== 'false',
  ai: {
    provider: 'featherless',
    apiKey: process.env.FEATHERLESS_API_KEY?.trim() || undefined,
    model: process.env.FEATHERLESS_MODEL?.trim() || DEFAULT_FEATHERLESS_MODEL,
    baseUrl: readBaseUrl(process.env.FEATHERLESS_BASE_URL),
    timeoutMs: readInt(
      process.env.FEATHERLESS_TIMEOUT_MS,
      'FEATHERLESS_TIMEOUT_MS',
      DEFAULT_FEATHERLESS_TIMEOUT_MS,
      1_000,
      120_000,
    ),
    maxContextChars: readInt(
      process.env.FEATHERLESS_MAX_CONTEXT_CHARS,
      'FEATHERLESS_MAX_CONTEXT_CHARS',
      DEFAULT_FEATHERLESS_MAX_CONTEXT_CHARS,
      200,
      200_000,
    ),
    maxTokens: readInt(
      process.env.FEATHERLESS_MAX_TOKENS,
      'FEATHERLESS_MAX_TOKENS',
      DEFAULT_FEATHERLESS_MAX_TOKENS,
      64,
      8_192,
    ),
  },
};