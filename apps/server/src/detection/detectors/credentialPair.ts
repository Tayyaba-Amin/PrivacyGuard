import type { Detector, RawMatch } from '../types.js';
import { isPlaceholderSecret } from '../validators.js';
import { isSecretKeyName, isUsernameKeyName, readValue } from './assignment.js';

type Entry = {
  key: string;
  keyStart: number;
  valueStart: number;
  valueEnd: number;
  end: number;
  role: 'username' | 'secret';
};

const ASSIGNMENT = /(?<![A-Za-z0-9_.-])([A-Za-z_][A-Za-z0-9_.-]{0,30})\s*[:=]\s*/g;

/** How far apart a username and its secret may be and still count as a pair. */
const PAIR_WINDOW = 300;

const MIN_USERNAME_LENGTH = 2;
const MIN_SECRET_LENGTH = 4;

/**
 * Password-like keys are paired first: a username next to a password is the
 * actionable finding, whereas a username next to an API key is usually just
 * two unrelated credentials sitting in the same config file.
 */
const PASSWORD_LIKE = /^(?:pass|passwd|pwd|password|passphrase)$/;

function isPasswordLike(key: string): boolean {
  const parts = key.toLowerCase().split(/[._-]/).filter((part) => part.length > 0);
  const last = parts[parts.length - 1] ?? key.toLowerCase();
  return PASSWORD_LIKE.test(last) || PASSWORD_LIKE.test(key.toLowerCase());
}

/**
 * Finds a username and a secret that sit close together, which is far more
 * actionable than either value alone. Values are never included in the
 * explanation or in any log output.
 */
export const detectCredentialPair: Detector = ({ text }): RawMatch[] => {
  const entries: Entry[] = [];

  for (const match of text.matchAll(ASSIGNMENT)) {
    const key = match[1];
    const keyStart = match.index;
    if (key === undefined || keyStart === undefined) continue;

    const parsed = readValue(text, keyStart + match[0].length);
    if (parsed === null) continue;

    if (isUsernameKeyName(key)) {
      if (parsed.value.length < MIN_USERNAME_LENGTH) continue;
      entries.push({ key, keyStart, ...parsed, role: 'username' });
      continue;
    }

    if (isSecretKeyName(key)) {
      if (parsed.value.length < MIN_SECRET_LENGTH) continue;
      if (isPlaceholderSecret(parsed.value)) continue;
      entries.push({ key, keyStart, ...parsed, role: 'secret' });
    }
  }

  const matches: RawMatch[] = [];
  const usedUsernames = new Set<Entry>();

  const secrets = entries.filter((entry) => entry.role === 'secret');
  const ordered = [
    ...secrets.filter((entry) => isPasswordLike(entry.key)),
    ...secrets.filter((entry) => !isPasswordLike(entry.key)),
  ];

  for (const secret of ordered) {

    // Deterministic pairing: prefer the closest unused username, preferring one
    // that appears before the secret, and never reuse a username.
    let chosen: { entry: Entry; distance: number } | null = null;

    for (const candidate of entries) {
      if (candidate.role !== 'username' || usedUsernames.has(candidate)) continue;

      const distance =
        candidate.end <= secret.keyStart
          ? secret.keyStart - candidate.end
          : candidate.keyStart >= secret.end
            ? candidate.keyStart - secret.end
            : Number.MAX_SAFE_INTEGER;

      if (distance > PAIR_WINDOW) continue;

      if (chosen === null || distance < chosen.distance) {
        chosen = { entry: candidate, distance };
      }
    }

    if (chosen === null) continue;
    usedUsernames.add(chosen.entry);

    const start = Math.min(chosen.entry.keyStart, secret.keyStart);
    const end = Math.max(chosen.entry.end, secret.end);

    matches.push({
      detectorIndex: -1,
      category: 'CREDENTIAL_PAIR',
      severity: 'HIGH',
      start,
      end,
      matchedText: text.slice(start, end),
      explanation: `A "${chosen.entry.key}" and a "${secret.key}" appear together. Credentials in shared text are the most common cause of account takeover, because one field alone is never enough and the pair is.`,
      confidence: 0.9,
    });
  }

  return matches;
};