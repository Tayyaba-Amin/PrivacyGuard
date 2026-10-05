import type { Detector, RawMatch, Span } from '../types.js';
import { spansOverlap } from '../types.js';

const EXPLANATION =
  'An email address is a permanent public identifier. It is the join key behind most data breaches and makes it easy to match your other accounts and target you with phishing.';

/**
 * Local part, `@`, then one or more domain labels. Boundaries exclude the
 * characters that may appear inside an address, so a match cannot start in the
 * middle of a longer token.
 */
const EMAIL_PATTERN =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*(?![A-Za-z0-9-])/g;

function isPlausibleEmail(value: string): boolean {
  const at = value.lastIndexOf('@');
  if (at <= 0) return false;

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);

  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;

  const labels = domain.split('.');
  if (labels.length < 2) return false;
  if (labels.some((label) => label.length === 0 || label.startsWith('-') || label.endsWith('-'))) {
    return false;
  }

  const tld = labels[labels.length - 1] ?? '';
  return /^[A-Za-z]{2,}$/.test(tld);
}

export const detectEmail: Detector = ({ text, claimed }: { text: string; claimed: Span[] }): RawMatch[] => {
  const matches: RawMatch[] = [];

  for (const match of text.matchAll(EMAIL_PATTERN)) {
    const value = match[0];
    const start = match.index;
    if (value === undefined || start === undefined) continue;
    if (!isPlausibleEmail(value)) continue;

    const span: Span = { start, end: start + value.length };
    if (claimed.some((other) => spansOverlap(span, other))) continue;

    matches.push({
      detectorIndex: -1,
      category: 'EMAIL',
      severity: 'MEDIUM',
      start: span.start,
      end: span.end,
      matchedText: value,
      explanation: EXPLANATION,
      confidence: 0.97,
    });
  }

  return matches;
};