/** Shared parsing for `key = value` and `key: value` style assignments. */

export type AssignmentKey = {
  key: string;
  /** Offset of the key name itself. */
  keyStart: number;
  /** Offset just past the `=` / `:` and any leading whitespace and quote. */
  valueStart: number;
  value: string;
  valueEnd: number;
  /** Offset just past the value and its closing quote, if any. */
  end: number;
};

const QUOTES = new Set(['"', "'", '`']);
const VALUE_STOP = /[\s,;"'`)\]}]/;

export type ValueSpan = {
  value: string;
  valueStart: number;
  valueEnd: number;
  end: number;
};

/**
 * Reads the value that begins at `from`, honouring an optional wrapping quote.
 * Returns null when the value is empty.
 */
export function readValue(text: string, from: number, maxLength = 120): ValueSpan | null {
  let cursor = from;

  while (cursor < text.length && (text[cursor] === ' ' || text[cursor] === '\t')) cursor += 1;

  const quote = text[cursor];
  if (quote !== undefined && QUOTES.has(quote)) {
    const closing = text.indexOf(quote, cursor + 1);
    if (closing === -1 || closing - cursor > maxLength) return null;

    return {
      value: text.slice(cursor + 1, closing),
      valueStart: cursor + 1,
      valueEnd: closing,
      end: closing + 1,
    };
  }

  const limit = Math.min(text.length, cursor + maxLength);
  let stop = cursor;
  while (stop < limit && !VALUE_STOP.test(text[stop] ?? '')) stop += 1;

  if (stop === cursor) return null;

  return { value: text.slice(cursor, stop), valueStart: cursor, valueEnd: stop, end: stop };
}

const SECRET_KEY_NAMES =
  /^(?:api[_-]?key|apikey|secret[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|refresh[_-]?token|api[_-]?token|secret|token|password|passwd|pwd|pass|passphrase|private[_-]?key)$/i;

const USERNAME_KEY_NAMES =
  /^(?:user(?:name)?|login|user[_-]?id|userid|uid|account|email[_-]?address)$/i;

/** Strips a `config.` or `options.` style prefix from a key name. */
export function baseKeyName(key: string): string {
  const parts = key.split(/[._-]/).filter((part) => part.length > 0);
  return (parts[parts.length - 1] ?? key).toLowerCase();
}

export function isSecretKeyName(key: string): boolean {
  return SECRET_KEY_NAMES.test(baseKeyName(key)) || SECRET_KEY_NAMES.test(key.toLowerCase());
}

export function isUsernameKeyName(key: string): boolean {
  return USERNAME_KEY_NAMES.test(baseKeyName(key)) || USERNAME_KEY_NAMES.test(key.toLowerCase());
}