/**
 * Shared representation for a single sensitive-information finding.
 *
 * Spans are exact: `start` is inclusive and `end` is exclusive, expressed as
 * UTF-16 code-unit offsets into the analysed text. They are the contract the
 * future redaction step will use, so they must stay accurate.
 */

export const FINDING_CATEGORIES = [
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

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type Severity = (typeof SEVERITIES)[number];

export type Finding = {
  id: string;
  category: FindingCategory;
  /**
   * Deterministic severity from the detector. This value is never modified by
   * the AI layer: a model's contextual opinion is exposed separately, under
   * `contextual`.
   */
  severity: Severity;
  /** Inclusive start offset into the analysed text. */
  start: number;
  /** Exclusive end offset into the analysed text. */
  end: number;
  matchedText: string;
  explanation: string;
  /** Detector confidence between 0 and 1. */
  confidence: number;
};

/** Deterministic facts about one analysis run. Present with or without AI. */
export type DeterministicMeta = {
  findingCount: number;
  categoryCount: number;
  categories: FindingCategory[];
  charactersAnalyzed: number;
  engine: string;
};

export type Span = {
  start: number;
  end: number;
};

/** A match before overlap resolution. */
export type RawMatch = Omit<Finding, 'id'> & {
  /** Position of the detector in the pipeline, used as the final tiebreak. */
  detectorIndex: number;
};

export type DetectorContext = {
  text: string;
  /**
   * Spans already claimed by earlier, more specific detectors. Generic
   * (low-precision) matches that overlap these are suppressed so the specific
   * detector keeps the finding.
   */
  claimed: Span[];
};

export type Detector = (context: DetectorContext) => RawMatch[];

const SEVERITY_RANK: Record<Severity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity];
}

export function spansOverlap(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}