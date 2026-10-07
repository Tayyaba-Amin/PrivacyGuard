import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Jimp, JimpMime } from 'jimp';
import { detectSensitiveInfo } from '../detection/index.js';
import { protectImage } from './protect.js';

describe('protectImage', () => {
  it('redacts an email when OCR splits it across word boxes', async () => {
    const image = new Jimp({ width: 220, height: 60, color: 0xffffffff });
    const imageBuffer = await image.getBuffer(JimpMime.png);
    const text = 'Contact demo.person@example.com';
    const email = detectSensitiveInfo(text).find((finding) => finding.category === 'EMAIL');
    assert.ok(email);

    const result = await protectImage(
      imageBuffer,
      JimpMime.png,
      [email],
      [
        { text: 'Contact', bbox: { x: 5, y: 10, width: 40, height: 20 } },
        { text: 'demo.person', bbox: { x: 50, y: 10, width: 70, height: 20 } },
        { text: '@', bbox: { x: 121, y: 10, width: 10, height: 20 } },
        { text: 'example.com', bbox: { x: 132, y: 10, width: 75, height: 20 } },
      ],
      'png',
    );

    assert.equal(result.redactionCount, 1);
    assert.deepEqual(result.meta.redactedCategories, ['EMAIL']);
    assert.ok(result.redactions[0]);
    assert.ok(result.redactions[0].bbox.x <= 50);
    assert.ok(result.redactions[0].bbox.x + result.redactions[0].bbox.width >= 207);
  });

  it('redacts a phone number when OCR omits separators and splits its digits', async () => {
    const image = new Jimp({ width: 220, height: 60, color: 0xffffffff });
    const imageBuffer = await image.getBuffer(JimpMime.png);
    const text = 'Call 202-555-0142';
    const phone = detectSensitiveInfo(text).find((finding) => finding.category === 'PHONE_NUMBER');
    assert.ok(phone);

    const result = await protectImage(
      imageBuffer,
      JimpMime.png,
      [phone],
      [
        { text: 'Call', bbox: { x: 5, y: 10, width: 35, height: 20 } },
        { text: '202', bbox: { x: 45, y: 10, width: 32, height: 20 } },
        { text: '555', bbox: { x: 82, y: 10, width: 32, height: 20 } },
        { text: '0142', bbox: { x: 119, y: 10, width: 45, height: 20 } },
      ],
      'png',
    );

    assert.equal(result.redactionCount, 1);
    assert.deepEqual(result.meta.redactedCategories, ['PHONE_NUMBER']);
    assert.ok(result.redactions[0]);
    assert.ok(result.redactions[0].bbox.x <= 45);
    assert.ok(result.redactions[0].bbox.x + result.redactions[0].bbox.width >= 164);
  });
});
