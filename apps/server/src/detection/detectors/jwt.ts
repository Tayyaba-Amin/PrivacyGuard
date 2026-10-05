import type { Detector, RawMatch } from '../types.js';
import { isJwtHeaderSegment } from '../validators.js';

const EXPLANATION =
  'A JSON Web Token is a bearer credential. Anyone holding it can replay the requests it authorises until it expires, so it must be treated like a password.';

/** Three base64url sections, the first of which encodes a JWT header. */
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}(?![A-Za-z0-9_-])/g;

export const detectJwt: Detector = ({ text }): RawMatch[] => {
  const matches: RawMatch[] = [];

  for (const match of text.matchAll(JWT_PATTERN)) {
    const value = match[0];
    const start = match.index;
    if (value === undefined || start === undefined) continue;

    const header = value.split('.')[0] ?? '';
    matches.push({
      detectorIndex: -1,
      category: 'JWT',
      severity: 'CRITICAL',
      start,
      end: start + value.length,
      matchedText: value,
      explanation: EXPLANATION,
      confidence: isJwtHeaderSegment(header) ? 0.99 : 0.88,
    });
  }

  return matches;
};