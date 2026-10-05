import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../app.js';
import type { RescanImageResponse } from '../api/types.js';
import { FINDING_CATEGORIES, SEVERITIES } from '../detection/types.js';
import { RISK_LEVELS, SEVERITY_WEIGHTS, SHARING_VERDICTS } from '../risk/index.js';
import fs from 'node:fs';

let server: Server;
let baseUrl: string;

const TEST_IMAGE_BUFFER = fs.readFileSync('test-image.png');
const TEST_IMAGE_BASE64 = TEST_IMAGE_BUFFER.toString('base64');

async function postRescan(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/rescan/image`, {
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

describe('POST /api/rescan/image', () => {
  it('rescans an image with no findings', async () => {
    const response = await postRescan({ image: TEST_IMAGE_BASE64 });
    assert.equal(response.status, 200);

    const body = (await response.json()) as RescanImageResponse;
    assert.ok(Array.isArray(body.findings));
    assert.ok(typeof body.summary === 'string');
    assert.ok(body.risk);
    assert.ok(typeof body.risk.score === 'number');
    assert.ok(RISK_LEVELS.includes(body.risk.level));
    assert.ok(SHARING_VERDICTS.includes(body.risk.verdict));
    // Rescan marker
    assert.deepEqual(body.rescan, { source: 'protected_image', protected: true });
  });

  it('returns the documented finding shape when findings exist', async () => {
    const response = await postRescan({ image: TEST_IMAGE_BASE64 });
    const body = (await response.json()) as RescanImageResponse;

    for (const finding of body.findings) {
      assert.equal(typeof finding.id, 'string');
      assert.ok(FINDING_CATEGORIES.includes(finding.category));
      assert.ok(SEVERITIES.includes(finding.severity));
      assert.equal(typeof finding.start, 'number');
      assert.equal(typeof finding.end, 'number');
      assert.equal(typeof finding.matchedText, 'string');
      assert.equal(typeof finding.explanation, 'string');
      assert.equal(typeof finding.confidence, 'number');
    }
  });

  it('attaches deterministic contextual commentary to every finding', async () => {
    const response = await postRescan({ image: TEST_IMAGE_BASE64 });
    const body = (await response.json()) as RescanImageResponse;

    for (const finding of body.findings) {
      assert.equal(finding.contextual.source, 'deterministic');
      assert.equal(finding.contextual.isSensitive, true);
      assert.ok(SEVERITIES.includes(finding.contextual.severity));
      assert.equal(finding.contextual.severityAdjusted, false);
      assert.ok(finding.contextual.explanation.length > 0);
      assert.ok(finding.contextual.recommendation.length > 0);
    }
  });

  it('returns metadata with image information and rescan marker', async () => {
    const response = await postRescan({ image: TEST_IMAGE_BASE64 });
    const body = (await response.json()) as RescanImageResponse;

    assert.equal(body.meta.findingCount, body.findings.length);
    assert.equal(body.meta.categoryCount, body.meta.categories.length);
    assert.equal(typeof body.meta.charactersAnalyzed, 'number');
    assert.equal(body.meta.engine, 'deterministic-v1');
    assert.equal(body.meta.aiEnabled, false);
    assert.equal(body.meta.aiStatus, 'unavailable');
    assert.equal(body.meta.aiStatusReason, 'disabled');
    assert.equal(body.meta.aiAnalyzedCount, 0);
    assert.equal(body.meta.aiContextTruncated, false);
    assert.equal(body.meta.aiSummary, null);
    assert.equal(body.meta.aiProvider, 'featherless');
    assert.equal(typeof body.meta.aiModel, 'string');
    // Image-specific metadata
    assert.ok(typeof body.meta.image.width === 'number');
    assert.ok(typeof body.meta.image.height === 'number');
    assert.ok(['png', 'jpeg', 'webp'].includes(body.meta.image.format));
    assert.ok(typeof body.meta.image.charactersExtracted === 'number');
    assert.ok(typeof body.meta.image.ocrConfidence === 'number');
    assert.ok(typeof body.meta.image.wordCount === 'number');
    // Rescan marker
    assert.deepEqual(body.rescan, { source: 'protected_image', protected: true });
  });

  it('returns a deterministic risk assessment alongside the findings', async () => {
    const response = await postRescan({ image: TEST_IMAGE_BASE64 });
    const body = (await response.json()) as RescanImageResponse;

    assert.ok(Number.isInteger(body.risk.score));
    assert.ok(body.risk.score >= 0 && body.risk.score <= 100);
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
    const response = await postRescan({ image: TEST_IMAGE_BASE64 });
    const body = (await response.json()) as RescanImageResponse;

    if (body.findings.length === 0) {
      assert.equal(body.risk.score, 0);
      assert.equal(body.risk.level, 'LOW');
      assert.equal(body.risk.verdict, 'SAFE_TO_SHARE');
      assert.deepEqual(body.risk.factors, []);
    }
  });
});

describe('POST /api/rescan/image validation', () => {
  it('rejects a missing image field', async () => {
    const response = await postRescan({});
    assert.equal(response.status, 400);

    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'missing_image');
  });

  it('rejects a non-string image field', async () => {
    for (const value of [123, true, null, ['a'], { nested: true }]) {
      const response = await postRescan({ image: value });
      assert.equal(response.status, 400);

      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'invalid_image');
    }
  });

  it('rejects empty image data', async () => {
    const response = await postRescan({ image: '' });
    assert.equal(response.status, 400);

    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'empty_image');
  });

  it('rejects a non-object body', async () => {
    const response = await postRescan(['not', 'an', 'object']);
    assert.equal(response.status, 400);

    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'invalid_request');
  });

  it('rejects unsupported image formats', async () => {
    const gifBase64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const response = await postRescan({ image: gifBase64 });
    assert.equal(response.status, 400);

    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'invalid_image');
  });

  it('rejects oversized image with 413', async () => {
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 0xFF);
    largeBuffer[0] = 0x89;
    largeBuffer[1] = 0x50;
    largeBuffer[2] = 0x4E;
    largeBuffer[3] = 0x47;
    largeBuffer[4] = 0x0D;
    largeBuffer[5] = 0x0A;
    largeBuffer[6] = 0x1A;
    largeBuffer[7] = 0x0A;
    const largeBase64 = largeBuffer.toString('base64');

    const response = await postRescan({ image: largeBase64 });
    assert.equal(response.status, 413);

    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'image_too_large');
    assert.match(body.error.message, /maximum size/);
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
    const response = await fetch(`${baseUrl}/api/rescan/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"image": ',
    });

    assert.ok(response.status === 400 || response.status === 500);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  });
});