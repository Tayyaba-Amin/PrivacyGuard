/** Values that look like assignments but are obviously not real secrets. */
const PLACEHOLDER_TOKENS = [
  'process.env',
  'import.meta.env',
  'os.environ',
  'env[',
  'your',
  'changeme',
  'change-me',
  'placeholder',
  'example',
  'sample',
  'dummy',
  'fake',
  'redacted',
  'secretkeyhere',
  'xxxxxxxx',
  'todo',
  'tbd',
  'undefined',
  'null',
  'none',
];

export function isPlaceholderSecret(value: string): boolean {
  const lowered = value.toLowerCase();

  if (lowered.includes('${') || lowered.includes('<') || lowered.includes('>')) return true;
  if (/^[*•x.]+$/i.test(lowered)) return true;
  return PLACEHOLDER_TOKENS.some((token) => lowered.includes(token));
}

/**
 * Decodes a base64url segment. Returns null when the input is not valid
 * base64url or does not decode to UTF-8 text.
 */
export function decodeBase64Url(segment: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;

  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    segment.length + ((4 - (segment.length % 4)) % 4),
    '=',
  );

  try {
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/** True when a JWT header segment really decodes to a signed-token header. */
export function isJwtHeaderSegment(segment: string): boolean {
  const decoded = decodeBase64Url(segment);
  if (decoded === null) return false;

  try {
    const parsed: unknown = JSON.parse(decoded);
    if (typeof parsed !== 'object' || parsed === null) return false;

    const header = parsed as Record<string, unknown>;
    return typeof header.alg === 'string';
  } catch {
    return false;
  }
}

/** Strips separators used in phone and card numbers. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}