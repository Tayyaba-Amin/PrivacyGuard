import type { DisplayRisk } from '../lib/types';
import { LEVEL_HEADLINE } from '../lib/findings';
import { TechnicalDetails } from './TechnicalDetails';

type VerdictPanelProps = {
  initialRisk: DisplayRisk | null;
  finalRisk: DisplayRisk | null;
  rescanComplete: boolean;
  /** True once a protected copy exists, so the check can be run. */
  canRescan: boolean;
  rescanState: 'idle' | 'rescanning' | 'complete';
  onRescan: () => Promise<void>;
};

/** The three answers a user needs, in plain language. */
const RESULT_COPY: Record<DisplayRisk['verdict'], { icon: string; headline: string; caption: string }> = {
  SAFE_TO_SHARE: {
    icon: '✓',
    headline: 'Looks safer to share',
    caption: 'The scan found no sensitive information left in your protected copy.',
  },
  REVIEW_BEFORE_SHARING: {
    icon: '!',
    headline: 'Some sensitive information is still present',
    caption: 'Low-risk items remain. Check them before you share.',
  },
  NOT_SAFE_TO_SHARE: {
    icon: '×',
    headline: 'Still not safe to share',
    caption: 'Serious exposure remains in the protected copy. Do not share it.',
  },
};

/**
 * The final safety check: re-scan the protected content and give one clear
 * answer. The numbers behind it stay available for anyone who wants them.
 */
export function VerdictPanel({
  initialRisk,
  finalRisk,
  rescanComplete,
  canRescan,
  rescanState,
  onRescan,
}: VerdictPanelProps) {
  if (!rescanComplete || !finalRisk) {
    return (
      <div className="verdicts">
        <div className="verdicts__check">
          <p className="verdicts__check-title">Final safety check</p>
          <p className="verdicts__check-copy">
            {canRescan
              ? 'After protection, we will scan the new version again to make sure sensitive information has been removed.'
              : 'Protect your content first. Then we can scan the protected version to make sure the sensitive information is gone.'}
          </p>

          <button
            type="button"
            className="button button--primary button--lg"
            onClick={() => void onRescan()}
            disabled={!canRescan || rescanState === 'rescanning' || rescanState === 'complete'}
          >
            {rescanState === 'rescanning'
              ? 'Scanning…'
              : rescanState === 'complete'
              ? 'Safety check complete'
              : 'Rescan Protected Content'}
          </button>

          {!canRescan ? (
            <p className="verdicts__check-hint">
              Protect your content in the previous step to unlock this check.
            </p>
          ) : null}
        </div>

        {initialRisk ? (
          <div className="verdicts__preview">
            <p className="verdicts__preview-label">Current result</p>
            <p className={`verdicts__preview-verdict verdicts__preview-verdict--${initialRisk.level}`}>
              {LEVEL_HEADLINE[initialRisk.level]}
            </p>
            <p className="verdicts__preview-score">
              {initialRisk.score} / 100 · {initialRisk.factors.length}{' '}
              {initialRisk.factors.length === 1 ? 'finding' : 'findings'}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  const result = RESULT_COPY[finalRisk.verdict];
  const showComparison = initialRisk !== null;

  return (
    <div className="verdicts">
      <div className={`verdicts__final verdicts__final--${finalRisk.level}`}>
        <p className="verdicts__final-label">Final safety check</p>

        <p className={`verdicts__final-verdict verdicts__final-verdict--${finalRisk.level}`}>
          <span className="verdicts__final-icon" aria-hidden="true">
            {result.icon}
          </span>
          {result.headline}
        </p>

        <p className="verdicts__final-caption">{result.caption}</p>
        <p className="verdicts__final-score">
          {finalRisk.score} / 100 · {finalRisk.factors.length}{' '}
          {finalRisk.factors.length === 1 ? 'finding' : 'findings'} left
        </p>

        <button
          type="button"
          className="button button--secondary"
          onClick={() => void onRescan()}
          disabled={rescanState === 'rescanning'}
        >
          {rescanState === 'rescanning' ? 'Scanning…' : 'Scan again'}
        </button>

        <TechnicalDetails label="Technical details">
          <p className="verdicts__detail-note">{finalRisk.explanation}</p>
          <p className="verdicts__detail-note">{finalRisk.caveat}</p>
          <p className="verdicts__detail-note">
            Detection is pattern-based and deterministic. It reports only what it recognises, so
            review content yourself before sharing it.
          </p>
        </TechnicalDetails>
      </div>

      {showComparison ? (
        <div className="verdicts__comparison">
          <h3 className="block__title">Before and after</h3>
          <div className="comparison">
            <div className="comparison__column comparison__column--initial">
              <p className="comparison__label">Before</p>
              <p className={`comparison__score comparison__score--${initialRisk!.level}`}>
                {initialRisk!.score} / 100
              </p>
              <p className={`comparison__verdict comparison__verdict--${initialRisk!.level}`}>
                {LEVEL_HEADLINE[initialRisk!.level]}
              </p>
              <p className="comparison__findings">
                {initialRisk!.factors.length}{' '}
                {initialRisk!.factors.length === 1 ? 'finding' : 'findings'}
              </p>
            </div>

            <div className="comparison__arrow" aria-hidden="true">
              <span>&rarr;</span>
            </div>

            <div className="comparison__column comparison__column--final">
              <p className="comparison__label">After</p>
              <p className={`comparison__score comparison__score--${finalRisk.level}`}>
                {finalRisk.score} / 100
              </p>
              <p className={`comparison__verdict comparison__verdict--${finalRisk.level}`}>
                {LEVEL_HEADLINE[finalRisk.level]}
              </p>
              <p className="comparison__findings">
                {finalRisk.factors.length} {finalRisk.factors.length === 1 ? 'finding' : 'findings'}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}