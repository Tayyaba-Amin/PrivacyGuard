/**
 * Image analysis and protection module.
 *
 * Provides OCR-based text extraction from images and visual redaction
 * of detected sensitive information.
 */

export * from './types.js';
export { extractTextFromImage, getImageDimensions, detectImageFormat, validateImageBuffer, cleanupWorkers } from './ocr.js';
export { protectImage } from './protect.js';