import type { Detector, RawMatch } from '../types.js';

const LABEL_EXPLANATION =
  'A labelled address gives away where someone lives or works. Combined with a name it is routinely used for stalking, doxxing and targeted scams.';

const STREET_EXPLANATION =
  'This looks like a street address. A home or workplace address narrows a person to a very small area.';

const ADDRESS_LABEL =
  /\b(?:(?:home|office|work|billing|mailing|shipping|permanent|residential|postal)\s+)?address(?:es)?\s*(?:is|are)?\s*[:\-]\s*/gi;

const STREET_TYPE_WORDS = [
  'avenue',
  'boulevard',
  'crescent',
  'highway',
  'parkway',
  'terrace',
  'street',
  'court',
  'drive',
  'lane',
  'road',
  'st',
  'rd',
  'ave',
  'blvd',
  'ct',
  'dr',
  'ln',
  'hwy',
  'pkwy',
];

/** Matches a word regardless of case: `street` becomes `[sS][tT]...`. */
function anyCase(word: string): string {
  return [...word].map((letter) => `[${letter.toLowerCase()}${letter.toUpperCase()}]`).join('');
}

const STREET_TYPES = STREET_TYPE_WORDS.map(anyCase).join('|');

/**
 * A house number, then one or more capitalised words, then a street type. The
 * capitalised word requirement is what keeps "3 street food stalls" out.
 */
const STREET_PATTERN = new RegExp(
  `\\b\\d{1,5}[A-Za-z]?\\s+(?:[A-Z][\\p{L}'-]*\\s+){1,4}(?:${STREET_TYPES})\\b\\.?`,
  'gu',
);

/** Labels alone are not enough; the value must look like a real location. */
const REJECTED_VALUES = /^(?:n\/?a|none|unknown|tbd|-|see above)$/i;
const MIN_LABEL_VALUE_LENGTH = 6;
const MAX_LABEL_VALUE_LENGTH = 140;

function readLabelledValue(text: string, from: number): { value: string; start: number; end: number } | null {
  const limit = Math.min(text.length, from + MAX_LABEL_VALUE_LENGTH);
  let stop = from;

  while (stop < limit) {
    const char = text[stop];
    if (char === '\n' || char === ';' || char === '|') break;
    if (char === '.' && /\s/.test(text[stop + 1] ?? '')) break;
    stop += 1;
  }

  const raw = text.slice(from, stop);
  const value = raw.replace(/[\s,;:.-]+$/, '').trim();
  if (value.length < MIN_LABEL_VALUE_LENGTH) return null;
  if (REJECTED_VALUES.test(value)) return null;

  const offset = text.indexOf(value, from);
  if (offset === -1) return null;

  return { value, start: offset, end: offset + value.length };
}

export const detectAddress: Detector = ({ text }): RawMatch[] => {
  const matches: RawMatch[] = [];

  for (const match of text.matchAll(ADDRESS_LABEL)) {
    const start = match.index;
    if (start === undefined) continue;

    const parsed = readLabelledValue(text, start + match[0].length);
    if (parsed === null) continue;

    matches.push({
      detectorIndex: -1,
      category: 'ADDRESS',
      severity: 'HIGH',
      start: parsed.start,
      end: parsed.end,
      matchedText: parsed.value,
      explanation: LABEL_EXPLANATION,
      confidence: 0.9,
    });
  }

  for (const match of text.matchAll(STREET_PATTERN)) {
    const value = match[0];
    const start = match.index;
    if (value === undefined || start === undefined) continue;

    const trimmed = value.replace(/[.\s]+$/, '');

    matches.push({
      detectorIndex: -1,
      category: 'ADDRESS',
      severity: 'HIGH',
      start,
      end: start + trimmed.length,
      matchedText: trimmed,
      explanation: STREET_EXPLANATION,
      confidence: 0.75,
    });
  }

  return matches;
};