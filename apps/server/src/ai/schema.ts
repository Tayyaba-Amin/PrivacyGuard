/**
 * Validation for model output.
 *
 * Everything that comes back from the provider is untrusted data. This module
 * is the only place that reads it, and it never throws: a malformed or hostile
 * response becomes a tagged failure so the caller can fall back to the
 * deterministic explanation.
 *
 * Nothing here trusts a field it has not type-checked, and no field that could
 * describe a *span* is accepted at all. Spans come from the detector only.
 */

import { SEVERITIES, type Severity } from '../detection/types.js';
import type { AiStatusReason } from './types.js';

const MAX_EXPLANATION_CHARS = 600;
const MAX_RECOMMENDATION_CHARS = 300;
const MAX_SUMMARY_CHARS = 1_200;

/** Control characters, zero-width and bidi overrides used to spoof a UI. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export type ModelAnalysis = {
  findingId: string;
  isSensitive: boolean;
  confidence: number;
  severity: Severity;
  explanation: string;
  recommendation: string;
};

export type ModelReport = {
  analyses: ModelAnalysis[];
  summary: string | null;
};

export type ParseResult =
  | { ok: true; report: ModelReport }
  | { ok: false; reason: Extract<AiStatusReason, 'malformed_response' | 'invalid_response'> };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSeverity = (value: unknown): value is Severity =>
  typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);

/** Collapses whitespace and strips control characters, then caps the length. */
function cleanText(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;

  const cleaned = value.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return null;

  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars - 1)}…` : cleaned;
}

/**
 * A model probability is only usable inside 0..1. A value outside that range is
 * rejected rather than rescaled: guessing at the model's units is exactly the
 * kind of assumption that lets bad output through.
 */
function cleanConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

/**
 * Pulls a JSON object out of a completion.
 *
 * Models wrap JSON in prose or markdown fences even when told not to, so a
 * fenced or prefixed object is recovered before parsing. Anything that still
 * does not parse is a malformed response, not an exception.
 */
function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const candidates = [withoutFence];

  const first = withoutFence.indexOf('{');
  const last = withoutFence.lastIndexOf('}');
  if (first !== -1 && last > first) {
    candidates.push(withoutFence.slice(first, last + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // try the next candidate
    }
  }

  return undefined;
}

function parseAnalysisEntry(value: unknown): ModelAnalysis | null {
  if (!isRecord(value)) return null;

  const findingId = typeof value['findingId'] === 'string' ? value['findingId'].trim() : '';
  if (findingId.length === 0) return null;

  if (typeof value['isSensitive'] !== 'boolean') return null;

  const confidence = cleanConfidence(value['confidence']);
  if (confidence === null) return null;

  if (!isSeverity(value['severity'])) return null;

  const explanation = cleanText(value['explanation'], MAX_EXPLANATION_CHARS);
  if (explanation === null) return null;

  const recommendation = cleanText(value['recommendation'], MAX_RECOMMENDATION_CHARS);
  if (recommendation === null) return null;

  return { findingId, isSensitive: value['isSensitive'], confidence, severity: value['severity'], explanation, recommendation };
}

export function parseModelReport(raw: string): ParseResult {
  const parsed = extractJsonObject(raw);

  if (!isRecord(parsed)) {
    return { ok: false, reason: 'malformed_response' };
  }

  const analyses = parsed['analyses'];
  if (!Array.isArray(analyses)) {
    return { ok: false, reason: 'malformed_response' };
  }

  const accepted: ModelAnalysis[] = [];
  for (const entry of analyses) {
    const analysis = parseAnalysisEntry(entry);
    // One bad entry does not invalidate the rest, but a duplicated findingId
    // cannot overwrite an entry that was already accepted.
    if (analysis && !accepted.some((existing) => existing.findingId === analysis.findingId)) {
      accepted.push(analysis);
    }
  }

  if (accepted.length === 0) {
    return { ok: false, reason: 'invalid_response' };
  }

  return {
    ok: true,
    report: {
      analyses: accepted,
      summary: cleanText(parsed['summary'], MAX_SUMMARY_CHARS),
    },
  };
}