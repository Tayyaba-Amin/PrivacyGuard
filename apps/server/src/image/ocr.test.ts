import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { SANS_32_BLACK } from '@jimp/plugin-print/fonts';
import { loadFont } from '@jimp/plugin-print/load-font';
import { Jimp, JimpMime } from 'jimp';
import { detectSensitiveInfo } from '../detection/index.js';
import { protectImage } from './protect.js';
import { cleanupWorkers, extractTextFromImage } from './ocr.js';

after(async () => {
  await cleanupWorkers();
});

describe('image OCR and protection', () => {
  it('extracts word boxes and redacts detected text from a readable image', async () => {
    const image = new Jimp({ width: 900, height: 180, color: 0xffffffff });
    const font = await loadFont(SANS_32_BLACK);
    image.print({ font, x: 10, y: 15, text: 'demo.person@example.com' });
    image.print({ font, x: 10, y: 75, text: '202-555-0142' });
    const imageBuffer = await image.getBuffer(JimpMime.png);

    const ocr = await extractTextFromImage(imageBuffer, JimpMime.png);
    assert.match(ocr.text, /demo\.person@example\.com/);
    assert.match(ocr.text, /202-555-0142/);
    assert.ok(ocr.words.length >= 2);
    assert.ok(ocr.words.every((word) => word.bbox.width > 0 && word.bbox.height > 0));

    const findings = detectSensitiveInfo(ocr.text);
    assert.equal(findings.length, 2);

    const protectedImage = await protectImage(imageBuffer, JimpMime.png, findings, ocr.words, 'png');
    assert.equal(protectedImage.redactionCount, findings.length);
  });
});
