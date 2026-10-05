import { Router, type Request, type Response } from 'express';
import { config } from '../config/env.js';
import { detectSensitiveInfo } from '../detection/index.js';
import { protectText } from '../protection/index.js';
import type { ProtectInput, ProtectionResult } from '../protection/types.js';

export type ProtectRouterDependencies = Record<string, never>;

type ParseResult = { ok: true; text: string } | { ok: false; status: number; body: ApiErrorBody };

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export type ProtectTextResponse = ProtectionResult;

const PROTECT_ERROR_CODES = [
  'invalid_request',
  'missing_text',
  'invalid_text',
  'empty_text',
  'text_too_large',
  'internal_error',
] as const;

export type ProtectApiErrorCode = (typeof PROTECT_ERROR_CODES)[number];

/**
 * Treats the request body as untrusted. Only the shape of the request is
 * inspected here; the submitted text is never logged, echoed or persisted.
 * The server runs its own detection to be authoritative over what gets redacted.
 */
function parseProtectRequest(body: unknown): ParseResult {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: 'invalid_request',
          message: 'Request body must be a JSON object containing a "text" field.',
        },
      },
    };
  }

  const text = (body as Record<string, unknown>)['text'];

  if (text === undefined) {
    return {
      ok: false,
      status: 400,
      body: { error: { code: 'missing_text', message: 'The "text" field is required.' } },
    };
  }

  if (typeof text !== 'string') {
    return {
      ok: false,
      status: 400,
      body: { error: { code: 'invalid_text', message: 'The "text" field must be a string.' } },
    };
  }

  if (text.trim().length === 0) {
    return {
      ok: false,
      status: 400,
      body: { error: { code: 'empty_text', message: 'The "text" field must not be empty.' } },
    };
  }

  if (text.length > config.maxTextChars) {
    return {
      ok: false,
      status: 413,
      body: {
        error: {
          code: 'text_too_large',
          message: `The "text" field accepts at most ${config.maxTextChars} characters (received ${text.length}).`,
        },
      },
    };
  }

  return { ok: true, text };
}

export function createProtectRouter(_dependencies: ProtectRouterDependencies): Router {
  const router = Router();

  router.post('/text', (req: Request, res: Response) => {
    void handleProtectText(req, res);
  });

  return router;
}

async function handleProtectText(req: Request, res: Response): Promise<void> {
  const parsed = parseProtectRequest(req.body);

  if (!parsed.ok) {
    res.status(parsed.status).json(parsed.body);
    return;
  }

  const text = parsed.text;

  // Server-authoritative detection: we run the detector on the submitted text
  // so the client cannot manipulate spans to redact arbitrary content.
  const findings = detectSensitiveInfo(text);

  // Protect using the server's own findings
  const input: ProtectInput = { text, findings };
  const result = protectText(input);

  // Response does not include original sensitive values in metadata
  const response: ProtectTextResponse = result;

  res.status(200).json(response);
}