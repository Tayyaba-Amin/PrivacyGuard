import { Router, type Request, type Response } from 'express';
import type { RescanImageResponse, ApiErrorResponse } from '../api/types.js';
import { buildDeterministicSummary } from '../api/types.js';
import { analyzeWithContext, aiServiceOptions, deterministicOutcome } from '../ai/index.js';
import type { AiProvider } from '../ai/types.js';
import { config } from '../config/env.js';
import { buildMeta, detectSensitiveInfo } from '../detection/index.js';
import type { Finding } from '../detection/types.js';
import { scoreRisk } from '../risk/index.js';
import { extractTextFromImage, validateImageBuffer, detectImageFormat, getImageDimensions } from '../image/index.js';

export type RescanImageRouterDependencies = {
  /** `null` disables the contextual layer entirely, as does `AI_ENABLED=false`. */
  ai: AiProvider | null;
};

export type ApiErrorBody = ApiErrorResponse;

type ParseResult =
  | { ok: true; buffer: Buffer; mimeType: string; format: 'png' | 'jpeg' | 'webp' }
  | { ok: false; status: number; body: ApiErrorBody };

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

const DETERMINISTIC_RECOMMENDATIONS: Record<Finding['category'], string> = {
  EMAIL: 'Remove it, or swap it for a secondary address if a reply is genuinely needed.',
  PHONE_NUMBER: 'Remove it from anything that is not a private conversation.',
  CREDIT_CARD: 'Delete the number. Keep only the last four digits if a reference is needed.',
  IP_ADDRESS: 'Remove it, or keep only the public address when it is genuinely useful.',
  URL: 'Remove it, or strip the query string, which often carries tokens.',
  API_KEY: 'Rotate it now, then move it into an environment variable or secret manager.',
  JWT: 'Revoke the session that issued it and never paste tokens into shared text.',
  PRIVATE_KEY: 'Treat the keypair as compromised and rotate it.',
  CREDENTIAL_PAIR: 'Change the password and revoke any active sessions for that account.',
  ADDRESS: 'Reduce it to a city or region, or remove it entirely.',
};

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

export function createRescanImageRouter(dependencies: RescanImageRouterDependencies): Router {
  const router = Router();

  router.post('/image', (req: Request, res: Response) => {
    void handleRescanImage(req, res, dependencies.ai);
  });

  return router;
}

async function handleRescanImage(
  req: Request,
  res: Response,
  ai: AiProvider | null
): Promise<void> {
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

  // Get image dimensions for metadata
  const { width, height } = await getImageDimensions(buffer);

  if (extractedText.trim().length === 0) {
    // No text found - return empty analysis with rescan marker
    const emptyMeta = {
      findingCount: 0,
      categoryCount: 0,
      categories: [] as import('../detection/types.js').FindingCategory[],
      charactersAnalyzed: 0,
      engine: 'deterministic-v1',
      aiEnabled: false,
      aiProvider: 'featherless' as const,
      aiStatus: 'unavailable' as const,
      aiStatusReason: 'disabled' as const,
      aiModel: config.ai.model,
      aiAnalyzedCount: 0,
      aiContextTruncated: false,
      aiSummary: null,
      image: {
        width,
        height,
        format,
        charactersExtracted: 0,
        ocrConfidence: ocrResult.confidence,
        wordCount: ocrResult.words.length,
      },
    };

    const response: RescanImageResponse = {
      findings: [],
      meta: emptyMeta,
      summary: 'No text was detected in the protected image.',
      risk: {
        score: 0,
        level: 'LOW',
        verdict: 'SAFE_TO_SHARE',
        explanation: 'No text was detected in the image, so no sensitive patterns could be matched.',
        caveat: 'Initial assessment of the image as submitted, before any redaction. It is not a guarantee that the content is safe to share.',
        factors: [],
        severityBasis: { deterministic: 0, contextual: 0 },
      },
      rescan: {
        source: 'protected_image',
        protected: true,
      },
    };

    res.status(200).json(response);
    return;
  }

  // Stage one: deterministic detection on extracted text
  const findings = detectSensitiveInfo(extractedText);
  const deterministicMeta = buildMeta(extractedText, findings);

  // Stage two: contextual analysis
  let outcome;
  try {
    outcome = await analyzeWithContext(extractedText, findings, {
      ...aiServiceOptions(ai),
      overrides: {
        recommendation: (finding: Finding) => DETERMINISTIC_RECOMMENDATIONS[finding.category],
      },
    });
  } catch {
    outcome = deterministicOutcome(findings, 'provider_error', 'degraded', {
      recommendation: (finding: Finding) => DETERMINISTIC_RECOMMENDATIONS[finding.category],
    });
  }

  const meta: RescanImageResponse['meta'] = {
    ...deterministicMeta,
    aiEnabled: ai !== null && ai.isConfigured() && config.aiEnabled,
    aiProvider: 'featherless',
    aiStatus: outcome.status,
    aiStatusReason: outcome.reason,
    aiModel: ai?.model ?? config.ai.model,
    aiAnalyzedCount: outcome.analyzedCount,
    aiContextTruncated: outcome.contextTruncated,
    aiSummary: outcome.summary,
    image: {
      width,
      height,
      format,
      charactersExtracted: extractedText.length,
      ocrConfidence: ocrResult.confidence,
      wordCount: ocrResult.words.length,
    },
  };

  // Stage three: deterministic risk scoring on the rescanned findings
  const risk = scoreRisk(outcome.findings);

  const response: RescanImageResponse = {
    findings: outcome.findings,
    meta,
    summary: outcome.summary ?? buildDeterministicSummary(deterministicMeta),
    risk,
    rescan: {
      source: 'protected_image',
      protected: true,
    },
  };

  res.status(200).json(response);
}