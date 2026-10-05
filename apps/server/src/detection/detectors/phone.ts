import type { Detector, RawMatch } from '../types.js';
import { digitsOnly } from '../validators.js';

const EXPLANATION =
  'A personal phone number enables SIM-swap attacks, robocalls and impersonation scams, because an attacker can already see how you sign your messages.';

/** Maximal run beginning with `+`, so backtracking can never shorten a match. */
const INTERNATIONAL_RUN = /(?<![\w.+])\+\d[\d\s().-]*/g;

/** Maximal run of digits and phone separators that does not begin with `+`. */
const NATIONAL_RUN = /(?<![\w.+])\(?\d[\d ().-]*/g;

const SEPARATORS = /[() .-]/;
const GROUP_3_3_4 = /^\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{0,4}$/;

function trimTrailingSeparators(value: string): string {
  return value.replace(/[\s().-]+$/, '');
}

/**
 * A bare run of digits is never a phone number, and neither is anything long
 * enough to be an order id. We require either a leading `+` or a grouped
 * national format.
 */
function isPlausiblePhone(value: string): boolean {
  const trimmed = trimTrailingSeparators(value);
  if (trimmed.length === 0) return false;

  const digits = digitsOnly(trimmed);
  if (digits.length < 7 || digits.length > 15) return false;

  if (trimmed.startsWith('+')) return true;

  if (!SEPARATORS.test(trimmed)) return false;
  if (trimmed.startsWith('(')) return true;
  if (GROUP_3_3_4.test(trimmed)) return true;

  // National formats written without a country code are overwhelmingly local
  // numbers starting with a trunk zero.
  return trimmed.startsWith('0');
}

export const detectPhone: Detector = ({ text }): RawMatch[] => {
  const matches: RawMatch[] = [];

  const claim = (value: string, start: number) => {
    const trimmed = trimTrailingSeparators(value);
    if (trimmed.length === 0 || !isPlausiblePhone(trimmed)) return;

    matches.push({
      detectorIndex: -1,
      category: 'PHONE_NUMBER',
      severity: 'MEDIUM',
      start,
      end: start + trimmed.length,
      matchedText: trimmed,
      explanation: EXPLANATION,
      confidence: trimmed.startsWith('+') ? 0.93 : 0.85,
    });
  };

  for (const match of text.matchAll(INTERNATIONAL_RUN)) {
    const value = match[0];
    const start = match.index;
    if (value === undefined || start === undefined) continue;
    claim(value, start);
  }

  for (const match of text.matchAll(NATIONAL_RUN)) {
    const value = match[0];
    const start = match.index;
    if (value === undefined || start === undefined) continue;
    if (value.includes('+')) continue;
    claim(value, start);
  }

  return matches;
};