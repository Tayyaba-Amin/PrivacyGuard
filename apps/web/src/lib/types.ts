export type {
  FindingSeverity,
  TextAnalysis,
  DisplayFinding,
  DisplayAi,
  DisplayContextual,
  DisplayRisk,
  DisplayRiskFactor,
} from './findings';

export { RISK_FACTOR_PREVIEW } from './findings';

export type InputMode = 'text' | 'image';

/** Top-level screen the application is showing. */
export type AppView = 'dashboard' | 'text' | 'image';

/** Where the analyzer currently is in the flow. */
export type AnalysisState = 'idle' | 'analyzing' | 'complete';

export type ProtectionState = 'idle' | 'protected';

/**
 * Defined for the final verdict stage. No component calculates a verdict yet:
 * the value stays `null` until risk scoring lands.
 */
export type Verdict = 'safe' | 'review' | 'unsafe';

export type VerdictMeta = {
  id: Verdict;
  label: string;
  caption: string;
};

export const VERDICTS: readonly VerdictMeta[] = [
  { id: 'safe', label: 'SAFE TO SHARE', caption: 'Nothing sensitive was found.' },
  { id: 'review', label: 'REVIEW BEFORE SHARING', caption: 'Low-risk items need a human decision.' },
  { id: 'unsafe', label: 'NOT SAFE TO SHARE', caption: 'Serious exposure. Protect it first.' },
];