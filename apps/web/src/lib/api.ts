/**
 * Wire contract for POST /api/analyze/text.
 *
 * These types mirror the backend definition in
 * `apps/server/src/api/types.ts`. They are duplicated rather than shared
 * through a workspace package so the frontend stays free of a build-time
 * dependency on the server; keep the two files in step.
 *
 * Nothing here is a secret: the provider's API key stays on the server and is
 * never part of a response.
 */

export const API_CATEGORIES = [
  'EMAIL',
  'PHONE_NUMBER',
  'CREDIT_CARD',
  'IP_ADDRESS',
  'URL',
  'API_KEY',
  'JWT',
  'PRIVATE_KEY',
  'CREDENTIAL_PAIR',
  'ADDRESS',
] as const;

export type ApiCategory = (typeof API_CATEGORIES)[number];

export const API_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type ApiSeverity = (typeof API_SEVERITIES)[number];

/** Risk levels, matching the backend's `risk.level`. */
export const API_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type ApiRiskLevel = (typeof API_RISK_LEVELS)[number];

/**
 * Initial sharing verdict for the text as submitted. This is a pre-protection
 * verdict: it does not claim the content is safe.
 */
export const API_SHARING_VERDICTS = [
  'SAFE_TO_SHARE',
  'REVIEW_BEFORE_SHARING',
  'NOT_SAFE_TO_SHARE',
] as const;

export type ApiSharingVerdict = (typeof API_SHARING_VERDICTS)[number];

export type ApiRiskFactor = {
  findingId: string;
  category: ApiCategory;
  /** Effective severity used for the weight. */
  severity: ApiSeverity;
  /** Detector severity, present only when the effective one differs. */
  deterministicSeverity?: ApiSeverity;
  severitySource: 'ai' | 'deterministic';
  /** Severity weight before diminishing returns, 0-100. */
  contribution: number;
};

/** Deterministic risk assessment. Never produced by the AI provider. */
export type ApiRiskAssessment = {
  score: number;
  level: ApiRiskLevel;
  verdict: ApiSharingVerdict;
  explanation: string;
  caveat: string;
  factors: ApiRiskFactor[];
  severityBasis: { deterministic: number; contextual: number };
};

/** Whether a finding's commentary came from the model or from the detector. */
export type ApiContextualSource = 'ai' | 'deterministic';

/** Outcome of the contextual-analysis layer for one request. */
export const AI_STATUSES = ['available', 'degraded', 'unavailable'] as const;

export type ApiAiStatus = (typeof AI_STATUSES)[number];

/**
 * Contextual commentary attached by the backend. When `source` is `deterministic`
 * the model did not contribute, so these are the detector's own words and must
 * not be presented as an AI opinion.
 */
export type ApiContextual = {
  source: ApiContextualSource;
  isSensitive: boolean;
  confidence: number;
  /** Contextual severity. Metadata only; no risk score is derived from it. */
  severity: ApiSeverity;
  severityAdjusted: boolean;
  explanation: string;
  recommendation: string;
};

export type ApiFinding = {
  id: string;
  category: ApiCategory;
  /** Deterministic severity, never overwritten by the AI layer. */
  severity: ApiSeverity;
  start: number;
  end: number;
  matchedText: string;
  explanation: string;
  confidence: number;
  contextual: ApiContextual;
};

export type ApiAnalysisMeta = {
  findingCount: number;
  categoryCount: number;
  categories: ApiCategory[];
  charactersAnalyzed: number;
  engine: string;
  aiEnabled: boolean;
  aiProvider: 'featherless';
  aiStatus: ApiAiStatus;
  aiStatusReason: string;
  aiModel: string;
  aiAnalyzedCount: number;
  aiContextTruncated: boolean;
  aiSummary: string | null;
};

export type AnalyzeTextResponse = {
  findings: ApiFinding[];
  meta: ApiAnalysisMeta;
  summary: string;
  risk: ApiRiskAssessment;
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Standing caveat on every risk assessment, mirrored from the backend so the UI
 * can label an absent one without inventing wording of its own.
 */
const RISK_CAVEAT =
  'Initial assessment of the text as submitted, before any redaction. It is not a guarantee that the content is safe to share.';

/**
 * Backend origin. In dev the Vite server proxies `/api` to this value, so a
 * relative URL would also work, but using the absolute origin keeps dev and
 * prod behaviour identical and makes the target obvious for each environment.
 * `VITE_API_ORIGIN` is inlined at build time; the fallback matches the default
 * in `apps/web/vite.config.ts`.
 */
const API_BASE = import.meta.env.VITE_API_ORIGIN ?? 'https://privacyguard-d7k0.onrender.com';

type ErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export async function analyzeText(text: string, signal?: AbortSignal): Promise<AnalyzeTextResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}/api/analyze/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('Could not reach the PrivacyGuard API. Is the backend running?', 'network_error', 0);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as ErrorBody | null)?.error;
    throw new ApiError(
      error?.message ?? `The API responded with ${response.status}.`,
      error?.code ?? 'unknown_error',
      response.status,
    );
  }

  return normaliseAnalyzeResponse(payload);
}

export type ProtectRedaction = {
  findingId: string;
  category: ApiCategory;
  start: number;
  end: number;
  replacement: string;
};

export type ProtectTextResponse = {
  protectedText: string;
  redactionCount: number;
  redactions: ProtectRedaction[];
};

export type RescanTextResponse = AnalyzeTextResponse & {
  rescan: {
    source: 'protected_text';
    protected: true;
  };
};

export async function protectText(text: string, signal?: AbortSignal): Promise<ProtectTextResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}/api/protect/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('Could not reach the PrivacyGuard API. Is the backend running?', 'network_error', 0);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as ErrorBody | null)?.error;
    throw new ApiError(
      error?.message ?? `The API responded with ${response.status}.`,
      error?.code ?? 'unknown_error',
      response.status,
    );
  }

  return payload as ProtectTextResponse;
}

/**
 * Fills in the contextual block when a response predates it, so a client that is
 * briefly out of step with the server degrades to deterministic wording instead
 * of rendering an undefined field or, worse, inventing an AI result.
 */
function normaliseAnalyseFinding(finding: ApiFinding): ApiFinding {
  const contextual = finding.contextual;

  if (contextual && typeof contextual.explanation === 'string') {
    return { ...finding, contextual: { ...contextual, source: contextual.source === 'ai' ? 'ai' : 'deterministic' } };
  }

  return {
    ...finding,
    contextual: {
      source: 'deterministic',
      isSensitive: true,
      confidence: finding.confidence,
      severity: finding.severity,
      severityAdjusted: false,
      explanation: finding.explanation,
      recommendation: finding.explanation,
    },
  };
}

function normaliseAnalyzeResponse(payload: unknown): AnalyzeTextResponse {
  const body = payload as AnalyzeTextResponse;

  return {
    findings: (body.findings ?? []).map(normaliseAnalyseFinding),
    meta: {
      ...body.meta,
      aiEnabled: body.meta?.aiEnabled ?? false,
      aiStatus: body.meta?.aiStatus ?? 'unavailable',
      aiStatusReason: body.meta?.aiStatusReason ?? 'missing_api_key',
      aiAnalyzedCount: body.meta?.aiAnalyzedCount ?? 0,
      aiContextTruncated: body.meta?.aiContextTruncated ?? false,
      aiSummary: body.meta?.aiSummary ?? null,
    },
    summary: body.summary ?? '',
    risk: normaliseRisk(body.risk),
  };
}

/**
 * Fills in a risk block for a response that predates it. The fallback is the
 * neutral 0 / LOW / SAFE_TO_SHARE assessment rather than a guess, and the
 * explanation says plainly that no assessment was received.
 */
function normaliseRisk(risk: ApiRiskAssessment | undefined): ApiRiskAssessment {
  if (risk && Number.isInteger(risk.score) && Array.isArray(risk.factors)) {
    return risk;
  }

  return {
    score: 0,
    level: 'LOW',
    verdict: 'SAFE_TO_SHARE',
    explanation:
      'No risk assessment was returned for this analysis. The findings below are still exact matches from the detector.',
    caveat: RISK_CAVEAT,
    factors: [],
    severityBasis: { deterministic: 0, contextual: 0 },
  };
}

export async function rescanText(text: string, signal?: AbortSignal): Promise<RescanTextResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}/api/rescan/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('Could not reach the PrivacyGuard API. Is the backend running?', 'network_error', 0);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as ErrorBody | null)?.error;
    throw new ApiError(
      error?.message ?? `The API responded with ${response.status}.`,
      error?.code ?? 'unknown_error',
      response.status,
    );
  }

  return normaliseAnalyzeResponse(payload) as RescanTextResponse;
}

/**
 * Image-specific API types and functions.
 */

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export type ImageMeta = ApiAnalysisMeta & {
  image: {
    width: number;
    height: number;
    format: ImageFormat;
    charactersExtracted: number;
    ocrConfidence: number;
    wordCount: number;
  };
};

export type AnalyzeImageResponse = {
  findings: ApiFinding[];
  meta: ImageMeta;
  summary: string;
  risk: ApiRiskAssessment;
};

export type ProtectImageRedaction = {
  findingId: string;
  category: string;
  bbox: { x: number; y: number; width: number; height: number };
  replacement: string;
};

export type ProtectImageResponse = {
  protectedImageBase64: string;
  redactionCount: number;
  redactions: ProtectImageRedaction[];
  meta: {
    width: number;
    height: number;
    format: ImageFormat;
    redactionCount: number;
    redactedCategories: string[];
  };
};

export type RescanImageResponse = AnalyzeImageResponse & {
  rescan: {
    source: 'protected_image';
    protected: true;
  };
};

/**
 * Converts a File to base64 string.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix
      const base64 = result.startsWith('data:') ? (result.split(',')[1] ?? '') : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function analyzeImage(file: File, signal?: AbortSignal): Promise<AnalyzeImageResponse> {
  const base64 = await fileToBase64(file);

  let response: Response;

  try {
    response = await fetch(`${API_BASE}/api/analyze/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64 }),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('Could not reach the PrivacyGuard API. Is the backend running?', 'network_error', 0);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as ErrorBody | null)?.error;
    throw new ApiError(
      error?.message ?? `The API responded with ${response.status}.`,
      error?.code ?? 'unknown_error',
      response.status,
    );
  }

  return normaliseAnalyzeImageResponse(payload);
}

export async function protectImage(file: File, signal?: AbortSignal): Promise<ProtectImageResponse> {
  const base64 = await fileToBase64(file);

  let response: Response;

  try {
    response = await fetch(`${API_BASE}/api/protect/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64 }),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('Could not reach the PrivacyGuard API. Is the backend running?', 'network_error', 0);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as ErrorBody | null)?.error;
    throw new ApiError(
      error?.message ?? `The API responded with ${response.status}.`,
      error?.code ?? 'unknown_error',
      response.status,
    );
  }

  return payload as ProtectImageResponse;
}

export async function rescanImage(file: File, signal?: AbortSignal): Promise<RescanImageResponse> {
  const base64 = await fileToBase64(file);

  let response: Response;

  try {
    response = await fetch(`${API_BASE}/api/rescan/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64 }),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('Could not reach the PrivacyGuard API. Is the backend running?', 'network_error', 0);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as ErrorBody | null)?.error;
    throw new ApiError(
      error?.message ?? `The API responded with ${response.status}.`,
      error?.code ?? 'unknown_error',
      response.status,
    );
  }

  return normaliseAnalyzeImageResponse(payload) as RescanImageResponse;
}

function normaliseAnalyzeImageResponse(payload: unknown): AnalyzeImageResponse {
  const body = payload as AnalyzeImageResponse;

  return {
    findings: (body.findings ?? []).map(normaliseAnalyseFinding),
    meta: {
      ...body.meta,
      aiEnabled: body.meta?.aiEnabled ?? false,
      aiStatus: body.meta?.aiStatus ?? 'unavailable',
      aiStatusReason: body.meta?.aiStatusReason ?? 'missing_api_key',
      aiAnalyzedCount: body.meta?.aiAnalyzedCount ?? 0,
      aiContextTruncated: body.meta?.aiContextTruncated ?? false,
      aiSummary: body.meta?.aiSummary ?? null,
      image: body.meta?.image ?? {
        width: 0,
        height: 0,
        format: 'png',
        charactersExtracted: 0,
        ocrConfidence: 0,
        wordCount: 0,
      },
    },
    summary: body.summary ?? '',
    risk: normaliseRisk(body.risk),
  };
}