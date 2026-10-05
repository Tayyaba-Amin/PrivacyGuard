import type { ApiCategory } from './api';

/**
 * The detector returns the exact matched text so a future redaction step can
 * use the span. It must never be rendered as-is: these helpers produce a
 * display-safe form so a secret is not shown back to the user in the clear.
 */

const MASK = '•';

function maskDigits(value: string, visibleTail = 4): string {
  const digits = value.replace(/\D/g, '');
  const tail = digits.slice(-visibleTail);
  const masked = Math.max(0, digits.length - visibleTail);
  return `${MASK.repeat(Math.min(masked, 12))}${tail}`;
}

function maskTail(value: string, visibleHead = 4): string {
  if (value.length <= visibleHead) return MASK.repeat(value.length);
  return `${value.slice(0, visibleHead)}${MASK.repeat(Math.min(12, value.length - visibleHead))}`;
}

function maskEmail(value: string): string {
  const at = value.lastIndexOf('@');
  if (at <= 0) return maskTail(value);

  const local = value.slice(0, at);
  const domain = value.slice(at);
  const first = local.charAt(0);

  return `${first}${MASK.repeat(Math.max(1, local.length - 1))}${domain}`;
}

function maskAddress(value: string): string {
  return value.replace(/\d/g, (digit) => (digit === '0' ? '0' : MASK));
}

function maskUrl(value: string): string {
  const query = value.indexOf('?');
  return query === -1 ? value : `${value.slice(0, query)}?${MASK.repeat(8)}`;
}

export function maskValue(category: ApiCategory, value: string): string {
  switch (category) {
    case 'EMAIL':
      return maskEmail(value);
    case 'PHONE_NUMBER':
    case 'CREDIT_CARD':
      return maskDigits(value);
    case 'API_KEY':
    case 'JWT':
      return maskTail(value);
    case 'PRIVATE_KEY':
      return `-----BEGIN ${MASK.repeat(12)}-----`;
    case 'CREDENTIAL_PAIR':
      return `${MASK.repeat(8)} = ${MASK.repeat(8)}`;
    case 'ADDRESS':
      return maskAddress(value);
    case 'URL':
      return maskUrl(value);
    case 'IP_ADDRESS':
    default:
      return value;
  }
}