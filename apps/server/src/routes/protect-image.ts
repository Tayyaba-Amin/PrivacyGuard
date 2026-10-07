import { Router, type Request, type Response } from 'express';
import { detectSensitiveInfo } from '../detection/index.js';
import { extractTextFromImage, validateImageBuffer, detectImageFormat, getImageDimensions } from '../image/index.js';
import { protectImage } from '../image/protect.js';
import type { ProtectImageResponse, ApiErrorResponse } from '../api/types.js';

export type ProtectImageRouterDependencies = Record<string, never>;

export type ApiErrorBody = ApiErrorResponse;

type ParseResult =
  | { ok: true; buffer: Buffer; mimeType: string; format: 'png' | 'jpeg' | 'webp' }
  | { ok: false; status: number; body: ApiErrorBody };

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Parses a JSON request containing a base64 encoded image.
 */
async function parseImageRequest(req: Request): Promise<ParseResult> {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: 'invalid_request',
          message: 'Request must be application/json with an "image" field (base64).',
        },
      },
    };
  }

  const body = req.body as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: 'invalid_request',
          message: 'Request body must be a JSON object containing an "image" field.',
        },
      },
    };
  }

  const bodyObj = body as Record<string, unknown>;
  const imageData = bodyObj['image'];

  // Check for missing image field
  if (!('image' in bodyObj)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: 'missing_image',
          message: 'The "image" field is required (base64 encoded).',
        },
      },
    };
  }

  // Check for non-string image field
  if (typeof imageData !== 'string') {
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: 'invalid_image',
          message: 'The "image" field must be a base64 encoded string.',
        },
      },
    };
  }

  // Check for empty string
  if (imageData === '') {
    return {
      ok: false,
      status: 400,
      body: { error: { code: 'empty_image', message: 'The image data is empty.' } },
    };
  }

  // Strip data URL prefix if present
  const base64 = imageData.startsWith('data:') ? imageData.split(',')[1] ?? '' : imageData;
  const buffer = Buffer.from(base64, 'base64');

  if (buffer.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { error: { code: 'empty_image', message: 'The image data is empty.' } },
    };
  }

  if (buffer.length > MAX_IMAGE_SIZE) {
    return {
      ok: false,
      status: 413,
      body: {
        error: {
          code: 'image_too_large',
          message: `Image exceeds maximum size of ${MAX_IMAGE_SIZE} bytes (received ${buffer.length}).`,
        },
      },
    };
  }

  const validation = validateImageBuffer(buffer);
  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      body: { error: { code: 'invalid_image', message: validation.error } },
    };
  }

  const detectedFormat = detectImageFormat(buffer);
  if (detectedFormat === 'unknown') {
    return {
      ok: false,
      status: 400,
      body: { error: { code: 'invalid_image', message: 'Unsupported image format.' } },
    };
  }
  const format: 'png' | 'jpeg' | 'webp' = detectedFormat;
  const mimeType = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';

  return { ok: true, buffer, mimeType, format };
}

export function createProtectImageRouter(_dependencies: ProtectImageRouterDependencies): Router {
  const router = Router();

  router.post('/image', (req: Request, res: Response) => {
    void handleProtectImage(req, res);
  });

  return router;
}

async function handleProtectImage(req: Request, res: Response): Promise<void> {
  const parsed = await parseImageRequest(req);

  if (!parsed.ok) {
    res.status(parsed.status).json(parsed.body);
    return;
  }

  const { buffer, mimeType, format } = parsed;

  // Stage zero: OCR text extraction
  let ocrResult;
  try {
    ocrResult = await extractTextFromImage(buffer, mimeType);
  } catch {
    res.status(500).json({
      error: { code: 'ocr_failed', message: 'Failed to extract text from image.' },
    });
    return;
  }

  const extractedText = ocrResult.text;

  // Server-authoritative detection: run detector on extracted text
  const findings = detectSensitiveInfo(extractedText);

  if (findings.length === 0) {
    // No findings - return original image
    const { width, height } = await getImageDimensions(buffer);
    const base64 = buffer.toString('base64');

    const response: ProtectImageResponse = {
      protectedImageBase64: base64,
      redactionCount: 0,
      redactions: [],
      meta: {
        width,
        height,
        format,
        redactionCount: 0,
        redactedCategories: [],
      },
    };

    res.status(200).json(response);
    return;
  }

  // Protect the image using findings and OCR word data
  try {
    const result = await protectImage(buffer, mimeType, findings, ocrResult.words, format);
    if (result.redactionCount !== findings.length) {
      res.status(422).json({
        error: {
          code: 'protection_incomplete',
          message: 'Could not reliably locate every sensitive area. Upload a clearer image or remove the sensitive information manually before sharing.',
        },
      });
      return;
    }
    res.status(200).json(result);
  } catch {
    res.status(500).json({
      error: { code: 'protection_failed', message: 'Failed to apply redactions to image.' },
    });
  }
}