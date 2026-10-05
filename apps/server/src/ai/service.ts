/**
 * Orchestration for the contextual-analysis layer.
 *
 * This is the only module the route talks to. It decides whether the provider
 * runs, builds the bounded prompt, validates what comes back, and merges the
 * result into the deterministic findings.
 *
 * Two invariants hold on every path, success or failure:
 *
 * - The findings and their spans always come from the deterministic detector.
 *   Model output is matched back to an existing finding id or discarded, so the
 *   model cannot introduce a finding, a category or a span.
 * - When the provider is missing, slow, erroring or malformed, the caller still
 *   receives every deterministic finding with deterministic commentary plus a
 *   machine-readable status. Nothing is fabricated.
 */

import type { Finding, Severity } from '../detection/types.js';
import { buildAnalysisBatches } from './context.js';
import { buildPrompt } from './prompt.js';
import { parseModelReport, type ModelAnalysis } from './schema.js';
import type {
  AiOutcome,
  AiProvider,
  AiStatus,
  AiStatusReason,
  ContextualAnalysis,
  ContextualOverrides,
  EnrichedFinding,
} from './types.js';

/** Ceiling on a merged summary assembled from several batches. */
const MAX_SUMMARY_CHARS = 1_200;

export type AiServiceOptions = {
  provider: AiProvider | null;
  enabled: boolean;
  maxContextChars: number;
  maxTokens: number;
  /** Overall budget for the whole request, not just one provider call. */
  timeoutMs: number;
  /** Deterministic wording, reused whenever the model adds nothing. */
  overrides?: ContextualOverrides;
};

/** Metadata-only diagnostics. Never includes the prompt, the text or the key. */
function reportFailure(reason: AiStatusReason, httpStatus?: number): void {
  console.warn(
    `[privacyguard] AI contextual analysis degraded (provider=featherless reason=${reason}${
      httpStatus === undefined ? '' : ` http=${httpStatus}`
    })`,
  );
}

function toEnrichedFinding(finding: Finding, contextual: ContextualAnalysis): EnrichedFinding {
  return { ...finding, contextual };
}

/** The deterministic commentary used as the fallback for a single finding. */
function deterministicContextual(finding: Finding, overrides?: ContextualOverrides): ContextualAnalysis {
  const severity: Severity = overrides?.severity?.(finding) ?? finding.severity;

  return {
    source: 'deterministic',
    isSensitive: true,
    confidence: finding.confidence,
    severity,
    severityAdjusted: severity !== finding.severity,
    explanation: overrides?.explanation?.(finding) ?? finding.explanation,
    recommendation: overrides?.recommendation?.(finding) ?? finding.explanation,
  };
}

/**
 * Enriches findings with deterministic commentary only. Used both by the
 * "never called the model" paths and as the last-resort guard if the AI layer
 * itself ever throws, so a bug there still cannot take a request down.
 */
export function deterministicOutcome(
  findings: Finding[],
  reason: AiStatusReason,
  status: AiStatus,
  overrides?: ContextualOverrides,
): AiOutcome {
  return {
    status,
    reason,
    findings: findings.map((finding) => toEnrichedFinding(finding, deterministicContextual(finding, overrides))),
    summary: null,
    analyzedCount: 0,
    contextTruncated: false,
  };
}

function mergeSummary(parts: (string | null)[]): string | null {
  const joined = parts.filter((part): part is string => typeof part === 'string').join(' ').trim();
  if (joined.length === 0) return null;
  return joined.length > MAX_SUMMARY_CHARS ? `${joined.slice(0, MAX_SUMMARY_CHARS - 1)}…` : joined;
}

export async function analyzeWithContext(
  text: string,
  findings: Finding[],
  options: AiServiceOptions,
): Promise<AiOutcome> {
  const { provider, enabled, maxContextChars, maxTokens, timeoutMs, overrides } = options;

  // Nothing was detected, so there is nothing for the model to interpret. The
  // layer is still reported as available when it is configured.
  if (findings.length === 0) {
    const configured = provider !== null && enabled && provider.isConfigured();
    return deterministicOutcome(findings, 'no_findings', configured ? 'available' : 'unavailable', overrides);
  }

  // A null provider and the off switch are the same user-visible situation, so
  // both report `disabled` rather than pretending a key was missing.
  if (!enabled || provider === null) {
    return deterministicOutcome(findings, 'disabled', 'unavailable', overrides);
  }

  if (!provider.isConfigured()) {
    return deterministicOutcome(findings, 'missing_api_key', 'unavailable', overrides);
  }

  const batches = buildAnalysisBatches(text, findings, maxContextChars);

  if (batches.length === 0) {
    return deterministicOutcome(findings, 'invalid_response', 'degraded', overrides);
  }

  const knownIds = new Set(findings.map((finding) => finding.id));
  const accepted = new Map<string, ModelAnalysis>();
  const summaries: (string | null)[] = [];
  let contextTruncated = false;
  let failureReason: AiStatusReason = 'invalid_response';
  let httpStatus: number | undefined;

  // One overall deadline for every batch, so a long document cannot make the
  // HTTP request hang. Batches that do not make it fall back individually.
  const deadline = AbortSignal.timeout(timeoutMs);

  for (const batch of batches) {
    if (deadline.aborted) {
      failureReason = 'timeout';
      break;
    }

    contextTruncated = contextTruncated || batch.truncated;

    const result = await provider.complete(buildPrompt(batch), maxTokens, deadline);

    if (!result.ok) {
      // The provider cannot tell an overall deadline from a caller abort, so
      // the deadline is resolved here where the two are distinguishable.
      failureReason = deadline.aborted ? 'timeout' : result.reason;
      httpStatus = deadline.aborted ? undefined : result.httpStatus;
      continue;
    }

    const parsed = parseModelReport(result.content);

    if (!parsed.ok) {
      failureReason = parsed.reason;
      continue;
    }

    summaries.push(parsed.report.summary);

    for (const analysis of parsed.report.analyses) {
      // The guard that keeps the detector authoritative: an id the detector did
      // not issue is discarded, and the first valid entry per id wins.
      if (!knownIds.has(analysis.findingId) || accepted.has(analysis.findingId)) continue;
      accepted.set(analysis.findingId, analysis);
    }
  }

  const enriched = findings.map((finding) => {
    const analysis = accepted.get(finding.id);

    if (!analysis) {
      return toEnrichedFinding(finding, deterministicContextual(finding, overrides));
    }

    const contextual: ContextualAnalysis = {
      source: 'ai',
      isSensitive: analysis.isSensitive,
      confidence: analysis.confidence,
      severity: analysis.severity,
      severityAdjusted: analysis.severity !== finding.severity,
      explanation: analysis.explanation,
      recommendation: analysis.recommendation,
    };

    return toEnrichedFinding(finding, contextual);
  });

  const analyzedCount = accepted.size;
  const summary = analyzedCount > 0 ? mergeSummary(summaries) : null;
  // `available` requires the model to have covered every detected finding.
  // Anything less is reported as degraded rather than overstated.
  const status: AiStatus = analyzedCount === findings.length ? 'available' : 'degraded';

  if (status === 'degraded') {
    reportFailure(failureReason, httpStatus);
  }

  return {
    status,
    reason: status === 'available' ? 'ok' : failureReason,
    findings: enriched,
    summary,
    analyzedCount,
    contextTruncated,
  };
}