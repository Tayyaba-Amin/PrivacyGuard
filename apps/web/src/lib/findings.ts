import type {
  ApiAiStatus,
  ApiCategory,
  ApiFinding,
  ApiRiskAssessment,
  ApiRiskFactor,
  ApiSeverity,
  ApiSharingVerdict,
} from './api';
import { maskValue } from './mask';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Contextual commentary as the UI presents it, with its provenance kept. */
export type DisplayContextual = {
  /** `ai` only when the model actually contributed for this finding. */
  source: 'ai' | 'deterministic';
  isSensitive: boolean;
  /** Contextual severity shown as metadata, never as an overall score. */
  severity: FindingSeverity;
  severityAdjusted: boolean;
  confidence: number;
  explanation: string;
  recommendation: string;
};

export type DisplayFinding = {
  id: string;
  category: ApiCategory;
  /** Deterministic severity. Sorting and highlighting use this, not the AI's. */
  severity: FindingSeverity;
  label: string;
  /** One plain sentence on why this kind of item matters. */
  why: string;
  maskedExample: string;
  location: string;
  /** Detector wording, always shown so the two sources stay distinguishable. */
  detectorExplanation: string;
  contextual: DisplayContextual;
  confidence: number;
};

/** One finding's contribution to the score, as the UI presents it. */
export type DisplayRiskFactor = {
  findingId: string;
  category: ApiCategory;
  label: string;
  severity: FindingSeverity;
  /** Detector severity, present only when the effective one differs. */
  deterministicSeverity?: FindingSeverity;
  severitySource: 'ai' | 'deterministic';
  contribution: number;
};

/** The deterministic risk assessment, as the UI presents it. */
export type DisplayRisk = {
  score: number;
  level: FindingSeverity;
  verdict: ApiSharingVerdict;
  explanation: string;
  caveat: string;
  factors: DisplayRiskFactor[];
  severityBasis: { deterministic: number; contextual: number };
  /** True when any weight came from AI contextual severity. */
  usedContextualSeverity: boolean;
};

/** What the AI layer contributed to this analysis, for the status banner. */
export type DisplayAi = {
  enabled: boolean;
  provider: string;
  status: ApiAiStatus;
  reason: string;
  model: string;
  analyzedCount: number;
  contextTruncated: boolean;
  /** The model's own overview, present only when it was actually used. */
  summary: string | null;
  /** Overall summary: the model's when available, otherwise the deterministic one. */
  summarySource: 'ai' | 'deterministic';
};

/** A finished text analysis as the UI needs it. */
export type TextAnalysis = {
  /** Where the data came from, so the UI never implies more than it knows. */
  source: 'detector';
  findings: DisplayFinding[];
  categoryCount: number;
  /** Category codes the server matched, shown as metadata only. */
  categories: ApiCategory[];
  charactersAnalyzed: number;
  engine: string;
  ai: DisplayAi;
  summary: string;
  risk: DisplayRisk;
};

const SEVERITY_MAP: Record<ApiSeverity, FindingSeverity> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Plain-language names and copy for each category. This is presentation only:
 * what is detected, how it is scored and how it is redacted all come from the
 * server. These strings exist so a non-technical user does not have to read a
 * category code.
 */
const CATEGORY_META: Record<ApiCategory, { label: string; action: string; why: string }> = {
  EMAIL: {
    label: 'Email address',
    action: 'Remove it, or use a secondary address if a reply is needed.',
    why: 'It can be used to reach you or to target you with scams.',
  },
  PHONE_NUMBER: {
    label: 'Phone number',
    action: 'Remove it from anything that is not a private conversation.',
    why: 'It identifies you directly and can be used for scams or unwanted calls.',
  },
  CREDIT_CARD: {
    label: 'Credit card',
    action: 'Remove it, or keep only the last 4 digits if you need a reference.',
    why: 'Someone could potentially misuse this payment information.',
  },
  IP_ADDRESS: {
    label: 'IP address',
    action: 'Remove it, or keep only the public address if it is useful.',
    why: 'It can reveal your location and the network you are on.',
  },
  URL: {
    label: 'Web link',
    action: 'Remove it, or strip the query string, which often carries tokens.',
    why: 'Links can carry tracking codes or private tokens in the query string.',
  },
  API_KEY: {
    label: 'API key',
    action: 'Rotate it now, then move it into an environment variable or secret manager.',
    why: 'Anyone holding this key can act as you in the linked account.',
  },
  JWT: {
    label: 'Session token',
    action: 'Revoke the session that issued it and never paste tokens into shared text.',
    why: 'It works like a temporary login, so it can let someone into the account.',
  },
  PRIVATE_KEY: {
    label: 'Private key',
    action: 'Rotate the key and remove the old one.',
    why: 'This is the key itself, so anyone holding it can act as you.',
  },
  CREDENTIAL_PAIR: {
    label: 'Login credentials',
    action: 'Change the password and revoke any active sessions for that account.',
    why: 'A username and password together can be used to sign in as you.',
  },
  ADDRESS: {
    label: 'Postal address',
    action: 'Reduce it to a city or region, or remove it.',
    why: 'It reveals where you live or where you receive deliveries.',
  },
};

/** Converts a character offset into a line and column label. */
function positionLabel(text: string, offset: number): string {
  let line = 1;
  let lineStart = 0;

  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }

  return `Line ${line}, column ${offset - lineStart + 1}`;
}

function toContextual(finding: ApiFinding): DisplayContextual {
  const contextual = finding.contextual;

  return {
    // A model response is only ever shown as AI commentary when the backend
    // says so; anything else keeps the deterministic label.
    source: contextual.source === 'ai' ? 'ai' : 'deterministic',
    isSensitive: contextual.isSensitive,
    severity: SEVERITY_MAP[contextual.severity],
    severityAdjusted: contextual.severityAdjusted,
    confidence: contextual.confidence,
    explanation: contextual.explanation,
    recommendation: contextual.recommendation || CATEGORY_META[finding.category].action,
  };
}

export function toDisplayFindings(findings: ApiFinding[], text: string): DisplayFinding[] {
  return findings
    .map((finding) => ({
      id: finding.id,
      category: finding.category,
      severity: SEVERITY_MAP[finding.severity],
      label: CATEGORY_META[finding.category].label,
      why: CATEGORY_META[finding.category].why,
      maskedExample: maskValue(finding.category, finding.matchedText),
      location: positionLabel(text, finding.start),
      detectorExplanation: finding.explanation,
      contextual: toContextual(finding),
      confidence: finding.confidence,
    }))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function countBySeverity(findings: DisplayFinding[]): Record<FindingSeverity, number> {
  return findings.reduce<Record<FindingSeverity, number>>(
    (totals, finding) => ({ ...totals, [finding.severity]: totals[finding.severity] + 1 }),
    { critical: 0, high: 0, medium: 0, low: 0 },
  );
}

function toDisplayFactor(factor: ApiRiskFactor): DisplayRiskFactor {
  return {
    findingId: factor.findingId,
    category: factor.category,
    label: CATEGORY_META[factor.category].label,
    severity: SEVERITY_MAP[factor.severity],
    ...(factor.deterministicSeverity
      ? { deterministicSeverity: SEVERITY_MAP[factor.deterministicSeverity] }
      : {}),
    severitySource: factor.severitySource,
    contribution: factor.contribution,
  };
}

/**
 * Maps the backend's risk block for display. Every value here is produced by the
 * deterministic scorer; the UI never recomputes or adjusts the score itself.
 */
export function toDisplayRisk(risk: ApiRiskAssessment): DisplayRisk {
  const level = SEVERITY_MAP[risk.level] as FindingSeverity;

  return {
    score: risk.score,
    level,
    verdict: risk.verdict,
    explanation: risk.explanation,
    caveat: risk.caveat,
    factors: risk.factors.map(toDisplayFactor),
    severityBasis: risk.severityBasis,
    usedContextualSeverity: risk.severityBasis.contextual > 0,
  };
}

/** Plain-language verdict labels, so no verdict code is ever shown as a headline. */
export const VERDICT_HEADLINE: Record<ApiSharingVerdict, string> = {
  SAFE_TO_SHARE: 'Looks safe',
  REVIEW_BEFORE_SHARING: 'Review before sharing',
  NOT_SAFE_TO_SHARE: "Don't share this yet",
};

/** Plain-language labels for a risk level, used for scores and comparisons. */
export const LEVEL_HEADLINE: Record<FindingSeverity, string> = {
  low: 'Looks safe',
  medium: 'Review before sharing',
  high: 'Be careful before sharing',
  critical: "Don't share this yet",
};

/** Maps a verdict onto the existing pill colour vocabulary. */
export function verdictTone(verdict: ApiSharingVerdict): 'safe' | 'review' | 'unsafe' {
  if (verdict === 'SAFE_TO_SHARE') return 'safe';
  if (verdict === 'REVIEW_BEFORE_SHARING') return 'review';
  return 'unsafe';
}

/** How many risk factors the UI names before collapsing the rest. */
export const RISK_FACTOR_PREVIEW = 4;