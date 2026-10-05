/**
 * Image analysis types.
 *
 * These types represent the structure of OCR results and the metadata
 * returned from image analysis.
 */

import type { Finding } from '../detection/types.js';

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export type OcrResult = {
  /** Extracted text from the image */
  text: string;
  /** Per-word OCR data with bounding boxes */
  words: OcrWord[];
  /** Confidence of the overall OCR result (0-100) */
  confidence: number;
};

export type OcrWord = {
  /** The recognized word text */
  text: string;
  /** Bounding box of the word */
  bbox: BoundingBox;
  /** Confidence of this word (0-100) */
  confidence: number;
};

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** A finding in image space with both text offset and pixel bounding box */
export type ImageFinding = Finding & {
  /** Pixel coordinates of the finding in the image */
  imageBbox?: BoundingBox;
};

export type ImageMeta = {
  /** Original image dimensions */
  width: number;
  height: number;
  /** Image format */
  format: ImageFormat;
  /** Number of characters extracted by OCR */
  charactersExtracted: number;
  /** OCR confidence */
  ocrConfidence: number;
  /** Number of words detected by OCR */
  wordCount: number;
  /** Analysis engine identifier */
  engine: string;
};

export type ProtectedImageMeta = {
  /** Original image dimensions */
  width: number;
  height: number;
  /** Image format */
  format: ImageFormat;
  /** Number of redactions applied */
  redactionCount: number;
  /** Categories that were redacted */
  redactedCategories: string[];
};

export type ImageRedaction = {
  findingId: string;
  category: string;
  /** Bounding box of the redaction */
  bbox: BoundingBox;
  /** Replacement token used */
  replacement: string;
};

export type ImageProtectionResult = {
  /** Base64 encoded protected image */
  protectedImageBase64: string;
  /** Number of redactions applied */
  redactionCount: number;
  /** Details of each redaction */
  redactions: ImageRedaction[];
  /** Metadata about the protection */
  meta: ProtectedImageMeta;
};