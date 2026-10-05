/**
 * Types for the contextual-analysis layer.
 *
 * The deterministic detector is always the source of truth for what was found
 * and where. An AI provider may only attach commentary to findings that already
 * exist; it can never introduce a new span, category or severity for the
 * response body.
 */

import type { Finding, Severity } from '../detection/types.js';

/**
 * Per-request outcome of the AI layer.
 *
 * - `available`  a validated provider response was merged into the findings.
 * - `degraded`   the provider was called but the result was unusable, so some
 *                or all findings fell back to deterministic commentary.
 * - `unavailable` the provider was never called (disabled, or no API key).
 */
export const AI_STATUSES = ['available', 'degraded', 'unavailable'] as const;

export type AiStatus = (typeof AI_STATUSES)[number];

/** Machine-readable reason behind an `aiStatus`. Never contains user content.
 *
 * `model_not_found` and `incomplete_response` exist so the two situations that
 * look identical on the wire — an unusable `FEATHERLESS_MODEL`, and a model that
 * ran out of token budget before answering — are not both reported as a broken
 * protocol.
 */
export const AI_STATUS_REASONS = [
  'ok',
  'disabled',
  'missing_api_key',
  'no_findings',
  'http_error',
  'timeout',
  'aborted',
  'network_error',
  'provider_error',
  'model_not_found',
  'incomplete_response',
  'malformed_response',
  'invalid_response',
] as const;

export type AiStatusReason = (typeof AI_STATUS_REASONS)[number];

export const AI_PROVIDER_ID = 'featherless' as const;

export type AiProviderId = typeof AI_PROVIDER_ID;

/** Where a finding's commentary came from. */
export type ContextualSource = 'ai' | 'deterministic';

/**
 * Contextual commentary attached to a single deterministic finding.
 *
 * `severity` is contextual metadata produced by the model. It never replaces
 * `Finding.severity`, and no overall risk score is derived from it here.
 */
export type ContextualAnalysis = {
  source: ContextualSource;
  isSensitive: boolean;
  /** Model confidence between 0 and 1, already clamped and validated. */
  confidence: number;
  /** Model's contextual severity, or the deterministic severity on fallback. */
  severity: Severity;
  /** True when the model's severity differs from the deterministic severity. */
  severityAdjusted: boolean;
  explanation: string;
  recommendation: string;
};

/** A deterministic finding plus its optional contextual commentary. */
export type EnrichedFinding = Finding & {
  contextual: ContextualAnalysis;
};

export type AiMeta = {
  aiEnabled: boolean;
  aiProvider: AiProviderId;
  aiStatus: AiStatus;
  aiStatusReason: AiStatusReason;
  /** Model identifier. Safe to expose: it is not a credential. */
  aiModel: string;
  /** How many findings received AI commentary. Never exceeds findingCount. */
  aiAnalyzedCount: number;
  /** True when a contextual window was used instead of the whole text. */
  aiContextTruncated: boolean;
  /** Model-written overview. Present only when a validated response was used. */
  aiSummary: string | null;
};

export type AiOutcome = {
  status: AiStatus;
  reason: AiStatusReason;
  /** Enriched findings, identical to the input ones when the AI did not run. */
  findings: EnrichedFinding[];
  summary: string | null;
  analyzedCount: number;
  contextTruncated: boolean;
};

/**
 * Deterministic commentary, resolved per finding and used whenever the model
 * adds nothing. Keeping these as resolvers means one table of per-category
 * wording can back every fallback path.
 */
export type ContextualOverrides = {
  explanation?: (finding: Finding) => string;
  recommendation?: (finding: Finding) => string;
  severity?: (finding: Finding) => Severity;
};

/** A single unit of work: a bounded slice of text plus the findings inside it. */
export type AnalysisBatch = {
  text: string;
  findings: Finding[];
  /** True when `text` is a windowed excerpt rather than the submitted text. */
  truncated: boolean;
};

export type AiPrompt = {
  system: string;
  user: string;
};

/**
 * The only surface the rest of the application uses. Implementations must not
 * throw for an expected failure: they return a tagged result instead so the
 * caller can fall back to the deterministic engine.
 */
export type AiProviderResult =
  | { ok: true; content: string }
  | { ok: false; reason: AiStatusReason; httpStatus?: number };

export type AiProvider = {
  readonly id: AiProviderId;
  /** Model identifier for reporting. Never the API key. */
  readonly model: string;
  /** False when the provider cannot be used, e.g. no API key configured. */
  isConfigured(): boolean;
  /**
   * Returns raw completion text. Network, timeout and protocol failures come
   * back as `{ ok: false }` rather than as thrown errors.
   */
  complete(prompt: AiPrompt, maxTokens: number, signal?: AbortSignal): Promise<AiProviderResult>;
};
