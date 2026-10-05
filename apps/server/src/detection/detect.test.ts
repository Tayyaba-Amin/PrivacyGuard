import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectSensitiveInfo, luhnValid } from './index.js';
import type { FindingCategory } from './types.js';

const categories = (text: string): FindingCategory[] =>
  detectSensitiveInfo(text).map((finding) => finding.category);

const ofCategory = (text: string, category: FindingCategory) =>
  detectSensitiveInfo(text).filter((finding) => finding.category === category);

const PEM = [
  '-----BEGIN PRIVATE KEY-----',
  'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDL7example',
  '-----END PRIVATE KEY-----',
].join('\n');

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

describe('EMAIL', () => {
  it('detects a valid email address', () => {
    assert.deepEqual(categories('Contact john@example.com for details.'), ['EMAIL']);
  });

  it('detects multiple email addresses', () => {
    const found = categories('Mail a.b@company.org or user.name+tag@mail.co.uk today.');
    assert.equal(found.filter((entry) => entry === 'EMAIL').length, 2);
  });

  it('ignores invalid email-like text', () => {
    assert.deepEqual(categories('not an email @@ example, @nope, and foo@'), []);
    assert.deepEqual(categories('user@localhost and user@example.c'), []);
  });

  it('reports the exact span', () => {
    const text = 'Email: john@example.com';
    const [finding] = ofCategory(text, 'EMAIL');
    assert.ok(finding);
    assert.equal(text.slice(finding.start, finding.end), 'john@example.com');
    assert.equal(finding.matchedText, 'john@example.com');
  });
});

describe('PHONE NUMBER', () => {
  it('detects an international number', () => {
    assert.ok(categories('Call +92 300 1234567 today.').includes('PHONE_NUMBER'));
    assert.ok(categories('Call +1 555 123 4567 today.').includes('PHONE_NUMBER'));
  });

  it('detects a local number', () => {
    assert.ok(categories('My number is 0300-1234567.').includes('PHONE_NUMBER'));
  });

  it('ignores arbitrary long digit strings', () => {
    assert.deepEqual(categories('Order 1234567890123 shipped today.'), []);
    assert.deepEqual(categories('Reference 1234567890 and 9876543210'), []);
    assert.deepEqual(categories('Version 2024-01-15 build 7'), []);
  });

  it('reports the exact span', () => {
    const text = 'Ring +92 300 1234567 now';
    const [finding] = ofCategory(text, 'PHONE_NUMBER');
    assert.ok(finding);
    assert.equal(text.slice(finding.start, finding.end), '+92 300 1234567');
  });
});

describe('CREDIT CARD', () => {
  it('accepts a Luhn-valid card number with spaces', () => {
    assert.ok(categories('Card 4111 1111 1111 1111 declined').includes('CREDIT_CARD'));
  });

  it('accepts a Luhn-valid card number with hyphens', () => {
    assert.ok(categories('Card 4111-1111-1111-1111 declined').includes('CREDIT_CARD'));
  });

  it('rejects a number that fails the Luhn check', () => {
    assert.deepEqual(categories('Card 4111 1111 1111 1112 declined'), []);
  });

  it('rejects a Luhn-valid number without a real issuer prefix', () => {
    assert.deepEqual(categories('Identifier 1234567812345670'), []);
  });

  it('exposes the checksum helper', () => {
    assert.equal(luhnValid('4111111111111111'), true);
    assert.equal(luhnValid('4111111111111112'), false);
  });
});

describe('IP ADDRESS', () => {
  it('detects valid IPv4 addresses', () => {
    assert.ok(categories('Host 192.168.1.10 responded').includes('IP_ADDRESS'));
    assert.ok(categories('Resolver 8.8.8.8 is up').includes('IP_ADDRESS'));
    assert.ok(categories('Broadcast 255.255.255.255').includes('IP_ADDRESS'));
  });

  it('ignores out-of-range octets', () => {
    assert.deepEqual(categories('Address 999.1.1.1 here'), []);
    assert.deepEqual(categories('Mask 256.256.256.256 here'), []);
  });

  it('ignores dotted version strings', () => {
    assert.deepEqual(categories('Release 1.2.3.4 shipped'), []);
  });
});

describe('URL', () => {
  it('detects https URLs', () => {
    assert.ok(categories('See https://example.com/docs for more').includes('URL'));
  });

  it('detects http URLs, including internal hosts', () => {
    assert.ok(categories('Open http://192.168.1.10/admin').includes('URL'));
  });

  it('does not strip trailing sentence punctuation from the span', () => {
    const text = 'Read https://example.com.';
    const [finding] = ofCategory(text, 'URL');
    assert.ok(finding);
    assert.equal(text.slice(finding.start, finding.end), 'https://example.com');
  });

  it('is not treated as a secret', () => {
    assert.deepEqual(categories('Read https://example.com/docs'), ['URL']);
  });
});

describe('API KEY / SECRET', () => {
  it('detects a recognisable vendor token', () => {
    assert.ok(categories('token: sk-proj-abcdefghijklmnopqrstuvwxyz123456').includes('API_KEY'));
    assert.ok(categories('AKIAIOSFODNN7EXAMPLE').includes('API_KEY'));
    assert.ok(categories('ghp_abcdefghijklmnopqrstuvwxyz0123456789AB').includes('API_KEY'));
  });

  it('detects a generic api_key assignment', () => {
    assert.ok(categories('api_key=abcd1234efgh').includes('API_KEY'));
    assert.ok(categories('api-key: abcd1234efgh').includes('API_KEY'));
  });

  it('detects other generic secret assignments', () => {
    assert.ok(categories('secret=abcd1234efgh').includes('API_KEY'));
    assert.ok(categories('password=abcd1234').includes('API_KEY'));
  });

  it('does not flag ordinary prose', () => {
    assert.deepEqual(categories('The quick brown fox jumps over the lazy dog.'), []);
  });

  it('does not flag random long hexadecimal strings', () => {
    assert.deepEqual(categories('commit de305d54975431b7adbe2eb6b9e5460142ab0cd9'), []);
  });

  it('ignores placeholder values', () => {
    assert.deepEqual(categories('api_key=your_key_here'), []);
    assert.deepEqual(categories('password=${DB_PASSWORD}'), []);
  });

  it('never includes the secret value in the explanation', () => {
    const [finding] = ofCategory('api_key=abcd1234efgh', 'API_KEY');
    assert.ok(finding);
    assert.equal(finding.explanation.includes('abcd1234efgh'), false);
  });
});

describe('JWT', () => {
  it('detects a JWT-shaped token', () => {
    assert.ok(categories(`Authorization: Bearer ${JWT}`).includes('JWT'));
  });

  it('ignores ordinary dotted text', () => {
    assert.deepEqual(categories('version 1.2.3 and 4.5.6 are available'), []);
    assert.deepEqual(categories('file.name.txt and config.yaml'), []);
  });

  it('reports the exact span', () => {
    const text = `token=${JWT}`;
    const [finding] = ofCategory(text, 'JWT');
    assert.ok(finding);
    assert.equal(text.slice(finding.start, finding.end), JWT);
  });
});

describe('PRIVATE KEY', () => {
  it('detects a PEM private key block', () => {
    const found = ofCategory(PEM, 'PRIVATE_KEY');
    assert.equal(found.length, 1);
    assert.equal(found[0]?.severity, 'CRITICAL');
    assert.equal(PEM.slice(found[0]?.start, found[0]?.end), PEM);
  });

  it('recognises an RSA private key header', () => {
    const rsa = PEM.replace(/PRIVATE KEY/g, 'RSA PRIVATE KEY');
    const [finding] = ofCategory(rsa, 'PRIVATE_KEY');
    assert.ok(finding);
    assert.match(finding.explanation, /RSA PRIVATE KEY/);
  });

  it('ignores ordinary text and a stray header', () => {
    assert.deepEqual(categories('This is not a key at all.'), []);
    assert.deepEqual(categories('-----BEGIN PRIVATE KEY----- truncated paste'), []);
  });
});

describe('CREDENTIAL PAIR', () => {
  it('detects a username and password together', () => {
    const found = ofCategory('username=admin\npassword=secret123', 'CREDENTIAL_PAIR');
    assert.equal(found.length, 1);
    assert.equal(found[0]?.severity, 'HIGH');
  });

  it('spans both assignments', () => {
    const text = 'username=admin\npassword=secret123';
    const [finding] = ofCategory(text, 'CREDENTIAL_PAIR');
    assert.ok(finding);
    assert.equal(text.slice(finding.start, finding.end), 'username=admin\npassword=secret123');
  });

  it('reports the pair once for repeated pairs', () => {
    const text = 'user=alice pass=alpha123 user=bob pass=beta456';
    assert.equal(ofCategory(text, 'CREDENTIAL_PAIR').length, 2);
  });

  it('does not repeat the same username across two secrets', () => {
    const found = ofCategory('user=alice password=alpha123 token=beta456789', 'CREDENTIAL_PAIR');
    assert.equal(found.length, 1);
  });

  it('ignores ordinary text', () => {
    assert.deepEqual(categories('The user clicked the password reset link.'), []);
  });

  it('prefers a password over a nearby API key for the username', () => {
    const text = 'api_key=abcd1234efgh\nusername=admin\npassword=secret123';
    const findings = detectSensitiveInfo(text);

    const pair = findings.find((finding) => finding.category === 'CREDENTIAL_PAIR');
    assert.ok(pair);
    assert.equal(text.slice(pair.start, pair.end), 'username=admin\npassword=secret123');

    // The unmatched api_key is reported on its own instead of being swallowed.
    const key = findings.find((finding) => finding.category === 'API_KEY');
    assert.ok(key);
    assert.equal(text.slice(key.start, key.end), 'api_key=abcd1234efgh');
  });

  it('never leaks the secret value in the explanation', () => {
    const [finding] = ofCategory('username=admin\npassword=secret123', 'CREDENTIAL_PAIR');
    assert.ok(finding);
    assert.equal(finding.explanation.includes('secret123'), false);
    assert.equal(finding.explanation.includes('admin'), false);
  });
});

describe('ADDRESS', () => {
  it('detects an explicitly labelled address', () => {
    assert.ok(categories('address: 221B Baker Street').includes('ADDRESS'));
    assert.ok(categories('My home address: 12 Elm Street, Springfield').includes('ADDRESS'));
    assert.ok(categories('Office address: 500 Oracle Parkway').includes('ADDRESS'));
  });

  it('detects a house number followed by street text', () => {
    assert.ok(categories('I live at 221B Baker Street now').includes('ADDRESS'));
    assert.ok(categories('Ship to 1600 Pennsylvania Avenue').includes('ADDRESS'));
  });

  it('ignores ordinary sentences', () => {
    assert.deepEqual(categories('The meeting is at 3 pm tomorrow.'), []);
    assert.deepEqual(categories('I went to the store and bought 3 street food stalls'), []);
    assert.deepEqual(categories('Address the envelope to the front desk.'), []);
  });
});

describe('overlaps and deduplication', () => {
  it('never returns two findings with the same category and span', () => {
    const text = [
      'Email john@example.com and jane@example.org.',
      'Card 4111 1111 1111 1111, phone +1 555 123 4567.',
      'Server 192.168.1.10 serves https://example.com/admin.',
      'address: 221B Baker Street',
    ].join(' ');

    for (const finding of detectSensitiveInfo(text)) {
      const duplicates = detectSensitiveInfo(text).filter(
        (other) => other.category === finding.category && other.start === finding.start && other.end === finding.end,
      );
      assert.equal(duplicates.length, 1);
    }
  });

  it('does not return overlapping spans', () => {
    const text = [
      'username=admin',
      'password=abcd1234efgh',
      'api_key=sk-proj-abcdefghijklmnopqrstuvwxyz',
      'server 192.168.1.10 with card 4111 1111 1111 1111',
      'mail john@example.com',
    ].join('\n');

    const findings = detectSensitiveInfo(text);
    for (let a = 0; a < findings.length; a += 1) {
      for (let b = a + 1; b < findings.length; b += 1) {
        const first = findings[a]!;
        const second = findings[b]!;
        const overlaps = first.start < second.end && second.start < first.end;
        assert.equal(overlaps, false, `${first.category} overlaps ${second.category}`);
      }
    }
  });

  it('keeps the credential pair instead of a duplicate generic secret match', () => {
    const text = 'username=admin\npassword=secret123';
    const found = detectSensitiveInfo(text);
    assert.deepEqual(
      found.map((finding) => finding.category),
      ['CREDENTIAL_PAIR'],
    );
  });

  it('orders findings by position', () => {
    const text = 'mail a@b.com then card 4111 1111 1111 1111 then ip 10.0.0.1';
    const starts = detectSensitiveInfo(text).map((finding) => finding.start);
    assert.deepEqual(starts, [...starts].sort((x, y) => x - y));
  });
});

describe('spans', () => {
  it('reports spans that slice back to the matched text', () => {
    const text = [
      'From: jane.doe@example.com',
      'Tel +44 7700 900123',
      'Card 4111 1111 1111 1111',
      'IP 10.0.0.7',
      'URL https://example.com/x',
      'JWT ' + JWT,
      'address: 221B Baker Street',
    ].join('\n');

    const findings = detectSensitiveInfo(text);
    assert.ok(findings.length >= 7);

    for (const finding of findings) {
      assert.equal(text.slice(finding.start, finding.end), finding.matchedText, finding.category);
      assert.ok(finding.start >= 0 && finding.end > finding.start && finding.end <= text.length);
      assert.ok(finding.confidence > 0 && finding.confidence <= 1);
    }
  });
});

describe('multiple findings', () => {
  it('reports every category present in one pass', () => {
    const text = [
      'My email is john@example.com and my phone is +92 300 1234567.',
      'Server 192.168.1.10 runs https://example.com/admin.',
      'Card 4111 1111 1111 1111 on file.',
      'address: 221B Baker Street',
    ].join(' ');

    const found = categories(text);
    for (const expected of [
      'EMAIL',
      'PHONE_NUMBER',
      'IP_ADDRESS',
      'URL',
      'CREDIT_CARD',
      'ADDRESS',
    ] as FindingCategory[]) {
      assert.ok(found.includes(expected), `expected ${expected}, got ${found.join(', ')}`);
    }
  });

  it('assigns a unique id to every finding', () => {
    const ids = detectSensitiveInfo('mail a@b.com, card 4111 1111 1111 1111, ip 10.0.0.1').map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('edge cases', () => {
  it('returns nothing for empty text', () => {
    assert.deepEqual(detectSensitiveInfo(''), []);
  });

  it('returns nothing for whitespace', () => {
    assert.deepEqual(detectSensitiveInfo('   \n\t  '), []);
  });

  it('returns nothing for ordinary prose', () => {
    assert.deepEqual(detectSensitiveInfo('We shipped the release on Tuesday and it went fine.'), []);
  });

  it('handles oversized text without throwing', () => {
    const large = 'lorem ipsum dolor sit amet '.repeat(20_000);
    assert.deepEqual(detectSensitiveInfo(large), []);
  });
});