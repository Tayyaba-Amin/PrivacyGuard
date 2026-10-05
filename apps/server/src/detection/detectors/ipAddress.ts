import type { Detector, RawMatch } from '../types.js';

const EXPLANATION =
  'An IP address reveals a network location and can expose internal infrastructure. Paired with a hostname it often makes an internal service reachable.';

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';

/**
 * Each octet is constrained to 0-255 by the pattern itself. The leading
 * lookbehind stops a match inside a longer dotted token (so `999.1.1.1` cannot
 * yield `99.1.1.1`), and the trailing lookahead rejects dotted versions.
 */
const IPV4_PATTERN = new RegExp(`(?<![\\w.])${OCTET}(?:\\.${OCTET}){3}(?!\\.\\d)`, 'g');

/**
 * `1.2.3.4` is indistinguishable from a version string, so a dotted quad
 * introduced by a release keyword is treated as a version, not an address.
 */
const VERSION_CONTEXT = /(?:\b(?:v|ver|version|release|build|rev|revision)\s*\.?\s*)$/i;
const CONTEXT_WINDOW = 24;

function isVersionLiteral(text: string, start: number): boolean {
  return VERSION_CONTEXT.test(text.slice(Math.max(0, start - CONTEXT_WINDOW), start));
}

export const detectIpAddress: Detector = ({ text }): RawMatch[] => {
  const matches: RawMatch[] = [];

  for (const match of text.matchAll(IPV4_PATTERN)) {
    const value = match[0];
    const start = match.index;
    if (value === undefined || start === undefined) continue;
    if (isVersionLiteral(text, start)) continue;

    matches.push({
      detectorIndex: -1,
      category: 'IP_ADDRESS',
      severity: 'LOW',
      start,
      end: start + value.length,
      matchedText: value,
      explanation: EXPLANATION,
      confidence: 0.95,
    });
  }

  return matches;
};