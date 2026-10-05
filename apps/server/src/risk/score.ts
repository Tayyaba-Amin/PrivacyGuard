/**
 * Deterministic, explainable risk scoring.
 *
 * Two ideas make the whole model:
 *
 * 1. **Weight.** Every finding contributes its effective severity's weight:
 *    LOW 10, MEDIUM 25, HIGH 50, CRITICAL 75.
 *
 * 2. **Diminishing returns.** Weights are combined as independent chances of
 *    exposure rather than summed, so a hundred emails cannot outrank a private
 *    key:
 *
 *        risk = 100 * (1 - product(1 - weight_i / 100))
 *
 *    Adding a second HIGH to one HIGH gives 100*(1 - 0.5*0.5) = 75, not 100.
 *    The result is naturally bounded by 100, so there is no arbitrary cap.
 *
 * Nothing here is random, time-dependent, or model-generated. The AI layer may
 * only change *which* severity weight one already-detected finding uses; it can
 * never add a finding, a span, or the score itself.
 */

import { severityRank, type Severity } from '../detection/types.js';
import type {
  RiskAssessment,
  RiskFactor,
  RiskLevel,
  ScorableFinding,
  SharingVerdict,
} from './types.js';

/** Severity weight for one finding, as a percentage of the 0-100 scale. */
export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  LOW: 10,
  MEDIUM: 25,
  HIGH: 50,
  CRITICAL: 75,
};

/** Inclusive lower bound at which each level starts. */
const LEVEL_THRESHOLDS: { min: number; level: RiskLevel }[] = [
  { min: 70, level: 'CRITICAL' },
  { min: 40, level: 'HIGH' },
  { min: 20, level: 'MEDIUM' },
  { min: 0, level: 'LOW' },
];

/** Inclusive upper bound at which each verdict stops applying. */
const VERDICT_THRESHOLDS: { max: number; verdict: SharingVerdict }[] = [
  { max: 19, verdict: 'SAFE_TO_SHARE' },
  { max: 69, verdict: 'REVIEW_BEFORE_SHARING' },
  { max: 100, verdict: 'NOT_SAFE_TO_SHARE' },
];

/**
 * Attached to every assessment. The verdict describes the text as submitted, so
 * it must never be read as a guarantee.
 */
export const RISK_CAVEAT =
  'Initial assessment of the text as submitted, before any redaction. It is not a guarantee that the content is safe to share.';

const CATEGORY_NOUNS: Record<ScorableFinding['category'], { one: string; many: string }> = {
  EMAIL: { one: 'email address', many: 'email addresses' },
  PHONE_NUMBER: { one: 'phone number', many: 'phone numbers' },
  CREDIT_CARD: { one: 'payment card number', many: 'payment card numbers' },
  IP_ADDRESS: { one: 'IP address', many: 'IP addresses' },
  URL: { one: 'URL', many: 'URLs' },
  API_KEY: { one: 'API key or secret', many: 'API keys or secrets' },
  JWT: { one: 'session token', many: 'session tokens' },
  PRIVATE_KEY: { one: 'private key', many: 'private keys' },
  CREDENTIAL_PAIR: { one: 'username and password pair', many: 'username and password pairs' },
  ADDRESS: { one: 'physical address', many: 'physical addresses' },
};

/**
 * The severity a finding is actually scored on.
 *
 * The AI contextual severity is used only when the model genuinely contributed
 * for that finding *and* the value is one this module recognises. Anything else
 * — AI unavailable, degraded, or an unrecognised value — falls back to the
 * detector's severity, so the score is never left undefined.
 */
export function effectiveSeverity(finding: ScorableFinding): { severity: Severity; source: 'ai' | 'deterministic' } {
  if (finding.contextual?.source === 'ai') {
    const contextual = finding.contextual.severity;

    if (typeof contextual === 'string' && contextual in SEVERITY_WEIGHTS) {
      return { severity: contextual, source: 'ai' };
    }
  }

  return { severity: finding.severity, source: 'deterministic' };
}

/** Combines weights with diminishing returns and rounds to a whole number. */
export function combineContributions(contributions: number[]): number {
  if (contributions.length === 0) return 0;

  const remaining = contributions.reduce((product, contribution) => product * (1 - contribution / 100), 1);
  const score = Math.round(100 * (1 - remaining));

  // Guard the published bounds against floating-point drift at the edges.
  return Math.min(100, Math.max(0, score));
}

export function riskLevelFor(score: number): RiskLevel {
  return LEVEL_THRESHOLDS.find((threshold) => score >= threshold.min)?.level ?? 'LOW';
}

export function verdictFor(score: number): SharingVerdict {
  return VERDICT_THRESHOLDS.find((threshold) => score <= threshold.max)?.verdict ?? 'NOT_SAFE_TO_SHARE';
}

/**
 * Deterministic explanation of the score. It is built from the score and the
 * detected categories only — never from model prose — so the same findings
 * always produce the same sentence.
 */
function explain(findings: ScorableFinding[], score: number, level: RiskLevel): string {
  if (findings.length === 0) {
    return `No sensitive-data pattern matched this text, so it contributes no risk. Pattern matching cannot recognise every format, so read the text before sharing it. ${RISK_CAVEAT}`;
  }

  const tail = (phrase: string): string => `${phrase} ${RISK_CAVEAT}`;

  // Count findings per category, then name the categories in a stable order.
  const counts = new Map<ScorableFinding['category'], number>();
  for (const finding of findings) {
    counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
  }

  const ordered = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

  const describe = ([category, count]: [ScorableFinding['category'], number]): string => {
    const noun = CATEGORY_NOUNS[category];
    return count === 1 ? `1 ${noun.one}` : `${count} ${noun.many}`;
  };

  const parts = ordered.map(describe);
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

  if (level === 'CRITICAL') {
    return tail(
      `Scored ${score}/100 because the content includes directly usable secrets or payment data (${list}). Someone with this text could act on it immediately, so protect it before it leaves your hands.`,
    );
  }

  if (level === 'HIGH') {
    return tail(
      `Scored ${score}/100 because the content includes high-risk identifiers (${list}) that would let a reader identify or reach the people involved.`,
    );
  }

  if (level === 'MEDIUM') {
    return tail(
      `Scored ${score}/100 because the content includes identifiers that add to a profile (${list}). Each one is worth a decision on its own rather than a blanket removal.`,
    );
  }

  return tail(
    `Scored ${score}/100 because only low-risk matches were found (${list}). They rarely matter on their own, but confirm each one is acceptable in this context.`,
  );
}

/**
 * Produces the full assessment for a set of enriched findings.
 *
 * Pure and deterministic: same input, same output, every time.
 */
export function scoreRisk(findings: ScorableFinding[]): RiskAssessment {
  const scored = findings.map((finding) => {
    const effective = effectiveSeverity(finding);

    return {
      finding,
      severity: effective.severity,
      severitySource: effective.source,
      contribution: SEVERITY_WEIGHTS[effective.severity],
    };
  });

  const score = combineContributions(scored.map((entry) => entry.contribution));
  const level = riskLevelFor(score);

  // Most influential first; ties broken by detector order, then id, so the
  // ordering is stable rather than dependent on input ordering.
  const ordered = [...scored].sort((a, b) => {
    if (b.contribution !== a.contribution) return b.contribution - a.contribution;
    if (a.finding.severity !== b.finding.severity) return severityRank(b.finding.severity) - severityRank(a.finding.severity);
    return a.finding.id.localeCompare(b.finding.id);
  });

  const factors: RiskFactor[] = ordered.map((entry) => ({
    findingId: entry.finding.id,
    category: entry.finding.category,
    severity: entry.severity,
    ...(entry.severity !== entry.finding.severity ? { deterministicSeverity: entry.finding.severity } : {}),
    severitySource: entry.severitySource,
    contribution: entry.contribution,
  }));

  return {
    score,
    level,
    verdict: verdictFor(score),
    explanation: explain(findings, score, level),
    caveat: RISK_CAVEAT,
    factors,
    severityBasis: {
      deterministic: scored.filter((entry) => entry.severitySource === 'deterministic').length,
      contextual: scored.filter((entry) => entry.severitySource === 'ai').length,
    },
  };
}