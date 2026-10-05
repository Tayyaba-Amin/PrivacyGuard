/**
 * Types for the deterministic risk-scoring layer.
 *
 * The scorer is a pure function of the findings it is given. It never calls a
 * model, reads the clock, or looks at anything but the findings — the same
 * findings always produce the same assessment, which is what makes the score
 * explainable and auditable.
 */

import type { EnrichedFinding } from '../ai/types.js';
import type { FindingCategory, Severity } from '../detection/types.js';

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

/**
 * Initial sharing verdict for the content as submitted.
 *
 * This is a *pre-protection* verdict. It describes what was found in the text,
 * not whether the text is safe: content can be shared safely once it has been
 * protected, and this verdict does not know that yet.
 */
export const SHARING_VERDICTS = ['SAFE_TO_SHARE', 'REVIEW_BEFORE_SHARING', 'NOT_SAFE_TO_SHARE'] as const;

export type SharingVerdict = (typeof SHARING_VERDICTS)[number];

/**
 * One finding's contribution to the score, with everything needed to reproduce
 * it by hand.
 */
export type RiskFactor = {
  findingId: string;
  category: FindingCategory;
  /** Effective severity used for the weight. */
  severity: Severity;
  /**
   * Detector severity. Present only when it differs from the effective severity,
   * so a reader can see where an AI adjustment changed the weight.
   */
  deterministicSeverity?: Severity;
  /** Whether the effective severity came from AI contextual analysis. */
  severitySource: 'ai' | 'deterministic';
  /** Severity weight for this finding, 0-100, before diminishing returns. */
  contribution: number;
};

export type RiskAssessment = {
  /** Integer 0-100. */
  score: number;
  level: RiskLevel;
  verdict: SharingVerdict;
  /** Deterministic sentence describing why this score was produced. */
  explanation: string;
  /** Standing caveat attached to every assessment, for the same reason. */
  caveat: string;
  /** Per-finding breakdown, most influential first. */
  factors: RiskFactor[];
  /** How the effective severity was chosen for the findings that had a choice. */
  severityBasis: {
    /** Findings scored with the detector's severity. */
    deterministic: number;
    /** Findings scored with the AI contextual severity. */
    contextual: number;
  };
};

/** Input to the scorer: the enriched findings from the analysis pipeline. */
export type RiskInput = Pick<EnrichedFinding, 'id' | 'category' | 'severity' | 'contextual'>[];

/**
 * Risk is a function of the enriched findings, so anything that structurally
 * satisfies this is a valid input. Used by the scorer and its tests.
 */
export type ScorableFinding = RiskInput[number];