/**
 * Types for the deterministic text protection (redaction) layer.
 *
 * This module replaces detected sensitive spans with category-specific tokens.
 * It never calls a model, never logs user content, and the same input always
 * produces the same output.
 */

import type { Finding, FindingCategory } from '../detection/types.js';

/** Category-aware replacement tokens. */
export const REDACTION_TOKENS: Record<FindingCategory, string> = {
  EMAIL: '[REDACTED_EMAIL]',
  PHONE_NUMBER: '[REDACTED_PHONE]',
  CREDIT_CARD: '[REDACTED_CREDIT_CARD]',
  IP_ADDRESS: '[REDACTED_IP]',
  URL: '[REDACTED_URL]',
  API_KEY: '[REDACTED_API_KEY]',
  JWT: '[REDACTED_JWT]',
  PRIVATE_KEY: '[REDACTED_PRIVATE_KEY]',
  CREDENTIAL_PAIR: '[REDACTED_CREDENTIALS]',
  ADDRESS: '[REDACTED_ADDRESS]',
};

/** Fallback token for any category not explicitly listed above. */
export const FALLBACK_TOKEN = '[REDACTED_SENSITIVE_DATA]';

/** A single redaction applied to the text. */
export type Redaction = {
  /** The finding ID that triggered this redaction. */
  findingId: string;
  /** The category of the finding that was redacted. */
  category: FindingCategory;
  /** Inclusive start offset in the original text. */
  start: number;
  /** Exclusive end offset in the original text. */
  end: number;
  /** The token that replaced the sensitive span. */
  replacement: string;
};

/** Result of protecting a text. */
export type ProtectionResult = {
  /** The text with all valid spans replaced by their tokens. */
  protectedText: string;
  /** Number of redactions applied. */
  redactionCount: number;
  /** Per-redaction metadata, most influential first. */
  redactions: Redaction[];
};

/** Input to the protection function. */
export type ProtectInput = {
  /** The original text submitted for analysis. */
  text: string;
  /** Findings from the deterministic detector (server-authoritative). */
  findings: Finding[];
};

/**
 * Validates that a span is well-formed for the given text length.
 * A valid span has integer bounds, start >= 0, end > start, end <= text.length.
 */
export function isValidSpan(span: { start: number; end: number }, textLength: number): boolean {
  return (
    Number.isInteger(span.start) &&
    Number.isInteger(span.end) &&
    span.start >= 0 &&
    span.end > span.start &&
    span.end <= textLength
  );
}

/**
 * Returns the redaction token for a category, falling back to the generic token.
 */
export function tokenForCategory(category: FindingCategory): string {
  return REDACTION_TOKENS[category] ?? FALLBACK_TOKEN;
}