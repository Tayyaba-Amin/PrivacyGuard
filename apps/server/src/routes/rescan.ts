import { Router, type Request, type Response } from 'express';
import type { AnalyzeTextResponse, ApiErrorResponse } from '../api/types.js';
import { buildDeterministicSummary } from '../api/types.js';
import { analyzeWithContext, aiServiceOptions, deterministicOutcome } from '../ai/index.js';
import type { AiProvider } from '../ai/types.js';
import { config } from '../config/env.js';
import { buildMeta, detectSensitiveInfo } from '../detection/index.js';
import type { Finding } from '../detection/types.js';
import { scoreRisk } from '../risk/index.js';

export type RescanRouterDependencies = {
  /** `null` disables the contextual layer entirely, as does `AI_ENABLED=false`. */
  ai: AiProvider | null;
};

export type ApiErrorBody = ApiErrorResponse;

type ParseResult = { ok: true; text: string } | { ok: false; status: number; body: ApiErrorBody };

/**
 * Per-category recommendation used when the AI layer adds nothing. Kept here so
 * the deterministic fallback is still actionable rather than a bare category
 * label.
 */
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
 * Treats the request body as untrusted. Only the shape of the request is
 * inspected here; the submitted text is never logged, echoed or persisted.
 */
function parseTextRequest(body: unknown): ParseResult {
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

export function createRescanRouter(dependencies: RescanRouterDependencies): Router {
  const router = Router();

  router.post('/text', (req: Request, res: Response) => {
    void handleRescanText(req, res, dependencies.ai);
  });

  return router;
}

async function handleRescanText(req: Request, res: Response, ai: AiProvider | null): Promise<void> {
  const parsed = parseTextRequest(req.body);

  if (!parsed.ok) {
    res.status(parsed.status).json(parsed.body);
    return;
  }

  const text = parsed.text;

  // Stage one: deterministic detection on the protected text.
  const findings = detectSensitiveInfo(text);
  const deterministicMeta = buildMeta(text, findings);

  // Stage two: contextual analysis.
  let outcome;
  try {
    outcome = await analyzeWithContext(text, findings, {
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

  const meta: AnalyzeTextResponse['meta'] = {
    ...deterministicMeta,
    aiEnabled: ai !== null && ai.isConfigured() && config.aiEnabled,
    aiProvider: 'featherless',
    aiStatus: outcome.status,
    aiStatusReason: outcome.reason,
    aiModel: ai?.model ?? config.ai.model,
    aiAnalyzedCount: outcome.analyzedCount,
    aiContextTruncated: outcome.contextTruncated,
    aiSummary: outcome.summary,
  };

  // Stage three: deterministic risk scoring on the rescanned findings.
  const risk = scoreRisk(outcome.findings);

  const response: AnalyzeTextResponse = {
    findings: outcome.findings,
    meta,
    summary: outcome.summary ?? buildDeterministicSummary(deterministicMeta),
    risk,
  };

  // Add rescan metadata to indicate this was a rescan of protected text
  res.status(200).json({
    ...response,
    rescan: {
      source: 'protected_text',
      protected: true,
    },
  });
}