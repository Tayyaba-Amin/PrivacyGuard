/**
 * Protection/redaction tests.
 *
 * The redactor is a pure function of (text, findings), so these call it
 * directly. No provider, no network, no clock.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FALLBACK_TOKEN,
  REDACTION_TOKENS,
  protectText,
  isValidSpan,
  tokenForCategory,
} from './index.js';
import type { Finding, FindingCategory, Severity } from '../detection/types.js';

let counter = 0;

function finding(
  category: FindingCategory,
  start: number,
  end: number,
  options: { severity?: Severity; id?: string } = {},
): Finding {
  counter += 1;

  return {
    id: options.id ?? `pg_test_${counter}`,
    category,
    severity: options.severity ?? 'MEDIUM',
    start,
    end,
    matchedText: 'x'.repeat(end - start),
    explanation: 'explanation',
    confidence: 0.9,
  };
}

const resetIds = (): void => {
  counter = 0;
};

describe('isValidSpan', () => {
  it('accepts a valid span', () => {
    assert.equal(isValidSpan({ start: 0, end: 5 }, 10), true);
    assert.equal(isValidSpan({ start: 5, end: 10 }, 10), true);
    assert.equal(isValidSpan({ start: 0, end: 10 }, 10), true);
  });

  it('rejects negative start', () => {
    assert.equal(isValidSpan({ start: -1, end: 5 }, 10), false);
  });

  it('rejects negative end', () => {
    assert.equal(isValidSpan({ start: 0, end: -5 }, 10), false);
  });

  it('rejects start >= end', () => {
    assert.equal(isValidSpan({ start: 5, end: 5 }, 10), false);
    assert.equal(isValidSpan({ start: 6, end: 5 }, 10), false);
  });

  it('rejects end > text.length', () => {
    assert.equal(isValidSpan({ start: 0, end: 11 }, 10), false);
  });

  it('rejects non-integer values', () => {
    assert.equal(isValidSpan({ start: 0.5, end: 5 }, 10), false);
    assert.equal(isValidSpan({ start: 0, end: 5.5 }, 10), false);
  });
});

describe('tokenForCategory', () => {
  it('returns the documented token for each category', () => {
    const expected: Record<FindingCategory, string> = {
      EMAIL: '[REDACTED_EMAIL]',
      PHONE_NUMBER: '[REDACTED_PHONE]',
      CREDIT_CARD: '[REDACTED_CREDIT_CARD]',
      IP_ADDRESS: '[REDACTED_IP]',
      URL: '[REDACTED_URL]',
      API_KEY: '[REDACTED_API_KEY]',
      JWT: '[REDACTED_JWT]',
      PRIVATE_KEY: '[REDACTED_PRIVATE_KEY]',
      CREDENTIAL_PAIR: '[REDACTED_CREDENTIALS]',
      ADDRESS: '[REDACTED_ADDRESS]',
    };

    for (const [category, token] of Object.entries(expected)) {
      assert.equal(tokenForCategory(category as FindingCategory), token, category);
    }
  });

  it('falls back for an unknown category (defensive)', () => {
    // This should not happen with the current types but defends against future additions.
    assert.equal(tokenForCategory('EMAIL' as FindingCategory), '[REDACTED_EMAIL]');
    // @ts-expect-error testing fallback for unknown category
    assert.equal(tokenForCategory('UNKNOWN_CATEGORY'), FALLBACK_TOKEN);
  });
});

describe('protectText', () => {
  describe('single finding', () => {
    it('replaces one email with its token', () => {
      resetIds();
      const text = 'Contact me at john@example.com please.';
      const findings = [finding('EMAIL', 14, 30)];

      const result = protectText({ text, findings });

      assert.equal(result.protectedText, 'Contact me at [REDACTED_EMAIL] please.');
      assert.equal(result.redactionCount, 1);
      const firstRedaction = result.redactions[0]!;
      assert.equal(firstRedaction.category, 'EMAIL');
      assert.equal(firstRedaction.replacement, '[REDACTED_EMAIL]');
    });

    it('replaces one phone number with its token', () => {
      resetIds();
      const text = 'Call +15551234567 now.';
      const findings = [finding('PHONE_NUMBER', 5, 17)];

      const result = protectText({ text, findings });

      assert.equal(result.protectedText, 'Call [REDACTED_PHONE] now.');
      assert.equal(result.redactionCount, 1);
      const firstRedaction = result.redactions[0]!;
      assert.equal(firstRedaction.replacement, '[REDACTED_PHONE]');
    });

    it('replaces one credit card with its token', () => {
      resetIds();
      const text = 'My card is 4111 1111 1111 1111';
      const findings = [finding('CREDIT_CARD', 11, 30)];

      const result = protectText({ text, findings });

      assert.equal(result.protectedText, 'My card is [REDACTED_CREDIT_CARD]');
      const firstRedaction = result.redactions[0]!;
      assert.equal(firstRedaction.replacement, '[REDACTED_CREDIT_CARD]');
    });

    it('replaces one API key with its token', () => {
      resetIds();
      const text = 'Key: sk-proj-abcdefghijklmnopqrstuvwxyz';
      const findings = [finding('API_KEY', 5, 39)];

      const result = protectText({ text, findings });

      assert.equal(result.protectedText, 'Key: [REDACTED_API_KEY]');
      const firstRedaction = result.redactions[0]!;
      assert.equal(firstRedaction.replacement, '[REDACTED_API_KEY]');
    });
  });

  describe('multiple findings', () => {
    it('replaces multiple categories correctly', () => {
      resetIds();
      const text = 'Email: john@example.com Phone: +15551234567';
      const findings = [finding('EMAIL', 7, 23), finding('PHONE_NUMBER', 31, 43)];

      const result = protectText({ text, findings });

      assert.equal(result.protectedText, 'Email: [REDACTED_EMAIL] Phone: [REDACTED_PHONE]');
      assert.equal(result.redactionCount, 2);
    });

    it('preserves all text outside the spans exactly', () => {
      resetIds();
      const text = '  Start  john@example.com  End  ';
      const findings = [finding('EMAIL', 9, 25)];

      const result = protectText({ text, findings });

      assert.equal(result.protectedText, '  Start  [REDACTED_EMAIL]  End  ');
    });

    it('handles finding at the beginning of text', () => {
      resetIds();
      const text = 'john@example.com is the email';
      const findings = [finding('EMAIL', 0, 16)];

      const result = protectText({ text, findings });

      assert.equal(result.protectedText, '[REDACTED_EMAIL] is the email');
    });

    it('handles finding at the end of text', () => {
      resetIds();
      const text = 'The email is john@example.com';
      const findings = [finding('EMAIL', 13, 29)];

      const result = protectText({ text, findings });

      assert.equal(result.protectedText, 'The email is [REDACTED_EMAIL]');
    });

    it('handles adjacent findings correctly', () => {
      resetIds();
      const text = 'john@example.com+15551234567';
      const findings = [finding('EMAIL', 0, 16), finding('PHONE_NUMBER', 16, 28)];

      const result = protectText({ text, findings });

      assert.equal(result.protectedText, '[REDACTED_EMAIL][REDACTED_PHONE]');
      assert.equal(result.redactionCount, 2);
    });

    it('same value at two separate spans is redacted both times', () => {
      resetIds();
      const text = 'john@example.com and john@example.com';
      const findings = [finding('EMAIL', 0, 16), finding('EMAIL', 21, 37)];

      const result = protectText({ text, findings });

      assert.equal(result.protectedText, '[REDACTED_EMAIL] and [REDACTED_EMAIL]');
      assert.equal(result.redactionCount, 2);
    });
  });

  describe('overlapping findings', () => {
    it('keeps the first span when two overlap (detector ordering wins)', () => {
      resetIds();
      const text = 'john@example.com';
      // First finding covers the whole email, second overlaps the domain part
      const findings = [
        finding('EMAIL', 0, 16, { id: 'first' }),
        finding('EMAIL', 5, 16, { id: 'second' }),
      ];

      const result = protectText({ text, findings });

      // First finding (start=0) should win and redact the whole thing
      assert.equal(result.protectedText, '[REDACTED_EMAIL]');
      assert.equal(result.redactionCount, 1);
      const firstRedaction = result.redactions[0]!;
      assert.equal(firstRedaction.findingId, 'first');
    });

    it('does not duplicate text when spans overlap', () => {
      resetIds();
      const text = 'abc john@example.com def';
      const findings = [
        finding('EMAIL', 4, 20, { id: 'first' }),
        finding('EMAIL', 10, 20, { id: 'second' }),
      ];

      const result = protectText({ text, findings });

      // Should only have one redaction, no duplicated 'abc ' or ' def'
      assert.equal(result.redactionCount, 1);
      assert.equal(result.protectedText, 'abc [REDACTED_EMAIL] def');
    });

    it('handles partially overlapping spans from different categories', () => {
      resetIds();
      const text = 'key=sk-proj-abc123';
      const findings = [
        finding('API_KEY', 4, 20, { id: 'api' }),
        finding('CREDENTIAL_PAIR', 0, 10, { id: 'cred' }),
      ];

      const result = protectText({ text, findings });

      // First by start wins
      assert.equal(result.redactionCount, 1);
      const firstRedaction = result.redactions[0]!;
      assert.equal(firstRedaction.findingId, 'cred');
    });
  });

  describe('invalid spans', () => {
    it('ignores span with negative start', () => {
      resetIds();
      const text = 'john@example.com';
      const findings = [
        { ...finding('EMAIL', 0, 16), start: -1 },
        finding('EMAIL', 0, 16),
      ];

      const result = protectText({ text, findings });

      assert.equal(result.redactionCount, 1);
      assert.equal(result.protectedText, '[REDACTED_EMAIL]');
    });

    it('ignores span with negative end', () => {
      resetIds();
      const text = 'john@example.com';
      const findings = [
        { ...finding('EMAIL', 0, 16), end: -1 },
        finding('EMAIL', 0, 16),
      ];

      const result = protectText({ text, findings });

      assert.equal(result.redactionCount, 1);
    });

    it('ignores span with start >= end', () => {
      resetIds();
      const text = 'john@example.com';
      const findings = [
        { ...finding('EMAIL', 0, 16), start: 10, end: 5 },
        finding('EMAIL', 0, 16),
      ];

      const result = protectText({ text, findings });

      assert.equal(result.redactionCount, 1);
    });

    it('ignores span with end > text.length', () => {
      resetIds();
      const text = 'john@example.com';
      const findings = [
        { ...finding('EMAIL', 0, 16), end: 100 },
        finding('EMAIL', 0, 16),
      ];

      const result = protectText({ text, findings });

      assert.equal(result.redactionCount, 1);
    });

    it('ignores span with non-integer values', () => {
      resetIds();
      const text = 'john@example.com';
      const findings = [
        { ...finding('EMAIL', 0, 16), start: 0.5 },
        finding('EMAIL', 0, 16),
      ];

      const result = protectText({ text, findings });

      assert.equal(result.redactionCount, 1);
    });

    it('does not crash when all spans are invalid', () => {
      resetIds();
      const text = 'john@example.com';
      const findings = [
        { ...finding('EMAIL', 0, 16), start: -1 },
        { ...finding('EMAIL', 0, 16), end: -1 },
      ];

      const result = protectText({ text, findings });

      assert.equal(result.protectedText, text);
      assert.equal(result.redactionCount, 0);
    });
  });

  describe('empty cases', () => {
    it('returns original text when text is empty', () => {
      resetIds();
      const result = protectText({ text: '', findings: [] });

      assert.equal(result.protectedText, '');
      assert.equal(result.redactionCount, 0);
    });

    it('returns original text when there are no findings', () => {
      resetIds();
      const text = 'This text has no sensitive data.';
      const result = protectText({ text, findings: [] });

      assert.equal(result.protectedText, text);
      assert.equal(result.redactionCount, 0);
    });
  });

  describe('sensitive value preservation', () => {
    it('does not include matchedText in redaction metadata', () => {
      resetIds();
      const text = 'My card is 4111 1111 1111 1111';
      const findings = [finding('CREDIT_CARD', 11, 30)];

      const result = protectText({ text, findings });
      const serialized = JSON.stringify(result);

      assert.equal(serialized.includes('4111'), false);
      assert.equal(serialized.includes('1111'), false);
    });

    it('does not include original text in output', () => {
      resetIds();
      const text = 'Secret: sk-proj-abc123';
      const findings = [finding('API_KEY', 8, 22)];

      const result = protectText({ text, findings });
      const serialized = JSON.stringify(result);

      assert.equal(serialized.includes('sk-proj-abc123'), false);
      // Protected text should have the token
      assert.equal(result.protectedText.includes('[REDACTED_API_KEY]'), true);
    });
  });

  describe('determinism', () => {
    it('produces identical output for identical input', () => {
      resetIds();
      const text = 'Email: john@example.com Phone: +1 555-123-4567';
      const findings = [finding('EMAIL', 7, 23), finding('PHONE_NUMBER', 32, 47)];

      const first = protectText({ text, findings });
      const second = protectText({ text, findings });

      assert.deepEqual(first, second);
    });

    it('produces identical output regardless of finding input order', () => {
      resetIds();
      const text = 'Email: john@example.com Phone: +1 555-123-4567';
      const f1 = finding('EMAIL', 7, 23);
      const f2 = finding('PHONE_NUMBER', 32, 47);

      const result1 = protectText({ text, findings: [f1, f2] });
      const result2 = protectText({ text, findings: [f2, f1] });

      assert.deepEqual(result1, result2);
    });
  });

  describe('all documented categories have tokens', () => {
    it('has a token for every FINDING_CATEGORIES entry', () => {
      const categories: FindingCategory[] = [
        'EMAIL',
        'PHONE_NUMBER',
        'CREDIT_CARD',
        'IP_ADDRESS',
        'URL',
        'API_KEY',
        'JWT',
        'PRIVATE_KEY',
        'CREDENTIAL_PAIR',
        'ADDRESS',
      ];

      for (const category of categories) {
        const token = REDACTION_TOKENS[category];
        assert.ok(token, `missing token for ${category}`);
        assert.ok(token.startsWith('[REDACTED_') && token.endsWith(']'), `token format for ${category}`);
      }
    });
  });

  describe('redaction metadata', () => {
    it('includes findingId, category, start, end, replacement', () => {
      resetIds();
      const text = 'john@example.com';
      const findings = [finding('EMAIL', 0, 16, { id: 'test-123' })];

      const result = protectText({ text, findings });

      assert.deepEqual(result.redactions[0], {
        findingId: 'test-123',
        category: 'EMAIL',
        start: 0,
        end: 16,
        replacement: '[REDACTED_EMAIL]',
      });
    });

    it('orders redactions by position in text', () => {
      resetIds();
      const text = 'a@b.com +15551234567';
      const findings = [
        finding('PHONE_NUMBER', 8, 19, { id: 'phone' }),
        finding('EMAIL', 0, 7, { id: 'email' }),
      ];

      const result = protectText({ text, findings });

      assert.ok(result.redactions.length >= 2);
      const firstRedaction = result.redactions[0]!;
      const secondRedaction = result.redactions[1]!;
      assert.equal(firstRedaction.findingId, 'email');
      assert.equal(secondRedaction.findingId, 'phone');
    });
  });
});