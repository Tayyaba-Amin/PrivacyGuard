import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../app.js';
import type { AnalyzeTextResponse } from '../api/types.js';

let server: Server;
let baseUrl: string;

async function postAnalyze(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/analyze/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function postProtect(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/protect/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function postRescan(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/rescan/text`, {
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

describe('POST /api/rescan/text', () => {
  it('returns zero findings for clean protected text', async () => {
    const response = await postRescan({
      text: 'This text has no sensitive data.',
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as AnalyzeTextResponse & { rescan: { source: string; protected: boolean } };
    assert.equal(body.findings.length, 0);
    assert.equal(body.risk.score, 0);
    assert.equal(body.risk.level, 'LOW');
    assert.equal(body.risk.verdict, 'SAFE_TO_SHARE');
    assert.equal(body.rescan.source, 'protected_text');
    assert.equal(body.rescan.protected, true);
  });

  it('finds remaining sensitive information in protected text', async () => {
    // Protected text that still contains a credit card number
    const response = await postRescan({
      text: 'My card is 4111 1111 1111 1111',
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as AnalyzeTextResponse & { rescan: { source: string; protected: boolean } };
    assert.ok(body.findings.length > 0);
    assert.ok(body.risk.score > 0);
    assert.ok(['MEDIUM', 'HIGH', 'CRITICAL'].includes(body.risk.level));
    assert.ok(['REVIEW_BEFORE_SHARING', 'NOT_SAFE_TO_SHARE'].includes(body.risk.verdict));
    assert.equal(body.rescan.source, 'protected_text');
    assert.equal(body.rescan.protected, true);
  });

  it('returns 400 for missing text field', async () => {
    const response = await postRescan({});

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'missing_text');
  });

  it('returns 400 for non-string text', async () => {
    const response = await postRescan({ text: 123 });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'invalid_text');
  });

  it('returns 400 for empty text', async () => {
    const response = await postRescan({ text: '   ' });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'empty_text');
  });

  it('returns 413 for text exceeding max length', async () => {
    const longText = 'x'.repeat(20001);
    const response = await postRescan({ text: longText });

    assert.equal(response.status, 413);
    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'text_too_large');
  });

  it('analyzes the provided text, not previous findings', async () => {
    // First analyze some text with sensitive data
    const analyzeResponse = await postAnalyze({ text: 'Email me at john@example.com' });
    assert.equal(analyzeResponse.status, 200);

    // Now rescan different text without sensitive data
    const rescanResponse = await postRescan({ text: 'This is clean text.' });
    assert.equal(rescanResponse.status, 200);
    const body = (await rescanResponse.json()) as AnalyzeTextResponse & { rescan: { source: string; protected: boolean } };
    assert.equal(body.findings.length, 0);
    assert.equal(body.risk.verdict, 'SAFE_TO_SHARE');
  });

  it('end-to-end flow: analyze -> protect -> rescan', async () => {
    const originalText = 'Contact john@example.com or call +15551234567.';

    // Step 1: Analyze
    const analyzeResponse = await postAnalyze({ text: originalText });
    assert.equal(analyzeResponse.status, 200);
    const analyzeBody = (await analyzeResponse.json()) as AnalyzeTextResponse;
    assert.ok(analyzeBody.findings.length > 0);
    assert.ok(analyzeBody.risk.score > 0);

    // Step 2: Protect
    const protectResponse = await postProtect({ text: originalText });
    assert.equal(protectResponse.status, 200);
    const protectBody = (await protectResponse.json()) as { protectedText: string; redactionCount: number };
    assert.ok(protectBody.protectedText.includes('[REDACTED_EMAIL]'));
    assert.ok(protectBody.protectedText.includes('[REDACTED_PHONE]'));

    // Step 3: Rescan protected text
    const rescanResponse = await postRescan({ text: protectBody.protectedText });
    assert.equal(rescanResponse.status, 200);
    const rescanBody = (await rescanResponse.json()) as AnalyzeTextResponse & { rescan: { source: string; protected: boolean } };

    // The protected text should have no findings (or significantly fewer)
    assert.equal(rescanBody.rescan.source, 'protected_text');
    assert.equal(rescanBody.rescan.protected, true);

    // The final verdict should be based on the protected text
    // In this case, since both email and phone were redacted, it should be SAFE_TO_SHARE
    assert.equal(rescanBody.risk.verdict, 'SAFE_TO_SHARE');
  });

  it('handles AI unavailable gracefully', async () => {
    // With ai: null, the rescan should still work deterministically
    const response = await postRescan({ text: 'Clean text here.' });

    assert.equal(response.status, 200);
    const body = (await response.json()) as AnalyzeTextResponse & { rescan: { source: string; protected: boolean } };
    assert.equal(body.findings.length, 0);
    assert.equal(body.meta.aiEnabled, false);
    assert.equal(body.meta.aiStatus, 'unavailable');
    assert.equal(body.risk.verdict, 'SAFE_TO_SHARE');
  });

  it('handles empty protected text (after all sensitive content was redacted)', async () => {
    const response = await postRescan({ text: '[REDACTED_EMAIL] [REDACTED_PHONE]' });

    assert.equal(response.status, 200);
    const body = (await response.json()) as AnalyzeTextResponse & { rescan: { source: string; protected: boolean } };
    // Redaction tokens should not be detected as sensitive data
    assert.equal(body.findings.length, 0);
    assert.equal(body.risk.verdict, 'SAFE_TO_SHARE');
  });
});