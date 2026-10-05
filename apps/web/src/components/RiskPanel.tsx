import type { DisplayRisk } from '../lib/types';
import { RISK_FACTOR_PREVIEW, VERDICT_HEADLINE } from '../lib/findings';
import { TechnicalDetails } from './TechnicalDetails';

type RiskPanelProps = {
  risk: DisplayRisk;
  /** Findings count, used only to phrase the risk in plain language. */
  findingCount: number;
};

const RISK_ADVICE: Record<DisplayRisk['verdict'], string> = {
  SAFE_TO_SHARE: 'We did not find anything sensitive. Read it yourself before you send it.',
  REVIEW_BEFORE_SHARING:
    'A few lower-risk items were found. Decide case by case before you share.',
  NOT_SAFE_TO_SHARE:
    'This contains details that could be used against you. Protect it first, then share the protected copy.',
};

const CRITICAL_ADVICE =
  'This includes items that could be used to access your accounts or payments. Protect the content before you send it.';

/**
 * The privacy risk of the content: a plain verdict, the score, what was found,
 * and the next action. Everything mechanical (score basis, per-finding weights,
 * detector wording) is kept but moved behind a disclosure.
 */
export function RiskPanel({ risk, findingCount }: RiskPanelProps) {
  const advice = RISK_ADVICE[risk.verdict];
  const isCritical = risk.level === 'critical';

  const summary = findingCount === 0
    ? 'We found nothing sensitive, so there is no risk to act on.'
    : `We found ${findingCount} ${findingCount === 1 ? 'piece' : 'pieces'} of sensitive information that could put your personal information, accounts or payment data at risk.`;

  return (
    <div className={`risk risk--${risk.level}`} id="risk-assessment">
      <p className="risk__eyebrow">Privacy risk</p>

      <h3 className={`risk__headline risk__headline--${risk.level}`}>{VERDICT_HEADLINE[risk.verdict]}</h3>

      <p className="risk__score-line">
        Risk score:{' '}
        <span className={`risk__score risk__score--${risk.level}`}>{risk.score}</span>
        <span className="risk__denominator">/ 100</span>
      </p>

      <p className="risk__summary">{summary}</p>

      {isCritical ? <p className="risk__advice">{CRITICAL_ADVICE}</p> : null}

      <MostImportant risk={risk} />

      <div className="risk__next">
        <p className="risk__next-label">What to do next</p>
        <p className="risk__next-copy">
          Protect your content below, then scan it again to make sure the sensitive information has
          been removed.
        </p>
      </div>

      <TechnicalDetails>
        <p className="risk__detail-note">{advice}</p>
        <p className="risk__detail-note">{risk.explanation}</p>
        <p className="risk__detail-note">{risk.caveat}</p>

        <div className="risk__basis">
          <span className="risk__basis-label">Severity basis</span>
          <span className="risk__basis-value">
            {risk.severityBasis.deterministic} from the pattern detector
          </span>
          {risk.usedContextualSeverity ? (
            <>
              <span className="risk__basis-value">
                {risk.severityBasis.contextual} adjusted by AI context
              </span>
              <span className="risk__basis-note">
                The score itself is still calculated from the detector&rsquo;s rules, not by the
                model.
              </span>
            </>
          ) : null}
        </div>

        <div className="risk__factors">
          <p className="risk__factors-title">
            Top contributing findings <span className="block__count">{risk.factors.length}</span>
          </p>
          <ul className="risk__factor-list">
            {risk.factors.slice(0, RISK_FACTOR_PREVIEW).map((factor) => (
              <li key={factor.findingId} className="risk__factor">
                <span
                  className={`risk__factor-dot risk__factor-dot--${factor.severity}`}
                  aria-hidden="true"
                />
                <span className="risk__factor-body">
                  <span className="risk__factor-name">{factor.label}</span>
                  <span className="risk__factor-meta">
                    {factor.severitySource === 'ai' ? 'AI context' : 'pattern detector'}{' '}
                    {factor.severity.toUpperCase()}
                    {factor.deterministicSeverity ? (
                      <span className="risk__factor-adjust">
                        {' '}
                        (detector said {factor.deterministicSeverity.toUpperCase()})
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="risk__factor-weight">+{factor.contribution}</span>
              </li>
            ))}
          </ul>
          {risk.factors.length > RISK_FACTOR_PREVIEW ? (
            <p className="risk__factor-more">
              and {risk.factors.length - RISK_FACTOR_PREVIEW} more lower-weight findings.
            </p>
          ) : null}
        </div>
      </TechnicalDetails>
    </div>
  );
}

/**
 * The highest-risk findings named in plain language. The full list, with
 * location and confidence, stays in the findings list below.
 */
function MostImportant({ risk }: { risk: DisplayRisk }) {
  const top = risk.factors.slice(0, RISK_FACTOR_PREVIEW);

  if (top.length === 0) return null;

  return (
    <div className="risk__top">
      <p className="risk__top-label">Most important</p>
      <ul className="risk__top-list">
        {top.map((factor) => (
          <li key={factor.findingId} className={`risk__top-item risk__top-item--${factor.severity}`}>
            <span className={`risk__top-dot risk__top-dot--${factor.severity}`} aria-hidden="true" />
            {factor.label}
          </li>
        ))}
      </ul>
    </div>
  );
}