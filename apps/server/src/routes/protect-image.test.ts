import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../app.js';
import type { ProtectImageResponse } from '../api/types.js';
import fs from 'node:fs';

let server: Server;
let baseUrl: string;

const TEST_IMAGE_BUFFER = fs.readFileSync('test-image.png');
const TEST_IMAGE_BASE64 = TEST_IMAGE_BUFFER.toString('base64');

async function postProtect(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/protect/image`, {
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

describe('POST /api/protect/image', () => {
  it('protects an image with no findings', async () => {
    const response = await postProtect({ image: TEST_IMAGE_BASE64 });
    assert.equal(response.status, 200);

    const body = (await response.json()) as ProtectImageResponse;
    assert.ok(typeof body.protectedImageBase64 === 'string');
    assert.equal(body.redactionCount, 0);
    assert.deepEqual(body.redactions, []);
    assert.ok(typeof body.meta.width === 'number');
    assert.ok(typeof body.meta.height === 'number');
    assert.ok(['png', 'jpeg', 'webp'].includes(body.meta.format));
    assert.equal(body.meta.redactionCount, 0);
    assert.deepEqual(body.meta.redactedCategories, []);
  });

  it('returns the documented response shape', async () => {
    const response = await postProtect({ image: TEST_IMAGE_BASE64 });
    const body = (await response.json()) as ProtectImageResponse;

    assert.ok(typeof body.protectedImageBase64 === 'string');
    assert.ok(Number.isInteger(body.redactionCount));
    assert.ok(Array.isArray(body.redactions));
    assert.ok(typeof body.meta.width === 'number');
    assert.ok(typeof body.meta.height === 'number');
    assert.ok(['png', 'jpeg', 'webp'].includes(body.meta.format));
    assert.ok(Number.isInteger(body.meta.redactionCount));
    assert.ok(Array.isArray(body.meta.redactedCategories));
  });

  it('redactions have the correct shape when present', async () => {
    const response = await postProtect({ image: TEST_IMAGE_BASE64 });
    const body = (await response.json()) as ProtectImageResponse;

    for (const redaction of body.redactions) {
      assert.equal(typeof redaction.findingId, 'string');
      assert.equal(typeof redaction.category, 'string');
      assert.ok(typeof redaction.bbox.x === 'number');
      assert.ok(typeof redaction.bbox.y === 'number');
      assert.ok(typeof redaction.bbox.width === 'number');
      assert.ok(typeof redaction.bbox.height === 'number');
      assert.equal(typeof redaction.replacement, 'string');
    }
  });
});

describe('POST /api/protect/image validation', () => {
  it('rejects a missing image field', async () => {
    const response = await postProtect({});
    assert.equal(response.status, 400);

    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'missing_image');
  });

  it('rejects a non-string image field', async () => {
    for (const value of [123, true, null, ['a'], { nested: true }]) {
      const response = await postProtect({ image: value });
      assert.equal(response.status, 400);

      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'invalid_image');
    }
  });

  it('rejects empty image data', async () => {
    const response = await postProtect({ image: '' });
    assert.equal(response.status, 400);

    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'empty_image');
  });

  it('rejects a non-object body', async () => {
    const response = await postProtect(['not', 'an', 'object']);
    assert.equal(response.status, 400);

    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'invalid_request');
  });

  it('rejects unsupported image formats', async () => {
    const gifBase64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const response = await postProtect({ image: gifBase64 });
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

    const response = await postProtect({ image: largeBase64 });
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
    const response = await fetch(`${baseUrl}/api/protect/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"image": ',
    });

    assert.ok(response.status === 400 || response.status === 500);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  });
});