/**
 * Public surface of the risk-scoring layer.
 *
 * Route code imports from here only. The scorer is deterministic and has no
 * provider, configuration or I/O dependency, so it can be exercised directly.
 */

export * from './types.js';
export {
  RISK_CAVEAT,
  SEVERITY_WEIGHTS,
  combineContributions,
  effectiveSeverity,
  riskLevelFor,
  scoreRisk,
  verdictFor,
} from './score.js';