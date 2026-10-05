import { detectAddress } from './detectors/address.js';
import { detectApiKey } from './detectors/apiKey.js';
import { detectCreditCard } from './detectors/creditCard.js';
import { detectCredentialPair } from './detectors/credentialPair.js';
import { detectEmail } from './detectors/email.js';
import { detectIpAddress } from './detectors/ipAddress.js';
import { detectJwt } from './detectors/jwt.js';
import { detectPhone } from './detectors/phone.js';
import { detectPrivateKey } from './detectors/privateKey.js';
import { detectUrl } from './detectors/url.js';
import { resolveFindings } from './overlap.js';
import type { DeterministicMeta, Detector, Finding, FindingCategory, RawMatch, Span } from './types.js';

export * from './types.js';
export { resolveFindings } from './overlap.js';
export { luhnValid, hasKnownCardPrefix } from './luhn.js';

/**
 * Order matters in one direction only: a detector listed earlier adds its spans
 * to `claimed`, and generic (low-precision) matches that overlap those spans are
 * suppressed. That is how a `password=...` that belongs to a credential pair is
 * reported as CREDENTIAL_PAIR rather than twice.
 */
const DETECTORS: { name: string; run: Detector }[] = [
  { name: 'privateKey', run: detectPrivateKey },
  { name: 'credentialPair', run: detectCredentialPair },
  { name: 'jwt', run: detectJwt },
  { name: 'apiKey', run: detectApiKey },
  { name: 'creditCard', run: detectCreditCard },
  { name: 'ipAddress', run: detectIpAddress },
  { name: 'email', run: detectEmail },
  { name: 'phone', run: detectPhone },
  { name: 'url', run: detectUrl },
  { name: 'address', run: detectAddress },
];

export const ENGINE_NAME = 'deterministic-v1';

/**
 * Runs every detector over `text` and returns non-overlapping findings ordered
 * by position. Pure function: the input text is never stored or logged.
 */
export function detectSensitiveInfo(text: string): Finding[] {
  const claimed: Span[] = [];
  const matches: RawMatch[] = [];

  DETECTORS.forEach((detector, detectorIndex) => {
    for (const match of detector.run({ text, claimed })) {
      const stamped: RawMatch = { ...match, detectorIndex };
      matches.push(stamped);
      claimed.push({ start: stamped.start, end: stamped.end });
    }
  });

  return resolveFindings(matches);
}

export function buildMeta(text: string, findings: Finding[]): DeterministicMeta {
  const categories = [...new Set(findings.map((finding) => finding.category))].sort() as FindingCategory[];

  return {
    findingCount: findings.length,
    categoryCount: categories.length,
    categories,
    charactersAnalyzed: text.length,
    engine: ENGINE_NAME,
  };
}