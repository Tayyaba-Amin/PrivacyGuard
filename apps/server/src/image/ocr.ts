/**
 * OCR module using Tesseract.js.
 *
 * Extracts text and word-level bounding boxes from images.
 * Uses Tesseract.js which runs entirely in JavaScript/WASM.
 */

import { createWorker } from 'tesseract.js';
import { Jimp } from 'jimp';
import type { OcrResult, OcrWord } from './types.js';

const WORKER_CACHE = new Map<string, Awaited<ReturnType<typeof createWorker>>>();

/**
 * Gets or creates a Tesseract worker for the given language.
 * Workers are cached to avoid reinitialization overhead.
 */
async function getWorker(lang = 'eng'): Promise<Awaited<ReturnType<typeof createWorker>>> {
  const key = lang;
  if (WORKER_CACHE.has(key)) {
    return WORKER_CACHE.get(key)!;
  }

  const worker = await createWorker(lang);
  WORKER_CACHE.set(key, worker);
  return worker;
}

/**
 * Converts an image buffer to a format Tesseract can process.
 * Tesseract.js can work with data URLs, so we convert Jimp images to base64.
 */
async function imageBufferToDataUrl(buffer: Buffer, mimeType: string): Promise<string> {
  const image = await Jimp.read(buffer);
  const format = mimeType === 'image/png' ? 'image/png' : mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  const base64 = await image.getBase64(format);
  return base64;
}

/**
 * Runs OCR on an image buffer and returns extracted text with word bounding boxes.
 */
export async function extractTextFromImage(
  buffer: Buffer,
  mimeType: string,
  lang = 'eng'
): Promise<OcrResult> {
  const worker = await getWorker(lang);

  // Convert to data URL for Tesseract
  const dataUrl = await imageBufferToDataUrl(buffer, mimeType);

  // Recognize text
  const { data } = await worker.recognize(dataUrl);

  // Extract words with bounding boxes
  const words: OcrWord[] = [];
  // Tesseract.js returns data with blocks, paragraphs, lines, words directly
  if (data.blocks) {
    for (const block of data.blocks) {
      if (block.paragraphs) {
        for (const paragraph of block.paragraphs) {
          if (paragraph.lines) {
            for (const line of paragraph.lines) {
              if (line.words) {
                for (const word of line.words) {
                  // Filter out low-confidence noise
                  if (word.confidence > 30 && word.text.trim().length > 0) {
                    words.push({
                      text: word.text,
                      bbox: {
                        x: word.bbox.x0,
                        y: word.bbox.y0,
                        width: word.bbox.x1 - word.bbox.x0,
                        height: word.bbox.y1 - word.bbox.y0,
                      },
                      confidence: word.confidence,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Combine all text
  const fullText = data.text?.trim() ?? '';

  return {
    text: fullText,
    words,
    confidence: data.confidence ?? 0,
  };
}

/**
 * Gets image dimensions from a buffer.
 */
export async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  const image = await Jimp.read(buffer);
  return { width: image.bitmap.width, height: image.bitmap.height };
}

/**
 * Detects image format from buffer.
 */
export function detectImageFormat(buffer: Buffer): 'png' | 'jpeg' | 'webp' | 'unknown' {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.length >= 8 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
      buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
    return 'png';
  }

  // JPEG signature: FF D8 FF
  if (buffer.length >= 3 &&
      buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpeg';
  }

  // WebP signature: RIFF....WEBP
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'webp';
  }

  return 'unknown';
}

/**
 * Validates that the buffer is a supported image format.
 */
export function validateImageBuffer(buffer: Buffer): { ok: true } | { ok: false; error: string } {
  if (!buffer || buffer.length === 0) {
    return { ok: false, error: 'Empty image buffer' };
  }

  const format = detectImageFormat(buffer);
  if (format === 'unknown') {
    return { ok: false, error: 'Unsupported image format. Use PNG, JPEG, or WEBP.' };
  }

  // Size limit: 10MB
  if (buffer.length > 10 * 1024 * 1024) {
    return { ok: false, error: 'Image too large. Maximum size is 10MB.' };
  }

  return { ok: true };
}

/**
 * Cleans up all workers (useful for testing).
 */
export async function cleanupWorkers(): Promise<void> {
  for (const worker of WORKER_CACHE.values()) {
    await worker.terminate();
  }
  WORKER_CACHE.clear();
}