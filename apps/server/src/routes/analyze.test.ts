import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../app.js';
import type { AnalyzeTextResponse } from '../api/types.js';
import { FINDING_CATEGORIES, SEVERITIES } from '../detection/types.js';
import { RISK_LEVELS, SEVERITY_WEIGHTS, SHARING_VERDICTS } from '../risk/index.js';

let server: Server;
let baseUrl: string;

const SAMPLE = [
  'Hi Jane,',
  'My email is jane.doe@example.com and my phone is +92 300 1234567.',
  'address: 221B Baker Street, London',
  'Server 192.168.1.10 runs https://example.com/admin.',
  'Card 4111 1111 1111 1111',
].join('\n');

async function post(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/analyze/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

before(async () => {
  // No provider is injected, so the AI layer is disabled for this suite and the
  // response is the pure deterministic contract. The AI paths are covered in
  // ai/contextual.test.ts.
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

describe('GET /api/health', () => {
  it('still responds', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { status: string };
    assert.equal(body.status, 'ok');
  });
});

describe('POST /api/analyze/text', () => {
  it('detects the sample sensitive information', async () => {
    const response = await post({ text: SAMPLE });
    assert.equal(response.status, 200);

    const body = (await response.json()) as AnalyzeTextResponse;
    assert.ok(body.findings.length > 0);

    for (const category of ['EMAIL', 'PHONE_NUMBER', 'ADDRESS', 'IP_ADDRESS', 'URL', 'CREDIT_CARD'] as const) {
      assert.ok(
        body.findings.some((finding) => finding.category === category),
        `expected ${category} in ${body.findings.map((f) => f.category).join(', ')}`,
      );
    }
  });

  it('returns the documented finding shape', async () => {
    const response = await post({ text: SAMPLE });
    const body = (await response.json()) as AnalyzeTextResponse;

    for (const finding of body.findings) {
      assert.equal(typeof finding.id, 'string');
      assert.ok(FINDING_CATEGORIES.includes(finding.category));
      assert.ok(SEVERITIES.includes(finding.severity));
      assert.equal(typeof finding.start, 'number');
      assert.equal(typeof finding.end, 'number');
      assert.equal(typeof finding.matchedText, 'string');
      assert.equal(typeof finding.explanation, 'string');
      assert.equal(typeof finding.confidence, 'number');
      assert.ok(SAMPLE.slice(finding.start, finding.end) === finding.matchedText);
    }
  });

  it('attaches deterministic contextual commentary to every finding', async () => {
    const response = await post({ text: SAMPLE });
    const body = (await response.json()) as AnalyzeTextResponse;

    for (const finding of body.findings) {
      assert.equal(finding.contextual.source, 'deterministic');
      assert.equal(finding.contextual.isSensitive, true);
      assert.ok(SEVERITIES.includes(finding.contextual.severity));
      assert.equal(finding.contextual.severityAdjusted, false);
      assert.ok(finding.contextual.explanation.length > 0);
      assert.ok(finding.contextual.recommendation.length > 0);
    }
  });

  it('returns metadata without a risk score in meta', async () => {
    const response = await post({ text: SAMPLE });
    const body = (await response.json()) as AnalyzeTextResponse;

    assert.equal(body.meta.findingCount, body.findings.length);
    assert.equal(body.meta.categoryCount, body.meta.categories.length);
    assert.equal(body.meta.charactersAnalyzed, SAMPLE.length);
    assert.equal(body.meta.engine, 'deterministic-v1');
    assert.equal(body.meta.aiEnabled, false);
    assert.equal(body.meta.aiStatus, 'unavailable');
    assert.equal(body.meta.aiStatusReason, 'disabled');
    assert.equal(body.meta.aiAnalyzedCount, 0);
    assert.equal(body.meta.aiContextTruncated, false);
    assert.equal(body.meta.aiSummary, null);
    assert.equal(body.meta.aiProvider, 'featherless');
    assert.equal(typeof body.meta.aiModel, 'string');

    const keys = Object.keys(body).sort();
    assert.deepEqual(keys, ['findings', 'meta', 'risk', 'summary']);
  });

  it('returns a deterministic risk assessment alongside the findings', async () => {
    const response = await post({ text: SAMPLE });
    const body = (await response.json()) as AnalyzeTextResponse;

    assert.ok(Number.isInteger(body.risk.score));
    assert.ok(body.risk.score > 0 && body.risk.score <= 100);
    assert.ok(RISK_LEVELS.includes(body.risk.level));
    assert.ok(SHARING_VERDICTS.includes(body.risk.verdict));
    assert.ok(body.risk.explanation.length > 0);
    assert.equal(body.risk.factors.length, body.findings.length);
    assert.equal(body.risk.severityBasis.contextual, 0, 'no AI ran, so no weight came from it');
    assert.equal(body.risk.severityBasis.deterministic, body.findings.length);

    for (const factor of body.risk.factors) {
      assert.equal(typeof factor.findingId, 'string');
      assert.ok(FINDING_CATEGORIES.includes(factor.category));
      assert.equal(SEVERITY_WEIGHTS[factor.severity], factor.contribution);
      assert.equal(factor.severitySource, 'deterministic');
    }
  });

  it('scores an empty result as 0 / LOW / SAFE_TO_SHARE', async () => {
    const response = await post({ text: 'We shipped the release on Tuesday and it went fine.' });
    const body = (await response.json()) as AnalyzeTextResponse;

    assert.equal(body.risk.score, 0);
    assert.equal(body.risk.level, 'LOW');
    assert.equal(body.risk.verdict, 'SAFE_TO_SHARE');
    assert.deepEqual(body.risk.factors, []);
  });

  it('returns a deterministic summary when no AI analysis ran', async () => {
    const response = await post({ text: SAMPLE });
    const body = (await response.json()) as AnalyzeTextResponse;

    assert.equal(typeof body.summary, 'string');
    assert.ok(body.summary.includes(String(body.meta.findingCount)));
  });

  it('returns an empty findings array for ordinary prose', async () => {
    const response = await post({ text: 'We shipped the release on Tuesday and it went fine.' });
    assert.equal(response.status, 200);

    const body = (await response.json()) as AnalyzeTextResponse;
    assert.deepEqual(body.findings, []);
    assert.equal(body.meta.categoryCount, 0);
    assert.deepEqual(body.meta.categories, []);
    assert.equal(body.meta.aiStatusReason, 'no_findings');
    assert.equal(body.meta.aiAnalyzedCount, 0);
  });
});

describe('POST /api/analyze/text validation', () => {
  it('rejects a missing text field', async () => {
    const response = await post({});
    assert.equal(response.status, 400);

    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'missing_text');
  });

  it('rejects a non-string text field', async () => {
    for (const value of [123, true, null, ['a'], { nested: true }]) {
      const response = await post({ text: value });
      assert.equal(response.status, 400);

      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'invalid_text');
    }
  });

  it('rejects empty and whitespace-only text', async () => {
    for (const value of ['', '   ', '\n\t']) {
      const response = await post({ text: value });
      assert.equal(response.status, 400);

      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'empty_text');
    }
  });

  it('rejects a non-object body', async () => {
    const response = await post(['not', 'an', 'object']);
    assert.equal(response.status, 400);

    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'invalid_request');
  });

  it('rejects oversized text with 413', async () => {
    const response = await post({ text: 'a'.repeat(20_001) });
    assert.equal(response.status, 413);

    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'text_too_large');
    assert.match(body.error.message, /at most 20000 characters/);
  });

  it('accepts text at the maximum size', async () => {
    const response = await post({ text: 'a'.repeat(20_000) });
    assert.equal(response.status, 200);
  });

  it('never echoes the submitted text in an error', async () => {
    const secret = 'do-not-log jane.doe@example.com';
    const response = await post({ text: secret.repeat(2_000) });

    assert.equal(response.status, 413);
    assert.equal((await response.text()).includes('jane.doe@example.com'), false);
  });
});

describe('error shape', () => {
  it('returns JSON for unknown endpoints', async () => {
    const response = await fetch(`${baseUrl}/api/unknown`, { method: 'POST' });
    assert.equal(response.status, 404);

    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'not_found');
  });

  it('returns JSON when the payload is malformed', async () => {
    const response = await fetch(`${baseUrl}/api/analyze/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"text": ',
    });

    assert.ok(response.status === 400 || response.status === 500);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  });
});