/**
 * Image protection module.
 *
 * Applies visual redactions to images based on OCR word bounding boxes
 * and detection findings. Uses Jimp for pure JavaScript image manipulation.
 */

import { Jimp } from 'jimp';
import type { ImageFinding, ImageProtectionResult, ImageRedaction, BoundingBox, ProtectedImageMeta, ImageFormat } from './types.js';
import { tokenForCategory } from '../protection/types.js';

/** Color for redaction boxes (black) */
const REDACTION_COLOR = 0x000000FF;

/** Padding around text for redaction (in pixels) */
const REDACTION_PADDING = 2;

/**
 * Converts a text offset finding to an image bounding box by matching
 * the matched text against OCR words.
 */
function findBoundingBoxForFinding(
  finding: ImageFinding,
  ocrWords: { text: string; bbox: BoundingBox }[]
): BoundingBox | null {
  const matchedText = finding.matchedText.trim();
  if (!matchedText) return null;

  // Try to find the text in the OCR words
  // We'll look for a sequence of words that contains the matched text
  const wordsText = ocrWords.map((w) => w.text).join(' ');
  const index = wordsText.indexOf(matchedText);

  if (index === -1) {
    // Try case-insensitive
    const lowerWordsText = wordsText.toLowerCase();
    const lowerMatched = matchedText.toLowerCase();
    const lowerIndex = lowerWordsText.indexOf(lowerMatched);
    if (lowerIndex === -1) return null;

    // Find which words cover this range
    return findBboxFromCharOffset(ocrWords, lowerIndex, lowerIndex + matchedText.length);
  }

  return findBboxFromCharOffset(ocrWords, index, index + matchedText.length);
}

/**
 * Finds the bounding box covering a character range in the concatenated word text.
 */
function findBboxFromCharOffset(
  ocrWords: { text: string; bbox: BoundingBox }[],
  startChar: number,
  endChar: number
): BoundingBox | null {
  let charPos = 0;
  let startWordIndex = -1;
  let endWordIndex = -1;

  for (let i = 0; i < ocrWords.length; i++) {
    const word = ocrWords[i];
    if (!word) continue;
    const wordEnd = charPos + word.text.length;

    if (startWordIndex === -1 && charPos <= startChar && startChar < wordEnd) {
      startWordIndex = i;
    }
    if (endWordIndex === -1 && charPos < endChar && endChar <= wordEnd) {
      endWordIndex = i;
    }

    charPos = wordEnd + 1; // +1 for the space we added

    if (startWordIndex !== -1 && endWordIndex !== -1) break;
  }

  if (startWordIndex === -1 || endWordIndex === -1) return null;

  // Calculate combined bounding box
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = startWordIndex; i <= endWordIndex; i++) {
    const word = ocrWords[i];
    if (!word) continue;
    minX = Math.min(minX, word.bbox.x);
    minY = Math.min(minY, word.bbox.y);
    maxX = Math.max(maxX, word.bbox.x + word.bbox.width);
    maxY = Math.max(maxY, word.bbox.y + word.bbox.height);
  }

  // Add padding
  minX = Math.max(0, minX - REDACTION_PADDING);
  minY = Math.max(0, minY - REDACTION_PADDING);
  maxX += REDACTION_PADDING;
  maxY += REDACTION_PADDING;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Applies redactions to an image based on findings and OCR word data.
 */
export async function protectImage(
  imageBuffer: Buffer,
  mimeType: string,
  findings: ImageFinding[],
  ocrWords: { text: string; bbox: BoundingBox }[],
  format: ImageFormat
): Promise<ImageProtectionResult> {
  const image = await Jimp.read(imageBuffer);

  const redactions: ImageRedaction[] = [];

  // Find bounding boxes for each finding
  for (const finding of findings) {
    const bbox = findBoundingBoxForFinding(finding, ocrWords);
    if (!bbox) continue;

    const replacement = tokenForCategory(finding.category);

    // Draw black rectangle over the sensitive region
    const { x, y, width, height } = bbox;

    // Ensure bounds are within image
    const safeX = Math.max(0, Math.min(x, image.bitmap.width - 1));
    const safeY = Math.max(0, Math.min(y, image.bitmap.height - 1));
    const safeWidth = Math.min(width, image.bitmap.width - safeX);
    const safeHeight = Math.min(height, image.bitmap.height - safeY);

    if (safeWidth <= 0 || safeHeight <= 0) continue;

    // Fill the region with black (use image.setPixelColor, not bitmap)
    for (let py = safeY; py < safeY + safeHeight; py++) {
      for (let px = safeX; px < safeX + safeWidth; px++) {
        image.setPixelColor(REDACTION_COLOR, px, py);
      }
    }

    redactions.push({
      findingId: finding.id,
      category: finding.category,
      bbox,
      replacement,
    });
  }

  // Convert back to buffer
  const formatMime = mimeType === 'image/png' ? 'image/png' : mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  const protectedBuffer = await image.getBase64(formatMime);

  // Extract base64 data (remove data URL prefix)
  const base64Data = protectedBuffer.split(',')[1] ?? protectedBuffer;

  // Build metadata
  const redactedCategories = [...new Set(redactions.map((r) => r.category))];

  const meta: ProtectedImageMeta = {
    width: image.bitmap.width,
    height: image.bitmap.height,
    format,
    redactionCount: redactions.length,
    redactedCategories,
  };

  return {
    protectedImageBase64: base64Data,
    redactionCount: redactions.length,
    redactions,
    meta,
  };
}