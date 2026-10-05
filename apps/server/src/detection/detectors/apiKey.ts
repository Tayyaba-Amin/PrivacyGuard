import type { Detector, RawMatch } from '../types.js';
import { isPlaceholderSecret } from '../validators.js';
import { spansOverlap } from '../types.js';
import { isSecretKeyName, readValue } from './assignment.js';

type ProviderPattern = {
  label: string;
  pattern: RegExp;
  confidence: number;
};

/**
 * Only patterns with an unmistakable vendor prefix are treated as high
 * confidence. A bare high-entropy string is never called an API key.
 */
const PROVIDER_PATTERNS: ProviderPattern[] = [
  {
    label: 'OpenAI-style secret key',
    pattern: /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{16,}\b/g,
    confidence: 0.98,
  },
  {
    label: 'Stripe secret key',
    pattern: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    confidence: 0.98,
  },
  {
    label: 'GitHub personal access token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g,
    confidence: 0.98,
  },
  {
    label: 'GitHub fine-grained token',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    confidence: 0.98,
  },
  {
    label: 'AWS access key id',
    pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
    confidence: 0.98,
  },
  {
    label: 'Google API key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    confidence: 0.97,
  },
  {
    label: 'Slack token',
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
    confidence: 0.97,
  },
  {
    label: 'npm access token',
    pattern: /\bnpm_[A-Za-z0-9]{36}\b/g,
    confidence: 0.97,
  },
];

/** `api_key = ...`, `api-key: ...`, `token=...`, `password: ...`. */
const SECRET_ASSIGNMENT =
  /(?<![A-Za-z0-9_.-])([A-Za-z_][A-Za-z0-9_.-]{0,30})\s*[:=]\s*/g;

const MIN_GENERIC_VALUE_LENGTH = 6;

export const detectApiKey: Detector = ({ text, claimed }): RawMatch[] => {
  const matches: RawMatch[] = [];
  const claimedBy = (start: number, end: number) =>
    claimed.some((span) => spansOverlap({ start, end }, span));

  for (const { label, pattern, confidence } of PROVIDER_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0];
      const start = match.index;
      if (value === undefined || start === undefined) continue;

      matches.push({
        detectorIndex: -1,
        category: 'API_KEY',
        severity: 'CRITICAL',
        start,
        end: start + value.length,
        matchedText: value,
        explanation: `A recognisable ${label}. Anyone who reads it can act as the account that issued it until it is revoked.`,
        confidence,
      });
    }
  }

  for (const match of text.matchAll(SECRET_ASSIGNMENT)) {
    const key = match[1];
    const keyStart = match.index;
    if (key === undefined || keyStart === undefined) continue;
    if (!isSecretKeyName(key)) continue;

    const parsed = readValue(text, keyStart + match[0].length);
    if (parsed === null) continue;
    if (parsed.value.length < MIN_GENERIC_VALUE_LENGTH) continue;
    if (isPlaceholderSecret(parsed.value)) continue;

    const start = keyStart;
    const end = parsed.end;

    // A specific detector already owns this span (credential pair or JWT).
    if (claimedBy(start, end)) continue;

    matches.push({
      detectorIndex: -1,
      category: 'API_KEY',
      severity: 'CRITICAL',
      start,
      end,
      matchedText: text.slice(start, end),
      explanation: `"${key}" is assigned a literal secret. Environment variables and secret managers exist precisely so this value never appears in shared text.`,
      confidence: 0.85,
    });
  }

  return matches;
};