import type { TextAnalysis } from '../lib/types';
import type { ProtectionState, DisplayRisk } from '../lib/types';
import type { FindingSeverity } from '../lib/findings';
import { TechnicalDetails } from './TechnicalDetails';

type ResultsPanelProps = {
  screen: 'results' | 'protected' | 'rescan';
  analysis: TextAnalysis;
  sourceLabel: string;
  protectionState: ProtectionState;
  protectBusy: boolean;
  onProtect: () => void;
  rescanState: 'idle' | 'rescanning' | 'complete';
  rescanRisk: DisplayRisk | null;
  onRescan: () => void;
  canRescan: boolean;
  protectedText: string | null;
  protectedImagePreviewUrl: string | null;
  mode: 'text' | 'image';
};

const SEVERITY_NAME: Record<FindingSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

const IMAGE_ACTIONS: Record<string, string> = {
  EMAIL: 'Crop it out or cover it before sharing.',
  PHONE_NUMBER: 'Remove or cover the phone number before sharing.',
  CREDIT_CARD: 'Do not share the card number; crop or cover it.',
  IP_ADDRESS: 'Remove or obscure the IP address before sharing.',
  URL: 'Remove or cover the link before sharing.',
  API_KEY: 'Remove the API key; rotate it if it was exposed.',
  JWT: 'Revoke the session token and do not share it.',
  PRIVATE_KEY: 'Remove the private key; rotate it if it was exposed.',
  CREDENTIAL_PAIR: 'Change the password and remove the credentials before sharing.',
  ADDRESS: 'Remove or reduce the postal address before sharing.',
};

function getWhatToDo(verdict: string, findingsCount: number): string {
  if (verdict === 'REVIEW_BEFORE_SHARING' && findingsCount === 0) {
    return 'PrivacyGuard could not verify this image. Improve the image quality or review it manually before sharing.';
  }
  if (findingsCount === 0) {
    return 'No sensitive information was detected. You can share this version if it looks right to you.';
  }
  if (verdict === 'NOT_SAFE_TO_SHARE') {
    return 'Do not share this version. Remove or protect the sensitive information first.';
  }
  if (verdict === 'REVIEW_BEFORE_SHARING') {
    return 'Review the sensitive information before sharing. We recommend protecting the content first.';
  }
  if (verdict === 'SAFE_TO_SHARE') {
    return 'Review the detected information before sharing. Create a protected copy if needed.';
  }
  return 'Check the highlighted information before sharing.';
}

function getImageGuidance(findings: { category: string }[]): string[] {
  const seen = new Set<string>();
  const guidance: string[] = [];

  for (const finding of findings) {
    const action = IMAGE_ACTIONS[finding.category];
    if (action && !seen.has(action)) {
      seen.add(action);
      guidance.push(action);
    }
  }

  if (guidance.length === 0) {
    return [
      'Do not share the original image.',
      'Manually crop, blur, or cover the sensitive areas before sharing.',
      'Run the edited image through PrivacyGuard again before sharing.',
    ];
  }

  return [
    'Do not share the original image.',
    ...guidance,
    'Run the edited image through PrivacyGuard again before sharing.',
  ];
}

export function ResultsPanel({
  screen,
  analysis,
  sourceLabel,
  protectionState,
  protectBusy,
  onProtect,
  rescanState,
  rescanRisk,
  onRescan,
  canRescan,
  protectedText,
  protectedImagePreviewUrl,
  mode,
}: ResultsPanelProps) {
  const { findings, risk } = analysis;
  const nothingFound = findings.length === 0;
  const isProtected = protectionState === 'protected';
  const showRescanResult = rescanState === 'complete' && rescanRisk !== null;
  const isImage = mode === 'image';

  const imageNeedsOcrReview = isImage && analysis.charactersAnalyzed === 0;
  const rescanNeedsOcrReview =
    rescanRisk?.verdict === 'REVIEW_BEFORE_SHARING' && rescanRisk.factors.length === 0;
  const riskLabel = nothingFound
    ? imageNeedsOcrReview || risk.verdict === 'REVIEW_BEFORE_SHARING'
      ? 'Review Before Sharing'
      : 'Safe to Share'
    : 'Not Safe to Share';
  const resultSentence = imageNeedsOcrReview
    ? 'No readable text was detected in this image.'
    : nothingFound
      ? 'No sensitive information was found.'
    : `${findings.length} sensitive ${plural(findings.length, 'item', 'items')} found`;
  const whatToDo = getWhatToDo(risk.verdict, findings.length);

  const showTextProtect = !isImage && !isProtected && !nothingFound;
  const showImageGuidance = isImage && !nothingFound && !isProtected;

  return (
    <div className="results">
      {screen === 'results' && (
        <>
          <div className={`result-card result-card--${imageNeedsOcrReview ? 'medium' : risk.level}`}>
            <h2 className="result-card__label">{riskLabel}</h2>
            <p className="result-card__score">
              {imageNeedsOcrReview ? '—' : risk.score} <span className="result-card__out">/ 100</span>
            </p>
            <p className="result-card__sentence">{resultSentence}</p>
            <p className="result-card__next">{whatToDo}</p>
          </div>

          {imageNeedsOcrReview && (
            <div className="what-to-do" role="status">
              <p className="what-to-do__title">PrivacyGuard could not verify this image.</p>
              <p>
                OCR extracted no readable text, so a zero finding count does not mean the image is
                safe. Try a sharper, well-lit image with text upright and in focus, or review it manually.
              </p>
            </div>
          )}

          {!nothingFound && (
            <div className="findings findings--compact">
              <h3 className="block__title">What we found</h3>
              <ul className="findings__rows">
                {findings.map((finding) => (
                  <li key={finding.id} className={`finding-card finding-card--${finding.severity}`}>
                    <div className="finding-card__head">
                      <span className={`severity severity--${finding.severity}`}>
                        {SEVERITY_NAME[finding.severity]}
                      </span>
                      <span className="finding-card__label">{finding.label}</span>
                    </div>
                    <p className="finding-card__why">{finding.why}</p>
                    <p className="finding-card__action">
                      <strong>What to do:</strong> {finding.contextual.recommendation}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showTextProtect && (
            <div className="result-action">
              <button
                type="button"
                className="button button--primary button--lg"
                onClick={onProtect}
                disabled={protectBusy}
              >
                {protectBusy ? 'Protecting…' : 'Create Protected Copy'}
              </button>
              <p className="result-action__support">
                Replace the detected sensitive information with safe placeholders while keeping the rest
                of your text readable.
              </p>
            </div>
          )}

          {showImageGuidance && (
            <div className="what-to-do">
              <p className="what-to-do__title">Do not share this image yet.</p>
              <ul className="what-to-do__list">
                {getImageGuidance(findings).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
              <p className="what-to-do__note">
                PrivacyGuard can identify sensitive areas, but review the protected image before sharing.
              </p>
            </div>
          )}
        </>
      )}

      {screen === 'protected' && isProtected && !isImage && (
        <div className="protected-card">
          <h3 className="block__title">Protected copy</h3>
          <p className="protected-card__sentence">
            Your sensitive information has been replaced with safe placeholders.
          </p>
          {protectedText && (
            <div className="protected-card__box">
              <pre className="protected-card__text">{protectedText}</pre>
            </div>
          )}
          <div className="protected-card__actions">
            {protectedText && (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  navigator.clipboard.writeText(protectedText);
                }}
              >
                Copy Protected Text
              </button>
            )}
            <button
              type="button"
              className="button button--primary button--lg"
              onClick={onRescan}
              disabled={!canRescan || rescanState === 'rescanning'}
            >
              {rescanState === 'rescanning' ? 'Scanning…' : 'Scan Protected Copy'}
            </button>
          </div>
        </div>
      )}

      {screen === 'protected' && isProtected && isImage && (
        <div className="protected-card">
          <h3 className="block__title">Protected image preview</h3>
          {protectedImagePreviewUrl && (
            <img
              className="protected-card__image"
              src={protectedImagePreviewUrl}
              alt="Protected image with sensitive areas covered"
            />
          )}
          <h3 className="block__title">Review before sharing</h3>
          <ol className="protected-card__steps">
            <li>Check that every sensitive area is fully covered in this copy.</li>
            <li>Scan the protected image to confirm nothing recognisable remains.</li>
            <li>Only share it after the final scan shows no sensitive information.</li>
          </ol>
          <div className="protected-card__actions">
            <button
              type="button"
              className="button button--primary button--lg"
              onClick={onRescan}
              disabled={!canRescan || rescanState === 'rescanning'}
            >
              {rescanState === 'rescanning' ? 'Scanning…' : 'Scan Edited Image'}
            </button>
          </div>
        </div>
      )}

      {screen === 'rescan' && showRescanResult && rescanRisk && (
        <div className={`final-check final-check--${rescanNeedsOcrReview ? 'medium' : rescanRisk.level}`}>
          <h3 className="block__title">Final safety check</h3>
          <div className={`final-check__card final-check__card--${rescanNeedsOcrReview ? 'medium' : rescanRisk.level}`}>
            <h4 className="final-check__label">
              {rescanRisk.verdict === 'SAFE_TO_SHARE' ? '✓ Safe to Share' : '! Still Needs Attention'}
            </h4>
            <p className="final-check__score">
              {rescanNeedsOcrReview ? '—' : rescanRisk.score}
              <span className="final-check__out">/ 100</span>
            </p>
            <p className="final-check__sentence">
              {rescanRisk.verdict === 'SAFE_TO_SHARE'
                ? 'No sensitive information was detected in the protected copy.'
                : rescanNeedsOcrReview
                  ? 'No readable text was detected, so the protected image could not be verified.'
                  : `${rescanRisk.factors.length} sensitive ${plural(rescanRisk.factors.length, 'item', 'items')} remain.`}
            </p>
            <p className="final-check__next">
              {rescanRisk.verdict === 'SAFE_TO_SHARE'
                ? 'This is the version you should share.'
                : rescanNeedsOcrReview
                  ? 'Review the image manually before sharing.'
                  : 'Protect the remaining information and scan again.'}
            </p>
          </div>
        </div>
      )}

      {screen === 'results' && <TechnicalDetails label="Technical details">
        <dl className="results__meta">
          <div>
            <dt>Source</dt>
            <dd>{sourceLabel}</dd>
          </div>
          <div>
            <dt>Categories matched</dt>
            <dd>
              {analysis.categoryCount} · <code>{analysis.categories.join(', ') || 'none'}</code>
            </dd>
          </div>
          <div>
            <dt>Characters analyzed</dt>
            <dd>{analysis.charactersAnalyzed.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Detection engine</dt>
            <dd>
              <code>{analysis.engine}</code>
            </dd>
          </div>
          <div>
            <dt>AI status</dt>
            <dd>
              {analysis.ai.status} · {analysis.ai.provider} · <code>{analysis.ai.model}</code> · analyzed {analysis.ai.analyzedCount}
              {analysis.ai.contextTruncated ? ' (context truncated)' : ''}
              {analysis.ai.reason ? ` · ${analysis.ai.reason}` : ''}
            </dd>
          </div>
        </dl>

        <h4 className="block__title" style={{ marginTop: 'var(--space-4)' }}>Findings details</h4>
        <ul className="findings__details">
          {findings.map((finding) => (
            <li key={finding.id} className={`finding-detail finding-detail--${finding.severity}`}>
              <div className="finding-detail__row">
                <span className="finding-detail__label">{finding.label}</span>
                <span className={`severity severity--${finding.severity}`}>
                  {SEVERITY_NAME[finding.severity]}
                </span>
              </div>
              <dl className="finding-detail__meta">
                <div>
                  <dt>Category</dt>
                  <dd>
                    <code>{finding.category}</code>
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{finding.location}</dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>{Math.round(finding.confidence * 100)}%</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>
                    {finding.contextual.source === 'ai'
                      ? `AI context (severity ${finding.contextual.severity}${
                          finding.contextual.severityAdjusted ? ', adjusted' : ''
                        })`
                      : 'Pattern detector'}
                  </dd>
                </div>
              </dl>
              <p className="finding-detail__detector">{finding.detectorExplanation}</p>
              <p className="finding-detail__why">
                <strong>Why it matters:</strong> {finding.why}
              </p>
              <p className="finding-detail__action">
                <strong>What to do:</strong> {finding.contextual.recommendation}
              </p>
            </li>
          ))}
        </ul>
      </TechnicalDetails>}
    </div>
  );
}
