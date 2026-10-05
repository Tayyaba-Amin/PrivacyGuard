import type { Detector, RawMatch } from '../types.js';

const EXPLANATION =
  'A PEM private key is the master secret for a keypair. Published once, it lets anyone impersonate the holder, decrypt past traffic and sign documents as them.';

/** Requires a matching BEGIN/END pair, so a stray header does not match. */
const PEM_BLOCK =
  /-----BEGIN ((?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?)-----[\s\S]{0,8192}?-----END \1-----/g;

const MAX_PEM_LENGTH = 8200;

export const detectPrivateKey: Detector = ({ text }): RawMatch[] => {
  const matches: RawMatch[] = [];

  for (const match of text.matchAll(PEM_BLOCK)) {
    const value = match[0];
    const start = match.index;
    const header = match[1];
    if (value === undefined || start === undefined || header === undefined) continue;
    if (value.length > MAX_PEM_LENGTH) continue;

    const kind = header.replace(/\s+/g, ' ').trim();

    matches.push({
      detectorIndex: -1,
      category: 'PRIVATE_KEY',
      severity: 'CRITICAL',
      start,
      end: start + value.length,
      matchedText: value,
      explanation: `${EXPLANATION} This block declares a ${kind}.`,
      confidence: 0.99,
    });
  }

  return matches;
};