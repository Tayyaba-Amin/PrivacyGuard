/**
 * Builds the bounded context sent to the model.
 *
 * A submission that already fits is passed through whole. A longer one is
 * reduced to a window around each detected span, which is what keeps prompt
 * size predictable. Two rules matter:
 *
 * 1. Every deterministic finding is still submitted for analysis. Findings are
 *    split across batches rather than dropped when they do not fit.
 * 2. Any shortening is reported through `AnalysisBatch.truncated`, so the caller
 *    can surface it instead of quietly analysing less than it detected.
 */

import type { Finding } from '../detection/types.js';
import type { AnalysisBatch } from './types.js';

/** Characters kept on each side of a span when a window is built. */
const DEFAULT_WINDOW_CHARS = 400;

/** Marks a gap between two non-adjacent windows. */
const WINDOW_GAP = '\n[...]\n';

/** Elision marker for a value that is itself larger than the whole budget. */
const VALUE_ELISION = '...';

/**
 * Upper bound on provider calls per analyze request. Hitting it is a latency
 * guard, not a reason to skip findings: the per-batch size grows instead, so
 * every finding is still covered.
 */
const MAX_BATCHES = 5;

/** Ceiling on findings per batch, to bound one prompt's size. */
const MAX_FINDINGS_PER_BATCH = 200;

type Range = { start: number; end: number };

/** Merges overlapping or nearly adjacent windows into a minimal set. */
function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Range[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];

    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      continue;
    }

    merged.push({ ...range });
  }

  return merged;
}

/**
 * Assembles a single excerpt for `findings` using `windowChars` of padding.
 * Returns null when the excerpt cannot fit in `budget`, which tells the caller
 * to split the batch.
 */
function buildExcerpt(
  text: string,
  findings: Finding[],
  windowChars: number,
  budget: number,
): { excerpt: string } | null {
  const ranges = mergeRanges(
    findings.map((finding) => ({
      start: Math.max(0, finding.start - windowChars),
      end: Math.min(text.length, finding.end + windowChars),
    })),
  );

  // A span wider than the whole budget can never be shown in full, so it is
  // elided rather than allowed to overflow.
  const pieces = ranges.map((range, index) => {
    const separator = index === 0 ? '' : WINDOW_GAP;
    const slice = text.slice(range.start, range.end);

    if (separator.length + slice.length > budget) {
      const room = Math.max(0, budget - separator.length - VALUE_ELISION.length);
      return separator + slice.slice(0, room) + VALUE_ELISION;
    }

    return separator + slice;
  });

  const excerpt = pieces.join('');

  if (excerpt.length > budget) return null;
  return { excerpt };
}

/** Finds the largest padding under `budget` that fits, halving until it does. */
function fitExcerpt(
  text: string,
  findings: Finding[],
  budget: number,
): { excerpt: string } | null {
  for (let windowChars = DEFAULT_WINDOW_CHARS; windowChars > 0; windowChars = Math.floor(windowChars / 2)) {
    const attempt = buildExcerpt(text, findings, windowChars, budget);
    if (attempt) return attempt;
  }

  // Windows are already zero-length: only the exact spans remain. If even that
  // overflows, buildExcerpt elides rather than failing.
  return buildExcerpt(text, findings, 0, budget);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

/**
 * Fits one group, halving it when even the bare spans exceed the budget.
 * Halving terminates because a single finding always fits: at zero padding
 * `buildExcerpt` elides the value instead of overflowing.
 */
function buildBatchesForGroup(text: string, group: Finding[], budget: number): AnalysisBatch[] {
  const fitted = fitExcerpt(text, group, budget);

  if (fitted) {
    // Any windowed batch is a shortened view of the submission, whether or not
    // a value had to be elided, so it is always reported as truncated.
    return [{ text: fitted.excerpt, findings: group, truncated: true }];
  }

  if (group.length <= 1) {
    const elided = buildExcerpt(text, group, 0, budget);
    return elided ? [{ text: elided.excerpt, findings: group, truncated: true }] : [];
  }

  const half = Math.ceil(group.length / 2);
  return [...buildBatchesForGroup(text, group.slice(0, half), budget), ...buildBatchesForGroup(text, group.slice(half), budget)];
}

/**
 * Splits `findings` into batches that each fit inside `maxContextChars`.
 *
 * A batch whose excerpt still does not fit is halved and retried, so no finding
 * is ever silently omitted because the surrounding document was long.
 */
export function buildAnalysisBatches(
  text: string,
  findings: Finding[],
  maxContextChars: number,
): AnalysisBatch[] {
  if (findings.length === 0) return [];

  if (text.length <= maxContextChars && findings.length <= MAX_FINDINGS_PER_BATCH) {
    return [{ text, findings, truncated: false }];
  }

  const perBatch = Math.min(
    MAX_FINDINGS_PER_BATCH,
    Math.max(1, Math.ceil(findings.length / MAX_BATCHES)),
  );

  return chunk(findings, perBatch).flatMap((group) => buildBatchesForGroup(text, group, maxContextChars));
}
