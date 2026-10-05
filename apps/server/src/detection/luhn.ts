/** Standard Luhn checksum, used to reject non-card numbers. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits) || digits.length < 12) return false;

  let sum = 0;
  let double = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const digit = digits.charCodeAt(index) - 48;

    if (double) {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += digit;
    }

    double = !double;
  }

  return sum % 10 === 0;
}

/**
 * Issuer Identification Number prefixes for the common card networks.
 * Luhn alone accepts roughly one in ten random 16-digit numbers, so requiring a
 * real prefix is what keeps ordinary order ids out of the results.
 */
const CARD_PREFIXES = [
  /^4\d{12}(?:\d{3})?(?:\d{3})?$/, // Visa
  /^5[1-5]\d{14}$/, // Mastercard
  /^2(?:2[2-9]\d|[3-6]\d{2}|7[01]\d|720)\d{12}$/, // Mastercard 2-series
  /^3[47]\d{13}$/, // American Express
  /^3(?:0[0-5]|[68]\d)\d{11}$/, // Diners Club
  /^6(?:011|5\d{2}|4[4-9]\d)\d{12}$/, // Discover
  /^62\d{14,17}$/, // UnionPay
];

export function hasKnownCardPrefix(digits: string): boolean {
  return CARD_PREFIXES.some((pattern) => pattern.test(digits));
}