/**
 * Deterministic text redaction.
 *
 * Replaces sensitive spans with category-specific tokens using the detector's
 * exact character offsets. The same text + same findings always produce the
 * same protected text. No model is involved.
 */

import {
  type ProtectInput,
  type ProtectionResult,
  type Redaction,
  isValidSpan,
  tokenForCategory,
} from './types.js';

/**
 * Redacts the sensitive spans in `input.text` using the provided findings.
 *
 * Invalid spans are ignored. Overlapping spans are resolved by keeping the
 * first span by start position (matching the detector's priority ordering).
 *
 * This function never logs the input text or any matched values.
 */
export function protectText(input: ProtectInput): ProtectionResult {
  const { text, findings } = input;

  if (text.length === 0 || findings.length === 0) {
    return {
      protectedText: text,
      redactionCount: 0,
      redactions: [],
    };
  }

  // Filter to valid spans and sort by start offset (defensive; detector already orders).
  const validFindings = findings
    .filter((finding) => isValidSpan(finding, text.length))
    .sort((a, b) => a.start - b.start);

  // Resolve overlapping spans: keep the first by start position.
  const nonOverlapping: typeof validFindings = [];
  for (const finding of validFindings) {
    const overlaps = nonOverlapping.some(
      (existing) => existing.start < finding.end && finding.start < existing.end,
    );
    if (!overlaps) {
      nonOverlapping.push(finding);
    }
  }

  // Build the protected text by copying non-sensitive segments and inserting tokens.
  let result = '';
  let lastEnd = 0;
  const redactions: Redaction[] = [];

  for (const finding of nonOverlapping) {
    // Append text before this finding
    result += text.slice(lastEnd, finding.start);

    // Determine replacement token
    const replacement = tokenForCategory(finding.category);

    // Append replacement
    result += replacement;

    // Record this redaction
    redactions.push({
      findingId: finding.id,
      category: finding.category,
      start: finding.start,
      end: finding.end,
      replacement,
    });

    lastEnd = finding.end;
  }

  // Append any trailing text after the last finding
  result += text.slice(lastEnd);

  return {
    protectedText: result,
    redactionCount: redactions.length,
    redactions,
  };
}

/**
 * Redaction tokens for all categories (for external reference or testing).
 */
export { REDACTION_TOKENS, FALLBACK_TOKEN, isValidSpan, tokenForCategory } from './types.js';