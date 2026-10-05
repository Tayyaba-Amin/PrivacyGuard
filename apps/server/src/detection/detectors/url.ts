import type { Detector, RawMatch } from '../types.js';

const EXPLANATION =
  'A URL can carry private hostnames, internal addresses, signed query parameters or tracking identifiers. Sharing one may hand over more than you intended.';

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi;

/** Sentence punctuation that is almost never part of a URL. */
const TRAILING_NOISE = /[.,;:!?)\]}'"]+$/;

function hostOf(value: string): string {
  const afterScheme = value.replace(/^https?:\/\//i, '');
  const end = afterScheme.search(/[/?#]/);
  return (end === -1 ? afterScheme : afterScheme.slice(0, end)).split('@').pop() ?? '';
}

export const detectUrl: Detector = ({ text }): RawMatch[] => {
  const matches: RawMatch[] = [];

  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0];
    const start = match.index;
    if (raw === undefined || start === undefined) continue;

    const value = raw.replace(TRAILING_NOISE, '');
    if (value.length <= 'https://'.length) continue;
    if (hostOf(value).length === 0) continue;

    matches.push({
      detectorIndex: -1,
      category: 'URL',
      severity: 'LOW',
      start,
      end: start + value.length,
      matchedText: value,
      explanation: EXPLANATION,
      confidence: 0.9,
    });
  }

  return matches;
};