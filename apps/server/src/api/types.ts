/**
 * Wire contract for `POST /api/analyze/text`.
 *
 * The response describes three independent things: what the deterministic
 * detector found (`DeterministicMeta`), what the contextual-analysis layer
 * contributed (`AiMeta`), and the risk assessment derived from both
 * (`RiskAssessment`). Because they are separate fields, a client can always
 * tell whether a claim came from a pattern match, a model, or a calculation.
 *
 * This module holds types only. It deliberately contains no provider detail
 * beyond the provider id and the model name, both of which are safe to publish.
 */

import type { AiMeta, EnrichedFinding } from '../ai/types.js';
import type { DeterministicMeta } from '../detection/types.js';
import type { RiskAssessment } from '../risk/types.js';

export type AnalysisMeta = DeterministicMeta & AiMeta;

export type AnalyzeTextResponse = {
  findings: EnrichedFinding[];
  meta: AnalysisMeta;
  /**
   * Human-readable overview: the model's contextual summary when a validated
   * response was used, otherwise a deterministic summary. Never a risk score.
   */
  summary: string;
  /**
   * Deterministic risk assessment of the findings above. Computed after
   * detection and AI enrichment, and never by the model.
   */
  risk: RiskAssessment;
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

export const API_ERROR_CODES = [
  'invalid_request',
  'missing_text',
  'invalid_text',
  'empty_text',
  'text_too_large',
  'not_found',
  'internal_error',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * Deterministic overview used when no validated AI summary is available. It
 * states only what the detector established.
 */
export function buildDeterministicSummary(meta: DeterministicMeta): string {
  if (meta.findingCount === 0) {
    return 'The deterministic detector found no sensitive information in this text. Pattern matching can miss unusual formatting, so read it yourself before sharing.';
  }

  const plural = meta.findingCount === 1 ? 'value' : 'values';
  const categoryText =
    meta.categoryCount === 1 ? 'one category' : `${meta.categoryCount} categories`;

  return `The deterministic detector matched ${meta.findingCount} sensitive ${plural} across ${categoryText}. Each match is a pattern hit, so confirm the context before deciding what to remove.`;
}

/**
 * Wire contract for `POST /api/analyze/image`.
 *
 * Mirrors the text analysis response but includes image-specific metadata
 * from the OCR step.
 */
export type AnalyzeImageResponse = {
  findings: EnrichedFinding[];
  meta: AnalysisMeta & {
    image: {
      width: number;
      height: number;
      format: 'png' | 'jpeg' | 'webp';
      charactersExtracted: number;
      ocrConfidence: number;
      wordCount: number;
    };
  };
  summary: string;
  risk: RiskAssessment;
};

/**
 * Wire contract for `POST /api/protect/image`.
 */
export type ProtectImageResponse = {
  protectedImageBase64: string;
  redactionCount: number;
  redactions: Array<{
    findingId: string;
    category: string;
    bbox: { x: number; y: number; width: number; height: number };
    replacement: string;
  }>;
  meta: {
    width: number;
    height: number;
    format: 'png' | 'jpeg' | 'webp';
    redactionCount: number;
    redactedCategories: string[];
  };
};

/**
 * Wire contract for `POST /api/rescan/image`.
 *
 * Same structure as AnalyzeImageResponse but with an additional
 * `rescan` marker to indicate this was a rescan of protected content.
 */
export type RescanImageResponse = AnalyzeImageResponse & {
  rescan: {
    source: 'protected_image';
    protected: true;
  };
};