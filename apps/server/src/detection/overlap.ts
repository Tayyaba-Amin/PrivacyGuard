import type { Finding, RawMatch } from './types.js';
import { severityRank, spansOverlap } from './types.js';

/**
 * Deterministic overlap policy.
 *
 * 1. Exact duplicates - the same category at the same span - collapse to one.
 * 2. Two findings with genuinely overlapping spans cannot both be redacted
 *    independently, so the winner is chosen by, in order:
 *      a. higher severity,
 *      b. longer span (more specific),
 *      c. earlier start offset,
 *      d. detector pipeline order.
 * The loser is dropped rather than trimmed, which keeps spans exact.
 */
function wins(a: RawMatch, b: RawMatch): number {
  const bySeverity = severityRank(b.severity) - severityRank(a.severity);
  if (bySeverity !== 0) return bySeverity;

  const byLength = b.end - b.start - (a.end - a.start);
  if (byLength !== 0) return byLength;

  if (a.start !== b.start) return a.start - b.start;

  return a.detectorIndex - b.detectorIndex;
}

export function resolveFindings(matches: RawMatch[]): Finding[] {
  const ordered = [...matches].sort(wins);

  const accepted: RawMatch[] = [];
  for (const candidate of ordered) {
    const span = { start: candidate.start, end: candidate.end };
    if (accepted.some((kept) => spansOverlap(span, { start: kept.start, end: kept.end }))) continue;
    accepted.push(candidate);
  }

  return accepted
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .map((match, index) => ({
      id: `pg_${String(index + 1).padStart(3, '0')}_${match.start}_${match.end}`,
      category: match.category,
      severity: match.severity,
      start: match.start,
      end: match.end,
      matchedText: match.matchedText,
      explanation: match.explanation,
      confidence: match.confidence,
    }));
}