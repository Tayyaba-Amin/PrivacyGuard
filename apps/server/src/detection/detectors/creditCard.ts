import { hasKnownCardPrefix, luhnValid } from '../luhn.js';
import type { Detector, RawMatch } from '../types.js';
import { digitsOnly } from '../validators.js';

const EXPLANATION =
  'A payment-card number is enough to attempt charges. Combined with a name or expiry date on the same text it is very likely to succeed.';

/** 12 to 19 digits, optionally grouped by single spaces or hyphens. */
const CARD_RUN = /(?<!\d)\d(?:[ -]?\d){11,18}(?!\d)/g;

export const detectCreditCard: Detector = ({ text }): RawMatch[] => {
  const matches: RawMatch[] = [];

  for (const match of text.matchAll(CARD_RUN)) {
    const value = match[0];
    const start = match.index;
    if (value === undefined || start === undefined) continue;

    const digits = digitsOnly(value);
    if (digits.length < 13 || digits.length > 19) continue;

    // Luhn rejects typos; the issuer prefix rejects random 16-digit numbers.
    if (!hasKnownCardPrefix(digits)) continue;
    if (!luhnValid(digits)) continue;

    matches.push({
      detectorIndex: -1,
      category: 'CREDIT_CARD',
      severity: 'CRITICAL',
      start,
      end: start + value.length,
      matchedText: value,
      explanation: EXPLANATION,
      confidence: 0.96,
    });
  }

  return matches;
};