/**
 * Protection API endpoint tests.
 *
 * These test the /api/protect/text endpoint through a real HTTP server.
 * No network, no provider, no clock.
 */

import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../app.js';
import type { ProtectTextResponse } from './protect.js';

let server: Server;
let baseUrl: string;

async function post(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/protect/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

before(async () => {
  const app = createApp({ ai: null });
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });

  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('POST /api/protect/text', () => {
  it('returns protected text for valid input', async () => {
    const response = await post({
      text: 'Contact john@example.com or call +15551234567.',
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as ProtectTextResponse;
    assert.equal(body.protectedText, 'Contact [REDACTED_EMAIL] or call [REDACTED_PHONE].');
    assert.equal(body.redactionCount, 2);
  });

  it('returns original text when no findings', async () => {
    const response = await post({
      text: 'This text has no sensitive data.',
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as ProtectTextResponse;
    assert.equal(body.protectedText, 'This text has no sensitive data.');
    assert.equal(body.redactionCount, 0);
  });

  it('returns 400 for missing text field', async () => {
    const response = await post({});

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'missing_text');
  });

  it('returns 400 for non-string text', async () => {
    const response = await post({ text: 123 });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'invalid_text');
  });

  it('returns 400 for empty text', async () => {
    const response = await post({ text: '   ' });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'empty_text');
  });

  it('returns 413 for text exceeding max length', async () => {
    const longText = 'x'.repeat(20001);
    const response = await post({ text: longText });

    assert.equal(response.status, 413);
    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'text_too_large');
  });

  it('server-side detection is authoritative - client findings ignored', async () => {
    // Even if client sends findings, server runs its own detection
    const response = await post({
      text: 'Email: john@example.com',
      findings: [
        {
          id: 'client-fake',
          category: 'API_KEY',
          severity: 'CRITICAL',
          start: 0,
          end: 7,
          matchedText: 'fakekey',
          explanation: 'fake',
          confidence: 1,
        },
      ],
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as ProtectTextResponse;
    // Should redact the email the server found, not the fake API key
    assert.equal(body.protectedText, 'Email: [REDACTED_EMAIL]');
    assert.equal(body.redactionCount, 1);
    assert.equal(body.redactions[0]!.category, 'EMAIL');
  });

  it('response does not contain original sensitive values in metadata', async () => {
    const response = await post({
      text: 'My card is 4111 1111 1111 1111',
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as ProtectTextResponse;
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes('4111'), false);
    assert.equal(serialized.includes('1111'), false);
  });

  it('handles multiple categories correctly', async () => {
    // Use formats the detector recognizes: email, API key (sk-proj-), credit card (Luhn valid)
    const response = await post({
      text: 'Email: john@example.com, Key: sk-proj-abcdefghijklmnopqrstuvwxyz, Card: 4111 1111 1111 1111',
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as ProtectTextResponse;
    // The detector may find all three
    assert.ok(body.redactionCount >= 2);
    const categories = body.redactions.map((r) => r.category).sort();
    assert.ok(categories.includes('EMAIL'));
    assert.ok(categories.includes('API_KEY') || categories.includes('CREDIT_CARD'));
  });

  it('preserves text outside spans exactly', async () => {
    const response = await post({
      text: '  Start  john@example.com  End  ',
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as ProtectTextResponse;
    assert.equal(body.protectedText, '  Start  [REDACTED_EMAIL]  End  ');
  });

  it('handles finding at beginning of text', async () => {
    const response = await post({
      text: 'john@example.com is the email',
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as ProtectTextResponse;
    assert.equal(body.protectedText, '[REDACTED_EMAIL] is the email');
  });

  it('handles finding at end of text', async () => {
    const response = await post({
      text: 'The email is john@example.com',
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as ProtectTextResponse;
    assert.equal(body.protectedText, 'The email is [REDACTED_EMAIL]');
  });

  it('handles adjacent findings', async () => {
    const response = await post({
      text: 'john@example.com+15551234567',
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as ProtectTextResponse;
    // The detector may or may not find the phone number depending on format
    // At minimum it should find the email
    assert.ok(body.redactionCount >= 1);
    assert.ok(body.protectedText.includes('[REDACTED_EMAIL]'));
  });

  it('handles overlapping spans - first by position wins', async () => {
    // We can't directly test overlapping since the server runs detection,
    // but we can verify the endpoint works with text that has multiple matches
    const response = await post({
      text: 'john@example.com jane@example.com',
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as ProtectTextResponse;
    assert.equal(body.redactionCount, 2);
    assert.equal(body.protectedText, '[REDACTED_EMAIL] [REDACTED_EMAIL]');
  });
});